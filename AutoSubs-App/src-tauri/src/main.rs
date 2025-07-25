// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::Client;
use serde_json::json;
use std::thread;
use tauri::RunEvent;

// Import plugins
use tauri_plugin_dialog::init as dialog_plugin;
use tauri_plugin_fs::init as fs_plugin;
use tauri_plugin_http::init as http_plugin;
use tauri_plugin_process::init as process_plugin;
use tauri_plugin_shell::init as shell_plugin;
use tauri_plugin_store::Builder as StoreBuilder;

mod config;
mod transcribe;
mod transcript;
mod audio;
mod models;

fn main() {
    whisper_rs::install_logging_hooks();
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        // Register each plugin
        .plugin(http_plugin())
        .plugin(fs_plugin())
        .plugin(dialog_plugin())
        .plugin(process_plugin())
        .plugin(shell_plugin())
        .plugin(StoreBuilder::default().build())
        .setup(|_app| {
            // Any additional setup logic if needed
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![transcribe::transcribe_audio, transcribe::cancel_transcription, models::get_downloaded_models, models::delete_model])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::Exit = event {
                // Spawn a new thread to handle the HTTP request asynchronously
                thread::spawn(|| {
                    // Initialize the Tokio runtime
                    let rt =
                        tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

                    // Execute the async block within the runtime
                    rt.block_on(async {
                        // Create a new HTTP client
                        let client = Client::new();

                        // Define the API endpoint
                        let resolve_api = "http://localhost:56002/";

                        // Prepare the JSON payload
                        let payload = json!({ "func": "Exit" });

                        // Send the POST request
                        if let Err(e) = client.post(resolve_api).json(&payload).send().await {
                            // Log the error or handle it as needed
                            eprintln!("Failed to send exit request: {}", e);
                        } else {
                            println!("Exit request sent successfully.");
                        }
                    });
                });
            }
        });
}
