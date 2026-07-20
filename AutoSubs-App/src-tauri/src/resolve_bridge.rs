//! Thin HTTP bridge to the AutoSubs Lua server that runs inside DaVinci Resolve.
//!
//! The frontend used to POST to `http://localhost:56002/` directly via
//! `@tauri-apps/plugin-http`, but that plugin's response-body stream was
//! observed to hang (headers arrived with `200 OK`, `.json()` / `.text()`
//! never resolved) against this particular server's short `Connection: close`
//! responses.
//!
//! Using `reqwest` from Rust sidesteps the plugin entirely. We expose a
//! single `resolve_bridge` command that takes a JSON payload, posts it to the
//! Lua server, and returns the raw response body as a string. The frontend
//! then `JSON.parse`s the result itself.

use std::time::Duration;

use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::json;

const RESOLVE_ENDPOINT: &str = "http://127.0.0.1:56002/";

static RESOLVE_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .connection_verbose(false)
        .build()
        .expect("failed to build Resolve HTTP client")
});

#[derive(Debug, Deserialize)]
pub struct ResolveBridgeArgs {
    /// Arbitrary JSON object to send as the POST body.
    pub payload: serde_json::Value,
    /// Optional override of the default request timeout (seconds). Defaults
    /// to 180 seconds because `ExportAudio` etc. can stall Resolve's
    /// scripting API for many seconds before returning, especially on Windows.
    #[serde(default, rename = "timeoutSecs")]
    pub timeout_secs: Option<u64>,
}

/// Posts `args.payload` as JSON to the Resolve Lua server and returns the raw
/// response body. Errors are returned as strings so the frontend sees them as
/// rejected invoke promises.
#[tauri::command]
pub async fn resolve_bridge(args: ResolveBridgeArgs) -> Result<String, String> {
    let timeout = Duration::from_secs(args.timeout_secs.unwrap_or(180));

    let response = RESOLVE_CLIENT
        .post(RESOLVE_ENDPOINT)
        .timeout(timeout)
        .header("Content-Type", "application/json")
        .json(&args.payload)
        .send()
        .await
        .map_err(|e| {
            tracing::debug!("resolve_bridge: could not connect to Resolve (this is normal if Resolve is closed): {}", e);
            // Distinguish "Resolve offline" from timeouts so the frontend can show
            // a user-facing message instead of a generic error.
            if e.is_connect() {
                "DaVinci Resolve is not running or the AutoSubs bridge is unavailable. \
                 Please open DaVinci Resolve and launch the AutoSubs script from \
                 Workspace → Scripts → AutoSubs."
                    .to_string()
            } else if e.is_timeout() {
                format!("DaVinci Resolve did not respond within {} seconds. \
                         It may be busy or unresponsive — try again, or restart the \
                         AutoSubs script in Resolve.", timeout.as_secs())
            } else {
                format!("resolve request failed: {}", e)
            }
        })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("failed to read response body: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Resolve server returned {}: {}",
            status.as_u16(),
            body
        ));
    }

    Ok(body)
}

/// Sends an arbitrary JSON payload to the Resolve Lua server and returns the
/// raw response body. Used internally for version probes and hot-reload
/// requests; the command above is the public frontend-facing entry point.
pub async fn send_resolve_payload(
    payload: serde_json::Value,
    timeout: Duration,
) -> Result<String, String> {
    let response = RESOLVE_CLIENT
        .post(RESOLVE_ENDPOINT)
        .timeout(timeout)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("resolve request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("failed to read response body: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Resolve server returned {}: {}",
            status.as_u16(),
            body
        ));
    }

    Ok(body)
}

/// Queries the Resolve server for its version. Returns `None` if the server
/// is reachable but does not report a version (i.e. it predates the
/// `GetVersion` endpoint).
pub async fn resolve_server_version() -> Result<Option<String>, String> {
    let body = send_resolve_payload(json!({"func": "GetVersion"}), Duration::from_secs(2)).await?;
    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("invalid JSON from Resolve server: {}", e))?;
    Ok(parsed
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

/// Asks the running Resolve server to hot-reload itself from the updated
/// application resources. The server replies before it tears down its
/// socket, so this returns as soon as the request is acknowledged.
pub async fn reload_resolve_server() -> Result<(), String> {
    send_resolve_payload(json!({"func": "ReloadServer"}), Duration::from_secs(3)).await?;
    Ok(())
}
