//! Installs the Resolve launcher (`Utility/AutoSubs.lua`) and the startup
//! scriptlib (`AutoSubs.scriptlib`) into the user's Resolve Scripts folder.
//!
//! The app owns this — not the installers — so a Tauri updater refresh lands
//! new scripts without a reinstall. Templates live in the bundled resources
//! with `[[__AUTOSUBS_RESOURCES_FOLDER__]]` / `[[__AUTOSUBS_APP_EXECUTABLE__]]`
//! placeholders; we substitute raw bytes and write only when content differs.
//!
//! Release builds only: a dev build must not install production launchers —
//! they would fight the `AutoSubs (Dev).scriptlib` that `npm run setup-resolve`
//! writes. main.rs guards the call with `cfg!(debug_assertions)`.

// In dev builds only the unit tests call into this module — main.rs skips the
// install call entirely.
#![cfg_attr(debug_assertions, allow(dead_code))]

use std::fs;
use std::path::{Path, PathBuf};

use crate::resolve_bridge::fusion_support_dir;

const RESOURCES_PLACEHOLDER: &[u8] = b"[[__AUTOSUBS_RESOURCES_FOLDER__]]";
const EXECUTABLE_PLACEHOLDER: &[u8] = b"[[__AUTOSUBS_APP_EXECUTABLE__]]";

/// Entry point from Tauri setup. Never fails the app: anything unexpected is a
/// `tracing::warn` and we move on.
pub fn install_resolve_scripts(app: &tauri::AppHandle) {
    // Resolve creates its per-user support dir on first launch, which can
    // happen after AutoSubs starts — wait for it rather than skipping script
    // installation for the whole session. We still never create the tree
    // ourselves, so on machines without Resolve this thread just sleeps.
    while !fusion_support_dir().is_some_and(|p| p.is_dir()) {
        std::thread::sleep(std::time::Duration::from_secs(5));
    }
    if let Err(e) = install(app, false) {
        tracing::warn!("resolve script install skipped: {e}");
    }
}

/// Installer-time entry point (`autosubs --install-resolve-scripts`, invoked by
/// the Windows installer). Unlike the startup path this creates the Scripts
/// tree when Resolve hasn't run yet — the user just chose to install AutoSubs,
/// so pre-seeding is wanted — and returns failures instead of only logging.
pub fn install_resolve_scripts_now<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    install(app, true)
}

fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>, create_tree: bool) -> Result<(), String> {
    use tauri::Manager;

    // The support dir only exists when Resolve is installed — not our business
    // to create the whole tree for a user without Resolve, unless an installer
    // asked us to pre-seed it.
    let support = fusion_support_dir()
        .ok_or_else(|| "could not determine Resolve support directory".to_string())?;
    if !support.is_dir() && !create_tree {
        return Ok(());
    }
    let scripts_root = support.join("Fusion").join("Scripts");

    // The resource dir contains the bundled `resources/` tree; tolerate both
    // `resource_dir/resources` and a flat layout.
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    let resources_folder = [resource_dir.join("resources"), resource_dir.clone()]
        .into_iter()
        .find(|p| p.join("modules").join("bootstrap.lua").is_file())
        .ok_or_else(|| {
            format!(
                "modules/bootstrap.lua not found under {}",
                resource_dir.display()
            )
        })?;

    let app_executable = app_executable_path()
        .ok_or_else(|| "could not determine app executable path".to_string())?;

    let resources_bytes = lua_path_bytes(&resources_folder);
    let executable_bytes = lua_path_bytes(&app_executable);

    // Utility launcher (restart path) and startup scriptlib (zero-click start).
    write_template(
        &resource_dir,
        "resources/AutoSubs.lua",
        &scripts_root.join("Utility").join("AutoSubs.lua"),
        &resources_bytes,
        &executable_bytes,
    )?;
    write_template(
        &resource_dir,
        "resources/AutoSubs.scriptlib",
        &scripts_root.join("AutoSubs.scriptlib"),
        &resources_bytes,
        &executable_bytes,
    )?;

    // Legacy cleanup the installers used to do; harmless to keep doing here.
    let utility = scripts_root.join("Utility");
    let _ = fs::remove_file(utility.join("AutoSubs V2.lua"));
    let _ = fs::remove_dir_all(utility.join("AutoSubs"));

    Ok(())
}

fn write_template(
    resource_dir: &Path,
    template_rel: &str,
    target: &Path,
    resources_bytes: &[u8],
    executable_bytes: &[u8],
) -> Result<(), String> {
    let template_path = resource_dir.join(template_rel);
    let template = fs::read(&template_path)
        .map_err(|e| format!("read {}: {e}", template_path.display()))?;

    let content = substitute(template, resources_bytes, executable_bytes);

    if let Ok(existing) = fs::read(target) {
        if existing == content {
            return Ok(());
        }
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }

    // tmp + rename so Resolve never reads a half-written launcher.
    let tmp = target.with_extension("autosubs-tmp");
    fs::write(&tmp, &content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, target).map_err(|e| format!("rename to {}: {e}", target.display()))?;

    tracing::info!("installed Resolve script {}", target.display());
    Ok(())
}

/// Byte-level placeholder substitution. Paths are injected as Lua long-string
/// bytes, so this must run on the raw template bytes — never UTF-8 strings.
fn substitute(template: Vec<u8>, resources: &[u8], executable: &[u8]) -> Vec<u8> {
    replace_all(
        replace_all(template, RESOURCES_PLACEHOLDER, &lua_long_string(resources)),
        EXECUTABLE_PLACEHOLDER,
        &lua_long_string(executable),
    )
}

/// Wrap raw path bytes in a Lua long bracket so the `[[__AUTOSUBS_*__]]`
/// placeholders keep their string delimiters after substitution. Backslashes
/// need no escaping inside long strings.
fn lua_long_string(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len() + 4);
    out.extend_from_slice(b"[[");
    out.extend_from_slice(bytes);
    out.extend_from_slice(b"]]");
    out
}

fn replace_all(haystack: Vec<u8>, needle: &[u8], replacement: &[u8]) -> Vec<u8> {
    if needle.is_empty() {
        return haystack;
    }
    let mut out = Vec::with_capacity(haystack.len());
    let mut rest = haystack.as_slice();
    while let Some(pos) = find_subslice(rest, needle) {
        out.extend_from_slice(&rest[..pos]);
        out.extend_from_slice(replacement);
        rest = &rest[pos + needle.len()..];
    }
    out.extend_from_slice(rest);
    out
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|w| w == needle)
}

/// The path the Lua side receives as `app_executable`. On macOS that's the
/// `.app` bundle, not the inner `Contents/MacOS/<bin>` Mach-O.
fn app_executable_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    bundle_root(&exe).or(Some(exe))
}

/// Walk `<name>.app/Contents/MacOS/<bin>` up to the `.app`. Identity elsewhere.
fn bundle_root(exe: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        // exe = Foo.app/Contents/MacOS/foo -> parent=MacOS, ..=Contents, ..=Foo.app
        let bundle = exe.parent()?.parent()?.parent()?;
        if bundle.extension().and_then(|e| e.to_str()) == Some("app") {
            return Some(bundle.to_path_buf());
        }
    }
    let _ = exe;
    None
}

/// Bytes the Lua side can hand to `loadfile`: narrow `fopen` on Windows means
/// the path must be ANSI code-page bytes, not UTF-8.
fn lua_path_bytes(p: &Path) -> Vec<u8> {
    #[cfg(target_os = "windows")]
    {
        return windows_lua_path_bytes(p);
    }
    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::ffi::OsStrExt;
        p.as_os_str().as_bytes().to_vec()
    }
}

#[cfg(target_os = "windows")]
fn windows_lua_path_bytes(p: &Path) -> Vec<u8> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Globalization::{
        WideCharToMultiByte, CP_ACP, WC_NO_BEST_FIT_CHARS,
    };
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;

    // resource_dir() hands us verbatim \\?\C:\... paths on Windows. Resolve's
    // narrow file APIs (fopen, bmd.fileexists) may not understand the prefix,
    // and our install paths are well under MAX_PATH — drop it.
    const BS: u16 = b'\\' as u16;
    let mut wide: Vec<u16> = p.as_os_str().encode_wide().collect();
    if wide.starts_with(&[BS, BS, b'?' as u16, BS]) {
        wide.drain(..4);
        if wide.starts_with(&[b'U' as u16, b'N' as u16, b'C' as u16, BS]) {
            wide.drain(..3);
            wide.insert(0, BS); // \\?\UNC\server -> \\server
        }
    }
    let wide: Vec<u16> = wide.into_iter().chain(Some(0)).collect();

    unsafe {
        // 1) ANSI code page, flagging any character that had to be approximated.
        let mut used_default = 0i32;
        let needed = WideCharToMultiByte(
            CP_ACP,
            WC_NO_BEST_FIT_CHARS,
            wide.as_ptr(),
            -1,
            std::ptr::null_mut(),
            0,
            std::ptr::null(),
            &mut used_default,
        );
        if needed > 0 {
            let mut buf = vec![0u8; needed as usize];
            let mut flag = 0i32;
            WideCharToMultiByte(
                CP_ACP,
                WC_NO_BEST_FIT_CHARS,
                wide.as_ptr(),
                -1,
                buf.as_mut_ptr(),
                needed,
                std::ptr::null(),
                &mut flag,
            );
            if flag == 0 {
                buf.truncate(needed as usize - 1); // drop NUL
                return buf;
            }
        }

        // 2) 8.3 short path — always ASCII when it exists.
        let needed = GetShortPathNameW(wide.as_ptr(), std::ptr::null_mut(), 0);
        if needed > 0 {
            let mut buf = vec![0u16; needed as usize];
            let len = GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), needed);
            if len > 0 {
                buf.truncate(len as usize);
                if let Ok(s) = String::from_utf16(&buf) {
                    if s.is_ascii() {
                        return s.into_bytes();
                    }
                }
            }
        }
    }

    // 3) Last resort: UTF-8. loadfile may misread it on non-UTF-8 code pages.
    tracing::warn!(
        "path {} is not representable in the ANSI code page; Resolve may fail to load the bridge scripts",
        p.display()
    );
    p.to_string_lossy().as_bytes().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitute_replaces_both_placeholders() {
        let template =
            b"a = [[__AUTOSUBS_RESOURCES_FOLDER__]]\nb = [[__AUTOSUBS_APP_EXECUTABLE__]]\n".to_vec();
        let out = substitute(template, b"/res", b"C:\\app\\AutoSubs.exe");
        assert_eq!(out, b"a = [[/res]]\nb = [[C:\\app\\AutoSubs.exe]]\n".to_vec());
    }

    #[test]
    fn substitute_handles_repeated_and_absent_placeholders() {
        let template = b"[[__AUTOSUBS_RESOURCES_FOLDER__]]/x and [[__AUTOSUBS_RESOURCES_FOLDER__]]/y".to_vec();
        let out = substitute(template, b"R", b"E");
        assert_eq!(out, b"[[R]]/x and [[R]]/y".to_vec());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn bundle_root_walks_up_to_app() {
        let exe = Path::new("/Applications/AutoSubs.app/Contents/MacOS/AutoSubs");
        assert_eq!(
            bundle_root(exe),
            Some(PathBuf::from("/Applications/AutoSubs.app"))
        );
        // A bare binary path is returned unchanged (no .app ancestor).
        let bare = Path::new("/usr/bin/autosubs");
        assert_eq!(bundle_root(bare), None);
    }
}
