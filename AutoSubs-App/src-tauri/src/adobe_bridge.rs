use std::sync::atomic::{AtomicU64, Ordering};
use std::collections::HashMap;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tauri::Manager;
use tauri::Emitter;

static CONNECTION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
const ADOBE_BRIDGE_ADDR: &str = "127.0.0.1:8185";

pub struct AdobeConnection {
    pub id: u64,
    pub sender: mpsc::Sender<String>,
    #[allow(dead_code)]
    pub app_name: String,
}

pub struct AdobeState {
    pub connections: Mutex<HashMap<String, AdobeConnection>>,
}

#[tauri::command]
pub async fn send_to_adobe(
    state: tauri::State<'_, AdobeState>,
    payload: serde_json::Value,
    integration: Option<String>,
) -> Result<String, String> {
    let app_id = integration.unwrap_or_else(|| "adobe".to_string());
    
    let sender = {
        let conn_guard = state.connections.lock().await;
        conn_guard.get(&app_id).map(|conn| conn.sender.clone())
    };

    if let Some(sender) = sender {
        let msg = payload.to_string();
        if sender.send(msg).await.is_err() {
            return Err(format!("Failed to send message to {} (connection lost)", app_id));
        }
        Ok("Message sent".into())
    } else {
        Err(format!("{} not connected", app_id))
    }
}

pub fn init_adobe_server(app_handle: tauri::AppHandle) {
    let adobe_state = AdobeState {
        connections: Mutex::new(HashMap::new()),
    };
    app_handle.manage(adobe_state);

    tauri::async_runtime::spawn(async move {
        let addr = ADOBE_BRIDGE_ADDR;
        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("Failed to bind Adobe bridge server to {}: {}", addr, e);
                return;
            }
        };
        tracing::info!("Adobe bridge server listening on {}", addr);

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let app_handle_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = handle_connection(stream, app_handle_clone).await {
                            tracing::error!("Error handling Adobe connection: {}", e);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("Failed to accept connection: {}", e);
                }
            }
        }
    });
}

async fn handle_connection(stream: TcpStream, app_handle: tauri::AppHandle) -> Result<(), eyre::Report> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    tracing::info!("Adobe extension attempting to connect...");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::channel::<String>(100);

    let connection_id = CONNECTION_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut detected_app = String::new();

    // Wait for handshake to identify the app with a timeout
    let handshake_res = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        ws_receiver.next()
    ).await;

    if let Ok(Some(Ok(msg))) = handshake_res {
        if let Message::Text(text) = msg {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(text.as_str()) {
                if json_val["type"] == "handshake" {
                    detected_app = json_val["payload"].as_str().unwrap_or("adobe").to_string();
                }
            }
        }
    }

    if detected_app.is_empty() {
        tracing::warn!("Handshake failed or timed out — closing unauthenticated connection");
        return Ok(());
    }

    tracing::info!("Adobe extension connected: {}", detected_app);

    // Store the sender in the state
    {
        let state = app_handle.state::<AdobeState>();
        let mut conn_guard = state.connections.lock().await;
        conn_guard.insert(detected_app.clone(), AdobeConnection {
            id: connection_id,
            sender: tx,
            app_name: detected_app.clone(),
        });
    }

    // Emit event to frontend with app info
    let _ = app_handle.emit("adobe-status", json!({ 
        "status": "connected", 
        "app": detected_app 
    }));

    // Task to send messages from channel to WS
    let mut send_task = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Task to receive messages from WS
    let app_handle_clone = app_handle.clone();
    let app_name_clone = detected_app.clone();
    let mut recv_task = tauri::async_runtime::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(text.as_str()) {
                    // Add app origin info to the message
                    if let Some(obj) = json_val.as_object_mut() {
                        obj.insert("integration".to_string(), json!(app_name_clone));
                    }
                    let _ = app_handle_clone.emit("adobe-message", json_val);
                }
            }
        }
    });

    // Wait for either task to finish (meaning connection lost); abort the other.
    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); },
        _ = &mut recv_task => { send_task.abort(); },
    }

    // Cleanup
    {
        let state = app_handle.state::<AdobeState>();
        let mut conn_guard = state.connections.lock().await;
        if let Some(conn) = conn_guard.get(&detected_app) {
            if conn.id == connection_id {
                conn_guard.remove(&detected_app);
                let _ = app_handle.emit("adobe-status", json!({ 
                    "status": "disconnected", 
                    "app": detected_app 
                }));
                tracing::info!("Adobe extension disconnected: {}", detected_app);
            }
        }
    }

    Ok(())
}
