use std::collections::VecDeque;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};

use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager, Runtime};
use tracing_subscriber::{fmt, layer::SubscriberExt, Registry};

// Keep the non-blocking worker guard alive for the lifetime of the app
static FILE_GUARD: Lazy<Mutex<Option<tracing_appender::non_blocking::WorkerGuard>>> =
    Lazy::new(|| Mutex::new(None));

// In-memory ring buffer of recent log lines
const MAX_LOG_LINES: usize = 20_000;
static MEMORY_LOGS: Lazy<RwLock<VecDeque<String>>> = Lazy::new(|| RwLock::new(VecDeque::new()));

// Internal writer that collects one formatted event and pushes it to MEMORY_LOGS on drop
struct MemoryWriter<'a> {
    buf: Vec<u8>,
    logs: &'a RwLock<VecDeque<String>>,
}

impl<'a> Write for MemoryWriter<'a> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.buf.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> { Ok(()) }
}

impl<'a> Drop for MemoryWriter<'a> {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.logs.write() {
            let mut s = String::from_utf8_lossy(&self.buf).to_string();
            if s.ends_with('\n') { s.pop(); } // trim one trailing newline for consistency
            guard.push_back(s);
            while guard.len() > MAX_LOG_LINES {
                guard.pop_front();
            }
        }
    }
}

struct MemoryMakeWriter;
impl<'a> fmt::MakeWriter<'a> for MemoryMakeWriter {
    type Writer = MemoryWriter<'a>;
    fn make_writer(&'a self) -> Self::Writer {
        MemoryWriter { buf: Vec::new(), logs: &MEMORY_LOGS }
    }
}

fn ensure_dir(path: &Path) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn resolve_log_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    let pr = app.path();
    let mut dir = pr
        .app_log_dir()
        .or_else(|_| pr.app_data_dir())
        .or_else(|_| pr.app_cache_dir())
        .unwrap_or_else(|_| std::env::temp_dir());
    dir.push("logs");
    dir
}

pub fn init_logging<R: Runtime>(app: &AppHandle<R>) {
    // Prevent double init
    static INIT_ONCE: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut inited) = INIT_ONCE.lock() {
        if *inited { return; }
        *inited = true;
    }

    let log_dir = resolve_log_dir(app);
    let _ = fs::create_dir_all(&log_dir);
    let file_appender = tracing_appender::rolling::daily(&log_dir, "autosubs.log");
    let (nb_writer, guard) = tracing_appender::non_blocking(file_appender);

    if let Ok(mut g) = FILE_GUARD.lock() {
        *g = Some(guard);
    }

    // File layer (no ANSI)
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(nb_writer)
        .with_target(true)
        .with_level(true)
        .compact();

    // Memory layer
    let mem_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(MemoryMakeWriter)
        .with_target(true)
        .with_level(true)
        .compact();

    let subscriber = Registry::default().with(file_layer).with(mem_layer);
    let _ = tracing::subscriber::set_global_default(subscriber);

    tracing::info!(target: "autosubs", path = %log_dir.display(), "logging initialized");
}

#[tauri::command]
pub fn get_backend_logs() -> String {
    if let Ok(guard) = MEMORY_LOGS.read() {
        guard.iter().cloned().collect::<Vec<_>>().join("\n")
    } else {
        String::new()
    }
}

#[tauri::command]
pub fn clear_backend_logs() {
    if let Ok(mut guard) = MEMORY_LOGS.write() { guard.clear(); }
}

#[tauri::command]
pub fn get_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let dir = resolve_log_dir(&app);
    ensure_dir(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}
