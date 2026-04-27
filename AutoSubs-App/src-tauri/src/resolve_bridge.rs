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

use serde::Deserialize;

const RESOLVE_ENDPOINT: &str = "http://127.0.0.1:56002/";

#[derive(Debug, Deserialize)]
pub struct ResolveBridgeArgs {
    /// Arbitrary JSON object to send as the POST body.
    pub payload: serde_json::Value,
    /// Optional override of the default request timeout (seconds). Defaults
    /// to 180 seconds because `ExportAudio` etc. can stall Resolve's
    /// scripting API for many seconds before returning, especially on Windows.
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

/// Posts `args.payload` as JSON to the Resolve Lua server and returns the raw
/// response body. Errors are returned as strings so the frontend sees them as
/// rejected invoke promises.
#[tauri::command]
pub async fn resolve_bridge(args: ResolveBridgeArgs) -> Result<String, String> {
    let timeout = Duration::from_secs(args.timeout_secs.unwrap_or(180));

    // One-shot client so we never hold a connection open between calls (the
    // Lua server closes the socket after each response anyway).
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .connection_verbose(false)
        .build()
        .map_err(|e| format!("failed to build HTTP client: {}", e))?;

    let response = client
        .post(RESOLVE_ENDPOINT)
        .header("Content-Type", "application/json")
        .json(&args.payload)
        .send()
        .await
        .map_err(|e| {
            // "Resolve offline" is normal if Resolve isn't running or the user is in standalone mode.
            tracing::debug!("resolve_bridge: could not connect to Resolve (this is normal if Resolve is closed): {}", e);
            format!("resolve request failed: {}", e)
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
