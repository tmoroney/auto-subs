//! # Logging System
//!
//! This module provides a centralized logging system for AutoSubs based on `tracing`.
//! It is designed with three primary goals:
//!
//! 1. **Privacy**: Sensitive information (specifically user home directories) is
//!    automatically redacted from all logs before they hit the disk or the memory buffer.
//! 2. **Performance**: File logging is non-blocking to ensure transcription and UI
//!    performance are never stalled by disk I/O.
//!    In-memory logs are stored in a fixed-size ring buffer (`MEMORY_LOGS`).
//! 3. **High Signal, Low Noise**: External libraries (hyper, reqwest) are filtered to
//!    `WARN` level, while `autosubs` and `transcription_engine` are kept at `DEBUG` or `INFO`.
//!    Internal "chatty" traces (e.g., individual Whisper segments) are kept at `TRACE`
//!    level and filtered out of standard logs.
//!
//! ## Privacy Redaction (`redact_paths`)
//! The `RedactingWriter` wrapper automatically replaces any occurrences of the user's
//! home directory (e.g., `/Users/tom/`) with `~`. It is robust enough to handle:
//! - Standard Unix/macOS paths.
//! - Windows backslashes and forward slashes.
//! - Escaped backslashes (common in Rust `Debug` output).
//!
//! ## Retention
//! Standard logs are rotated daily and kept for 7 days. Exported logs are never
//! automatically deleted.

use std::collections::VecDeque;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, SystemTime};

use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager, Runtime};
use tracing_subscriber::{fmt, layer::SubscriberExt, Registry, EnvFilter};

// Keep the non-blocking worker guard alive for the lifetime of the app
static FILE_GUARD: Lazy<Mutex<Option<tracing_appender::non_blocking::WorkerGuard>>> =
    Lazy::new(|| Mutex::new(None));

// User's home directory for path redaction
static HOME_DIR: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

// In-memory ring buffer of recent log lines
const MAX_LOG_LINES: usize = 20_000;
static MEMORY_LOGS: Lazy<RwLock<VecDeque<String>>> = Lazy::new(|| RwLock::new(VecDeque::new()));

fn redact_paths(input: &str) -> String {
    let mut output = input.to_string();
    if let Ok(guard) = HOME_DIR.read() {
        if let Some(ref home) = *guard {
            // Standard replacement
            output = output.replace(home, "~");

            // Handle Windows-specific variations if applicable
            if home.contains('\\') {
                // Escaped backslashes (common in Debug output)
                let escaped = home.replace("\\", "\\\\");
                output = output.replace(&escaped, "~");

                // Forward slashes (common in some tool outputs)
                let forward = home.replace("\\", "/");
                output = output.replace(&forward, "~");
            }
        }
    }
    output
}

// A wrapper writer that redacts sensitive paths before writing
struct RedactingWriter<W: Write> {
    inner: W,
}

impl<W: Write> Write for RedactingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let s = String::from_utf8_lossy(buf);
        let redacted = redact_paths(&s);
        self.inner.write_all(redacted.as_bytes())?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

// A wrapper MakeWriter that creates RedactingWriters
struct RedactingMakeWriter<M> {
    inner: M,
}

impl<'a, M> fmt::MakeWriter<'a> for RedactingMakeWriter<M>
where
    M: fmt::MakeWriter<'a>,
{
    type Writer = RedactingWriter<M::Writer>;

    fn make_writer(&'a self) -> Self::Writer {
        RedactingWriter {
            inner: self.inner.make_writer(),
        }
    }
}

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
            let s = String::from_utf8_lossy(&self.buf).to_string();
            let mut s = redact_paths(&s);
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

const LOG_RETENTION_DAYS: u64 = 7;

fn cleanup_old_logs(log_dir: &Path) {
    let retention = Duration::from_secs(LOG_RETENTION_DAYS * 24 * 60 * 60);
    let now = SystemTime::now();

    let Ok(entries) = fs::read_dir(log_dir) else { return };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        // Only clean up autosubs log files, not the active log or exported logs
        if !name.starts_with("autosubs.log") || name == "autosubs.log" {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        let Ok(modified) = metadata.modified() else { continue };
        let Ok(age) = now.duration_since(modified) else { continue };
        if age > retention {
            let _ = fs::remove_file(&path);
        }
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

    // Initialize home directory for path redaction
    if let Ok(mut home_guard) = HOME_DIR.write() {
        if let Ok(home) = app.path().home_dir() {
            *home_guard = Some(home.to_string_lossy().to_string());
        }
    }

    let log_dir = resolve_log_dir(app);
    let _ = fs::create_dir_all(&log_dir);
    cleanup_old_logs(&log_dir);

    let log_dir_redacted = redact_paths(&log_dir.to_string_lossy());

    let file_appender = tracing_appender::rolling::daily(&log_dir, "autosubs.log");
    let (nb_writer, guard) = tracing_appender::non_blocking(file_appender);

    if let Ok(mut g) = FILE_GUARD.lock() {
        *g = Some(guard);
    }

    // File layer (no ANSI, redacted)
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(RedactingMakeWriter { inner: nb_writer })
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

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            EnvFilter::new("info")
                .add_directive("hyper=warn".parse().unwrap())
                .add_directive("hyper_util=warn".parse().unwrap())
                .add_directive("reqwest=warn".parse().unwrap())
                .add_directive("tauri=info".parse().unwrap())
                .add_directive("autosubs=debug".parse().unwrap())
                .add_directive("transcription_engine=debug".parse().unwrap())
                .add_directive("whisper_rs=warn".parse().unwrap())
                .add_directive("ort=warn".parse().unwrap())
        });

    let subscriber = Registry::default()
        .with(filter)
        .with(file_layer)
        .with(mem_layer);
    let _ = tracing::subscriber::set_global_default(subscriber);

    tracing::info!(target: "autosubs", path = %log_dir_redacted, "logging initialized");
    tracing::info!(
        target: "autosubs",
        "autosubs v{} ({} {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
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

#[tauri::command]
pub fn export_backend_logs<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    // Ensure log directory exists
    let dir = resolve_log_dir(&app);
    ensure_dir(&dir).map_err(|e| e.to_string())?;

    // Collect logs from in-memory ring buffer
    let content = if let Ok(guard) = MEMORY_LOGS.read() {
        guard.iter().cloned().collect::<Vec<_>>().join("\n")
    } else {
        String::new()
    };

    // Write to a deterministic filename so users can find it easily
    let out_path = dir.join("autosubs-export.log");
    fs::write(&out_path, content).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = resolve_log_dir(&app);
    ensure_dir(&dir).map_err(|e| e.to_string())?;

    let path = dir.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
