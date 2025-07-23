use hf_hub::{api::sync::Api, api::Progress, Cache};
use std::io::copy;
use std::path::PathBuf;
use tauri::{command, AppHandle, Emitter, Manager};
use zip::ZipArchive;

/// Progress tracker for model downloads that emits events to the frontend
struct ModelDownloadProgress {
    app: AppHandle,
    current: usize,
    total: usize,
    model_name: String,
    offset: f32,  // Starting percentage offset (0.0 for main model, 50.0 for CoreML)
    scale: f32,   // Scale factor (50.0 for main model, 50.0 for CoreML)
}

impl ModelDownloadProgress {
    fn new(app: AppHandle, model_name: String) -> Self {
        Self {
            app,
            current: 0,
            total: 0,
            model_name,
            offset: 0.0,
            scale: 100.0,  // Full 0-100% range for single downloads
        }
    }
    
    fn new_with_offset(app: AppHandle, model_name: String, offset: f32, scale: f32) -> Self {
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

impl Progress for ModelDownloadProgress {
    fn init(&mut self, size: usize, filename: &str) {
        self.total = size;
        self.current = 0;
        // Only emit start event for the first download in a sequence (offset == 0)
        if self.offset == 0.0 {
            let _ = self.app.emit("model-download-start", (&self.model_name, filename, size));
        }
    }

    fn update(&mut self, size: usize) {
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
fn get_model_cache_dir(app: AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|_| "Failed to get cache directory".to_string())?;
    let model_dir = cache_dir.join("models");
    if !model_dir.exists() {
        std::fs::create_dir_all(&model_dir)
            .map_err(|e| format!("Failed to create model cache directory: {}", e))?;
    }
    Ok(model_dir)
}

fn get_snapshots_dir(app: AppHandle) -> PathBuf {
    let cache_dir = get_model_cache_dir(app.clone()).unwrap();
    cache_dir.join("models--ggerganov--whisper.cpp").join("snapshots")
}

/// Returns the appropriate filename for a Whisper model based on the model variant and language.
/// - If the model is "large", it maps to "large-v3" internally, matching the naming convention.
/// - If the `lang` parameter is "en" (case-insensitive) and the model isn't "large-v3", returns the English-specific model file.
/// - Otherwise, returns the general model file name.
/// Examples:
///   get_filename("base", &Some("en".to_string()))      -> "ggml-base.en.bin"
///   get_filename("large", &None)                       -> "ggml-large-v3.bin"
///   get_filename("medium", &Some("fr".to_string()))    -> "ggml-medium.bin"
fn get_filename(model: &str, lang: &Option<String>) -> String {
    let is_en = lang.as_deref().map_or(false, |l| l.eq_ignore_ascii_case("en"));
    // English models are not available for large-v3 and large-v3-turbo
    if is_en && model != "large-v3" && model != "large-v3-turbo" {
        format!("ggml-{}.en.bin", model)
    } else {
        format!("ggml-{}.bin", model)
    }
}

/// Checks if a model exists in the cache, and if not, downloads it from the Hugging Face Hub.
/// Returns the path to the model file in the cache.
pub fn download_model_if_needed(app: AppHandle, model: &str, lang: &Option<String>) -> Result<PathBuf, String> {
    let filename = get_filename(model, lang);
    let model_cache = get_model_cache_dir(app.clone())?;
    let snapshots_dir = get_snapshots_dir(app.clone());

    println!("Checking for model '{}' in cache...", filename);

    let api = hf_hub::api::sync::ApiBuilder::new()
        .with_cache_dir(model_cache.clone())
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
                    let _ = app.emit("model-found-in-cache", model);
                    model_path = Some(potential_path);
                    break;
                }
            }
        }
    }
    
    let model_path = match model_path {
        Some(path) => path,
        None => {
            // On macOS, check if we'll also need to download CoreML encoder
            #[cfg(target_os = "macos")]
            let needs_coreml = true;
            #[cfg(not(target_os = "macos"))]
            let needs_coreml = false;
            
            let model_path = if needs_coreml {
                // On macOS with CoreML, main model is 0-70%
                let progress = ModelDownloadProgress::new_with_offset(app.clone(), model.to_string(), 0.0, 70.0);
                let silent_progress = SilentFinish { inner: progress };
                let downloaded_path = repo.download_with_progress(&filename, silent_progress).map_err(|e| e.to_string())?;
                // Explicitly set progress to 70% to ensure continuity
                let _ = app.emit("model-download-progress", 70);
                downloaded_path
            } else {
                // On other platforms or no CoreML, main model is 0-100%
                let progress = ModelDownloadProgress::new(app.clone(), model.to_string());
                let downloaded_path = repo.download_with_progress(&filename, progress).map_err(|e| e.to_string())?;
                let _ = app.emit("model-download-progress", 100);
                let _ = app.emit("model-download-complete", &model);
                downloaded_path
            };
            
            model_path
        }
    };

    // If on mac, also download the corresponding coreml encoder if it exists
    #[cfg(target_os = "macos")]
    {
        // English models are not available for large-v3 and large-v3-turbo
        let is_en = lang.as_deref().map_or(true, |l| l.eq_ignore_ascii_case("en") && model != "large-v3" && model != "large-v3-turbo");
        let coreml_file = if is_en {
            format!("ggml-{}.en-encoder.mlmodelc.zip", model)
        } else {
            format!("ggml-{}-encoder.mlmodelc.zip", model)
        };
        
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
            // Emit immediate progress at 70% to maintain progress bar continuity
            let _ = app.emit("model-download-progress", 70);
            
            // Create progress tracker for CoreML download (70-90% range)
            let coreml_progress = ModelDownloadProgress::new_with_offset(app.clone(), model.to_string(), 70.0, 20.0);
            let silent_coreml_progress = SilentFinish { inner: coreml_progress };

            // Download CoreML encoder with progress tracking
            let coreml_zip_path = repo.download_with_progress(&coreml_file, silent_coreml_progress)
                .map_err(|e| e.to_string())?;
            
            // Emit progress event at 90% (download complete, starting extraction)
            let _ = app.emit("model-download-progress", 90);
            
            // Extract the zip file to the same directory
            let extract_dir = coreml_zip_path.parent().ok_or("Failed to get parent directory")?;
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
                        let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                        std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                    }

                    extracted_count += 1;
                    let percentage = 90.0 + (extracted_count as f32 / total_size as f32) * 10.0;
                    let _ = app.emit("model-download-progress", percentage as i32);
                }

                // After successful extraction, delete the zip file (symlink and original blob)
                let metadata = std::fs::symlink_metadata(&coreml_zip_path).map_err(|e| e.to_string())?;
                if metadata.file_type().is_symlink() {
                    let target_path = std::fs::read_link(&coreml_zip_path).map_err(|e| e.to_string())?;
                    let blob_path = if target_path.is_absolute() {
                        target_path
                    } else {
                        extract_dir.join(target_path)
                    };
                    if blob_path.exists() {
                        std::fs::remove_file(&blob_path).map_err(|e| format!("Failed to delete zip blob: {}", e))?;
                    }
                    std::fs::remove_file(&coreml_zip_path).map_err(|e| format!("Failed to delete zip symlink: {}", e))?;
                } else {
                    // If it's not a symlink, just delete the file itself
                    std::fs::remove_file(&coreml_zip_path).map_err(|e| format!("Failed to delete zip file: {}", e))?;
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


#[command]
pub fn delete_model(model: &str, app: AppHandle) -> Result<(), String> {
    let snapshots_dir = get_snapshots_dir(app.clone());
    
    if !snapshots_dir.exists() {
        return Ok(()); // No models to delete
    }
    
    let model_name = if model == "large" { "large-v3" } else { model };
    
    // List of all possible file patterns for this model
    let file_patterns = vec![
        format!("ggml-{}.bin", model_name),           // Non-English model
        format!("ggml-{}.en.bin", model_name),        // English model
        format!("ggml-{}-encoder.mlmodelc", model_name),     // Non-English CoreML encoder (extracted)
        format!("ggml-{}.en-encoder.mlmodelc", model_name),  // English CoreML encoder (extracted)
        format!("ggml-{}-encoder.mlmodelc.zip", model_name), // Non-English CoreML encoder (zip)
        format!("ggml-{}.en-encoder.mlmodelc.zip", model_name), // English CoreML encoder (zip)
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
                    let metadata = std::fs::symlink_metadata(&file_path).map_err(|e| e.to_string())?;

                    if metadata.file_type().is_symlink() {
                        // It's a symlink. Read the link to get the path to the actual file (the blob).
                        let target_path = std::fs::read_link(&file_path).map_err(|e| e.to_string())?;
                        let blob_path = if target_path.is_absolute() {
                            target_path
                        } else {
                            // hf-hub links are relative, so we resolve them from the snapshot dir.
                            snapshot_dir.join(target_path)
                        };

                        // Delete the actual blob file if it exists.
                        if blob_path.exists() {
                            std::fs::remove_file(&blob_path).map_err(|e| format!("Failed to delete blob file {}: {}", blob_path.display(), e))?;
                        }
                        
                        // Finally, delete the symlink itself.
                        std::fs::remove_file(&file_path).map_err(|e| format!("Failed to delete symlink {}: {}", file_path.display(), e))?;

                    } else if metadata.is_dir() {
                        // It's a directory (e.g., extracted CoreML model), remove it recursively.
                        std::fs::remove_dir_all(&file_path).map_err(|e| format!("Failed to delete directory {}: {}", file_path.display(), e))?;
                    } else {
                        // It's a regular file, not a symlink or directory.
                        std::fs::remove_file(&file_path).map_err(|e| format!("Failed to delete file {}: {}", file_path.display(), e))?;
                    }

                    deleted_files.push(pattern.clone());
                }
            }
        }
    }
    
    if deleted_files.is_empty() {
        return Err(format!("No files found for model '{}'", model));
    }
    
    println!("Deleted {} files for model '{}': {:?}", deleted_files.len(), model, deleted_files);
    Ok(())
}

#[command]
pub fn get_downloaded_models(app: AppHandle) -> Result<Vec<String>, String> {
    use std::fs;
    let snapshots_dir = get_snapshots_dir(app.clone());
    let mut models = Vec::new();
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
                            models.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    Ok(models)
}

/// Downloads a file from a URL to a local cache if it doesn't already exist.
pub async fn download_diarize_model_if_needed(app: AppHandle, file_name: &str, url: &str) -> Result<PathBuf, String> {
    let model_dir = get_model_cache_dir(app.clone())?;
    let local_path = model_dir.join(file_name);

    if local_path.exists() {
        println!("Diarize model '{}' found locally.", file_name);
        return Ok(local_path);
    }

    println!("Diarize model '{}' not found. Downloading from {}...", file_name, url);

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
        file_name,
        local_path
    );
    Ok(local_path)
}
