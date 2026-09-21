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
     Open DaVinci Resolve and run Workspace → Scripts → AutoSubs \
     (once per Resolve session).";

/// How long to wait for the Lua side to ack a fresh request before declaring
/// the bridge offline.
const ACK_TIMEOUT: Duration = Duration::from_secs(2);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// While a previous handler is still running (Rust timed out on it but Lua
/// kept going — it has no cancellation), a new request sits in the mailbox
/// unacked: the loop is busy, not dead. `request_in_flight` detects that
/// state and extends the ack deadline by this much, refreshed every time the
/// evidence is still present.
const BUSY_HOLD: Duration = Duration::from_secs(10);

/// An acked-but-unanswered request older than this is an abandoned leftover
/// from a previous run, not a live handler — don't let it mask a dead
/// bridge. Request ids encode their creation time (`unix_millis * 1000 +
/// counter`), so the age is recoverable.
const BUSY_ACK_MAX_AGE_MS: u64 = 120_000;

/// Absolute cap on how long `request_in_flight` may postpone the offline
/// verdict. A stale ack also survives a bridge that *died* mid-handler (a
/// crash is the only way to get one — the loop always responds before it can
/// exit), so extending per-poll without a ceiling would mask a dead bridge
/// for up to BUSY_ACK_MAX_AGE_MS instead of detecting it promptly.
const MAX_BUSY_WAIT: Duration = Duration::from_secs(60);

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

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Unique request id, always a decimal string on both sides.
fn next_request_id() -> String {
    let counter = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed) % 1000;
    (unix_millis() * 1000 + counter).to_string()
}

/// `<data_local_dir>/com.autosubs/resolve-bridge`, matching the Lua side.
pub(crate) fn mailbox_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|d| d.join("com.autosubs").join("resolve-bridge"))
        .ok_or_else(|| "could not determine the local data directory".to_string())
}

/// Per-user Resolve support directory — the parent of `Fusion/Profiles` (where
/// we read prefs) and `Fusion/Scripts` (where resolve_scripts.rs installs the
/// launcher). None when Resolve's layout can't be determined.
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

/// Strings the Lua side got from Resolve's API are ANSI code-page bytes on
/// Windows (e.g. a Cyrillic user profile path inside a media path or clip
/// name). Decode them losslessly so names round-trip: the frontend echoes
/// values like `templateName` back and Lua compares them byte-for-byte.
#[cfg(target_os = "windows")]
fn ansi_codepage_to_utf8(bytes: &[u8]) -> String {
    use windows_sys::Win32::Globalization::{MultiByteToWideChar, CP_ACP};
    unsafe {
        let needed = MultiByteToWideChar(
            CP_ACP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        );
        if needed > 0 {
            let mut wide = vec![0u16; needed as usize];
            let written = MultiByteToWideChar(
                CP_ACP,
                0,
                bytes.as_ptr(),
                bytes.len() as i32,
                wide.as_mut_ptr(),
                needed,
            );
            if written > 0 {
                wide.truncate(written as usize);
                if let Ok(s) = String::from_utf16(&wide) {
                    return s;
                }
            }
        }
    }
    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(not(target_os = "windows"))]
fn ansi_codepage_to_utf8(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Decode a `<id>:<base64 json>` response value. Returns the JSON body only
/// when it is valid base64 and parseable JSON — anything else means we
/// caught the prefs file half-written and should keep polling. Payloads are
/// normally UTF-8; non-UTF-8 payloads are decoded as the Windows ANSI code
/// page so Resolve-supplied names survive instead of either being dropped
/// (reporting a healthy bridge as unresponsive) or mangled.
fn decode_response<'a>(value: &'a str, id: &str) -> Option<Result<String, String>> {
    let (rid, encoded) = value.split_once(':')?;
    if rid != id {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    let text = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(err) => ansi_codepage_to_utf8(err.as_bytes()),
    };
    serde_json::from_str::<serde_json::Value>(&text).ok()?;
    Some(Ok(text))
}

/// True when the prefs file shows the Lua loop alive but busy: an `Ack` for
/// a different, still-recent request id with no matching `Response` yet —
/// i.e. a handler is in flight. This happens when a caller's timeout fired
/// while its handler kept running (the template scan on a large media pool
/// can outlive the frontend's patience by tens of seconds); the loop will
/// pick our request up when it finishes. A very old acked-but-unanswered id
/// is an abandoned leftover, not evidence of life.
fn request_in_flight(text: &str, id: &str) -> bool {
    let Some(ack) = pref_value(text, "Ack") else {
        return false;
    };
    if ack == id {
        return false;
    }
    let Ok(encoded) = ack.parse::<u64>() else {
        return false;
    };
    if unix_millis().saturating_sub(encoded / 1000) > BUSY_ACK_MAX_AGE_MS {
        return false;
    }
    match pref_value(text, "Response") {
        Some(value) => decode_response(value, ack).is_none(),
        None => true,
    }
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
    let busy_cap = Instant::now() + MAX_BUSY_WAIT;
    let mut ack_deadline = Instant::now() + ACK_TIMEOUT;
    let mut acked = false;

    loop {
        // Read bytes, not a UTF-8 string: Resolve writes prefs in the user's
        // ANSI code page on Windows, so a non-ASCII profile path makes the
        // file invalid UTF-8 and a strict read would report a healthy bridge
        // as offline forever. Every key and value we parse is ASCII.
        if let Ok(bytes) = fs::read(&prefs_path) {
            let text = String::from_utf8_lossy(&bytes);
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
                // An ack for a different request with no response yet means
                // the loop is busy inside a handler, not dead — our request
                // is next in line. Keep waiting instead of reporting a false
                // disconnect, but never past busy_cap: the same evidence is
                // left behind when the bridge dies mid-handler, so an
                // unbounded extension would mask a dead bridge too.
                if request_in_flight(&text, id) {
                    ack_deadline = (Instant::now() + BUSY_HOLD).min(busy_cap);
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
        // non-UTF-8 bytes (ANSI code page) -> decoded lossily, still parses
        let ansi = base64::engine::general_purpose::STANDARD.encode(b"{\"ok\":\"\xC0\"}");
        assert!(decode_response(&format!("7:{}", ansi), "7").is_some());
    }

    #[test]
    fn request_in_flight_detects_busy_loop() {
        // A recent request id (unix_millis * 1000 + counter) that was acked
        // but has no response: the loop is inside its handler.
        let busy_id = (unix_millis() * 1000).to_string();
        let ours = "999";
        let text = format!("Ack = \"{}\"\n", busy_id);
        assert!(request_in_flight(&text, ours));

        // A response for that id means the handler finished.
        let done = base64::engine::general_purpose::STANDARD.encode("{}");
        let text = format!("Ack = \"{}\"\nResponse = \"{}:{}\"", busy_id, busy_id, done);
        assert!(!request_in_flight(&text, ours));

        // Our own ack is not "someone else is busy".
        let text = format!("Ack = \"{}\"", ours);
        assert!(!request_in_flight(&text, ours));

        // An acked-but-unanswered request from long ago is an abandoned
        // leftover, not a live handler.
        let old_id = ((unix_millis() - 600_000) * 1000).to_string();
        let text = format!("Ack = \"{}\"", old_id);
        assert!(!request_in_flight(&text, ours));

        // No ack at all, or an unparsable one, is not evidence of life.
        assert!(!request_in_flight("Response = \"1:e30=\"", ours));
        assert!(!request_in_flight("Ack = \"not-a-number\"", ours));
    }
}
