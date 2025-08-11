// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tauri::RunEvent;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};

// Import plugins
use tauri_plugin_dialog::init as dialog_plugin;
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
        .plugin(tauri_plugin_os::init())
        .plugin(StoreBuilder::default().build())
        // Register each plugin
        .plugin(http_plugin())
        .plugin(fs_plugin())
        .plugin(dialog_plugin())
        .plugin(process_plugin())
        .plugin(shell_plugin())
        .setup(|_app| {
            // Any additional setup logic if needed
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

                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        // short timeout to avoid hanging on exit
                        let client = Client::builder()
                            .no_proxy()
                            .timeout(Duration::from_millis(750))
                            .build()
                            .unwrap_or_else(|_| Client::new());

                        let _ = client
                            .post("http://localhost:56002/")
                            .header("Connection", "close")
                            .json(&json!({ "func": "Exit" }))
                            .send()
                            .await;

                        // now actually exit the app
                        app_handle.exit(0);

                        // On Windows, some background tasks can keep the process around.
                        // Add a short fallback to force-terminate if the graceful exit didn't complete.
                        #[cfg(target_os = "windows")]
                        {
                            tokio::time::sleep(Duration::from_millis(1200)).await;
                            // last resort hard exit
                            std::process::exit(0);
                        }
                    });
                }
                RunEvent::WindowEvent { event, .. } => {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        // When user closes the window (e.g., mac red button), request app exit.
                        // The ExitRequested handler will perform the actual shutdown flow.
                        if !EXITING.load(AtomicOrdering::SeqCst) {
                            app.exit(0);
                        }
                    }
                }
                _ => {}
            }
        });
}
