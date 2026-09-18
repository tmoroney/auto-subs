//! File-mailbox bridge to the AutoSubs Lua server that runs inside DaVinci
//! Resolve.
//!
//! Resolve 21.1 (free edition) sandboxes the Lua state that runs
//! Workspace > Scripts scripts: `io`, `ffi`, `package`, `require`,
//! `os.execute` and `bmd.readdir` are all nil, so the old `ljsocket` HTTP
//! server on port 56002 can no longer exist. Instead we use a file mailbox
//! that works on every edition and platform:
//!
//! * Rust -> Lua: we atomically write `request.lua` (a `return {...}` chunk
//!   carrying an id and a JSON body) into a shared mailbox directory. The Lua
//!   loop picks it up with `loadfile`.
//! * Lua -> Rust: the Lua side calls `fusion:SetPrefs` + `SavePrefs()`, which
//!   writes `Fusion.prefs` to disk immediately. We poll that file for an
//!   `Ack = "<id>"` (request picked up) and `Response = "<id>:<base64 json>"`.
//!
//! The mailbox directory is `<data_local_dir>/com.autosubs/resolve-bridge`
//! (LOCALAPPDATA on Windows, ~/Library/Application Support on macOS,
//! XDG_DATA_HOME or ~/.local/share on Linux), matching `bootstrap.lua`.
//!
//! Requests are serialised behind a mutex because the mailbox holds a single
//! request file at a time.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::Mutex;

const RESOLVE_OFFLINE_MESSAGE: &str = "DaVinci Resolve is not running or the AutoSubs bridge is unavailable. \
     Please open DaVinci Resolve (the bridge starts automatically), or run \
     Workspace → Scripts → AutoSubs to restart it.";

/// How long to wait for the Lua side to ack a fresh request before declaring
/// the bridge offline.
const ACK_TIMEOUT: Duration = Duration::from_secs(2);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Serialises mailbox requests: only one request.lua exists at a time.
static REQUEST_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
pub struct ResolveBridgeArgs {
    /// Arbitrary JSON object to send as the request body.
    pub payload: serde_json::Value,
    /// Optional override of the default request timeout (seconds). Defaults
    /// to 180 seconds because `ExportAudio` etc. can stall Resolve's
    /// scripting API for many seconds before returning, especially on Windows.
    #[serde(default, rename = "timeoutSecs")]
    pub timeout_secs: Option<u64>,
}

/// Unique request id, always a decimal string on both sides.
fn next_request_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let counter = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed) % 1000;
    (millis * 1000 + counter).to_string()
}

/// `<data_local_dir>/com.autosubs/resolve-bridge`, matching the Lua side.
fn mailbox_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|d| d.join("com.autosubs").join("resolve-bridge"))
        .ok_or_else(|| "could not determine the local data directory".to_string())
}

/// Per-user Resolve support directory — the parent of `Fusion/Profiles` (where
/// we read prefs) and `Fusion/Scripts` (where resolve_scripts.rs installs the
/// launcher + scriptlib). None when Resolve's layout can't be determined.
pub(crate) fn fusion_support_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // %APPDATA% (Roaming)\Blackmagic Design\DaVinci Resolve\Support
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|p| p.join("Blackmagic Design").join("DaVinci Resolve").join("Support"))
    }
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|p| {
            p.join("Library")
                .join("Application Support")
                .join("Blackmagic Design")
                .join("DaVinci Resolve")
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        dirs::home_dir().map(|p| p.join(".local").join("share").join("DaVinciResolve"))
    }
}

/// Locate `Fusion/Profiles/*/Fusion.prefs`, most recently modified wins.
fn fusion_prefs_path() -> Option<PathBuf> {
    let profiles = fusion_support_dir()?.join("Fusion").join("Profiles");
    let mut best: Option<(SystemTime, PathBuf)> = None;
    for entry in fs::read_dir(profiles).ok()?.flatten() {
        let prefs = entry.path().join("Fusion.prefs");
        if !prefs.is_file() {
            continue;
        }
        let modified = prefs
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
            best = Some((modified, prefs));
        }
    }
    best.map(|(_, p)| p)
}

/// Build the request chunk: `return { id = "<id>", body = [==[<json>]==] }`
/// where the long-bracket level is the smallest `n` such that `]` + `=`*n +
/// `]` does not appear in the body.
fn encode_request(id: &str, body: &str) -> String {
    let mut level = 1usize;
    loop {
        let closing = format!("]{}]", "=".repeat(level));
        if !body.contains(&closing) {
            break;
        }
        level += 1;
    }
    let eq = "=".repeat(level);
    format!("return {{ id = \"{}\", body = [{}[{}]{}] }}", id, eq, body, eq)
}

/// Extract the value of `key = "..."` assignments from the prefs file text.
/// The key must start at a word boundary (the preceding char is not part of
/// an identifier) so e.g. `PlaybackAck` can't match `Ack`. Returns the last
/// match so a stale earlier section can't win.
fn pref_value<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("{} = \"", key);
    let mut result = None;
    let mut offset = 0;
    while let Some(pos) = text[offset..].find(&needle) {
        let abs = offset + pos;
        let boundary = abs == 0
            || !matches!(text.as_bytes()[abs - 1], b'0'..=b'9' | b'a'..=b'z' | b'A'..=b'Z' | b'_');
        let start = abs + needle.len();
        match text[start..].find('"') {
            Some(len) => {
                if boundary {
                    result = Some(&text[start..start + len]);
                }
                offset = start + len;
            }
            None => break,
        }
    }
    result
}

/// Decode a `<id>:<base64 json>` response value. Returns the JSON body only
/// when it is valid base64, UTF-8 and parseable JSON — anything else means we
/// caught the prefs file half-written and should keep polling.
fn decode_response<'a>(value: &'a str, id: &str) -> Option<Result<String, String>> {
    let (rid, encoded) = value.split_once(':')?;
    if rid != id {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    let text = String::from_utf8(bytes).ok()?;
    serde_json::from_str::<serde_json::Value>(&text).ok()?;
    Some(Ok(text))
}

/// If the payload carries a string `filePath`, read that file and attach the
/// parsed JSON as `subtitleData` (the sandboxed Lua side cannot read files).
fn attach_subtitle_data(payload: &mut serde_json::Value) -> Result<(), String> {
    let file_path = match payload.get("filePath").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => return Ok(()),
    };
    let text = fs::read_to_string(&file_path).map_err(|e| {
        format!("could not read subtitle file {}: {}", file_path, e)
    })?;
    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        format!("could not parse subtitle file {}: {}", file_path, e)
    })?;
    payload["subtitleData"] = data;
    Ok(())
}

fn delete_request_file(path: &std::path::Path) {
    // Retry a few times: on Windows the delete can fail while Lua still has
    // the file open.
    for _ in 0..5 {
        if fs::remove_file(path).is_ok() || !path.exists() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Sends an arbitrary JSON payload to the Resolve Lua server and returns the
/// raw response body. Used internally for version probes and hot-reload
/// requests; the command below is the public frontend-facing entry point.
pub async fn send_resolve_payload(
    mut payload: serde_json::Value,
    timeout: Duration,
) -> Result<String, String> {
    let _guard = REQUEST_LOCK.lock().await;

    let dir = mailbox_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create mailbox directory {}: {}", dir.display(), e))?;
    let request_path = dir.join("request.lua");
    // Drop any stale request left over from a previous app run.
    delete_request_file(&request_path);

    attach_subtitle_data(&mut payload)?;

    let id = next_request_id();
    let body = serde_json::to_string(&payload)
        .map_err(|e| format!("could not serialize resolve payload: {}", e))?;
    let chunk = encode_request(&id, &body);

    // Write-then-rename so Lua never sees a half-written request.
    let tmp_path = dir.join("request.lua.tmp");
    fs::write(&tmp_path, &chunk)
        .map_err(|e| format!("could not write mailbox request: {}", e))?;
    fs::rename(&tmp_path, &request_path)
        .map_err(|e| format!("could not publish mailbox request: {}", e))?;

    let result = wait_for_response(&id, timeout).await;
    delete_request_file(&request_path);
    result
}

/// Delete a leftover `request.lua`/`request.lua.tmp` (e.g. the Exit written
/// by `post_resolve_exit` just before the app quit) so a freshly launched
/// Lua script can't replay it. Called once at app startup.
pub fn clear_stale_request() {
    if let Ok(dir) = mailbox_dir() {
        let _ = fs::remove_file(dir.join("request.lua"));
        let _ = fs::remove_file(dir.join("request.lua.tmp"));
    }
}

async fn wait_for_response(id: &str, timeout: Duration) -> Result<String, String> {
    let prefs_path = fusion_prefs_path().ok_or_else(|| RESOLVE_OFFLINE_MESSAGE.to_string())?;

    let deadline = Instant::now() + timeout;
    let ack_deadline = Instant::now() + ACK_TIMEOUT;
    let mut acked = false;

    loop {
        if let Ok(text) = fs::read_to_string(&prefs_path) {
            if let Some(value) = pref_value(&text, "Response") {
                if let Some(result) = decode_response(value, id) {
                    return result;
                }
            }
            if !acked {
                if let Some(ack) = pref_value(&text, "Ack") {
                    if ack == id {
                        acked = true;
                    }
                }
            }
        }

        let now = Instant::now();
        if now >= deadline {
            return Err(format!(
                "DaVinci Resolve did not respond within {} seconds. \
                 It may be busy or unresponsive — try again, or restart the \
                 AutoSubs script in Resolve.",
                timeout.as_secs()
            ));
        }
        if !acked && now >= ack_deadline {
            return Err(RESOLVE_OFFLINE_MESSAGE.to_string());
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

/// Sends `args.payload` through the mailbox to the Resolve Lua server and
/// returns the raw response body. Errors are returned as strings so the
/// frontend sees them as rejected invoke promises.
#[tauri::command]
pub async fn resolve_bridge(args: ResolveBridgeArgs) -> Result<String, String> {
    let timeout = Duration::from_secs(args.timeout_secs.unwrap_or(180));
    send_resolve_payload(args.payload, timeout).await
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
/// application resources. The server writes its response before it reloads,
/// so this returns as soon as the request completes.
pub async fn reload_resolve_server() -> Result<(), String> {
    send_resolve_payload(json!({"func": "ReloadServer"}), Duration::from_secs(3)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_request_picks_safe_long_bracket_level() {
        // Simple body: level 1 ([=[ ... ]=]) suffices; note "]]" inside the
        // body must not close the string.
        let out = encode_request("42", "{\"a\":1}");
        assert_eq!(out, "return { id = \"42\", body = [=[{\"a\":1}]=] }");

        // Body containing "]]" is still fine at level 1 (only "]=]" closes).
        let out = encode_request("1", "x]]y");
        assert!(out.contains("[=[x]]y]=]"));

        // Body containing "]=]" forces level 2.
        let out = encode_request("2", "a]=]b");
        assert!(out.contains("[==[a]=]b]==]"));

        // Body containing "]=]" and "]==]" forces level 3.
        let out = encode_request("3", "a]=]b]==]c");
        assert!(out.contains("[===[a]=]b]==]c]===]"));
    }

    #[test]
    fn pref_value_finds_last_assignment() {
        let text = "Ack = \"1\"\nPlaybackAck = \"9\"\nResponse = \"2:e30=\"\nAck = \"3\"";
        assert_eq!(pref_value(text, "Ack"), Some("3"));
        assert_eq!(pref_value(text, "Response"), Some("2:e30="));
        assert_eq!(pref_value(text, "Missing"), None);
    }

    #[test]
    fn decode_response_validates_id_and_json() {
        let good = base64::engine::general_purpose::STANDARD.encode("{\"ok\":true}");
        let v = format!("7:{}", good);
        assert_eq!(decode_response(&v, "7").unwrap().unwrap(), "{\"ok\":true}");
        // wrong id -> ignored
        assert!(decode_response(&v, "8").is_none());
        // invalid base64 -> keep polling
        assert!(decode_response("7:%%%not-base64%%%", "7").is_none());
        // valid base64 but not JSON -> keep polling
        let not_json = base64::engine::general_purpose::STANDARD.encode("hello");
        assert!(decode_response(&format!("7:{}", not_json), "7").is_none());
    }
}
