use crate::transcribe::SHOULD_CANCEL;
use hf_hub::api::Progress;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::io::copy;
use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::{command, AppHandle, Emitter, Manager, Runtime};

// Progress tracker for model downloads that emits events to the frontend
struct ModelDownloadProgress<R: Runtime> {
    app: AppHandle<R>,
    current: usize,
    total: usize,
    model_name: String,
    offset: f32, // Starting percentage offset (0.0 for main model, 50.0 for CoreML)
    scale: f32,  // Scale factor (50.0 for main model, 50.0 for CoreML)
}

impl<R: Runtime> ModelDownloadProgress<R> {
    fn new(app: AppHandle<R>, model_name: String) -> Self {
        Self {
            app,
            current: 0,
            total: 0,
            model_name,
            offset: 0.0,
            scale: 100.0, // Full 0-100% range for single downloads
        }
    }

    fn new_with_offset(app: AppHandle<R>, model_name: String, offset: f32, scale: f32) -> Self {
        Self {
            app,
            current: 0,
            total: 0,
            model_name,
            offset,
            scale,
        }
    }

    fn get_percentage(&self) -> f32 {
        if self.total == 0 {
            self.offset
        } else {
            let progress = (self.current as f32 / self.total as f32) * self.scale;
            self.offset + progress
        }
    }
}

impl<R: Runtime> Progress for ModelDownloadProgress<R> {
    fn init(&mut self, size: usize, filename: &str) {
        self.total = size;
        self.current = 0;
        // Only emit start event for the first download in a sequence (offset == 0)
        if self.offset == 0.0 {
            let _ = self
                .app
                .emit("model-download-start", (&self.model_name, filename, size));
        }
    }

    fn update(&mut self, size: usize) {
        // Check for cancellation before updating progress
        if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
            if *should_cancel {
                // Clean up any stale lock files when cancellation is detected
                let _ = cleanup_stale_lock_files::<R>(self.app.clone());
                // Emit cancellation event and return early
                let _ = self.app.emit("model-download-cancelled", &self.model_name);
                // We can't directly abort the download here, but we can stop updating progress
                // The download will continue but won't report progress
                return;
            }
        }

        self.current += size;
        let percentage = self.get_percentage();
        let _ = self.app.emit("model-download-progress", percentage as i32);
    }

    fn finish(&mut self) {
        // This is intentionally left empty for the main struct.
        // The finish event is handled by the SilentFinish wrapper.
    }
}

/// A wrapper that calls finish on the inner progress tracker.
struct SilentFinish<P: Progress> {
    inner: P,
}

impl<P: Progress> Progress for SilentFinish<P> {
    fn init(&mut self, size: usize, filename: &str) {
        self.inner.init(size, filename);
    }

    fn update(&mut self, size: usize) {
        self.inner.update(size);
    }

    fn finish(&mut self) {
        // This wrapper does NOT call finish on the inner tracker, preventing
        // premature `model-download-complete` events during multi-stage downloads.
    }
}

/// Returns the path to the app's model cache directory, creating it if it doesn't exist.
fn get_model_cache_dir<R: Runtime>(app: AppHandle<R>) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Failed to get cache directory".to_string())?;
    let model_dir = cache_dir.join("models");
    if !model_dir.exists() {
        std::fs::create_dir_all(&model_dir)
            .map_err(|e| format!("Failed to create model cache directory: {}", e))?;
    }
    Ok(model_dir)
}

fn get_snapshots_dir<R: Runtime>(app: AppHandle<R>) -> PathBuf {
    let cache_dir = get_model_cache_dir::<R>(app.clone()).unwrap();
    cache_dir
        .join("models--ggerganov--whisper.cpp")
        .join("snapshots")
}

/// Cleans up stale lock files in the model cache directory
/// This is called when model downloads are cancelled to prevent lock file issues
fn cleanup_stale_lock_files<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let cache_dir = get_model_cache_dir::<R>(app.clone())?;
    let blobs_dir = cache_dir
        .join("models--ggerganov--whisper.cpp")
        .join("blobs");

    if !blobs_dir.exists() {
        return Ok(()); // No blobs directory means no lock files to clean
    }

    let mut cleaned_count = 0;

    // Iterate through all files in the blobs directory
    match std::fs::read_dir(&blobs_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                        // Remove lock/partial/incomplete files
                        if filename.ends_with(".lock")
                            || filename.ends_with(".incomplete")
                            || filename.ends_with(".part")
                        {
                            if let Err(e) = std::fs::remove_file(&path) {
                                println!(
                                    "Warning: Failed to remove cache artifact {}: {}",
                                    path.display(),
                                    e
                                );
                            } else {
                                println!("Cleaned up stale cache artifact: {}", filename);
                                cleaned_count += 1;
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            println!("Warning: Could not read blobs directory for cleanup: {}", e);
        }
    }

    if cleaned_count > 0 {
        println!("Cleaned up {} stale cache artifacts", cleaned_count);
    }

    Ok(())
}

/// If a String is required (lossy if path isn’t valid UTF-8).
pub fn get_vad_model_path<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    // Try bundled resource path first
    app
        .path()
        .resolve(
            "models/ggml-silero-v5.1.2.bin",
            BaseDirectory::Resource,
        )
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
}

/// Checks if a model exists in the cache, and if not, downloads it from the Hugging Face Hub.
/// Returns the path to the model file in the cache.
pub fn download_model_if_needed<R: Runtime>(app: AppHandle<R>, model: &str) -> Result<PathBuf, String> {
    // Check for cancellation at the start
    if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
        if *should_cancel {
            // Clean up any stale lock files before returning
            let _ = cleanup_stale_lock_files(app.clone());
            return Err("Model download cancelled".to_string());
        }
    }

    let filename = format!("ggml-{}.bin", model);
    let model_cache = get_model_cache_dir::<R>(app.clone())?;
    let snapshots_dir = get_snapshots_dir(app.clone());

    println!("Checking for model '{}' in cache...", filename);

    let api = hf_hub::api::sync::ApiBuilder::new()
        .with_cache_dir(model_cache.clone())
        .with_token(None) // Explicitly set no token for public access
        .build()
        .map_err(|e| e.to_string())?;
    let repo = api.model("ggerganov/whisper.cpp".to_string());

    // Check if model already exists in cache by checking file existence directly

    // Try to get the cached file path without downloading
    let mut model_path = None;

    // Look for the file in cache directories
    if snapshots_dir.exists() {
        for entry in std::fs::read_dir(&snapshots_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let snapshot_dir = entry.path();
            if snapshot_dir.is_dir() {
                let potential_path = snapshot_dir.join(&filename);
                if potential_path.exists() {
                    // Validate cached file; if invalid, remove and continue searching
                    if let Err(e) = validate_model_file(&potential_path) {
                        println!(
                            "Found cached model but validation failed ({}). Removing and continuing...",
                            e
                        );
                        let _ = remove_snapshot_file_and_blob(&potential_path);
                        continue;
                    }
                    let _ = app.emit("model-found-in-cache", model);
                    model_path = Some(potential_path);
                    break;
                }
            }
        }
    }

    let mut model_path = match model_path {
        Some(path) => path,
        None => {
            // Check for cancellation before starting download
            if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
                if *should_cancel {
                    // Clean up any stale lock files before returning
                    let _ = cleanup_stale_lock_files(app.clone());
                    return Err("Model download cancelled".to_string());
                }
            }

            // On macOS, check if we'll also need to download CoreML encoder
            #[cfg(target_os = "macos")]
            let needs_coreml = true;
            #[cfg(not(target_os = "macos"))]
            let needs_coreml = false;

            let model_path = if needs_coreml {
                // On macOS with CoreML, main model is 0-70%
                let progress = ModelDownloadProgress::new_with_offset(
                    app.clone(),
                    model.to_string(),
                    0.0,
                    70.0,
                );
                let silent_progress = SilentFinish { inner: progress };
                let downloaded_path = repo
                    .download_with_progress(&filename, silent_progress)
                    .map_err(|e| e.to_string())?;
                // Explicitly set progress to 70% to ensure continuity
                let _ = app.emit("model-download-progress", 70);
                downloaded_path
            } else {
                // On other platforms or no CoreML, main model is 0-100%
                let progress = ModelDownloadProgress::new(app.clone(), model.to_string());
                let downloaded_path = repo
                    .download_with_progress(&filename, progress)
                    .map_err(|e| e.to_string())?;
                let _ = app.emit("model-download-progress", 100);
                let _ = app.emit("model-download-complete", &model);
                downloaded_path
            };

            model_path
        }
    };

    // Validate the resolved model path; if invalid, clean and retry download once
    if let Err(e) = validate_model_file(&model_path) {
        println!(
            "Model file validation failed after initial retrieval ({}). Attempting one re-download...",
            e
        );
        let _ = remove_snapshot_file_and_blob(&model_path);
        let _ = cleanup_stale_lock_files(app.clone());

        let progress = ModelDownloadProgress::new(app.clone(), model.to_string());
        let redownloaded = repo
            .download_with_progress(&filename, progress)
            .map_err(|e| e.to_string())?;
        let _ = app.emit("model-download-progress", 100);
        let _ = app.emit("model-download-complete", &model);

        if let Err(e2) = validate_model_file(&redownloaded) {
            return Err(format!(
                "Model file appears corrupted or incomplete even after re-download: {}",
                e2
            ));
        }
        model_path = redownloaded;
    }

    // If on mac, also download the corresponding coreml encoder if it exists
    #[cfg(target_os = "macos")]
    {
        let coreml_file = format!("ggml-{}-encoder.mlmodelc.zip", model);

        // Check if CoreML encoder already exists in snapshots dir
        let mut coreml_cached = false;
        if snapshots_dir.exists() {
            for entry in std::fs::read_dir(&snapshots_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let snapshot_dir = entry.path();
                if snapshot_dir.is_dir() {
                    let potential_zip_path = snapshot_dir.join(&coreml_file);
                    let coreml_extracted_name = coreml_file.trim_end_matches(".zip");
                    let potential_extracted_path = snapshot_dir.join(coreml_extracted_name);

                    if potential_zip_path.exists() && potential_extracted_path.exists() {
                        coreml_cached = true;
                        break;
                    }
                }
            }
        }

        if !coreml_cached {
            // Check for cancellation before CoreML download
            if let Ok(should_cancel) = SHOULD_CANCEL.lock() {
                if *should_cancel {
                    // Clean up any stale lock files before returning
                    let _ = cleanup_stale_lock_files(app.clone());
                    return Err("Model download cancelled".to_string());
                }
            }

            // Emit immediate progress at 70% to maintain progress bar continuity
            let _ = app.emit("model-download-progress", 70);

            // Create progress tracker for CoreML download (70-90% range)
            let coreml_progress =
                ModelDownloadProgress::new_with_offset(app.clone(), model.to_string(), 70.0, 20.0);
            let silent_coreml_progress = SilentFinish {
                inner: coreml_progress,
            };

            // Download CoreML encoder with progress tracking
            let coreml_zip_path = repo
                .download_with_progress(&coreml_file, silent_coreml_progress)
                .map_err(|e| e.to_string())?;

            // Emit progress event at 90% (download complete, starting extraction)
            let _ = app.emit("model-download-progress", 90);

            // Extract the zip file to the same directory
            let extract_dir = coreml_zip_path
                .parent()
                .ok_or("Failed to get parent directory")?;
            let coreml_extracted_name = coreml_file.trim_end_matches(".zip");
            let coreml_extracted_path = extract_dir.join(coreml_extracted_name);

            // Only extract if not already extracted
            if !coreml_extracted_path.exists() {
                let file = std::fs::File::open(&coreml_zip_path).map_err(|e| e.to_string())?;
                let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

                // Manually extract with progress reporting (90% -> 100%)
                let total_size = archive.len() as u64; // Use file count for progress
                let mut extracted_count = 0;

                for i in 0..archive.len() {
                    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                    let outpath = match file.enclosed_name() {
                        Some(path) => extract_dir.join(path),
                        None => continue,
                    };

                    if (*file.name()).ends_with('/') {
                        std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
                    } else {
                        if let Some(p) = outpath.parent() {
                            if !p.exists() {
                                std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                            }
                        }
                        let mut outfile =
                            std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                        std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                    }

                    extracted_count += 1;
                    let percentage = 90.0 + (extracted_count as f32 / total_size as f32) * 10.0;
                    let _ = app.emit("model-download-progress", percentage as i32);
                }

                // After successful extraction, delete the zip file (symlink and original blob)
                let metadata =
                    std::fs::symlink_metadata(&coreml_zip_path).map_err(|e| e.to_string())?;
                if metadata.file_type().is_symlink() {
                    let target_path =
                        std::fs::read_link(&coreml_zip_path).map_err(|e| e.to_string())?;
                    let blob_path = if target_path.is_absolute() {
                        target_path
                    } else {
                        extract_dir.join(target_path)
                    };
                    if blob_path.exists() {
                        fs::remove_file(&blob_path)
                            .map_err(|e| format!("Failed to delete zip blob: {}", e))?;
                    }
                    fs::remove_file(&coreml_zip_path)
                        .map_err(|e| format!("Failed to delete zip symlink: {}", e))?;
                } else {
                    // If it's not a symlink, just delete the file itself
                    fs::remove_file(&coreml_zip_path)
                        .map_err(|e| format!("Failed to delete zip file: {}", e))?;
                }
            }
        } else {
            // CoreML is cached, emit smooth progress transition
            let _ = app.emit("model-download-progress", 70);
            // Small delay to ensure smooth visual transition
            std::thread::sleep(std::time::Duration::from_millis(50));
            let _ = app.emit("model-download-progress", 90);
        }

        // Final completion events are now sent only after all stages are done.
        let _ = app.emit("model-download-progress", 100);
        // Add a small delay to ensure the frontend can render the 100% state
        std::thread::sleep(std::time::Duration::from_millis(250));
        let _ = app.emit("model-download-complete", model);
    }

    println!("Model path is: {:?}", model_path);
    Ok(model_path)
}

/// --- Helpers to validate and clean cached model files ---
fn resolve_symlink_target(path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        let target = fs::read_link(path).map_err(|e| e.to_string())?;
        let base = path.parent().ok_or_else(|| "Failed to get parent directory".to_string())?;
        Ok(if target.is_absolute() { target } else { base.join(target) })
    } else {
        Ok(path.to_path_buf())
    }
}

fn validate_model_file(path: &Path) -> Result<(), String> {
    let blob_path = resolve_symlink_target(path)?;
    if !blob_path.exists() {
        return Err(format!(
            "Model blob target does not exist: {}",
            blob_path.display()
        ));
    }
    let md = fs::metadata(&blob_path).map_err(|e| e.to_string())?;
    // Basic sanity: should be non-trivial size (> 1MB)
    if md.len() < 1_000_000 {
        return Err(format!(
            "Model blob seems too small ({} bytes): {}",
            md.len(),
            blob_path.display()
        ));
    }

    // Optional: try reading a few bytes to ensure file is readable
    let mut f = fs::File::open(&blob_path).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 16];
    let _ = f.read(&mut buf).map_err(|e| e.to_string())?;

    Ok(())
}

fn remove_snapshot_file_and_blob(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        let target_path = fs::read_link(path).map_err(|e| e.to_string())?;
        let base = path.parent().ok_or_else(|| "Failed to get parent directory".to_string())?;
        let blob_path = if target_path.is_absolute() {
            target_path
        } else {
            base.join(target_path)
        };
        if blob_path.exists() {
            fs::remove_file(&blob_path)
                .map_err(|e| format!("Failed to delete blob file {}: {}", blob_path.display(), e))?;
        }
        fs::remove_file(path)
            .map_err(|e| format!("Failed to delete snapshot symlink {}: {}", path.display(), e))?;
    } else if metadata.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to delete directory {}: {}", path.display(), e))?;
    } else {
        fs::remove_file(path)
            .map_err(|e| format!("Failed to delete file {}: {}", path.display(), e))?;
    }
    Ok(())
}

#[command]
pub fn delete_model<R: Runtime>(model: &str, app: AppHandle<R>) -> Result<(), String> {
    let snapshots_dir = get_snapshots_dir(app.clone());
    if !snapshots_dir.exists() {
        return Ok(()); // No models to delete
    }

    // List of all possible file patterns for this model
    let file_patterns = vec![
        format!("ggml-{}.bin", model),                  // Model file
        format!("ggml-{}-encoder.mlmodelc", model),     // CoreML encoder (extracted)
        format!("ggml-{}-encoder.mlmodelc.zip", model), // CoreML encoder (zip)
    ];

    let mut deleted_files = Vec::new();

    // Search through all snapshot directories
    for entry in std::fs::read_dir(&snapshots_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let snapshot_dir = entry.path();

        if snapshot_dir.is_dir() {
            // Check each file pattern in this snapshot directory
            for pattern in &file_patterns {
                let file_path = snapshot_dir.join(pattern);
                if file_path.exists() {
                    // Use symlink_metadata to check the file type without following the link.
                    let metadata = fs::symlink_metadata(&file_path).map_err(|e| e.to_string())?;

                    if metadata.file_type().is_symlink() {
                        // It's a symlink. Read the link to get the path to the actual file (the blob).
                        let target_path = fs::read_link(&file_path).map_err(|e| e.to_string())?;
                        let blob_path = if target_path.is_absolute() {
                            target_path
                        } else {
                            // hf-hub links are relative, so we resolve them from the snapshot dir.
                            snapshot_dir.join(target_path)
                        };
                        if blob_path.exists() {
                            fs::remove_file(&blob_path)
                                .map_err(|e| format!("Failed to delete blob file {}: {}", blob_path.display(), e))?;
                        }
                        fs::remove_file(&file_path)
                            .map_err(|e| format!("Failed to delete snapshot symlink {}: {}", file_path.display(), e))?;
                    } else if metadata.is_dir() {
                        // It's a directory (e.g., extracted CoreML model), remove it recursively.
                        fs::remove_dir_all(&file_path)
                            .map_err(|e| format!("Failed to delete directory {}: {}", file_path.display(), e))?;
                    } else {
                        // It's a regular file, not a symlink or directory.
                        fs::remove_file(&file_path)
                            .map_err(|e| format!("Failed to delete file {}: {}", file_path.display(), e))?;
                    }

                    deleted_files.push(pattern.clone());
                }
            }
        }
    }

    if deleted_files.is_empty() {
        return Err(format!("No files found for model '{}'", model));
    }

    println!(
        "Deleted {} files for model '{}': {:?}",
        deleted_files.len(),
        model,
        deleted_files
    );
    Ok(())
}

#[command]
pub fn get_downloaded_models<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    use std::fs;
    let snapshots_dir = get_snapshots_dir(app.clone());
    let mut found_files = Vec::new();

    for entry in fs::read_dir(&snapshots_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            for file in fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
                let file = file.map_err(|e| e.to_string())?;
                // Use symlink_metadata to detect both symlinks and files
                let metadata = fs::symlink_metadata(file.path()).map_err(|e| e.to_string())?;
                if metadata.is_file() || metadata.file_type().is_symlink() {
                    let file_name = file.file_name();
                    if let Some(name) = file_name.to_str() {
                        if name.ends_with(".bin") {
                            found_files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }

    // Map filenames back to conceptual model names
    let mut detected_models = Vec::new();

    for filename in found_files {
        if filename.starts_with("ggml-") && filename.ends_with(".bin") {
            let model_part = filename.replace("ggml-", "").replace(".bin", "");
            detected_models.push(model_part);
        }
    }

    // Remove duplicates and sort
    detected_models.sort();
    detected_models.dedup();

    Ok(detected_models)
}

/// Downloads a file from a URL to a local cache if it doesn't already exist.
pub async fn download_diarize_model_if_needed<R: Runtime>(
    app: AppHandle<R>,
    file_name: &str,
    url: &str,
) -> Result<PathBuf, String> {
    let model_dir = get_model_cache_dir::<R>(app.clone())?;
    let local_path = model_dir.join(file_name);

    if local_path.exists() {
        println!("Diarize model '{}' found locally.", file_name);
        return Ok(local_path);
    }

    println!(
        "Diarize model '{}' not found. Downloading from {}...",
        file_name, url
    );

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download diarize model '{}': {}", file_name, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download diarize model '{}': received status {}",
            file_name,
            response.status()
        ));
    }

    let mut dest = std::fs::File::create(&local_path)
        .map_err(|e| format!("Failed to create file for diarize model: {}", e))?;
    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read downloaded diarize model bytes: {}", e))?;

    copy(&mut content.as_ref(), &mut dest)
        .map_err(|e| format!("Failed to write diarize model to file: {}", e))?;

    println!(
        "Diarize model '{}' downloaded successfully to {:?}.",
        file_name, local_path
    );
    Ok(local_path)
}
