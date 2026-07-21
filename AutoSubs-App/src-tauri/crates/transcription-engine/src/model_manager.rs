use crate::manifest::{self, Engine as MEngine, FileSpec, ModelEntry, Source};
use crate::types::{LabeledProgressFn, ProgressType};
use eyre::{bail, eyre, Context, Result};
use hf_hub::api::tokio::{ApiBuilder, Progress as HubProgress};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime};
use tokio_util::sync::CancellationToken;
use once_cell::sync::Lazy;

const WHISPER_REPO_ID: &str = "ggerganov/whisper.cpp";
// Diarization repo/files/id now come from the manifest (`manifest::diarize()`).

// Number of automatic retries (with exponential backoff + HTTP Range resume, handled
// internally by hf-hub) for transient network errors while downloading a model.
const HUB_DOWNLOAD_MAX_RETRIES: usize = 3;

// How long `download_with_stall_watchdog` waits without any download progress
// before giving up and reporting a stall (see its doc comment for rationale).
const STALL_TIMEOUT_SECS: u64 = 90;

// Global download state to ensure only one download runs at a time
static ACTIVE_DOWNLOAD: Lazy<Mutex<Option<Arc<CancellationToken>>>> = Lazy::new(|| Mutex::new(None));

// Lightweight async progress adapter for hf-hub. It only records byte counters into
// shared atomics; the actual percentage callback + cancellation handling happens on
// the polling side, which is free to hold borrowed closures.
#[derive(Clone)]
struct ChannelProgress {
    current: Arc<AtomicUsize>,
    total: Arc<AtomicUsize>,
    // Set once hf-hub's `init` callback fires, i.e. once the HTTP response headers have
    // actually been received. Lets the polling side tell "still establishing the
    // connection" apart from "connected but no data flowing", so the stall-timeout clock
    // can be reset to give a full, fresh budget for genuine data stalls instead of also
    // being consumed by slow connection setup.
    connected: Arc<AtomicBool>,
}

impl HubProgress for ChannelProgress {
    async fn init(&mut self, size: usize, _filename: &str) {
        self.total.store(size, Ordering::Relaxed);
        self.current.store(0, Ordering::Relaxed);
        self.connected.store(true, Ordering::Relaxed);
    }

    async fn update(&mut self, size: usize) {
        self.current.fetch_add(size, Ordering::Relaxed);
    }

    async fn finish(&mut self) {
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

        let filename = format!("ggml-{model}.bin");

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
                "progressSteps.download",
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
                "progressSteps.download",
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
                        "progressSteps.download",
                    )
                    .await
                {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!(
                            "Warning: CoreML encoder download failed ({}). Proceeding without CoreML encoder.",
                            e
                        );
                        if let Some(cb) = progress { cb(100, ProgressType::Download, "progressSteps.download"); }
                        return Ok(model_path);
                    }
                };

                // Progress at 90% (download done, start extracting)
                if let Some(cb) = progress { cb(90, ProgressType::Download, "progressSteps.download"); }

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
                            cb(pct as i32, ProgressType::Download, "progressSteps.download");
                        }
                    }

                    // After extraction, delete the zip and its blob target (if symlinked)
                    let _ = remove_snapshot_file_and_blob(&coreml_zip_path);
                }

                // Final completion
                if let Some(cb) = progress { cb(100, ProgressType::Download, "progressSteps.download"); }
            }
        }

        Ok(model_path)
    }


    /// Generic entry point: ensure the model described by a manifest entry is
    /// present in the cache, downloading if needed, and return the directory (or
    /// model dir) to hand to the engine loader.
    ///
    /// Dispatches on the manifest `source` to one of three strategies:
    /// whisper-ggml (single `.bin` + optional CoreML); an hf-hub snapshot of
    /// repo-relative files kept in place (Parakeet, Cohere, and other engines
    /// whose loader reads one repo's flat layout); or a flattened per-model
    /// directory that downloads each file to a chosen name and (optionally) from
    /// a different repo (Moonshine, Canary's cross-repo `nemo128.onnx`).
    pub async fn ensure_model(
        &self,
        entry: &ModelEntry,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        match &entry.source {
            Source::WhisperGgml { model } => {
                self.ensure_whisper_model(model, progress, is_cancelled).await
            }
            Source::Hf { repo, files } => {
                if let Some((subdir, key)) = Self::flat_layout(entry) {
                    self.ensure_hf_flat(subdir, &key, repo, files, progress, is_cancelled).await
                } else {
                    let paths: Vec<&str> = files.iter().map(|f| f.path()).collect();
                    self.ensure_hf_snapshot(repo, &paths, progress, is_cancelled).await
                }
            }
        }
    }

    /// Decide whether a model uses the flattened per-model directory layout, and
    /// if so where it lives: `Some((subdir, key))` → `<cache>/<subdir>/<key>`.
    ///
    /// A model needs flattening when any file is renamed/nested or comes from a
    /// different repo. Moonshine keeps its historical `moonshine/<variant>` path;
    /// everything else is keyed by `<engine>/<id>`.
    fn flat_layout(entry: &ModelEntry) -> Option<(&'static str, String)> {
        let Source::Hf { files, .. } = &entry.source else {
            return None;
        };
        let needs_flatten = files.iter().any(|f| f.is_renamed() || f.repo().is_some());
        if !needs_flatten {
            return None;
        }
        match entry.engine {
            MEngine::Moonshine => {
                let variant = entry.moonshine_variant.clone().unwrap_or_else(|| entry.id.clone());
                Some(("moonshine", variant))
            }
            MEngine::Canary => Some(("canary", entry.id.clone())),
            MEngine::Gigaam => Some(("gigaam", entry.id.clone())),
            MEngine::Cohere => Some(("cohere", entry.id.clone())),
            MEngine::SenseVoice => Some(("sense_voice", entry.id.clone())),
            MEngine::Parakeet => Some(("parakeet", entry.id.clone())),
            MEngine::OmniAsr => Some(("omni_asr", entry.id.clone())),
            MEngine::Whisper => Some(("whisper", entry.id.clone())),
        }
    }

    /// Download a set of repo-relative files from a HF repo into the hf-hub
    /// snapshot cache and return the snapshot directory containing all of them.
    /// Files keep their repo names. Used by Parakeet and the other NeMo/ONNX
    /// engines whose loaders read a flat directory of known filenames.
    async fn ensure_hf_snapshot(
        &self,
        repo_id: &str,
        required_files: &[&str],
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

        // Fast path: find a snapshot dir that already contains all required files.
        if let Some(snapshot_dir) = self.find_cached_snapshot_with_files(repo_id, required_files)? {
            if required_files
                .iter()
                .all(|f| validate_model_file(&snapshot_dir.join(f)).is_ok())
            {
                return Ok(snapshot_dir);
            }
        }

        // Download required files sequentially so we can show progress.
        // ensure_hub_model handles caching and no-ops if everything is cached.
        let total = required_files.len() as f32;
        for (idx, filename) in required_files.iter().enumerate() {
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
                    "progressSteps.download",
                )
                .await?;
        }

        // After downloading, locate a snapshot that contains everything.
        if let Some(snapshot_dir) = self.find_cached_snapshot_with_files(repo_id, required_files)? {
            for f in required_files {
                let p = snapshot_dir.join(f);
                validate_model_file(&p)
                    .with_context(|| format!("Model validation failed for '{f}' from '{repo_id}'"))?;
            }
            if let Some(cb) = progress {
                cb(100, ProgressType::Download, "progressSteps.download");
            }
            return Ok(snapshot_dir);
        }

        bail!("Failed to locate model snapshot for '{}' after download", repo_id);
    }

    /// Download a set of files into a flat per-model directory
    /// (`<cache>/<subdir>/<key>`), honoring per-file rename/flatten and per-file
    /// repo overrides. Files default to `default_repo` unless a `FileSpec`
    /// specifies its own. Used by Moonshine (nested layout + shared tokenizer)
    /// and Canary (cross-repo `nemo128.onnx` preprocessor).
    async fn ensure_hf_flat(
        &self,
        subdir: &str,
        key: &str,
        default_repo: &str,
        files: &[FileSpec],
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                bail!("Model download cancelled");
            }
        }

        let cache_root = self.model_cache_dir()?;
        let model_dir = cache_root.join(subdir).join(key);
        if !model_dir.exists() {
            fs::create_dir_all(&model_dir).context("Failed to create model directory")?;
        }

        // Fast path: all destination files present and valid.
        if files.iter().all(|f| {
            let p = model_dir.join(f.dest());
            p.exists() && validate_model_file(&p).is_ok()
        }) {
            return Ok(model_dir);
        }

        let hf_endpoint =
            std::env::var("HF_ENDPOINT").unwrap_or_else(|_| "https://huggingface.co".to_string());
        let hf_endpoint = hf_endpoint.trim_end_matches('/');

        let total = files.len() as f32;
        for (idx, file) in files.iter().enumerate() {
            if let Some(is_cancelled) = is_cancelled {
                if is_cancelled() {
                    bail!("Model download cancelled");
                }
            }

            let dest = model_dir.join(file.dest());
            if dest.exists() && validate_model_file(&dest).is_ok() {
                continue;
            }

            let offset = (idx as f32 / total) * 100.0;
            let scale = (1.0 / total) * 100.0;
            if let Some(cb) = progress {
                cb(offset as i32, ProgressType::Download, "progressSteps.download");
            }

            let repo = file.repo().unwrap_or(default_repo);
            let url = format!("{}/{}/resolve/main/{}", hf_endpoint, repo, file.path());
            download_to(&dest, &url).await?;
            validate_model_file(&dest).with_context(|| {
                format!("Model validation failed for '{}' from '{repo}'", file.dest())
            })?;

            if let Some(cb) = progress {
                cb((offset + scale) as i32, ProgressType::Download, "progressSteps.download");
            }
        }

        if let Some(cb) = progress {
            cb(100, ProgressType::Download, "progressSteps.download");
        }

        Ok(model_dir)
    }

    /// Ensure the Parakeet model is available. Thin shim over the manifest +
    /// generic [`ensure_model`](Self::ensure_model); kept for current callers.
    pub async fn ensure_parakeet_v3_model(
        &self,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        let entry = manifest::get("parakeet")
            .ok_or_else(|| eyre!("'parakeet' is missing from the model manifest"))?;
        self.ensure_model(entry, progress, is_cancelled).await
    }

    /// Ensure a Moonshine model is available. Thin shim over the manifest +
    /// generic [`ensure_model`](Self::ensure_model); kept for current callers.
    pub async fn ensure_moonshine_model(
        &self,
        model: &str,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        let entry =
            manifest::get(model).ok_or_else(|| eyre!("Unknown Moonshine model: {}", model))?;
        self.ensure_model(entry, progress, is_cancelled).await
    }

    /// Ensure the Silero VAD model exists locally. If not, download via hf-hub.
    /// Download the Silero VAD model (`ggml-silero-v5.1.2.bin` from `ggml-org/whisper-vad`).
    ///
    /// This uses a direct, timeout-bounded reqwest download instead of the blocking
    /// hf-hub/ureq path. The blocking path has no read timeout, so a stalled connection
    /// (proxy/firewall/AV interfering with the HF CDN) hangs the whole transcription
    /// indefinitely with no error — see issue #530. An async download can be wrapped in
    /// `tokio::time::timeout` and aborted cleanly, turning a silent hang into a
    /// recoverable error.
    pub async fn ensure_vad_model(
        &self,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        const VAD_TIMEOUT_SECS: u64 = 120;

        let hf_endpoint = std::env::var("HF_ENDPOINT")
            .unwrap_or_else(|_| "https://huggingface.co".to_string());
        let hf_endpoint = hf_endpoint.trim_end_matches('/');
        let vad = manifest::vad();
        let vad_url = format!(
            "{}/{}/resolve/main/{}",
            hf_endpoint, vad.repo, vad.file
        );

        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() { bail!("Cancelled"); }
        }

        let dest = self
            .model_cache_dir()?
            .join("vad")
            .join(&vad.file);

        // Fast path: already downloaded and valid — don't touch the network.
        if dest.exists() && validate_model_file(&dest).is_ok() {
            return Ok(dest);
        }

        // Remove any partial/corrupt file left by a previous interrupted attempt.
        if dest.exists() {
            let _ = fs::remove_file(&dest);
        }

        if let Some(cb) = progress {
            cb(0, ProgressType::Download, "progressSteps.download");
        }

        match tokio::time::timeout(
            std::time::Duration::from_secs(VAD_TIMEOUT_SECS),
            download_to(&dest, &vad_url),
        )
        .await
        {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                let _ = fs::remove_file(&dest);
                bail!("Failed to download Silero VAD model: {}", e);
            }
            Err(_) => {
                let _ = fs::remove_file(&dest);
                bail!(
                    "Timed out downloading Silero VAD model after {}s (network stalled). \
                     Check your connection / proxy / firewall and try again.",
                    VAD_TIMEOUT_SECS
                );
            }
        }

        validate_model_file(&dest)
            .with_context(|| format!("Silero VAD model validation failed: {}", dest.display()))?;

        if let Some(cb) = progress {
            cb(100, ProgressType::Download, "progressSteps.download");
        }
        Ok(dest)
    }

    /// Ensure the speaker-diarization bundle (segmentation + embedding models)
    /// is cached, returning `(segmentation_path, embedding_path)`. Repo and
    /// filenames come from the manifest (`manifest::diarize()`).
    pub async fn ensure_diarize_models(
        &self,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<(PathBuf, PathBuf)> {
        if let Some(is_cancelled) = is_cancelled { if is_cancelled() { bail!("Cancelled"); } }

        let d = manifest::diarize();
        let seg_file = d
            .files
            .first()
            .ok_or_else(|| eyre!("diarize manifest is missing the segmentation file"))?;
        let emb_file = d
            .files
            .get(1)
            .ok_or_else(|| eyre!("diarize manifest is missing the embedding file"))?;

        let files: Vec<&str> = d.files.iter().map(|s| s.as_str()).collect();
        // Validate (not just check existence) so a stale/corrupt/partial diarize
        // file left by an interrupted download isn't treated as "already cached",
        // which would suppress the final 100% progress callback after a re-download.
        let had_cached_diarize_bundle = match self.find_cached_snapshot_with_files(&d.repo, &files) {
            Ok(Some(snapshot_dir)) => files.iter().all(|f| validate_model_file(&snapshot_dir.join(f)).is_ok()),
            _ => false,
        };

        // Segmentation model: 0..50% of the diarize download progress.
        let seg_path = self
            .ensure_hub_model(&d.repo, seg_file, progress, is_cancelled, 0.0, 50.0, "progressSteps.download")
            .await?;

        if let Some(is_cancelled) = is_cancelled { if is_cancelled() { bail!("Cancelled"); } }

        // Embedding model: 50..100%.
        let emb_path = self
            .ensure_hub_model(&d.repo, emb_file, progress, is_cancelled, 50.0, 50.0, "progressSteps.download")
            .await?;

        if !had_cached_diarize_bundle {
            if let Some(cb) = progress { cb(100, ProgressType::Download, "progressSteps.download"); }
        }
        Ok((seg_path, emb_path))
    }

    pub async fn ensure_aligner_model(
        &self,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
    ) -> Result<PathBuf> {
        let aligner = manifest::aligner();
        let files: Vec<&str> = aligner.files.iter().map(FileSpec::path).collect();
        self.ensure_hf_snapshot(&aligner.repo, &files, progress, is_cancelled)
            .await
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
                            tracing::info!("Removed model symlink: {}", path.display());
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

    /// Delete a flat per-model directory (`<cache>/<subdir>/<key>`).
    fn delete_flat_dir(&self, subdir: &str, key: &str) -> Result<()> {
        let cache_dir = self.model_cache_dir()?;
        let model_dir = cache_dir.join(subdir).join(key);
        if !model_dir.exists() {
            bail!("Model '{}/{}' not found in cache", subdir, key);
        }

        fs::remove_dir_all(&model_dir)
            .with_context(|| format!("Failed to delete model directory: {}", model_dir.display()))?;
        tracing::info!("Deleted model: {}", model_dir.display());
        Ok(())
    }

    /// Delete the entire hf-hub cache directory (`models--{owner}--{repo}`) for a
    /// Hugging Face repo. Used for Parakeet and the other snapshot-cached engines.
    fn delete_hf_repo(&self, repo_id: &str) -> Result<()> {
        let cache_dir = self.model_cache_dir()?;
        let mut parts = repo_id.splitn(2, '/');
        let owner = parts.next().unwrap_or("");
        let repo = parts.next().unwrap_or("");
        let repo_dir = cache_dir.join(format!("models--{owner}--{repo}"));
        if !repo_dir.exists() {
            bail!("Model '{}' not found in cache", repo_id);
        }

        fs::remove_dir_all(&repo_dir)
            .with_context(|| format!("Failed to delete model directory: {}", repo_dir.display()))?;
        tracing::info!("Deleted model repo: {}", repo_dir.display());
        Ok(())
    }

    pub fn delete_diarize_model(&self) -> Result<()> {
        self.delete_hf_repo(&manifest::diarize().repo)
    }

    pub fn cleanup_stale_locks(&self) -> Result<()> {
        let root = self.model_cache_dir()?;
        if !root.exists() { return Ok(()); }

        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            // Use symlink_metadata to avoid following dangling symlinks when classifying entries.
            let read = match fs::read_dir(&dir) {
                Ok(r) => r,
                Err(e) => {
                    tracing::warn!("Failed to read {}: {}", dir.display(), e);
                    continue;
                }
            };
            for entry in read {
                let entry = match entry { Ok(e) => e, Err(_) => continue };
                let path = entry.path();
                let md = match fs::symlink_metadata(&path) { Ok(m) => m, Err(_) => continue };
                let ft = md.file_type();

                if ft.is_symlink() {
                    // Remove dangling snapshot symlinks whose blob target no longer exists.
                    // These commonly remain after a partial/cancelled download and cause
                    // hf-hub to fail fast on Windows when it tries to reuse them.
                    let target_exists = fs::metadata(&path).is_ok();
                    if !target_exists {
                        if let Err(e) = fs::remove_file(&path) {
                            tracing::warn!("Failed to remove dangling symlink {}: {}", path.display(), e);
                        }
                    }
                    continue;
                }

                if ft.is_dir() {
                    stack.push(path);
                    continue;
                }

                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    if name.ends_with(".lock") || name.ends_with(".incomplete") || name.ends_with(".part") {
                        if let Err(e) = fs::remove_file(&path) {
                            // Log but don't fail - some files might be in use
                            tracing::warn!("Failed to remove {}: {}", path.display(), e);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// List all cached models, driven by the manifest.
    /// Returns the ids of models whose files are present in the cache
    /// (e.g. "tiny", "parakeet", "moonshine-tiny"), plus the diarization model.
    pub fn list_cached_models(&self) -> Result<Vec<String>> {
        let cache_dir = self.model_cache_dir()?;
        if !cache_dir.exists() { return Ok(vec![]); }

        let mut models = std::collections::HashSet::new();

        for entry in &manifest::MANIFEST.models {
            let present = match &entry.source {
                Source::WhisperGgml { model } => {
                    let filename = format!("ggml-{model}.bin");
                    // Validate (not just existence) so a stale/corrupt/partial file left by
                    // a previous interrupted download isn't reported as cached — otherwise
                    // the UI hides the "Download" step and a fresh download silently starts
                    // once transcription begins, with no visible progress.
                    match self.find_cached_snapshot_with_files(WHISPER_REPO_ID, &[filename.as_str()]) {
                        Ok(Some(snapshot_dir)) => validate_model_file(&snapshot_dir.join(&filename)).is_ok(),
                        _ => false,
                    }
                }
                Source::Hf { repo, files } => {
                    if let Some((subdir, key)) = Self::flat_layout(entry) {
                        let dir = cache_dir.join(subdir).join(key);
                        // Validate (not just existence) so partial/too-small files
                        // left by an interrupted download aren't reported as cached.
                        // Mirrors the fast-path check used in `ensure_hf_flat`.
                        files.iter().all(|f| validate_model_file(&dir.join(f.dest())).is_ok())
                    } else {
                        // Validate every file (not just check existence) for the same reason
                        // as above.
                        let paths: Vec<&str> = files.iter().map(|f| f.path()).collect();
                        match self.find_cached_snapshot_with_files(repo, &paths) {
                            Ok(Some(snapshot_dir)) => {
                                paths.iter().all(|p| validate_model_file(&snapshot_dir.join(p)).is_ok())
                            }
                            _ => false,
                        }
                    }
                }
            };
            if present {
                models.insert(entry.id.clone());
            }
        }

        let diarize = manifest::diarize();
        let diarize_files: Vec<&str> = diarize.files.iter().map(|s| s.as_str()).collect();
        // Validate (not just check existence), for the same reason as the model loop above:
        // a stale/corrupt/partial diarization file left by an interrupted download must not
        // be reported as cached.
        if let Ok(Some(snapshot_dir)) = self.find_cached_snapshot_with_files(&diarize.repo, &diarize_files) {
            if diarize_files.iter().all(|f| validate_model_file(&snapshot_dir.join(f)).is_ok()) {
                models.insert(diarize.id.clone());
            }
        }

        let aligner = manifest::aligner();
        let aligner_files: Vec<&str> = aligner.files.iter().map(FileSpec::path).collect();
        // Same validation as diarize: partial/corrupt aligner files must not be reported
        // as cached, otherwise the UI keeps prompting to download a model that exists.
        if let Ok(Some(snapshot_dir)) = self.find_cached_snapshot_with_files(&aligner.repo, &aligner_files) {
            if aligner_files.iter().all(|f| validate_model_file(&snapshot_dir.join(f)).is_ok()) {
                models.insert(aligner.id.clone());
            }
        }

        let mut result: Vec<String> = models.into_iter().collect();
        result.sort(); // Sort for consistent ordering
        Ok(result)
    }

    /// Delete a cached model by id. Routing is driven by the manifest.
    /// Returns true if successfully deleted, false if it doesn't exist or fails.
    pub fn delete_cached_model(&self, model_name: &str) -> bool {
        if model_name == manifest::diarize().id {
            return self.delete_diarize_model().is_ok();
        }
        if model_name == manifest::aligner().id {
            return self.delete_hf_repo(&manifest::aligner().repo).is_ok();
        }
        match manifest::get(model_name) {
            Some(entry) => match &entry.source {
                Source::WhisperGgml { model } => self.delete_whisper_model(model).is_ok(),
                Source::Hf { repo, .. } => {
                    if let Some((subdir, key)) = Self::flat_layout(entry) {
                        self.delete_flat_dir(subdir, &key).is_ok()
                    } else {
                        self.delete_hf_repo(repo).is_ok()
                    }
                }
            },
            // Unknown id: best-effort whisper symlink removal (legacy behavior).
            None => self.delete_whisper_model(model_name).is_ok(),
        }
    }

    /// Setup for a new download: cancel previous download and create new token.
    fn setup_new_download(&self) -> Result<Arc<CancellationToken>> {
        // Take the previous token and release the lock immediately — we must not hold a
        // std::sync::MutexGuard across any blocking work.
        let old_token = ACTIVE_DOWNLOAD.lock().unwrap().take();

        // Cancel and cleanup previous download if it exists
        if let Some(old_token) = old_token {
            old_token.cancel();
            self.cleanup_stale_locks().ok();
        }

        // Create new token for this download
        let new_token = Arc::new(CancellationToken::new());
        *ACTIVE_DOWNLOAD.lock().unwrap() = Some(new_token.clone());
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
        // If a cached file exists but fails validation (corrupted/partial from a previous run or
        // a prior install), purge it before handing control to hf-hub so we don't trip on stale
        // snapshot symlinks / blobs (a common cause of immediate download failures on Windows).
        if let Some(cached) = self.find_cached_file(repo_id, filename)? {
            match validate_model_file(&cached) {
                Ok(()) => {
                    // Do NOT emit progress here; caller requested to only start progress
                    // reporting if a download actually occurs.
                    return Ok(cached);
                }
                Err(e) => {
                    tracing::warn!(
                        "Cached '{}' from '{}' is invalid ({}); removing before re-download",
                        filename, repo_id, e
                    );
                    let _ = remove_snapshot_file_and_blob(&cached);
                    self.cleanup_stale_locks().ok();
                }
            }
        }

        // Check cancellation again before starting download
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                self.cleanup_stale_locks().ok();
                bail!("Download cancelled before starting");
            }
        }

        // from_env() reads HF_ENDPOINT (custom HuggingFace mirror) and HF_HOME from the
        // environment. with_cache_dir() overrides HF_HOME so our own cache location is used.
        // We keep retrying the async download helper itself to preserve the previous
        // transient-failure behavior without the sync API's background-thread workaround.
        let api = ApiBuilder::from_env()
            .with_cache_dir(cache_dir)
            .build()
            .with_context(|| format!("Failed to build hf-hub API for repo '{repo_id}'"))?;

        let mut last_error = None;
        let mut success = None;
        for attempt in 0..=HUB_DOWNLOAD_MAX_RETRIES {
            match self
                .download_with_stall_watchdog(
                    &api, repo_id, filename, progress, is_cancelled, offset, scale, label, &cancel_token,
                )
                .await
            {
                Ok(path) => {
                    success = Some(path);
                    break;
                }
                Err(e) => {
                    last_error = Some(e);
                    // A cancelled download won't succeed on retry — stop immediately
                    // instead of burning the remaining attempts (each of which would
                    // just re-run cleanup and bail again at the cancellation guard).
                    if cancel_token.is_cancelled() {
                        break;
                    }
                    if attempt < HUB_DOWNLOAD_MAX_RETRIES {
                        self.cleanup_stale_locks().ok();
                    }
                }
            }
        }
        let path = match success {
            Some(path) => path,
            None => {
                // `download_with_stall_watchdog` already attaches the
                // "Failed to download '{filename}' from '{repo_id}'" context, so
                // propagate its error as-is rather than double-wrapping the prefix.
                let err = last_error
                    .take()
                    .expect("download loop should always capture an error before failing");
                return Err(err);
            }
        };

        // Validate the downloaded/cached file; if invalid, remove and retry once
        if let Err(e) = validate_model_file(&path) {
            tracing::warn!(
                "Model file validation failed after initial retrieval ({}). Attempting one re-download...",
                e
            );
            let _ = remove_snapshot_file_and_blob(&path);
            self.cleanup_stale_locks().ok();

            let path2 = self
                .download_with_stall_watchdog(
                    &api, repo_id, filename, progress, is_cancelled, offset, scale, label, &cancel_token,
                )
                .await
                .with_context(|| format!("Failed to re-download '{filename}' from '{repo_id}'"))?;
            validate_model_file(&path2)
                .with_context(|| format!("Model validation failed for '{filename}' from '{repo_id}'"))?;

            if let Some(cb) = progress { cb((offset + scale) as i32, ProgressType::Download, label); }
            return Ok(path2);
        }

        if let Some(cb) = progress { cb((offset + scale) as i32, ProgressType::Download, label); }
        Ok(path)
    }

    /// Runs an async hf-hub download while polling for progress/cancellation/stalls
    /// from the caller. Polling with a stall timeout turns a silent hang into a clear,
    /// recoverable error.
    async fn download_with_stall_watchdog(
        &self,
        api: &hf_hub::api::tokio::Api,
        repo_id: &str,
        filename: &str,
        progress: Option<&LabeledProgressFn>,
        is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
        offset: f32,
        scale: f32,
        label: &str,
        cancel_token: &Arc<CancellationToken>,
    ) -> Result<PathBuf> {
        const POLL_INTERVAL_MS: u64 = 500;

        let current = Arc::new(AtomicUsize::new(0));
        let total = Arc::new(AtomicUsize::new(0));
        let connected = Arc::new(AtomicBool::new(false));
        let cp = ChannelProgress { current: current.clone(), total: total.clone(), connected: connected.clone() };
        let repo = api.model(repo_id.to_string());
        let download = repo.download_with_progress(filename, cp);
        tokio::pin!(download);

        let mut last_seen = 0usize;
        let mut last_progress_at = Instant::now();
        let mut was_connected = false;
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(POLL_INTERVAL_MS));

        loop {
            if let Some(is_cancelled) = is_cancelled {
                if is_cancelled() {
                    cancel_token.cancel();
                    bail!("Download cancelled");
                }
            }
            if cancel_token.is_cancelled() {
                bail!("Download cancelled");
            }

            tokio::select! {
                res = &mut download => {
                    let path = res.with_context(|| format!("Failed to download '{filename}' from '{repo_id}'"))?;
                    return Ok(path);
                }
                _ = interval.tick() => {
                    // The connection may take a while to establish (slow DNS/TLS/proxy),
                    // which is not itself a "stall" in the data-transfer sense. Reset the
                    // clock the moment we observe the connection has actually come up
                    // (hf-hub's `init` callback firing) so a slow connection start doesn't
                    // eat into the budget meant for genuine mid-transfer stalls. Connection
                    // establishment itself is still bounded by the same timeout, counted
                    // from the time the download future was created.
                    if !was_connected && connected.load(Ordering::Relaxed) {
                        was_connected = true;
                        last_progress_at = Instant::now();
                    }

                    let cur = current.load(Ordering::Relaxed);
                    let tot = total.load(Ordering::Relaxed);
                    if cur != last_seen {
                        last_seen = cur;
                        last_progress_at = Instant::now();
                        if let Some(cb) = progress {
                            let pct = if tot == 0 {
                                offset
                            } else {
                                offset + (cur as f32 / tot as f32) * scale
                            };
                            cb(pct as i32, ProgressType::Download, label);
                        }
                    }
                    if last_progress_at.elapsed().as_secs() > STALL_TIMEOUT_SECS {
                        bail!(
                            "Timed out downloading '{}' from '{}': no progress for {}s (network stalled). \
                             Check your connection / proxy / firewall and try again.",
                            filename, repo_id, STALL_TIMEOUT_SECS
                        );
                    }
                }
            }
        }
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
        let base = cache_root.join(format!("models--{owner}--{repo}")).join("snapshots");
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

        let base = cache_root.join(format!("models--{owner}--{repo}")).join("snapshots");
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
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let stem = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    // whisper.cpp models use the ggml-{model}.bin naming convention. The VAD model
    // is also named ggml-*.bin, but is much smaller and uses a different binary
    // format, so keep Whisper-specific cache sanity checks away from it.
    let is_whisper_bin = ext == "bin" && stem.starts_with("ggml-") && !stem.contains("silero");
    let min_bytes: u64 = if is_whisper_bin {
        // Smallest Whisper model (tiny.en) is ~77 MB; 50 MB catches partial downloads that
        // would otherwise pass the old 100 KB floor and cause a native crash in whisper.cpp.
        50_000_000
    } else {
        match ext {
            "json" | "txt" => 1,
            _ => 100_000, // 100 KB
        }
    };
    if md.len() < min_bytes {
        bail!("Model blob seems too small ({} bytes): {}", md.len(), blob_path.display());
    }
    // This is only a cheap cache/download sanity check. whisper-rs/whisper.cpp
    // remains the authority on whether a model is actually compatible.

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

async fn download_to(dest_path: &Path, url: &str) -> Result<()> {
    if let Some(parent) = dest_path.parent() { fs::create_dir_all(parent).ok(); }
    // Explicit client with a connect timeout so a dead/blocked endpoint fails fast
    // instead of hanging on connection setup. Callers that need a bound on the whole
    // transfer (e.g. ensure_vad_model) wrap this in tokio::time::timeout.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .context("Failed to build HTTP client")?;
    let mut resp = client.get(url).send().await.context("Failed to GET url")?;
    if !resp.status().is_success() {
        bail!("Failed to download '{}': status {}", url, resp.status());
    }
    // Stream to a `.part` temp file in the same directory, then atomically rename
    // on success. This avoids leaving a partial file at the destination path if the
    // transfer fails mid-stream — otherwise `list_cached_models` (which only checks
    // existence for flat-layout models) would mark a half-downloaded model as cached.
    // The temp file lives in the same directory as the destination, so `fs::rename`
    // is atomic on the same filesystem across all platforms.
    let part_path = {
        let mut name = dest_path.file_name().map(|s| s.to_os_string()).unwrap_or_default();
        name.push(".part");
        dest_path.with_file_name(name)
    };

    // Best-effort cleanup of any stale `.part` file from a previous failed attempt.
    let _ = fs::remove_file(&part_path);

    let stream_result: Result<()> = async {
        let mut f = fs::File::create(&part_path).context("Failed to create temp download file")?;
        while let Some(chunk) = resp.chunk().await.context("Failed to read response chunk")? {
            std::io::copy(&mut chunk.as_ref(), &mut f).context("Failed to write file")?;
        }
        f.sync_all().context("Failed to sync download file")?;
        Ok(())
    }
    .await;

    match stream_result {
        Ok(()) => {
            // On POSIX, `fs::rename` atomically replaces an existing destination.
            // On Windows, `fs::rename` fails if the destination already exists, which
            // would block finalization when re-downloading a corrupt or partial
            // flat-layout model file that `ensure_hf_flat` already detected at
            // `dest_path` (validation failed → re-download → can't rename over the
            // bad file). Retry once after removing a pre-existing destination so the
            // fresh download replaces the corrupt one instead of stranding the user
            // with a `.part` they can't finalize without manual cleanup.
            if let Err(e) = fs::rename(&part_path, dest_path) {
                if dest_path.exists() {
                    let _ = fs::remove_file(dest_path);
                    fs::rename(&part_path, dest_path).with_context(|| {
                        format!("Failed to finalize download to {}", dest_path.display())
                    })?;
                } else {
                    return Err(e).with_context(|| {
                        format!("Failed to finalize download to {}", dest_path.display())
                    });
                }
            }
            Ok(())
        }
        Err(e) => {
            // Remove the partial temp file so it isn't mistaken for a complete download.
            let _ = fs::remove_file(&part_path);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the "stuck at 0% forever" bug: a download attempt for a file
    /// that doesn't exist must return an error promptly, not hang indefinitely.
    ///
    /// Ignored by default because it makes a real HTTP request to huggingface.co, making
    /// it sensitive to network availability in CI. Run explicitly with
    /// `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn download_watchdog_fails_fast_for_missing_file() {
        let cache_dir = std::env::temp_dir().join(format!(
            "autosubs-test-cache-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let manager = ModelManager::new(cache_dir.clone());
        let api = ApiBuilder::from_env()
            .with_cache_dir(manager.model_cache_dir().unwrap())
            .build()
            .expect("failed to build hf-hub API");
        let cancel_token = Arc::new(CancellationToken::new());

        let start = Instant::now();
        let result = manager
            .download_with_stall_watchdog(
                &api,
                WHISPER_REPO_ID,
                "this-file-does-not-exist.bin",
                None,
                None,
                0.0,
                100.0,
                "test",
                &cancel_token,
            )
            .await;

        let _ = fs::remove_dir_all(&cache_dir);

        assert!(result.is_err(), "expected an error for a nonexistent file");
        // Bound against the watchdog's own stall timeout (rather than an arbitrary
        // shorter value) so a slow-but-reachable HF response can't cause a false failure.
        assert!(
            start.elapsed() < std::time::Duration::from_secs(STALL_TIMEOUT_SECS),
            "download watchdog should fail fast instead of hanging"
        );
    }
}
