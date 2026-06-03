// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tauri::{Manager, RunEvent};
use tauri::Emitter; // for app.emit
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering as AtomicOrdering};
use std::sync::Arc;
use tokio::sync::Notify;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

// Import plugins
use tauri_plugin_fs::init as fs_plugin;
use tauri_plugin_http::init as http_plugin;
use tauri_plugin_process::init as process_plugin;
use tauri_plugin_shell::init as shell_plugin;
use tauri_plugin_shell::ShellExt; // for app.shell()
use tauri_plugin_store::Builder as StoreBuilder;
use tauri_plugin_clipboard_manager::init as clipboard_plugin;
use tauri_plugin_opener::init as opener_plugin;
use tauri_plugin_single_instance::init as single_instance_plugin;
use tokio::process::Command as TokioCommand;

mod audio_preprocess;
mod models;
mod transcription_api;
mod transcript_types;
mod logging;
mod resolve_bridge;
mod adobe_bridge;
mod cli;
#[cfg(target_os = "macos")]
mod traffic_lights;

// Include integration-like tests that need crate visibility
#[cfg(test)]
mod tests;

// Global guard to avoid re-entrant exit handling
static EXITING: AtomicBool = AtomicBool::new(false);

/// Read the Windows system proxy from the Internet Settings registry key and inject it
/// into the process environment as HTTP_PROXY / HTTPS_PROXY so that HTTP clients that
/// read proxy settings from env vars (ureq used by hf-hub, reqwest) can use the proxy
/// that VPN and proxy software configures via Windows Settings.
///
/// Only runs when the env vars are not already set, so explicit overrides (e.g. from a
/// launch script) are always preserved.
#[cfg(target_os = "windows")]
fn setup_proxy_env() {
    let already_set = std::env::var_os("HTTP_PROXY").is_some()
        || std::env::var_os("HTTPS_PROXY").is_some()
        || std::env::var_os("http_proxy").is_some()
        || std::env::var_os("https_proxy").is_some()
        || std::env::var_os("ALL_PROXY").is_some();
    if already_set {
        return;
    }

    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(ie) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings") else {
        return;
    };

    let enabled: u32 = ie.get_value("ProxyEnable").unwrap_or(0u32);
    if enabled == 0 {
        return;
    }

    let server: String = match ie.get_value("ProxyServer") {
        Ok(s) => s,
        Err(_) => return,
    };
    if server.is_empty() {
        return;
    }

    // ProxyServer is either a bare "host:port" or a semicolon-separated
    // "proto=host:port" list (e.g. "http=127.0.0.1:8080;https=127.0.0.1:8080;socks=127.0.0.1:1080").
    let make_url = |addr: &str| -> String {
        if addr.starts_with("http://") || addr.starts_with("https://") || addr.starts_with("socks") {
            addr.to_string()
        } else {
            format!("http://{}", addr)
        }
    };

    // Parse HTTP_PROXY / HTTPS_PROXY from the ProxyServer value.
    // ProxyServer is either a bare "host:port" (applies to all protocols, use as HTTP proxy)
    // or a semicolon-separated "proto=host:port" list. Only map http/https entries —
    // never fall back to socks entries, because reqwest has no SOCKS support in this build
    // and speaking HTTP proxy protocol to a SOCKS listener causes immediate failures.
    let (http_url, https_url) = if server.contains('=') {
        let find = |proto: &str| -> Option<String> {
            server
                .split(';')
                .find(|s| s.to_ascii_lowercase().starts_with(&format!("{}=", proto)))
                .and_then(|s| s.splitn(2, '=').nth(1))
                .map(|addr| make_url(addr))
        };
        // Only use explicitly named http/https entries; skip socks-only configurations.
        let http = find("http");
        let https = find("https").or_else(|| find("http"));
        (http, https)
    } else {
        // Bare "host:port" means use for all protocols including HTTP — this is correct.
        let url = make_url(&server);
        (Some(url.clone()), Some(url))
    };

    if let Some(ref url) = http_url {
        unsafe {
            std::env::set_var("HTTP_PROXY", url);
            std::env::set_var("http_proxy", url);
        }
    }
    if let Some(ref url) = https_url {
        unsafe {
            std::env::set_var("HTTPS_PROXY", url);
            std::env::set_var("https_proxy", url);
        }
    }

    // Build NO_PROXY from the WinINet ProxyOverride list so that local
    // connections (Resolve bridge on 127.0.0.1:56002, etc.) are never
    // routed through the proxy. Always include loopback addresses even if
    // ProxyOverride is absent; WinINet's "<local>" sentinel is replaced
    // with the canonical addresses that ureq/reqwest understand.
    let existing_no_proxy = std::env::var_os("NO_PROXY")
        .or_else(|| std::env::var_os("no_proxy"))
        .is_some();
    if !existing_no_proxy {
        let mut no_proxy_entries: Vec<String> =
            vec!["127.0.0.1".into(), "localhost".into(), "::1".into()];

        if let Ok(override_val) = ie.get_value::<String, _>("ProxyOverride") {
            for entry in override_val.split(';') {
                let entry = entry.trim();
                if entry.is_empty() || entry.eq_ignore_ascii_case("<local>") {
                    // <local> is already covered by the loopback entries above.
                    continue;
                }
                no_proxy_entries.push(entry.to_string());
            }
        }

        let no_proxy = no_proxy_entries.join(",");
        unsafe {
            std::env::set_var("NO_PROXY", &no_proxy);
            std::env::set_var("no_proxy", &no_proxy);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn setup_proxy_env() {}


#[cfg(target_os = "linux")]
fn is_newer_version(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Option<(u32, u32, u32)> {
        let parts: Vec<u32> = s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect();
        if parts.len() >= 3 { Some((parts[0], parts[1], parts[2])) } else { None }
    };
    matches!((parse(latest), parse(current)), (Some(l), Some(c)) if l > c)
}

struct InstallSignal(Arc<Notify>);

#[tauri::command]
fn trigger_install_update(state: tauri::State<InstallSignal>) {
    state.0.notify_one();
}

/// Build the main GUI window programmatically.
///
/// The window is intentionally NOT declared in `tauri.conf.json`: a config-defined
/// window is created automatically at startup, which spins up a webview even for a
/// headless CLI run (adding startup cost, a dock/taskbar flash, and a needless
/// WebView/WebKitGTK dependency). Creating it here means it only exists in GUI mode.
///
/// Mirrors the previous `tauri.conf.json` window config. It starts hidden and is
/// shown later (after the macOS traffic-light positioner is installed), matching the
/// existing startup flow.
fn create_main_window(app: &tauri::AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    #[allow(unused_mut)]
    let mut builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("AutoSubs")
            .inner_size(750.0, 700.0)
            .decorations(true)
            .accept_first_mouse(true)
            .visible(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .traffic_light_position(tauri::LogicalPosition::new(16.0_f64, 25.0_f64));
    }

    // `zoom_hotkeys_enabled` is only available off macOS without the
    // `macos-private-api` feature; matches the old config's `zoomHotkeysEnabled`.
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.zoom_hotkeys_enabled(true);
    }

    builder.build()
}

fn main() {
    // Inject system proxy env vars before any thread or HTTP client is created so
    // that both ureq (hf-hub) and reqwest pick up the Windows system proxy set by
    // VPN software via WinINet.
    setup_proxy_env();

    // Route whisper.cpp C-side logs through Rust's tracing system so they can be
    // filtered rather than being dumped raw to stderr.
    transcription_engine::install_logging_hooks();

    // Decide GUI vs headless from raw argv *before* building, so we can hide the
    // window and skip GUI-only plugins (single-instance would forward our args to
    // a running GUI and exit, breaking a CLI run while the app is open).
    let headless = cli::is_headless_invocation();
    if headless {
        cli::attach_console();
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(StoreBuilder::default().build())
        // Register each plugin
        .plugin(http_plugin())
        .plugin(fs_plugin())
        .plugin(process_plugin())
        .plugin(shell_plugin())
        .plugin(clipboard_plugin())
        .plugin(opener_plugin())
        .plugin(tauri_plugin_cli::init());

    if !headless {
        builder = builder.plugin(single_instance_plugin(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched
            let _ = app.get_webview_window("main").map(|w| w.set_focus());
        }));
    }

    builder
        .setup(move |app| {
            // Initialize backend logging (file + in-memory ring buffer). Logs go to
            // the log file only, never stdout/stderr, so CLI output stays clean.
            crate::logging::init_logging(&app.handle());

            if headless {
                // Headless/CLI: never create a window. Hide the macOS dock icon so a
                // CLI run is fully invisible, then run the subcommand and exit.
                #[cfg(target_os = "macos")]
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    cli::run(handle).await;
                });
                return Ok(());
            }

            // GUI mode: create the main window programmatically (see create_main_window
            // for why it isn't declared in tauri.conf.json).
            create_main_window(app.handle())?;

            crate::adobe_bridge::init_adobe_server(app.handle().clone());

            // Set window title to "AutoSubs" on Windows and Linux for taskbar display
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title("AutoSubs");
                }
            }

            // Set traffic light position programmatically on macOS.
            // `trafficLightPosition` in tauri.conf.json is only applied at window
            // creation and AppKit resets the button layout on various lifecycle
            // events in packaged builds, so re-apply it here and on window events.
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // Clearing the title triggers an AppKit titlebar relayout that
                    // resets the traffic lights (tauri-apps/tauri#13044), so do it
                    // BEFORE installing our positioner — otherwise the immediate
                    // apply inside `install` is undone right after it runs.
                    let _ = window.set_title("");
                    crate::traffic_lights::install(&window);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            // Startup sidecar health check: ffmpeg availability & version
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let mut ffmpeg_ok = false;
                    let mut ffmpeg_version = String::new();

                    // ffmpeg -version (sidecar first, then system fallback)
                    match app_handle.shell().sidecar("ffmpeg") {
                        Ok(cmd) => {
                            match cmd.args(["-version"]).output().await {
                                Ok(out) if out.status.success() => {
                                    ffmpeg_ok = true;
                                    let stdout = String::from_utf8_lossy(&out.stdout);
                                    ffmpeg_version = stdout.lines().next().unwrap_or("").to_string();
                                    tracing::info!("ffmpeg check (sidecar): ok=true, version=\"{}\"", ffmpeg_version);
                                }
                                Ok(out) => {
                                    let stderr = String::from_utf8_lossy(&out.stderr);
                                    tracing::warn!("ffmpeg sidecar -version exited non-zero. stderr: {}", stderr);
                                    // fallback to system
                                    if let Ok(sys) = TokioCommand::new("ffmpeg").arg("-version").output().await {
                                        ffmpeg_ok = sys.status.success();
                                        let stdout = String::from_utf8_lossy(&sys.stdout);
                                        ffmpeg_version = stdout.lines().next().unwrap_or("").to_string();
                                        tracing::info!("ffmpeg check (system): ok={}, version=\"{}\"", ffmpeg_ok, ffmpeg_version);
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("ffmpeg sidecar execution failed: {:?}", e);
                                    if let Ok(sys) = TokioCommand::new("ffmpeg").arg("-version").output().await {
                                        ffmpeg_ok = sys.status.success();
                                        let stdout = String::from_utf8_lossy(&sys.stdout);
                                        ffmpeg_version = stdout.lines().next().unwrap_or("").to_string();
                                        tracing::info!("ffmpeg check (system): ok={}, version=\"{}\"", ffmpeg_ok, ffmpeg_version);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("ffmpeg sidecar not found/failed to init: {:?}", e);
                            if let Ok(sys) = TokioCommand::new("ffmpeg").arg("-version").output().await {
                                ffmpeg_ok = sys.status.success();
                                let stdout = String::from_utf8_lossy(&sys.stdout);
                                ffmpeg_version = stdout.lines().next().unwrap_or("").to_string();
                                tracing::info!("ffmpeg check (system): ok={}, version=\"{}\"", ffmpeg_ok, ffmpeg_version);
                            }
                        }
                    }

                    // Emit an event to frontend so users can access diagnostics quickly
                    let payload = json!({
                        "ffmpeg_ok": ffmpeg_ok,
                        "ffmpeg_version": ffmpeg_version,
                    });
                    let _ = app_handle.emit("sidecar-health", payload);

                    if !ffmpeg_ok {
                        tracing::warn!("One or more sidecars appear unavailable. On Windows, AV or SmartScreen may block sidecars; try 'Open Logs Folder' for details.");
                    }
                });
            }

            // Check for updates in the background on startup
            let install_signal = Arc::new(Notify::new());
            app.manage(InstallSignal(install_signal.clone()));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                #[cfg(target_os = "linux")]
                {
                    // The Tauri updater only supports AppImage on Linux; we distribute .deb and
                    // Flatpak instead. Fetch latest.json ourselves and emit a link for the user.
                    let current = handle.package_info().version.to_string();
                    let endpoint = "https://github.com/tmoroney/auto-subs/releases/latest/download/latest.json";
                    if let Ok(client) = reqwest::Client::builder()
                        .timeout(Duration::from_secs(10))
                        .build()
                    {
                        if let Ok(resp) = client.get(endpoint).send().await {
                            if let Ok(body) = resp.json::<serde_json::Value>().await {
                                if let Some(latest) = body.get("version").and_then(|v| v.as_str()) {
                                    if is_newer_version(latest, &current) {
                                        let _ = handle.emit("update-available-link", json!({ "version": latest }));
                                    }
                                }
                            }
                        }
                    }
                }

                #[cfg(not(target_os = "linux"))]
                if let Ok(builder) = handle.updater_builder().build() {
                  if let Ok(Some(info)) = builder.check().await {
                    let title = "Update available".to_string();
                    let message = format!("Version {} is available.\nInstall now?", info.version);
                    let handle_for_cb = handle.clone();
                    handle
                      .dialog()
                      .message(message)
                      .title(title)
                      .buttons(MessageDialogButtons::OkCancelCustom("Install".to_string(), "Later".to_string()))
                      .show(move |should_update| {
                        if should_update {
                          let handle_for_dl = handle_for_cb.clone();
                          let signal = install_signal.clone();
                          tauri::async_runtime::spawn(async move {
                            if let Ok(builder2) = handle_for_dl.updater_builder().build() {
                              if let Ok(Some(update2)) = builder2.check().await {
                                let downloaded = Arc::new(AtomicU64::new(0));
                                let handle_progress = handle_for_dl.clone();

                                let bytes = match update2
                                  .download(
                                    move |chunk, total| {
                                      let prev = downloaded.fetch_add(chunk as u64, AtomicOrdering::Relaxed);
                                      let current = prev + chunk as u64;
                                      let percentage = total.map(|t| if t > 0 { (current as f64 / t as f64 * 100.0).min(100.0) } else { 0.0 }).unwrap_or(0.0);
                                      let _ = handle_progress.emit("update-progress", json!({
                                        "percentage": percentage,
                                        "downloaded": current,
                                        "total": total.unwrap_or(0)
                                      }));
                                    },
                                    || {},
                                  )
                                  .await
                                {
                                  Ok(bytes) => bytes,
                                  Err(e) => {
                                    tracing::error!("Update download failed: {}", e);
                                    let _ = handle_for_dl.emit("update-error", json!({ "error": e.to_string() }));
                                    return;
                                  }
                                };

                                let _ = handle_for_dl.emit("update-ready", json!({}));
                                signal.notified().await;

                                let _ = handle_for_dl.emit("update-installing", json!({}));
                                if let Err(e) = update2.install(bytes) {
                                  tracing::error!("Update install failed: {}", e);
                                  let _ = handle_for_dl.emit("update-error", json!({ "error": e.to_string() }));
                                  return;
                                }

                                let _ = handle_for_dl.emit("update-restarting", json!({}));
                                handle_for_dl.restart();
                              }
                            }
                          });
                        }
                      });
                  }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            transcription_api::transcribe_audio,
            transcription_api::cancel_transcription,
            transcription_api::reformat_subtitles,
            models::get_downloaded_models,
            models::delete_model,
            logging::get_backend_logs,
            logging::clear_backend_logs,
            logging::get_log_dir,
            logging::export_backend_logs,
            logging::open_log_dir,
            resolve_bridge::resolve_bridge,
            adobe_bridge::send_to_adobe,
            trigger_install_update,
            audio_preprocess::extract_audio_peaks,
            cli::cli_command_status,
            cli::install_cli_command,
            cli::uninstall_cli_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(move |app, event| {
            match event {
                RunEvent::Ready => {
                    // Headless runs keep the window hidden; cli::run drives the work
                    // and exits the process itself.
                    if headless {
                        return;
                    }
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        for delay_ms in [100_u64, 500, 1200] {
                            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                // These late show()/set_focus() calls trigger an AppKit
                                // titlebar relayout that resets the traffic lights, and
                                // set_focus() on an already-focused window emits no
                                // Focused event — so the install()-registered listener
                                // won't fire. Re-apply explicitly to keep them aligned.
                                #[cfg(target_os = "macos")]
                                crate::traffic_lights::position_on_main_thread(&window);
                            }
                        }
                    });
                }
                RunEvent::ExitRequested { api, code, .. } => {
                    if code == Some(tauri::RESTART_EXIT_CODE) {
                        return;
                    }

                    // If we're already exiting, don't intercept again; allow exit to proceed
                    if EXITING.swap(true, AtomicOrdering::SeqCst) {
                        return;
                    }

                    // keep the app alive long enough to send the shutdown signal
                    api.prevent_exit();

                    // Proactively cancel any active long-running tasks (e.g., transcription)
                    if let Ok(mut should_cancel) = crate::transcription_api::SHOULD_CANCEL.lock() {
                        *should_cancel = true;
                    }

                    // Windows: do a small blocking send inline so we don't exit before the request is on the wire
                    #[cfg(target_os = "windows")]
                    {
                        let url = "http://127.0.0.1:56002/";
                        let bc = reqwest::blocking::Client::builder()
                            .no_proxy()
                            .tcp_nodelay(true)
                            .timeout(Duration::from_millis(800))
                            .build();
                        if let Ok(bc) = bc {
                            let _ = bc
                                .post(url)
                                .header("Connection", "close")
                                .json(&json!({ "func": "Exit" }))
                                .send();
                        }

                        // As an extra-safe fallback, send a raw HTTP request over TCP synchronously
                        {
                            use std::io::Write;
                            use std::net::TcpStream;
                            let body = b"{\"func\":\"Exit\"}";
                            let req = format!(
                                "POST / HTTP/1.1\r\nHost: 127.0.0.1:56002\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
                                body.len()
                            );
                            if let Ok(mut stream) = TcpStream::connect_timeout(
                                &"127.0.0.1:56002".parse().unwrap(),
                                Duration::from_millis(400),
                            ) {
                                let _ = stream.set_nodelay(true);
                                let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
                                let _ = stream.write_all(req.as_bytes());
                                let _ = stream.write_all(body);
                                let _ = stream.flush();
                            }
                        }
                        // brief pause to allow flush
                        std::thread::sleep(Duration::from_millis(250));

                        // now actually exit the app
                        app.exit(0);

                        // last resort hard exit after a grace period
                        std::thread::spawn(|| {
                            std::thread::sleep(Duration::from_millis(1200));
                            std::process::exit(0);
                        });
                    }

                    // Non-Windows: keep async path
                    #[cfg(not(target_os = "windows"))]
                    {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            // short timeout to avoid hanging on exit
                            let client = Client::builder()
                                .no_proxy()
                                .tcp_nodelay(true)
                                .timeout(Duration::from_millis(750))
                                .build()
                                .unwrap_or_else(|_| Client::new());

                            let url = "http://127.0.0.1:56002/";
                            let _ = client
                                .post(url)
                                .header("Connection", "close")
                                .json(&json!({ "func": "Exit" }))
                                .send()
                                .await;

                            tokio::time::sleep(Duration::from_millis(150)).await;
                            app_handle.exit(0);
                        });
                    }
                }
                RunEvent::WindowEvent { event, .. } => {
                    // Ensure clicking the window close (X) reliably routes through ExitRequested
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if !EXITING.load(AtomicOrdering::SeqCst) {
                            app.exit(0);
                        }
                    }
                }
                _ => {}
            }
        });
}
