//! "Open from Resolve": opens AutoSubs when the user runs Workspace > Scripts >
//! AutoSubs, the way the script did before Resolve 21.1.
//!
//! The sandboxed Resolve script can't launch programs (AGENTS.md lists the
//! routes that are gone), but it can write Fusion.prefs. The production
//! launcher sets `Global.AutoSubsBridge.LaunchRequest` and calls SavePrefs
//! (bootstrap.lua); a watcher outside Resolve sees the new value land on disk
//! and opens the app. A running app is brought to the front instead, through
//! LaunchServices on macOS and the single-instance plugin elsewhere.
//!
//! The watcher is this binary started with `--resolve-watcher`. main.rs runs it
//! before Tauri is built, so it has no window, webview or dock icon, and it only
//! stats one file a second. It starts at login from a LaunchAgent (macOS), the
//! HKCU Run key (Windows) or an XDG autostart entry (Linux), and again every
//! time the app starts. A lock file keeps it to one copy per user.
//!
//! On by default. Turning it off in Settings writes a marker file and removes
//! the login entry; the running watcher sees the marker and exits.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::resolve_bridge::{fusion_prefs_path, pref_value};

pub const WATCHER_FLAG: &str = "--resolve-watcher";
/// Run by the Windows installer before its "AutoSubs is running" check, which
/// would otherwise find a watcher the user never sees.
pub const STOP_FLAG: &str = "--stop-resolve-watcher";

const POLL_INTERVAL: Duration = Duration::from_secs(1);
/// Fusion.prefs keeps the last request across Resolve sessions, and another
/// profile's file can become the newest. Only a value written moments ago is a
/// click.
const REQUEST_MAX_AGE_SECS: i64 = 30;
/// A watcher started right after an update waits this long for the old one to
/// notice its binary was replaced and let go of the lock.
const LOCK_WAIT: Duration = Duration::from_secs(5);
const STOP_WAIT: Duration = Duration::from_secs(3);

#[cfg(target_os = "macos")]
const LAUNCH_AGENT_LABEL: &str = "com.autosubs.resolve-launcher";
#[cfg(target_os = "windows")]
const RUN_VALUE_NAME: &str = "AutoSubs";
#[cfg(all(unix, not(target_os = "macos")))]
const AUTOSTART_FILE: &str = "com.autosubs.resolve-launcher.desktop";

#[derive(Serialize)]
pub struct OpenFromResolveStatus {
    supported: bool,
    enabled: bool,
}

/// Handles the watcher's own flags before Tauri is built. Returns only when
/// argv holds neither.
pub fn handle_args() {
    match std::env::args().nth(1).as_deref() {
        Some(WATCHER_FLAG) => run_watcher(),
        Some(STOP_FLAG) => {
            stop_watcher();
            std::process::exit(0);
        }
        _ => {}
    }
}

/// Register and start the watcher unless the user turned it off. Called at
/// app startup (release builds) and by `--install-resolve-scripts`, so a
/// Windows install works before the app is ever opened.
pub fn ensure_enabled() {
    if !is_supported() || is_disabled() {
        return;
    }
    if let Err(e) = activate() {
        tracing::warn!("open from Resolve: {e}");
    }
}

#[tauri::command]
pub fn open_from_resolve_status() -> OpenFromResolveStatus {
    status()
}

#[tauri::command]
pub fn set_open_from_resolve(enabled: bool) -> Result<OpenFromResolveStatus, String> {
    if !is_supported() {
        return Err("Opening from Resolve isn't available in this version of AutoSubs.".into());
    }
    let marker = disabled_marker().ok_or("could not determine the local data directory")?;
    if enabled {
        let _ = fs::remove_file(&marker);
        activate()?;
    } else {
        if let Some(parent) = marker.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        fs::write(&marker, b"").map_err(|e| format!("write {}: {e}", marker.display()))?;
        unregister()?;
    }
    Ok(status())
}

fn status() -> OpenFromResolveStatus {
    let supported = is_supported();
    OpenFromResolveStatus {
        supported,
        enabled: supported && !is_disabled(),
    }
}

/// Flatpak's sandbox can neither add a login item nor read Resolve's prefs.
fn is_supported() -> bool {
    #[cfg(all(unix, not(target_os = "macos")))]
    if std::env::var_os("FLATPAK_ID").is_some() || Path::new("/.flatpak-info").exists() {
        return false;
    }
    true
}

fn state_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.autosubs"))
}

fn disabled_marker() -> Option<PathBuf> {
    state_dir().map(|d| d.join("resolve-launcher-disabled"))
}

fn is_disabled() -> bool {
    disabled_marker().is_some_and(|p| p.exists())
}

fn activate() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    // A failed login entry only costs the next login; still start it now.
    if let Err(e) = register(&exe) {
        tracing::warn!("open from Resolve: could not add login item: {e}");
    }
    spawn_detached(Command::new(&exe).arg(WATCHER_FLAG))
}

// ---------------------------------------------------------------------------
// The watcher process
// ---------------------------------------------------------------------------

fn run_watcher() -> ! {
    // Taken before waiting for the lock, so a stop request written while we
    // wait (e.g. the installer stopping the current owner) covers us too.
    let started = SystemTime::now();
    let Some(_lock) = acquire_lock(LOCK_WAIT) else {
        std::process::exit(0); // another watcher is running
    };
    let exe = std::env::current_exe().ok();
    let exe_stamp = exe.as_deref().and_then(modified);

    let mut seen_mtime = None;
    let mut last_request = String::new();
    loop {
        // An update replaced (or an uninstall removed) our binary: exit so the
        // restarted app can start the new one.
        let replaced = exe_stamp.is_some() && exe.as_deref().and_then(modified) != exe_stamp;
        if is_disabled() || stop_requested(started) || replaced {
            std::process::exit(0);
        }

        if let Some(prefs) = fusion_prefs_path() {
            let mtime = modified(&prefs);
            if mtime.is_some() && mtime != seen_mtime {
                // Bytes, not UTF-8: Resolve writes prefs in the ANSI code page
                // on Windows (see wait_for_response). The mtime is recorded
                // only after a read succeeds, so a failed read retries.
                if let Ok(bytes) = fs::read(&prefs) {
                    seen_mtime = mtime;
                    let text = String::from_utf8_lossy(&bytes);
                    if let Some(request) = pref_value(&text, "LaunchRequest") {
                        if request != last_request {
                            last_request = request.to_string();
                            if is_fresh(request, unix_secs()) {
                                open_app();
                            }
                        }
                    }
                }
            }
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

/// Requests are `"<os.time()> <unique>"`, written by bootstrap.lua.
fn is_fresh(request: &str, now: i64) -> bool {
    request
        .split_whitespace()
        .next()
        .and_then(|t| t.parse::<i64>().ok())
        .is_some_and(|t| (now - t).abs() <= REQUEST_MAX_AGE_SECS)
}

fn open_app() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    // LaunchServices starts the bundle, or activates the copy already running.
    #[cfg(target_os = "macos")]
    if let Some(bundle) = crate::resolve_scripts::bundle_root(&exe) {
        let _ = spawn_detached(Command::new("/usr/bin/open").arg(bundle));
        return;
    }
    // A second instance hands off to the running one (single-instance plugin).
    let _ = spawn_detached(&mut Command::new(&exe));
}

fn spawn_detached(cmd: &mut Command) -> Result<(), String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    let mut child = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;
    // Reap it so it doesn't linger as a zombie while we keep running.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn modified(path: &Path) -> Option<SystemTime> {
    path.metadata().and_then(|m| m.modified()).ok()
}

fn unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn lock_path() -> Option<PathBuf> {
    state_dir().map(|d| d.join("resolve-launcher.lock"))
}

fn stop_path() -> Option<PathBuf> {
    state_dir().map(|d| d.join("resolve-launcher.stop"))
}

/// The OS releases the lock when the process exits, however it exits.
fn acquire_lock(wait: Duration) -> Option<fs::File> {
    let path = lock_path()?;
    fs::create_dir_all(path.parent()?).ok()?;
    let file = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(&path)
        .ok()?;
    let deadline = Instant::now() + wait;
    loop {
        match file.try_lock() {
            Ok(()) => return Some(file),
            Err(fs::TryLockError::WouldBlock) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(_) => return None,
        }
    }
}

fn watcher_running() -> bool {
    acquire_lock(Duration::ZERO).is_none()
}

/// A stop file older than this watcher is a leftover from an interrupted
/// `--stop-resolve-watcher`, not a request.
fn stop_requested(started: SystemTime) -> bool {
    stop_path()
        .and_then(|p| modified(&p))
        .is_some_and(|t| t > started)
}

fn stop_watcher() {
    let Some(stop) = stop_path() else {
        return;
    };
    if !watcher_running() {
        return;
    }
    let _ = fs::write(&stop, b"");
    let deadline = Instant::now() + STOP_WAIT;
    while watcher_running() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = fs::remove_file(&stop);
}

// ---------------------------------------------------------------------------
// Login item, per platform
// ---------------------------------------------------------------------------

/// Write only when the content differs, so an unchanged entry never triggers
/// the OS's "background item added" notice again.
#[cfg(not(target_os = "windows"))]
fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
    if fs::read(path).is_ok_and(|existing| existing == content.as_bytes()) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    fs::write(path, content).map_err(|e| format!("write {}: {e}", path.display()))?;
    tracing::info!("open from Resolve: wrote login item {}", path.display());
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn remove_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove {}: {e}", path.display())),
    }
}

#[cfg(target_os = "macos")]
fn launch_agent_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| {
            h.join("Library")
                .join("LaunchAgents")
                .join(format!("{LAUNCH_AGENT_LABEL}.plist"))
        })
        .ok_or_else(|| "could not determine the home directory".into())
}

/// Not loaded with launchctl: activate() starts the watcher itself, and launchd
/// picks the agent up at the next login. AssociatedBundleIdentifiers makes
/// System Settings > Login Items list it as AutoSubs, with the app's icon.
#[cfg(target_os = "macos")]
fn launch_agent_plist(exe: &Path) -> String {
    let exe = exe
        .to_string_lossy()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{LAUNCH_AGENT_LABEL}</string>
    <key>AssociatedBundleIdentifiers</key>
    <array>
        <string>com.autosubs</string>
    </array>
    <key>ProgramArguments</key>
    <array>
        <string>{exe}</string>
        <string>{WATCHER_FLAG}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
</dict>
</plist>
"#
    )
}

#[cfg(target_os = "macos")]
fn register(exe: &Path) -> Result<(), String> {
    write_if_changed(&launch_agent_path()?, &launch_agent_plist(exe))
}

#[cfg(target_os = "macos")]
fn unregister() -> Result<(), String> {
    remove_if_present(&launch_agent_path()?)
}

#[cfg(target_os = "windows")]
fn register(exe: &Path) -> Result<(), String> {
    use std::ffi::OsString;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let mut command = OsString::from("\"");
    command.push(exe.as_os_str());
    command.push(format!("\" {WATCHER_FLAG}"));

    let (run, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|e| format!("open Run key: {e}"))?;
    if run.get_value::<OsString, _>(RUN_VALUE_NAME).is_ok_and(|v| v == command) {
        return Ok(());
    }
    run.set_value(RUN_VALUE_NAME, &command)
        .map_err(|e| format!("set Run value: {e}"))
}

#[cfg(target_os = "windows")]
fn unregister() -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let Ok(run) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_SET_VALUE,
    ) else {
        return Ok(());
    };
    match run.delete_value(RUN_VALUE_NAME) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("delete Run value: {e}")),
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn autostart_path() -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|d| d.join("autostart").join(AUTOSTART_FILE))
        .ok_or_else(|| "could not determine the config directory".into())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn autostart_entry(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=AutoSubs\n\
         Comment=Opens AutoSubs when you run it from DaVinci Resolve\n\
         Exec={} {WATCHER_FLAG}\n\
         Icon=autosubs\n\
         Terminal=false\n\
         NoDisplay=true\n\
         X-GNOME-Autostart-enabled=true\n",
        desktop_exec_arg(&exe.to_string_lossy())
    )
}

/// Quote one Exec argument. The desktop-entry spec applies string escapes
/// (`\\` -> `\`) before its quoting rule (`\"` -> `"`), so a quoted `"`, `` ` ``
/// or `$` is written `\\x` and a backslash `\\\\`; `%` is a field code.
#[cfg(all(unix, not(target_os = "macos")))]
fn desktop_exec_arg(arg: &str) -> String {
    let mut out = String::from("\"");
    for c in arg.chars() {
        match c {
            '"' | '`' | '$' => {
                out.push_str("\\\\");
                out.push(c);
            }
            '\\' => out.push_str("\\\\\\\\"),
            '%' => out.push_str("%%"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The deb/rpm install this entry (scripts/gen-resolve-linux.js) so the
/// watcher starts at login before the app is first opened. A same-named file
/// in ~/.config/autostart takes precedence over it for that user.
#[cfg(all(unix, not(target_os = "macos")))]
const SYSTEM_AUTOSTART_DIR: &str = "/etc/xdg/autostart";

#[cfg(all(unix, not(target_os = "macos")))]
fn system_autostart_path() -> PathBuf {
    Path::new(SYSTEM_AUTOSTART_DIR).join(AUTOSTART_FILE)
}

/// When the package's entry already starts this binary, a user copy would only
/// outlive an uninstall, so remove ours (including a Hidden=true one) instead.
#[cfg(all(unix, not(target_os = "macos")))]
fn register(exe: &Path) -> Result<(), String> {
    let user = autostart_path()?;
    let entry = autostart_entry(exe);
    if fs::read(system_autostart_path()).is_ok_and(|system| system == entry.as_bytes()) {
        return remove_if_present(&user);
    }
    write_if_changed(&user, &entry)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn unregister() -> Result<(), String> {
    let user = autostart_path()?;
    if system_autostart_path().exists() {
        write_if_changed(&user, &hidden_autostart_entry())
    } else {
        remove_if_present(&user)
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn hidden_autostart_entry() -> String {
    "[Desktop Entry]\nType=Application\nName=AutoSubs\nHidden=true\n".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_fresh_accepts_only_recent_requests() {
        let now = 1_800_000_000;
        assert!(is_fresh("1800000000 table: 0x01", now));
        assert!(is_fresh("1799999990 table: 0x01", now));
        // Small clock skew the other way is fine too.
        assert!(is_fresh("1800000005 table: 0x01", now));
        // A value persisted by an earlier Resolve session.
        assert!(!is_fresh("1799990000 table: 0x01", now));
        assert!(!is_fresh("", now));
        assert!(!is_fresh("not-a-time", now));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn launch_agent_plist_escapes_the_path() {
        let plist = launch_agent_plist(Path::new("/Apps/A&B.app/Contents/MacOS/autosubs"));
        assert!(plist.contains("<string>/Apps/A&amp;B.app/Contents/MacOS/autosubs</string>"));
        assert!(plist.contains("<string>--resolve-watcher</string>"));
    }

    /// The pkg postinstall writes the same agent before the app first runs; if
    /// the two drift, the app rewrites it and macOS can notify the user again.
    #[cfg(target_os = "macos")]
    #[test]
    fn launch_agent_plist_matches_pkg_postinstall() {
        let script = include_str!("../../../Mac-Package/Scripts/postinstall");
        let start = script.find("<<PLIST\n").expect("postinstall heredoc") + "<<PLIST\n".len();
        let end = start + script[start..].find("\nPLIST\n").expect("heredoc end") + 1;
        let app = "/Applications/AutoSubs.app";
        let from_pkg = script[start..end]
            .replace("$AGENT_LABEL", LAUNCH_AGENT_LABEL)
            .replace("$APP_PATH", app);
        let exe = format!("{app}/Contents/MacOS/autosubs");
        assert_eq!(from_pkg, launch_agent_plist(Path::new(&exe)));
    }

    /// The package's entry must equal ours for /usr/bin/autosubs, or register()
    /// can't tell that it already starts this binary.
    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn autostart_entry_matches_package_entry() {
        let script = include_str!("../../scripts/gen-resolve-linux.js");
        let start = script.find("const AUTOSTART_ENTRY = `").expect("entry") + "const AUTOSTART_ENTRY = `".len();
        let end = start + script[start..].find('`').expect("entry end");
        assert_eq!(&script[start..end], autostart_entry(Path::new("/usr/bin/autosubs")));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn desktop_exec_arg_quotes_per_spec() {
        assert_eq!(desktop_exec_arg("/usr/bin/autosubs"), "\"/usr/bin/autosubs\"");
        assert_eq!(desktop_exec_arg("/a b/$x"), "\"/a b/\\\\$x\"");
        assert_eq!(desktop_exec_arg("/100%"), "\"/100%%\"");
    }
}
