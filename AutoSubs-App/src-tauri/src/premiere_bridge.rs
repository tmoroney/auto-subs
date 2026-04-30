use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tauri::Manager;
use tauri::Emitter;

static CONNECTION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
const PREMIERE_ENDPOINT: &str = "127.0.0.1:8185";

pub struct PremiereConnection {
    pub id: u64,
    pub sender: mpsc::Sender<String>,
}

pub struct PremiereState {
    pub connection: Mutex<Option<PremiereConnection>>,
}

#[tauri::command]
pub async fn send_to_premiere(
    state: tauri::State<'_, PremiereState>,
    payload: serde_json::Value,
) -> Result<String, String> {
    let sender = {
        let conn_guard = state.connection.lock().await;
        if let Some(conn) = &*conn_guard {
            Some(conn.sender.clone())
        } else {
            None
        }
    };

    if let Some(sender) = sender {
        let msg = payload.to_string();
        if sender.send(msg).await.is_err() {
            return Err("Failed to send message to Premiere (connection lost)".into());
        }
        Ok("Message sent".into())
    } else {
        Err("Premiere not connected".into())
    }
}

pub fn init_premiere_server(app_handle: tauri::AppHandle) {
    let premiere_state = PremiereState {
        connection: Mutex::new(None),
    };
    app_handle.manage(premiere_state);

    tauri::async_runtime::spawn(async move {
        let addr = PREMIERE_ENDPOINT;
        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("Failed to bind Premiere server to {}: {}", addr, e);
                return;
            }
        };
        tracing::info!("Premiere server listening on {}", addr);

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let app_handle_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = handle_connection(stream, app_handle_clone).await {
                            tracing::error!("Error handling Premiere connection: {}", e);
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
    tracing::info!("Premiere extension connected");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::channel::<String>(100);

    let connection_id = CONNECTION_ID_COUNTER.fetch_add(1, Ordering::Relaxed);

    // Store the sender in the state
    {
        let state = app_handle.state::<PremiereState>();
        let mut conn_guard = state.connection.lock().await;
        *conn_guard = Some(PremiereConnection {
            id: connection_id,
            sender: tx,
        });
    }

    // Emit event to frontend
    let _ = app_handle.emit("premiere-status", json!({ "status": "connected" }));

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
    let mut recv_task = tauri::async_runtime::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let Message::Text(text) = msg {
                // Forward message to Tauri frontend
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(text.as_str()) {
                    let _ = app_handle_clone.emit("premiere-message", json_val);
                }
            }
        }
    });

    // Wait for either task to finish (meaning connection lost)
    tokio::select! {
        _ = &mut send_task => {},
        _ = &mut recv_task => {},
    }

    // Cleanup
    {
        let state = app_handle.state::<PremiereState>();
        let mut conn_guard = state.connection.lock().await;
        if let Some(ref conn) = *conn_guard {
            if conn.id == connection_id {
                *conn_guard = None;
                let _ = app_handle.emit("premiere-status", json!({ "status": "disconnected" }));
                tracing::info!("Premiere extension disconnected");
            }
        }
    }

    Ok(())
}
