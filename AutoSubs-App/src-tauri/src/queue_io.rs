//! Filesystem operations for batch transcription.
//!
//! Access is limited to the filesystem scope granted to the frontend, including
//! paths selected through the native file or folder dialog. Folder grants are
//! session-scoped and must be reselected after an app restart.

use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs, io::{self, Write}, path::{Component, Path, PathBuf}};
use tauri::Runtime;
use tauri_plugin_fs::FsExt;

const MEDIA_EXTENSIONS: &[&str] = &[
    "wav", "mp3", "m4a", "flac", "ogg", "aac", "mp4", "mov", "mkv", "webm",
    "avi", "wmv", "mpeg", "mpg", "m4v", "3gp", "aiff", "opus", "alac",
];

#[derive(Serialize)]
pub struct QueueFileSelection {
    files: Vec<String>,
    skipped: Vec<String>,
}

fn supported_media(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str())
        .is_some_and(|ext| MEDIA_EXTENSIONS.iter().any(|item| ext.eq_ignore_ascii_case(item)))
}

fn collect_path<F: Fn(&Path) -> bool>(
    path: &Path,
    recursive: bool,
    allowed: &F,
    files: &mut Vec<String>,
    skipped: &mut Vec<String>,
    seen: &mut HashSet<PathBuf>,
) {
    if !allowed(path) {
        skipped.push(path.to_string_lossy().into_owned());
        return;
    }
    let Ok(metadata) = fs::symlink_metadata(path) else {
        skipped.push(path.to_string_lossy().into_owned());
        return;
    };
    // Do not follow links out of a selected folder, or enter junction loops.
    if metadata.file_type().is_symlink() {
        skipped.push(path.to_string_lossy().into_owned());
    } else if metadata.is_file() {
        if supported_media(path) {
            let Ok(canonical) = fs::canonicalize(path) else {
                skipped.push(path.to_string_lossy().into_owned());
                return;
            };
            if !allowed(&canonical) || fs::File::open(&canonical).is_err() {
                skipped.push(path.to_string_lossy().into_owned());
            } else if seen.insert(canonical) {
                files.push(path.to_string_lossy().into_owned());
            }
        } else {
            skipped.push(path.to_string_lossy().into_owned());
        }
    } else if metadata.is_dir() {
        let Ok(canonical) = fs::canonicalize(path) else {
            skipped.push(path.to_string_lossy().into_owned());
            return;
        };
        if !allowed(&canonical) || !seen.insert(canonical) {
            return;
        }
        let Ok(entries) = fs::read_dir(path) else {
            skipped.push(path.to_string_lossy().into_owned());
            return;
        };
        let mut children = Vec::new();
        for entry in entries {
            match entry {
                Ok(entry) => children.push(entry.path()),
                Err(_) => skipped.push(path.to_string_lossy().into_owned()),
            }
        }
        children.sort();
        for child in children {
            let is_directory = fs::symlink_metadata(&child)
                .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
                .unwrap_or(false);
            if is_directory && !recursive {
                skipped.push(child.to_string_lossy().into_owned());
            } else {
                collect_path(&child, recursive, allowed, files, skipped, seen);
            }
        }
    } else {
        skipped.push(path.to_string_lossy().into_owned());
    }
}

#[tauri::command]
pub async fn queue_collect_files<R: Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    recursive: bool,
) -> Result<QueueFileSelection, String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        let mut skipped = Vec::new();
        let mut seen = HashSet::new();
        for path in paths {
            collect_path(Path::new(&path), recursive, &|path| scope.is_allowed(path),
                &mut files, &mut skipped, &mut seen);
        }
        QueueFileSelection { files, skipped }
    }).await.map_err(|err| err.to_string())
}

fn validate_filename(filename: &str) -> Result<&str, String> {
    let mut components = Path::new(filename).components();
    if filename.chars().any(|ch| matches!(ch, '/' | '\\' | ':'))
        || !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
        || !filename.to_ascii_lowercase().ends_with(".srt")
        || filename.len() <= 4
    {
        return Err("Invalid subtitle filename".into());
    }
    Ok(&filename[..filename.len() - 4])
}

fn validate_output_directory<F: Fn(&Path) -> bool>(
    directory: &Path,
    allowed: &F,
) -> Result<PathBuf, String> {
    let directory = fs::canonicalize(directory)
        .map_err(|_| "Output folder is unavailable or not authorized; select it again".to_string())?;
    if !directory.is_dir()
        || !allowed(&directory)
        || !allowed(&directory.join("autosubs-preflight-check.srt"))
    {
        return Err("Output folder is unavailable or not authorized; select it again".into());
    }
    Ok(directory)
}

fn check_output_directory<F: Fn(&Path) -> bool>(
    directory: &Path,
    allowed: &F,
) -> Result<(), String> {
    let directory = validate_output_directory(directory, allowed)?;
    let mut temp = tempfile::Builder::new().prefix("autosubs-check-").tempfile_in(directory)
        .map_err(|err| format!("Cannot write to output folder: {err}"))?;
    if !allowed(temp.path()) {
        return Err("Output folder is not authorized; select it again".into());
    }
    temp.write_all(b"test").and_then(|_| temp.as_file().sync_all())
        .map_err(|err| format!("Cannot write to output folder: {err}"))?;
    temp.close().map_err(|err| format!("Cannot remove output folder check: {err}"))
}

#[tauri::command]
pub async fn queue_check_output<R: Runtime>(
    app: tauri::AppHandle<R>,
    directory: String,
) -> Result<(), String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        check_output_directory(Path::new(&directory), &|path| scope.is_allowed(path))
    }).await.map_err(|err| err.to_string())?
}

fn write_srt<F: Fn(&Path) -> bool>(
    directory: &Path,
    filename: &str,
    content: &str,
    allowed: &F,
) -> Result<PathBuf, String> {
    let stem = validate_filename(filename)?;
    // Resolve the directory first: a non-existent destination cannot itself be
    // canonicalized, so checking only its lexical path could follow a parent
    // symlink outside the granted scope.
    let directory = validate_output_directory(directory, allowed)?;
    if !allowed(&directory.join(filename)) {
        return Err("Output folder is unavailable or not authorized; select it again".into());
    }

    // Write fully in the target directory before publishing, so no partial SRT
    // appears under the final name. persist_noclobber never replaces an
    // existing destination and returns the temporary file on collision.
    let mut temp = tempfile::NamedTempFile::new_in(&directory).map_err(|err| err.to_string())?;
    temp.write_all(content.as_bytes()).and_then(|_| temp.as_file().sync_all())
        .map_err(|err| err.to_string())?;
    for suffix in 0..10_000 {
        let name = if suffix == 0 { format!("{stem}.srt") }
            else { format!("{stem} ({suffix}).srt") };
        let destination = directory.join(name);
        if !allowed(&destination) {
            return Err("Output folder is not authorized; select it again".into());
        }
        match temp.persist_noclobber(&destination) {
            Ok(_) => return Ok(destination),
            Err(err) if err.error.kind() == io::ErrorKind::AlreadyExists => temp = err.file,
            Err(err) => return Err(err.error.to_string()),
        }
    }
    Err("Could not find an available subtitle filename".into())
}

#[tauri::command]
pub async fn queue_write_srt<R: Runtime>(
    app: tauri::AppHandle<R>,
    directory: String,
    filename: String,
    content: String,
) -> Result<String, String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        write_srt(Path::new(&directory), &filename, &content, &|path| scope.is_allowed(path))
            .map(|path| path.to_string_lossy().into_owned())
    }).await.map_err(|err| err.to_string())?
}

/// An output is always derived from an authorised media file, not an arbitrary
/// frontend-provided filename. In adjacent mode this permits only sibling
/// subtitles of that file, even when the dialog granted just the input file.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QueueOutputFormat { Srt, Txt }

impl QueueOutputFormat {
    fn extension(&self) -> &'static str {
        match self { Self::Srt => "srt", Self::Txt => "txt" }
    }
}

#[derive(Deserialize)]
pub struct QueueOutputContent {
    format: QueueOutputFormat,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueOutputCheck {
    source_path: String,
    format: QueueOutputFormat,
    output_path: String,
    existing: bool,
    duplicate: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueOutputError { source_path: String, message: String }

#[derive(Serialize)]
pub struct QueuePreflight { outputs: Vec<QueueOutputCheck>, errors: Vec<QueueOutputError> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExportResult { output_paths: Vec<String>, backup_paths: Vec<String> }

fn resolve_queue_source<F: Fn(&Path) -> bool>(source: &Path, allowed: &F) -> Result<PathBuf, String> {
    if !allowed(source) || !supported_media(source) {
        return Err("Source file is unavailable or not authorized; select it again".into());
    }
    let metadata = fs::symlink_metadata(source).map_err(|err| err.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Source must be a regular media file".into());
    }
    let canonical = fs::canonicalize(source).map_err(|err| err.to_string())?;
    if !allowed(&canonical) || fs::File::open(&canonical).is_err() {
        return Err("Source file is unavailable or not authorized; select it again".into());
    }
    Ok(canonical)
}

fn queue_output_paths<F: Fn(&Path) -> bool>(
    source: &Path, formats: &[QueueOutputFormat], output_directory: Option<&Path>, allowed: &F,
) -> Result<Vec<PathBuf>, String> {
    let source = resolve_queue_source(source, allowed)?;
    let parent = source.parent().ok_or("Source has no parent directory")?;
    let directory = match output_directory {
        Some(directory) => validate_output_directory(directory, allowed)?,
        None => parent.to_path_buf(),
    };
    let filename = source.file_name().ok_or("Source has no filename")?;
    let base = directory.join(filename);
    Ok(formats.iter().map(|format| base.with_extension(format.extension())).collect())
}

fn output_collision_key(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();
    // Default macOS filesystems are commonly case-insensitive; conservatively
    // flag case-only collisions even on a case-sensitive macOS volume.
    if cfg!(any(windows, target_os = "macos")) { value.to_lowercase() } else { value }
}

fn inspect_queue_outputs<F: Fn(&Path) -> bool>(
    sources: &[String], formats: &[QueueOutputFormat], output_directory: Option<&Path>, allowed: &F,
) -> QueuePreflight {
    let mut outputs = Vec::new();
    let mut errors = Vec::new();
    for source in sources {
        match queue_output_paths(Path::new(source), formats, output_directory, allowed) {
            Ok(paths) => {
                if let Some(directory) = paths.first().and_then(|path| path.parent()) {
                    let check = tempfile::Builder::new().prefix("autosubs-check-").tempfile_in(directory)
                        .and_then(|mut file| { file.write_all(b"test")?; file.close() });
                    if let Err(err) = check {
                        errors.push(QueueOutputError { source_path: source.clone(), message: format!("Cannot write to output folder: {err}") });
                        continue;
                    }
                }
                for (format, path) in formats.iter().zip(paths) {
                    let existing = match path.symlink_metadata() {
                        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => true,
                        Ok(_) => {
                            errors.push(QueueOutputError { source_path: source.clone(), message: format!("Existing output is not a regular file: {}", path.display()) });
                            continue;
                        },
                        Err(err) if err.kind() == io::ErrorKind::NotFound => false,
                        Err(err) => {
                            errors.push(QueueOutputError { source_path: source.clone(), message: err.to_string() });
                            continue;
                        },
                    };
                    outputs.push(QueueOutputCheck {
                        source_path: source.clone(), format: format.clone(), existing,
                        output_path: path.to_string_lossy().into_owned(), duplicate: false,
                    });
                }
            },
            Err(message) => errors.push(QueueOutputError { source_path: source.clone(), message }),
        }
    }
    let mut counts = HashMap::new();
    for output in &outputs { *counts.entry(output_collision_key(Path::new(&output.output_path))).or_insert(0usize) += 1; }
    for output in &mut outputs { output.duplicate = counts[&output_collision_key(Path::new(&output.output_path))] > 1; }
    QueuePreflight { outputs, errors }
}

#[tauri::command]
pub async fn queue_preflight_outputs<R: Runtime>(
    app: tauri::AppHandle<R>, sources: Vec<String>, formats: Vec<QueueOutputFormat>,
    output_directory: Option<String>,
) -> Result<QueuePreflight, String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        inspect_queue_outputs(&sources, &formats, output_directory.as_deref().map(Path::new), &|path| scope.is_allowed(path))
    }).await.map_err(|err| err.to_string())
}

/// Atomically move a name only when the destination does not exist. Unlike a
/// hard-link followed by unlink, this cannot remove a file another process
/// swapped in after the backup was made. Unsupported filesystems fail safely.
#[cfg(windows)]
fn rename_noclobber(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::MoveFileW;
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let destination: Vec<u16> = destination.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    // MoveFileW does not replace an existing destination and both paths are on
    // the same filesystem because backups are siblings of the output.
    if unsafe { MoveFileW(source.as_ptr(), destination.as_ptr()) } == 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn rename_noclobber(source: &Path, destination: &Path) -> io::Result<()> {
    use rustix::fs::{renameat_with, RenameFlags, CWD};
    renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE).map_err(Into::into)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn rename_noclobber(_source: &Path, _destination: &Path) -> io::Result<()> {
    Err(io::Error::new(io::ErrorKind::Unsupported, "Safe no-overwrite rename is not supported on this platform"))
}

/// Preserve the old file under a timestamped, no-clobber name before
/// publishing. A failure leaves either the original or backup.
/// Publishing uses persist_noclobber, so a concurrently created destination is
/// never overwritten. No external process should edit an output during export.
fn publish_queue_output<F: Fn(&Path) -> bool>(destination: &Path, content: &str, allowed: &F) -> Result<Option<PathBuf>, String> {
    if !allowed(destination) { return Err("Output folder is not authorized; select it again".into()); }
    let directory = destination.parent().ok_or("Output has no parent directory")?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|err| err.to_string())?;
    temp.write_all(content.as_bytes()).and_then(|_| temp.as_file().sync_all()).map_err(|err| err.to_string())?;
    let backup = match fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err(format!("Existing output is not a regular file: {}", destination.display()));
            }
            let when: chrono::DateTime<chrono::Local> = metadata.created().or_else(|_| metadata.modified())
                .unwrap_or_else(|_| std::time::SystemTime::now()).into();
            let stem = destination.file_stem().ok_or("Output has no filename")?.to_string_lossy();
            // Leave room for a timestamp, suffix, and extension on filesystems
            // with a 255-character component limit.
            let mut backup_stem = String::new();
            let mut units = 0;
            for ch in stem.chars() {
                if units + ch.len_utf16() > 160 { break; }
                units += ch.len_utf16();
                backup_stem.push(ch);
            }
            let extension = destination.extension().ok_or("Output has no extension")?.to_string_lossy();
            let timestamp = when.format("%Y-%m-%d_%H-%M-%S");
            let mut backup = None;
            for suffix in 0..10_000 {
                let name = if suffix == 0 { format!("{backup_stem}.{timestamp}.{extension}") }
                    else { format!("{backup_stem}.{timestamp} ({suffix}).{extension}") };
                let candidate = directory.join(name);
                if !allowed(&candidate) { return Err("Output folder is not authorized; select it again".into()); }
                match rename_noclobber(destination, &candidate) {
                    Ok(()) => { backup = Some(candidate); break; },
                    Err(err) if err.kind() == io::ErrorKind::AlreadyExists => continue,
                    Err(err) => return Err(format!("Could not preserve existing output: {err}")),
                }
            }
            let backup = backup.ok_or("Could not find an available backup filename")?;
            // If another process replaced the name between the initial check
            // and the atomic move, do not publish over a directory or symlink.
            let moved = fs::symlink_metadata(&backup).map_err(|err| format!("Prior output moved to {} but could not be inspected: {err}", backup.display()))?;
            if !moved.is_file() || moved.file_type().is_symlink() {
                let restored = rename_noclobber(&backup, destination).is_ok();
                return Err(if restored { format!("Output changed and was restored: {}", destination.display()) }
                    else { format!("Output changed; it is preserved at {}", backup.display()) });
            }
            Some(backup)
        },
        Err(err) if err.kind() == io::ErrorKind::NotFound => None,
        Err(err) => return Err(err.to_string()),
    };
    match temp.persist_noclobber(destination) {
        Ok(_) => Ok(backup),
        Err(err) => {
            let recovery = if let Some(ref saved) = backup {
                // Restoring is also no-clobber. If someone created a new file,
                // keep it and the timestamped backup rather than overwrite it.
                if rename_noclobber(saved, destination).is_ok() { format!("; prior version restored at {}", destination.display()) }
                else { format!("; prior version preserved at {}", saved.display()) }
            } else { String::new() };
            Err(format!("Could not write {}{}: {}", destination.display(),
                recovery, err.error))
        }
    }
}

#[tauri::command]
pub async fn queue_export_outputs<R: Runtime>(
    app: tauri::AppHandle<R>, source_path: String, outputs: Vec<QueueOutputContent>,
    output_directory: Option<String>,
) -> Result<QueueExportResult, String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let formats: Vec<_> = outputs.iter().map(|output| output.format.clone()).collect();
        let paths = queue_output_paths(Path::new(&source_path), &formats, output_directory.as_deref().map(Path::new), &|path| scope.is_allowed(path))?;
        let mut result = QueueExportResult { output_paths: Vec::new(), backup_paths: Vec::new() };
        for (output, path) in outputs.iter().zip(paths) {
            if output_directory.is_some() && !scope.is_allowed(&path) {
                return Err("Output folder is unavailable or not authorized; select it again".into());
            }
            match publish_queue_output(&path, &output.content, &|candidate| output_directory.is_none() || scope.is_allowed(candidate)) {
                Ok(backup) => {
                    result.output_paths.push(path.to_string_lossy().into_owned());
                    if let Some(path) = backup { result.backup_paths.push(path.to_string_lossy().into_owned()); }
                },
                Err(err) => return Err(format!("{err}{}{}", if result.output_paths.is_empty() { String::new() }
                    else { format!("; already written: {}", result.output_paths.join(", ")) },
                    if result.backup_paths.is_empty() { String::new() }
                    else { format!("; previous versions saved at: {}", result.backup_paths.join(", ")) })),
            }
        }
        Ok(result)
    }).await.map_err(|err| err.to_string())?
}

/// Call only after the app-wide pipeline owner has stopped all prior work.
#[tauri::command]
pub fn queue_reset_cancellation() -> Result<(), String> {
    let mut cancel = crate::transcription_api::SHOULD_CANCEL.lock()
        .map_err(|_| "Failed to acquire cancellation lock".to_string())?;
    *cancel = false;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_unique_complete_files_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("clip.en.srt"), "existing").unwrap();
        let path = write_srt(dir.path(), "clip.en.srt", "complete", &|_| true).unwrap();
        assert_eq!(path.file_name().unwrap(), "clip.en (1).srt");
        assert_eq!(fs::read_to_string(dir.path().join("clip.en.srt")).unwrap(), "existing");
        assert_eq!(fs::read_to_string(path).unwrap(), "complete");
    }

    #[test]
    fn refuses_unscoped_or_unsafe_output() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write_srt(dir.path(), "clip.srt", "x", &|_| false).is_err());
        for name in ["../clip.srt", "..\\clip.srt", "clip.txt", "C:clip.srt", ".srt"] {
            assert!(write_srt(dir.path(), name, "x", &|_| true).is_err());
        }
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn checks_output_directory_without_leaving_files() {
        let dir = tempfile::tempdir().unwrap();
        assert!(check_output_directory(dir.path(), &|_| false).is_err());
        assert!(check_output_directory(dir.path(), &|_| true).is_ok());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
        assert!(check_output_directory(&dir.path().join("missing"), &|_| true).is_err());
    }

    #[test]
    fn collects_supported_files_without_duplicates_and_reports_skips() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("audio.WAV"), "x").unwrap();
        fs::write(dir.path().join("notes.txt"), "x").unwrap();
        let mut files = Vec::new();
        let mut skipped = Vec::new();
        let mut seen = HashSet::new();
        collect_path(dir.path(), true, &|_| true, &mut files, &mut skipped, &mut seen);
        collect_path(&dir.path().join("audio.WAV"), true, &|_| true, &mut files, &mut skipped, &mut seen);
        assert_eq!(files.len(), 1);
        assert_eq!(skipped.len(), 1);
    }

    #[test]
    fn checks_resolved_file_path_against_scope() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("audio.wav");
        fs::write(&path, "x").unwrap();
        let calls = std::cell::Cell::new(0);
        let mut files = Vec::new();
        let mut skipped = Vec::new();
        collect_path(&path, false, &|_| {
            calls.set(calls.get() + 1);
            calls.get() == 1
        }, &mut files, &mut skipped, &mut HashSet::new());
        assert!(files.is_empty());
        assert_eq!(skipped.len(), 1);
        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn source_output_has_same_stem_and_preflight_finds_existing_and_duplicate_targets() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("clip.mp4");
        let second = dir.path().join("clip.wav");
        fs::write(&first, "media").unwrap();
        fs::write(&second, "media").unwrap();
        fs::write(dir.path().join("clip.srt"), "old").unwrap();
        let sources = vec![first.to_string_lossy().into_owned(), second.to_string_lossy().into_owned()];
        let checked = inspect_queue_outputs(&sources, &[QueueOutputFormat::Srt, QueueOutputFormat::Txt], None, &|_| true);
        assert!(checked.errors.is_empty());
        assert_eq!(checked.outputs.len(), 4);
        assert!(checked.outputs.iter().all(|output| output.duplicate));
        assert_eq!(checked.outputs.iter().filter(|output| output.existing).count(), 2);
        assert!(checked.outputs.iter().any(|output| Path::new(&output.output_path).ends_with("clip.srt")));
        assert!(checked.outputs.iter().any(|output| Path::new(&output.output_path).ends_with("clip.txt")));
    }

    #[test]
    fn replaces_latest_only_after_preserving_previous_versions() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("clip.srt");
        fs::write(&output, "first").unwrap();
        let first_backup = publish_queue_output(&output, "second", &|_| true).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&first_backup).unwrap(), "first");
        assert_eq!(fs::read_to_string(&output).unwrap(), "second");
        let second_backup = publish_queue_output(&output, "third", &|_| true).unwrap().unwrap();
        assert_ne!(first_backup, second_backup);
        assert_eq!(fs::read_to_string(&first_backup).unwrap(), "first");
        assert_eq!(fs::read_to_string(&second_backup).unwrap(), "second");
        assert_eq!(fs::read_to_string(&output).unwrap(), "third");
    }

    #[test]
    fn refuses_to_replace_directories_and_denied_destinations() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("clip.txt");
        fs::create_dir(&output).unwrap();
        assert!(publish_queue_output(&output, "text", &|_| true).is_err());
        assert!(output.is_dir());
        assert!(publish_queue_output(&dir.path().join("other.txt"), "text", &|_| false).is_err());
        assert!(!dir.path().join("other.txt").exists());
    }

    #[test]
    fn atomic_backup_move_never_replaces_an_existing_backup() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("clip.srt");
        let backup = dir.path().join("clip.backup.srt");
        fs::write(&output, "latest").unwrap();
        fs::write(&backup, "previous").unwrap();
        assert_eq!(rename_noclobber(&output, &backup).unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(&output).unwrap(), "latest");
        assert_eq!(fs::read_to_string(&backup).unwrap(), "previous");
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    fn preflight_conservatively_flags_case_only_collisions() {
        assert_eq!(output_collision_key(Path::new("Clip.SRT")), output_collision_key(Path::new("clip.srt")));
    }
}
