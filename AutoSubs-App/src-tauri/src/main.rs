// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tauri::RunEvent;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

// Import plugins
use tauri_plugin_fs::init as fs_plugin;
use tauri_plugin_http::init as http_plugin;
use tauri_plugin_process::init as process_plugin;
use tauri_plugin_shell::init as shell_plugin;
use tauri_plugin_store::Builder as StoreBuilder;

mod audio;
mod config;
mod models;
mod transcribe;
mod transcript;

// Global guard to avoid re-entrant exit handling
static EXITING: AtomicBool = AtomicBool::new(false);

fn main() {
    whisper_rs::install_logging_hooks();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(StoreBuilder::default().build())
        // Register each plugin
        .plugin(http_plugin())
        .plugin(fs_plugin())
        .plugin(process_plugin())
        .plugin(shell_plugin())
        .setup(|app| {
            // Check for updates in the background on startup (Tauri v2 Updater)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(builder) = handle.updater_builder().build() {
                  if let Ok(Some(info)) = builder.check().await {
                    // Show a non-blocking confirmation dialog
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
                          // Perform download+install asynchronously
                          let handle_for_dl = handle_for_cb.clone();
                          tauri::async_runtime::spawn(async move {
                            if let Ok(builder2) = handle_for_dl.updater_builder().build() {
                              if let Ok(Some(update2)) = builder2.check().await {
                                if let Err(e) = update2
                                  .download_and_install(
                                    |chunk, total| eprintln!("Downloading update: {} / {:?}", chunk, total),
                                    || eprintln!("Download finished"),
                                  )
                                  .await
                                {
                                  eprintln!("Update failed: {e}");
                                  return;
                                }

                                // Inform user of success (non-blocking message)
                                handle_for_dl
                                  .dialog()
                                  .message("Update installed. It will take effect the next time you open the app.")
                                  .title("AutoSubs updated")
                                  .buttons(MessageDialogButtons::Ok)
                                  .show(|_| {});
                                // Optional: restart immediately
                                // handle_for_dl.restart();
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
            transcribe::transcribe_audio,
            transcribe::cancel_transcription,
            models::get_downloaded_models,
            models::delete_model
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|app, event| {
            match event {
                RunEvent::ExitRequested { api, .. } => {
                    // If we're already exiting, don't intercept again; allow exit to proceed
                    if EXITING.swap(true, AtomicOrdering::SeqCst) {
                        return;
                    }

                    // keep the app alive long enough to send the shutdown signal
                    api.prevent_exit();

                    // Proactively cancel any active long-running tasks (e.g., transcription)
                    if let Ok(mut should_cancel) = crate::transcribe::SHOULD_CANCEL.lock() {
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
