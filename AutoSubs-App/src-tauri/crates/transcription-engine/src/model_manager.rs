use crate::types::{LabeledProgressFn, ProgressType};
use eyre::{bail, eyre, Context, Result};
use hf_hub::api::sync::ApiBuilder;
use hf_hub::api::Progress as HubProgress;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tokio_util::sync::CancellationToken;
use once_cell::sync::Lazy;

// Global download state to ensure only one download runs at a time
static ACTIVE_DOWNLOAD: Lazy<Mutex<Option<Arc<CancellationToken>>>> = Lazy::new(|| Mutex::new(None));

// Generation counter to invalidate old progress callbacks
static DOWNLOAD_GENERATION: AtomicU64 = AtomicU64::new(0);

// Internal progress adapter for hf-hub that forwards percentage to an optional callback
struct DownloadProgress<'a> {
    // percentage = offset + (current/total) * scale
    offset: f32,
    scale: f32,
    current: usize,
    total: usize,
    progress_cb: Option<&'a LabeledProgressFn>,
    label: &'a str,
    is_cancelled: Option<&'a (dyn Fn() -> bool + Send + Sync)>,
    on_cancel_cleanup: Option<Box<dyn Fn() + Send + Sync + 'a>>,
    generation: u64,
    cancel_token: Arc<CancellationToken>,
}

impl<'a> DownloadProgress<'a> {
    fn new(
        progress_cb: Option<&'a LabeledProgressFn>,
        is_cancelled: Option<&'a (dyn Fn() -> bool + Send + Sync)>,
        offset: f32,
        scale: f32,
        on_cancel_cleanup: Option<Box<dyn Fn() + Send + Sync + 'a>>,
        label: &'a str,
        cancel_token: Arc<CancellationToken>,
    ) -> Self {
        Self {
            offset,
            scale,
            current: 0,
            total: 0,
            progress_cb,
            is_cancelled,
            on_cancel_cleanup,
            label,
            generation: DOWNLOAD_GENERATION.load(Ordering::Relaxed),
            cancel_token,
        }
    }

    /// Check if this download should stop (cancelled by user or superseded by new download)
    fn should_stop(&self) -> bool {
        // User cancelled
        if let Some(is_cancelled) = self.is_cancelled {
            if is_cancelled() {
                return true;
            }
        }
        
        // Cancelled by newer download
        if self.cancel_token.is_cancelled() {
            return true;
        }
        
        // Superseded by newer generation
        if self.generation != DOWNLOAD_GENERATION.load(Ordering::Relaxed) {
            return true;
        }
        
        false
    }

    fn emit(&self) {
        if self.should_stop() {
            return;
        }
        
        if let (Some(cb), total) = (self.progress_cb, self.total) {
            let pct = if total == 0 {
                self.offset
            } else {
                self.offset + (self.current as f32 / self.total as f32) * self.scale
            };
            cb(pct as i32, ProgressType::Download, self.label);
        }
    }
    
    /// Handle cancellation: cancel token and run cleanup
    fn handle_cancellation(&self) {
        self.cancel_token.cancel();
        if let Some(ref f) = self.on_cancel_cleanup {
            f();
        }
    }
}

impl<'a> HubProgress for DownloadProgress<'a> {
    fn init(&mut self, size: usize, _filename: &str) {
        self.total = size;
        self.current = 0;
        self.emit();
    }

    fn update(&mut self, size: usize) {
        // Check if user cancelled and handle cleanup
        if let Some(is_cancelled) = self.is_cancelled {
            if is_cancelled() {
                self.handle_cancellation();
                return;
            }
        }

        self.current += size;
        self.emit();
    }

    fn finish(&mut self) {
        // intentionally no-op; caller will manage final 100% emission if needed
    }
}

pub struct ModelManager {
    cache_dir: PathBuf,
}

impl ModelManager {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }

    fn model_cache_dir(&self) -> Result<PathBuf> {
        let dir = self.cache_dir.clone();
        if !dir.exists() {
            fs::create_dir_all(&dir).context("Failed to create model cache directory")?;
        }
        Ok(dir)
    }


    // ---- Public API ----
    pub async fn ensure_whisper_model(
        &self,
        model: &str,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        // Early cancellation
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                self.cleanup_stale_locks().ok();
                bail!("Model download cancelled");
            }
        }

        let filename = format!("ggml-{}.bin", model);

        // On macOS with CoreML feature, main model is 0-70%; otherwise 0-100%
        #[cfg(feature = "coreml")]
        let needs_coreml = cfg!(target_os = "macos");
        #[cfg(not(feature = "coreml"))]
        let needs_coreml = false;

        let model_path = if needs_coreml {
            // 0..70 for main model
            self.ensure_hub_model(
                "ggerganov/whisper.cpp",
                &filename,
                progress,
                is_cancelled,
                0.0,
                70.0,
                &format!("Downloading {}", model),
            )
            .await?
        } else {
            self.ensure_hub_model(
                "ggerganov/whisper.cpp",
                &filename,
                progress,
                is_cancelled,
                0.0,
                100.0,
                &format!("Downloading {}", model),
            )
            .await?
        };

        // If enabled, fetch CoreML encoder as well (zip then extract)
        #[cfg(feature = "coreml")]
        {
            if cfg!(target_os = "macos") {
                let coreml_file = format!("ggml-{}-encoder.mlmodelc.zip", model);

                // Fast path: if the extracted CoreML encoder directory already exists in cache,
                // skip downloading the zip entirely.
                let extracted_name = coreml_file.trim_end_matches(".zip");
                if let Ok(cache_root) = self.model_cache_dir() {
                    let base = cache_root
                        .join("models--ggerganov--whisper.cpp")
                        .join("snapshots");
                    if base.exists() {
                        if let Ok(entries) = fs::read_dir(&base) {
                            for entry in entries.flatten() {
                                let snap = entry.path();
                                if !snap.is_dir() { continue; }
                                let extracted_path = snap.join(extracted_name);
                                if extracted_path.exists() {
                                    // Do NOT emit progress here to avoid starting progress
                                    // when everything is already cached.
                                    return Ok(model_path);
                                }
                            }
                        }
                    }
                }

                // 70..90 for the CoreML archive download. If it fails (e.g., network), log and continue
                // with the main model instead of failing the entire operation.
                let coreml_zip_path = match self
                    .ensure_hub_model(
                        "ggerganov/whisper.cpp",
                        &coreml_file,
                        progress,
                        is_cancelled,
                        70.0,
                        20.0,
                        "Downloading CoreML encoder",
                    )
                    .await
                {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!(
                            "Warning: CoreML encoder download failed ({}). Proceeding without CoreML encoder.",
                            e
                        );
                        if let Some(cb) = progress { cb(100, ProgressType::Download, "Failed to download CoreML encoder"); }
                        return Ok(model_path);
                    }
                };

                // Progress at 90% (download done, start extracting)
                if let Some(cb) = progress { cb(90, ProgressType::Download, "Extracting CoreML encoder"); }

                // Extract to same directory as the cached zip
                let extract_dir = coreml_zip_path
                    .parent()
                    .ok_or_else(|| eyre!("Failed to get parent directory for CoreML zip"))?;
                let extracted_name = coreml_file.trim_end_matches(".zip");
                let extracted_path = extract_dir.join(extracted_name);

                if !extracted_path.exists() {
                    let file = fs::File::open(&coreml_zip_path)
                        .context("Failed to open CoreML zip")?;
                    let mut archive = zip::ZipArchive::new(file)
                        .context("Failed to read CoreML zip archive")?;

                    let total = archive.len() as u64;
                    let mut count = 0u64;
                    for i in 0..archive.len() {
                        let mut file = archive.by_index(i).context("Failed to access zip entry")?;
                        let outpath = match file.enclosed_name() {
                            Some(path) => extract_dir.join(path),
                            None => continue,
                        };
                        if (&*file.name()).ends_with('/') {
                            fs::create_dir_all(&outpath).ok();
                        } else {
                            if let Some(p) = outpath.parent() { fs::create_dir_all(p).ok(); }
                            let mut outfile = fs::File::create(&outpath)
                                .context("Failed to create extracted file")?;
                            std::io::copy(&mut file, &mut outfile)
                                .context("Failed to extract file")?;
                        }
                        count += 1;
                        if let Some(cb) = progress {
                            let pct = 90.0 + (count as f32 / total as f32) * 10.0;
                            cb(pct as i32, ProgressType::Download, "Extracting CoreML encoder");
                        }
                    }

                    // After extraction, delete the zip and its blob target (if symlinked)
                    let _ = remove_snapshot_file_and_blob(&coreml_zip_path);
                }

                // Final completion
                if let Some(cb) = progress { cb(100, ProgressType::Download, "Extracted CoreML encoder"); }
            }
        }

        Ok(model_path)
    }


    pub async fn ensure_parakeet_v3_model(
        &self,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        // Early cancellation
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                self.cleanup_stale_locks().ok();
                bail!("Model download cancelled");
            }
        }

        let repo_id = "istupakov/parakeet-tdt-0.6b-v3-onnx";
        // Minimal set required by transcribe-rs Parakeet loader in int8 mode.
        let required_files = [
            "encoder-model.int8.onnx",
            "decoder_joint-model.int8.onnx",
            "nemo128.onnx",
            "vocab.txt",
            "config.json",
        ];

        // Fast path: find a snapshot dir that already contains all required files.
        if let Some(snapshot_dir) = self.find_cached_snapshot_with_files(repo_id, &required_files)? {
            let mut ok = true;
            for f in required_files {
                let p = snapshot_dir.join(f);
                if !p.exists() || validate_model_file(&p).is_err() {
                    ok = false;
                    break;
                }
            }
            if ok {
                return Ok(snapshot_dir);
            }
        }

        // Download required files. We do this sequentially so we can show progress.
        // Note: ensure_hub_model handles caching and will no-op if everything is already cached.
        let total = required_files.len() as f32;
        for (idx, filename) in required_files.iter().enumerate() {
            // Start progress at 0 only if a download occurs; ensure_hub_model itself avoids emitting
            // progress if it returns from cache.
            let offset = (idx as f32 / total) * 100.0;
            let scale = (1.0 / total) * 100.0;
            let _ = self
                .ensure_hub_model(
                    repo_id,
                    filename,
                    progress,
                    is_cancelled,
                    offset,
                    scale,
                    "Downloading Parakeet v3 model",
                )
                .await?;
        }

        // After downloading, locate a snapshot that contains everything.
        if let Some(snapshot_dir) = self.find_cached_snapshot_with_files(repo_id, &required_files)? {
            // Validate again to be safe.
            for f in required_files {
                let p = snapshot_dir.join(f);
                validate_model_file(&p)
                    .with_context(|| format!("Model validation failed for '{}' from '{}'", f, repo_id))?;
            }
            if let Some(cb) = progress {
                cb(100, ProgressType::Download, "Downloaded Parakeet v3 model");
            }
            return Ok(snapshot_dir);
        }

        bail!("Failed to locate Parakeet model snapshot after download");
    }

    pub async fn ensure_moonshine_model(
        &self,
        model: &str,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        // Early cancellation
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                bail!("Model download cancelled");
            }
        }

        let folder = match model.to_lowercase().as_str() {
            "moonshine-tiny" => "tiny",
            "moonshine-tiny-ar" => "tiny-ar",
            "moonshine-tiny-zh" => "tiny-zh",
            "moonshine-tiny-ja" => "tiny-ja",
            "moonshine-tiny-ko" => "tiny-ko",
            "moonshine-tiny-uk" => "tiny-uk",
            "moonshine-tiny-vi" => "tiny-vi",
            "moonshine-base" => "base",
            "moonshine-base-es" => "base-es",
            _ => bail!("Unknown Moonshine model: {}", model),
        };

        let cache_root = self.model_cache_dir()?;
        let model_dir = cache_root.join("moonshine").join(folder);
        if !model_dir.exists() {
            fs::create_dir_all(&model_dir).context("Failed to create Moonshine model directory")?;
        }

        let required_files = [
            "encoder_model.onnx",
            "decoder_model_merged.onnx",
            "tokenizer.json",
        ];

        let onnx_subdir = if folder == "tiny" || folder == "base" {
            "quantized"
        } else {
            "float"
        };

        // Fast path: if all required files exist and validate, return immediately.
        let mut ok = true;
        for f in required_files {
            let p = model_dir.join(f);
            if !p.exists() || validate_model_file(&p).is_err() {
                ok = false;
                break;
            }
        }
        if ok {
            return Ok(model_dir);
        }

        // Download missing/invalid files.
        let total = required_files.len() as f32;
        for (idx, filename) in required_files.iter().enumerate() {
            if let Some(is_cancelled) = is_cancelled {
                if is_cancelled() {
                    bail!("Model download cancelled");
                }
            }

            let dest = model_dir.join(filename);
            if dest.exists() && validate_model_file(&dest).is_ok() {
                continue;
            }

            let offset = (idx as f32 / total) * 100.0;
            let scale = (1.0 / total) * 100.0;

            if let Some(cb) = progress {
                cb(offset as i32, ProgressType::Download, "Downloading Moonshine model");
            }

            let url = if *filename == "tokenizer.json" {
                // The HF repo currently does not provide tokenizer.json under tiny/* variants.
                // Tokenizer assets live under base/float and appear to be shared.
                "https://huggingface.co/UsefulSensors/moonshine/resolve/main/onnx/merged/base/float/tokenizer.json".to_string()
            } else {
                format!(
                    "https://huggingface.co/UsefulSensors/moonshine/resolve/main/onnx/merged/{}/{}/{}",
                    folder, onnx_subdir, filename
                )
            };
            download_to(&dest, &url).await?;
            validate_model_file(&dest)
                .with_context(|| format!("Model validation failed for '{}' from Moonshine {}", filename, folder))?;

            if let Some(cb) = progress {
                cb((offset + scale) as i32, ProgressType::Download, "Downloading Moonshine model");
            }
        }

        if let Some(cb) = progress {
            cb(100, ProgressType::Download, "Downloaded Moonshine model");
        }

        Ok(model_dir)
    }

    /// Ensure the Silero VAD model exists locally. If not, download via hf-hub.
    /// Uses the ggml-org/whisper-vad repository and the file `ggml-silero-v5.1.2.bin`.
    pub async fn ensure_vad_model(
        &self,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        self
            .ensure_hub_model(
                "ggml-org/whisper-vad",
                "ggml-silero-v5.1.2.bin",
                progress,
                is_cancelled,
                0.0,
                100.0,
                "Downloading VAD Model",
            )
            .await
    }

    pub async fn ensure_diarize_models(
        &mut self,
        seg_url: &str,
        emb_url: &str,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<(PathBuf, PathBuf)> {
        if let Some(is_cancelled) = is_cancelled { if is_cancelled() { bail!("Cancelled"); } }

        let seg_path = if let Some((repo_id, filename)) = parse_hf_blob_url(seg_url) {
            self
                .ensure_hub_model(
                    &repo_id,
                    &filename,
                    progress,
                    is_cancelled,
                    0.0,
                    50.0,
                    "Downloading Diarize Models",
                )
                .await?
        } else {
            let model_dir = self.model_cache_dir()?;
            let seg_name = url_filename(seg_url).ok_or_else(|| eyre!("Invalid seg_url"))?;
            let seg_path = model_dir.join(&seg_name);
            if !seg_path.exists() {
                if let Some(cb) = progress { cb(5, ProgressType::Download, "Downloading Diarize Models"); }
                download_to(&seg_path, seg_url).await?;
            }
            seg_path
        };

        if let Some(is_cancelled) = is_cancelled { if is_cancelled() { bail!("Cancelled"); } }

        let emb_path = if let Some((repo_id, filename)) = parse_hf_blob_url(emb_url) {
            self
                .ensure_hub_model(
                    &repo_id,
                    &filename,
                    progress,
                    is_cancelled,
                    50.0,
                    50.0,
                    "Downloading Diarize Models",
                )
                .await?
        } else {
            let model_dir = self.model_cache_dir()?;
            let emb_name = url_filename(emb_url).ok_or_else(|| eyre!("Invalid emb_url"))?;
            let emb_path = model_dir.join(&emb_name);
            if !emb_path.exists() {
                if let Some(cb) = progress { cb(55, ProgressType::Download, "Downloading Diarize Models"); }
                download_to(&emb_path, emb_url).await?;
            }
            emb_path
        };

        if let Some(cb) = progress { cb(100, ProgressType::Download, "Downloaded Diarize Models"); }
        Ok((seg_path, emb_path))
    }

    pub fn delete_whisper_model(&self, model: &str) -> Result<()> {
        let cache_dir = self.model_cache_dir()?;
        if !cache_dir.exists() { return Ok(()); }

        let patterns = vec![
            format!("ggml-{}.bin", model),
            format!("ggml-{}-encoder.mlmodelc", model),
            format!("ggml-{}-encoder.mlmodelc.zip", model),
        ];

        let mut stack = vec![cache_dir];
        let mut deleted_any = false;
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).context("Failed to read cache dir")? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    if patterns.iter().any(|p| p == name) {
                        // Only remove the symlink, not the blob file
                        // This allows the blob to be reused if the model is downloaded again
                        if path.exists() {
                            let _ = fs::remove_file(&path);
                            deleted_any = true;
                            eprintln!("Removed model symlink: {}", path.display());
                        }
                    }
                }
            }
        }

        if !deleted_any {
            bail!("No files found for model '{}'", model);
        }
        Ok(())
    }

    /// Delete a cached Moonshine model by name (e.g. "moonshine-tiny", "moonshine-base-es").
    /// Removes the entire model folder from the moonshine cache directory.
    pub fn delete_moonshine_model(&self, model_name: &str) -> Result<()> {
        let folder = model_name
            .strip_prefix("moonshine-")
            .ok_or_else(|| eyre!("Invalid Moonshine model name: {}", model_name))?;

        let cache_dir = self.model_cache_dir()?;
        let model_dir = cache_dir.join("moonshine").join(folder);
        if !model_dir.exists() {
            bail!("Moonshine model '{}' not found in cache", model_name);
        }

        fs::remove_dir_all(&model_dir)
            .with_context(|| format!("Failed to delete Moonshine model directory: {}", model_dir.display()))?;
        eprintln!("Deleted Moonshine model: {}", model_dir.display());
        Ok(())
    }

    /// Delete the cached Parakeet model.
    /// Removes the hf-hub snapshot files for the Parakeet model.
    pub fn delete_parakeet_model(&self) -> Result<()> {
        let cache_dir = self.model_cache_dir()?;
        let parakeet_repo_dir = cache_dir.join("models--istupakov--parakeet-tdt-0.6b-v3-onnx");
        if !parakeet_repo_dir.exists() {
            bail!("Parakeet model not found in cache");
        }

        fs::remove_dir_all(&parakeet_repo_dir)
            .with_context(|| format!("Failed to delete Parakeet model directory: {}", parakeet_repo_dir.display()))?;
        eprintln!("Deleted Parakeet model: {}", parakeet_repo_dir.display());
        Ok(())
    }

    /// Clean up orphaned blob files that are no longer referenced by any symlinks
    /// This should be called periodically to free up disk space
    pub fn cleanup_orphaned_blobs(&self) -> Result<()> {
        let cache_root = self.model_cache_dir()?;
        let models_dir = cache_root.join("models--ggerganov--whisper.cpp");
        if !models_dir.exists() { return Ok(()); }

        let blobs_dir = models_dir.join("blobs");
        let snapshots_dir = models_dir.join("snapshots");
        if !blobs_dir.exists() || !snapshots_dir.exists() { return Ok(()); }

        // Collect all blob files
        let mut blob_files: std::collections::HashSet<String> = std::collections::HashSet::new();
        for entry in fs::read_dir(&blobs_dir).context("Failed to read blobs dir")? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    blob_files.insert(name.to_string());
                }
            }
        }

        // Collect all referenced blobs from symlinks
        let mut referenced_blobs: std::collections::HashSet<String> = std::collections::HashSet::new();
        for entry in fs::read_dir(&snapshots_dir).context("Failed to read snapshots dir")? {
            let entry = entry?;
            let snap_path = entry.path();
            if snap_path.is_dir() {
                for snap_entry in fs::read_dir(&snap_path).context("Failed to read snapshot dir")? {
                    let snap_entry = snap_entry?;
                    let symlink_path = snap_entry.path();
                    if symlink_path.is_symlink() {
                        if let Ok(target) = fs::read_link(&symlink_path) {
                            if let Some(blob_name) = target.file_name().and_then(|s| s.to_str()) {
                                referenced_blobs.insert(blob_name.to_string());
                            }
                        }
                    }
                }
            }
        }

        // Remove orphaned blobs
        let mut cleaned_count = 0;
        for blob_name in blob_files {
            if !referenced_blobs.contains(&blob_name) {
                let blob_path = blobs_dir.join(&blob_name);
                if fs::remove_file(&blob_path).is_ok() {
                    cleaned_count += 1;
                    eprintln!("Removed orphaned blob: {}", blob_name);
                }
            }
        }

        if cleaned_count > 0 {
            eprintln!("Cleaned up {} orphaned blob files", cleaned_count);
        }

        Ok(())
    }

    pub fn cleanup_stale_locks(&self) -> Result<()> {
        let root = self.model_cache_dir()?;
        if !root.exists() { return Ok(()); }

        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).context("Failed to read cache dir")? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    if name.ends_with(".lock") || name.ends_with(".incomplete") || name.ends_with(".part") {
                        if let Err(e) = fs::remove_file(&path) {
                            // Log but don't fail - some files might be in use
                            eprintln!("Failed to remove {}: {}", path.display(), e);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// List all cached models in the cache directory.
    /// Returns a vector of model names (e.g., "tiny", "base", "small", "moonshine-tiny").
    pub fn list_cached_models(&self) -> Result<Vec<String>> {
        let cache_dir = self.model_cache_dir()?;
        if !cache_dir.exists() { return Ok(vec![]); }

        let mut models = std::collections::HashSet::new();

        // Look in the Whisper repository directory
        let whisper_repo_dir = cache_dir.join("models--ggerganov--whisper.cpp").join("snapshots");
        if whisper_repo_dir.exists() {
            // Iterate through snapshot directories
            for snapshot_entry in fs::read_dir(&whisper_repo_dir).context("Failed to read snapshots dir")? {
                let snapshot_entry = snapshot_entry?;
                let snapshot_path = snapshot_entry.path();
                if !snapshot_path.is_dir() { continue; }

                // Look for ggml-{model}.bin files in this snapshot
                for file_entry in fs::read_dir(&snapshot_path).context("Failed to read snapshot dir")? {
                    let file_entry = file_entry?;
                    let path = file_entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                            if name.starts_with("ggml-") && name.ends_with(".bin") {
                                // Extract model name from "ggml-{model}.bin"
                                let model_part = name.strip_prefix("ggml-").unwrap_or("");
                                let model_name = model_part.strip_suffix(".bin").unwrap_or("");
                                if !model_name.is_empty() {
                                    models.insert(model_name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        // Look in the Moonshine cache directory
        let moonshine_dir = cache_dir.join("moonshine");
        if moonshine_dir.exists() {
            let required_files = ["encoder_model.onnx", "decoder_model_merged.onnx", "tokenizer.json"];
            for entry in fs::read_dir(&moonshine_dir).context("Failed to read moonshine dir")? {
                let entry = entry?;
                let path = entry.path();
                if !path.is_dir() { continue; }
                // Check that all required model files exist in this folder
                let all_present = required_files.iter().all(|f| path.join(f).exists());
                if all_present {
                    if let Some(folder_name) = path.file_name().and_then(|s| s.to_str()) {
                        // Map folder name back to model value: "tiny" -> "moonshine-tiny", "base-es" -> "moonshine-base-es"
                        models.insert(format!("moonshine-{}", folder_name));
                    }
                }
            }
        }

        // Look in the Parakeet cache directory (hf-hub structure)
        if self.find_cached_snapshot_with_files(
            "istupakov/parakeet-tdt-0.6b-v3-onnx",
            &["encoder-model.int8.onnx", "decoder_joint-model.int8.onnx"],
        ).unwrap_or(None).is_some() {
            models.insert("parakeet".to_string());
        }

        let mut result: Vec<String> = models.into_iter().collect();
        result.sort(); // Sort for consistent ordering
        Ok(result)
    }

    /// Delete a cached model by name.
    /// Returns true if successfully deleted, false if model doesn't exist or deletion failed.
    pub fn delete_cached_model(&self, model_name: &str) -> bool {
        if model_name.starts_with("moonshine-") {
            return self.delete_moonshine_model(model_name).is_ok();
        }
        if model_name == "parakeet" {
            return self.delete_parakeet_model().is_ok();
        }
        self.delete_whisper_model(model_name).is_ok()
    }

    /// Setup for a new download: cancel previous download and create new token
    fn setup_new_download(&self) -> Result<Arc<CancellationToken>> {
        let mut active = ACTIVE_DOWNLOAD.lock().unwrap();
        
        // Cancel and cleanup previous download if it exists
        if let Some(old_token) = active.take() {
            old_token.cancel();
            self.cleanup_stale_locks().ok();
        }
        
        // Create new token for this download
        let new_token = Arc::new(CancellationToken::new());
        *active = Some(new_token.clone());
        Ok(new_token)
    }

    /// Downloads a model file from HuggingFace Hub with caching and progress support.
    /// 
    /// This function ensures only one download runs at a time by:
    /// 1. Cancelling any previous download
    /// 2. Cleaning up partial files from cancelled downloads
    /// 3. Creating a new cancellation token for this download
    async fn ensure_hub_model(
        &self,
        repo_id: &str,
        filename: &str,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
        offset: f32,
        scale: f32,
        label: &str,
    ) -> Result<PathBuf> {
        // Setup: Cancel old download, create new token, cleanup partial files
        let cancel_token = self.setup_new_download()?;
        
        // Increment generation counter to invalidate any stale callbacks
        DOWNLOAD_GENERATION.fetch_add(1, Ordering::Relaxed);
        
        // Early cancellation
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                self.cleanup_stale_locks().ok();
                cancel_token.cancel();
                bail!("Download cancelled");
            }
        }

        // Clean up any stale locks and partial files before starting
        self.cleanup_stale_locks().ok();

        let cache_dir = self.model_cache_dir()?;

        // Fast path: if a valid cached file exists under snapshots, return it immediately to avoid
        // hitting the network. We do this conservatively and validate before returning.
        if let Some(cached) = self.find_cached_file(repo_id, filename)? {
            if validate_model_file(&cached).is_ok() {
                // Do NOT emit progress here; caller requested to only start progress
                // reporting if a download actually occurs.
                return Ok(cached);
            }
        }

        // Check cancellation again before starting download
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                self.cleanup_stale_locks().ok();
                bail!("Download cancelled before starting");
            }
        }

        let api = ApiBuilder::new()
            .with_cache_dir(cache_dir)
            .build()
            .with_context(|| format!("Failed to build hf-hub API for repo '{}'", repo_id))?;

        let repo = api.model(repo_id.to_string());

        // Always use progress adapter; it will no-op if no callback provided
        let prog = DownloadProgress::new(
            progress,
            is_cancelled,
            offset,
            scale,
            Some(Box::new({
                let this = self;
                move || { this.cleanup_stale_locks().ok(); }
            })),
            label,
            cancel_token.clone(),
        );

        let download_result = repo.download_with_progress(filename, prog);
        
        // Check if this download was cancelled while it was running
        if cancel_token.is_cancelled() {
            bail!("Download cancelled");
        }
        
        // Only propagate error if download wasn't cancelled
        let path = download_result
            .with_context(|| format!("Failed to download '{}' from '{}'", filename, repo_id))?;

        // Validate the downloaded/cached file; if invalid, remove and retry once
        if let Err(e) = validate_model_file(&path) {
            eprintln!(
                "Model file validation failed after initial retrieval ({}). Attempting one re-download...",
                e
            );
            let _ = remove_snapshot_file_and_blob(&path);
            self.cleanup_stale_locks().ok();

            let prog2 = DownloadProgress::new(progress, is_cancelled, offset, scale, None, label, cancel_token.clone());
            let path2 = repo
                .download_with_progress(filename, prog2)
                .with_context(|| format!("Failed to re-download '{}' from '{}'", filename, repo_id))?;
            validate_model_file(&path2)
                .with_context(|| format!("Model validation failed for '{}' from '{}'", filename, repo_id))?;

            if let Some(cb) = progress { cb((offset + scale) as i32, ProgressType::Download, label); }
            return Ok(path2);
        }

        if let Some(cb) = progress { cb((offset + scale) as i32, ProgressType::Download, label); }
        Ok(path)
    }

    // Attempt to locate a cached file in the hf-hub cache layout without performing any network requests.
    // Cache layout: <cache_root>/models--{owner}--{repo}/snapshots/<rev>/{filename}
    // If a symlink is missing but the blob exists, recreate the symlink.
    fn find_cached_file(&self, repo_id: &str, filename: &str) -> Result<Option<PathBuf>> {
        let cache_root = self.model_cache_dir()?;
        let mut parts = repo_id.splitn(2, '/');
        let owner = parts.next().unwrap_or("");
        let repo = parts.next().unwrap_or("");
        if owner.is_empty() || repo.is_empty() {
            return Ok(None);
        }
        let base = cache_root.join(format!("models--{}--{}", owner, repo)).join("snapshots");
        if !base.exists() { return Ok(None); }

        // IMPORTANT: snapshots are revision-hash directories and fs::read_dir order is arbitrary.
        // If we return the first match, we can accidentally use an older model even after a newer
        // revision has been downloaded (same filename). Instead, pick the most recently modified
        // candidate.
        let mut best: Option<(SystemTime, PathBuf)> = None;
        for entry in fs::read_dir(&base).context("Failed to read snapshots dir")? {
            let entry = entry?;
            let snap = entry.path();
            if !snap.is_dir() {
                continue;
            }

            let candidate = snap.join(filename);
            if !candidate.exists() {
                continue;
            }

            let modified = fs::metadata(&candidate)
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);

            match &best {
                None => best = Some((modified, candidate)),
                Some((best_modified, _)) => {
                    if modified > *best_modified {
                        best = Some((modified, candidate));
                    }
                }
            }
        }

        if let Some((_, path)) = best {
            return Ok(Some(path));
        }

        Ok(None)
    }

    fn find_cached_snapshot_with_files(&self, repo_id: &str, filenames: &[&str]) -> Result<Option<PathBuf>> {
        let cache_root = self.model_cache_dir()?;
        let mut parts = repo_id.splitn(2, '/');
        let owner = parts.next().unwrap_or("");
        let repo = parts.next().unwrap_or("");
        if owner.is_empty() || repo.is_empty() {
            return Ok(None);
        }

        let base = cache_root.join(format!("models--{}--{}", owner, repo)).join("snapshots");
        if !base.exists() {
            return Ok(None);
        }

        let mut best: Option<(SystemTime, PathBuf)> = None;
        for entry in fs::read_dir(&base).context("Failed to read snapshots dir")? {
            let entry = entry?;
            let snap = entry.path();
            if !snap.is_dir() {
                continue;
            }

            if !filenames.iter().all(|f| snap.join(f).exists()) {
                continue;
            }

            let modified = fs::metadata(&snap)
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            match &best {
                None => best = Some((modified, snap)),
                Some((best_modified, _)) => {
                    if modified > *best_modified {
                        best = Some((modified, snap));
                    }
                }
            }
        }

        Ok(best.map(|(_, p)| p))
    }
}

// ---- Helpers to validate and clean cached model files ----
fn resolve_symlink_target(path: &Path) -> Result<PathBuf> {
    let metadata = fs::symlink_metadata(path).context("symlink_metadata failed")?;
    if metadata.file_type().is_symlink() {
        let target = fs::read_link(path).context("read_link failed")?;
        let base = path.parent().ok_or_else(|| eyre!("Failed to get parent directory"))?;
        Ok(if target.is_absolute() { target } else { base.join(target) })
    } else {
        Ok(path.to_path_buf())
    }
}

fn validate_model_file(path: &Path) -> Result<()> {
    let blob_path = resolve_symlink_target(path)?;
    if !blob_path.exists() {
        bail!("Model blob target does not exist: {}", blob_path.display());
    }
    let md = fs::metadata(&blob_path).context("metadata failed")?;
    // IMPORTANT: use the *snapshot file* extension (the symlink name) to decide the threshold.
    // The resolved blob path in HF caches is typically a hash with no extension.
    let min_bytes: u64 = match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "json" => 1,
        "txt" => 1,
        _ => 100_000, // 100 KB
    };
    if md.len() < min_bytes {
        bail!("Model blob seems too small ({} bytes): {}", md.len(), blob_path.display());
    }
    let mut f = fs::File::open(&blob_path).context("open failed")?;
    let mut buf = [0u8; 16];
    let _ = f.read(&mut buf).context("read failed")?;

    if blob_path.extension().and_then(|e| e.to_str()) == Some("zip") {
        let file = fs::File::open(&blob_path).context("open failed")?;
        let _ = zip::ZipArchive::new(file).context("invalid zip archive")?;
    }
    Ok(())
}

fn remove_snapshot_file_and_blob(path: &Path) -> Result<()> {
    if !path.exists() { return Ok(()); }
    let metadata = fs::symlink_metadata(path).context("symlink_metadata failed")?;
    if metadata.file_type().is_symlink() {
        let target_path = fs::read_link(path).context("read_link failed")?;
        let base = path.parent().ok_or_else(|| eyre!("Failed to get parent directory"))?;
        let blob_path = if target_path.is_absolute() { target_path } else { base.join(target_path) };
        if blob_path.exists() { let _ = fs::remove_file(&blob_path); }
        let _ = fs::remove_file(path);
    } else if metadata.is_dir() {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

fn url_filename(url: &str) -> Option<String> {
    url.rsplit('/').next().map(|s| s.to_string())
}

fn parse_hf_blob_url(url: &str) -> Option<(String, String)> {
    let trimmed = url.strip_prefix("https://huggingface.co/")?;
    let mut parts = trimmed.split('/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    let blob = parts.next()?;
    if blob != "blob" {
        return None;
    }
    let _rev = parts.next()?;
    let filename = parts.next()?;
    if owner.is_empty() || repo.is_empty() || filename.is_empty() {
        return None;
    }
    Some((format!("{}/{}", owner, repo), filename.to_string()))
}

async fn download_to(dest_path: &Path, url: &str) -> Result<()> {
    if let Some(parent) = dest_path.parent() { fs::create_dir_all(parent).ok(); }
    let resp = reqwest::get(url).await.context("Failed to GET url")?;
    if !resp.status().is_success() {
        bail!("Failed to download '{}': status {}", url, resp.status());
    }
    let bytes = resp.bytes().await.context("Failed to read body bytes")?;
    let mut f = fs::File::create(dest_path).context("Failed to create destination file")?;
    std::io::copy(&mut bytes.as_ref(), &mut f).context("Failed to write file")?;
    Ok(())
}