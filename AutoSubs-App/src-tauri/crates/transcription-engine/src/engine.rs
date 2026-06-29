use std::path::PathBuf;
use eyre::eyre;
use crate::types::{SpeechSegment, LabeledProgressFn, NewSegmentFn, Segment};
use crate::formatting::{process_segments, PostProcessConfig, TextCase, TextDensity};

/// Frontend-requested content formatting applied after structural line-wrapping.
#[derive(Clone, Debug, Default)]
pub struct ContentFormatting {
    pub text_case: TextCase,
    pub remove_punctuation: bool,
    pub censored_words: Vec<String>,
}

use crate::engines::moonshine::moonshine_variant_from_model_name;
use crate::manifest::{self, Engine as ModelEngine};
// callback type aliases are defined in crate::types

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub cache_dir: PathBuf, // Cache directory for downloaded models
    pub enable_dtw: Option<bool>, // Enable DTW for better word timestamps - this will disable flash attention
    pub enable_flash_attn: Option<bool>, // Enable flash attention for faster inference (works best for larger models)
    pub use_gpu: Option<bool>, // Enable GPU acceleration
    pub gpu_device: Option<i32>, // GPU device id, default 0
    pub vad_model_path: Option<String>, // Path to Voice Activity Detection (VAD) model
    pub diarize_segment_model_path: Option<String>, // Optional path to diarization segmentation model; if None, it will be downloaded
    pub diarize_embedding_model_path: Option<String>, // Optional path to diarization embedding model; if None, it will be downloaded
}

impl EngineConfig {
    pub fn default() -> Self {
        Self {
            cache_dir: "./cache".into(),
            enable_dtw: Some(true),
            enable_flash_attn: Some(false),
            use_gpu: Some(true),
            gpu_device: None,
            vad_model_path: None,
            diarize_segment_model_path: None,
            diarize_embedding_model_path: None,
        }
    }
}

pub struct Callbacks<'a> {
    // Unified progress callback: receives percent and a label describing the stage
    pub progress: Option<&'a LabeledProgressFn>,
    pub new_segment_callback: Option<&'a NewSegmentFn>,
    pub is_cancelled: Option<Box<dyn Fn() -> bool + Send + Sync + 'static>>,
}

impl<'a> Default for Callbacks<'a> {
    fn default() -> Self {
        Self {
            progress: None,
            new_segment_callback: None,
            is_cancelled: None,
        }
    }
}

pub struct Engine {
    cfg: EngineConfig,
    models: crate::model_manager::ModelManager,
}

impl Engine {
    pub fn new(cfg: EngineConfig) -> Self {
        Self {
            models: crate::model_manager::ModelManager::new(cfg.cache_dir.clone()),
            cfg,
        }
    }

    pub async fn transcribe_audio(
        &mut self,
        audio_path: &str,
        options: crate::TranscribeOptions,
        max_lines: Option<usize>,
        density: Option<TextDensity>,
        custom_max_chars_per_line: Option<usize>,
        content_formatting: Option<ContentFormatting>,
        cb: Option<Callbacks<'_>>,
    ) -> eyre::Result<(Vec<Segment>, Vec<Segment>, String)> {
        let cb = cb.unwrap_or_default();
        if !std::path::PathBuf::from(audio_path).exists() {
            eyre::bail!("audio file doesn't exist")
        }

        // Route to the appropriate engine based on the manifest. Models not in
        // the manifest fall back to Whisper (legacy behavior).
        let model_entry = manifest::get(&options.model);
        let engine_kind = model_entry.map(|e| e.engine).unwrap_or(ModelEngine::Whisper);
        let is_whisper = matches!(engine_kind, ModelEngine::Whisper);

        // Ensure/download the appropriate model.
        let _model_path = match model_entry {
            Some(entry) => {
                self.models
                    .ensure_model(entry, cb.progress, cb.is_cancelled.as_deref())
                    .await?
            }
            None => {
                self.models
                    .ensure_whisper_model(&options.model, cb.progress, cb.is_cancelled.as_deref())
                    .await?
            }
        };

        let original_samples = crate::audio::read_wav(&audio_path)?;
        if original_samples.is_empty() {
            eyre::bail!("audio file contains no samples")
        }

        let speech_segments: Vec<SpeechSegment>;

        if let Some(true) = options.enable_diarize {
            // Ensure/download diarization models from the manifest, unless the
            // caller provided explicit paths in the config.
            let (seg_path, emb_path) = match (&self.cfg.diarize_segment_model_path, &self.cfg.diarize_embedding_model_path) {
                (Some(seg), Some(emb)) => (PathBuf::from(seg), PathBuf::from(emb)),
                _ => self
                    .models
                    .ensure_diarize_models(cb.progress, cb.is_cancelled.as_deref())
                    .await?,
            };

            let threshold = options.advanced.as_ref().and_then(|a| a.diarize_threshold).unwrap_or(0.5);
            let diarize_options = diarize::DiarizeOptions {
                segment_model_path: seg_path,
                embedding_model_path: emb_path,
                threshold,
                max_speakers: match options.max_speakers {
                    Some(0) | None => usize::MAX,
                    Some(n) => n,
                },
            };

            let diarize_progress = |pct| {
                if let Some(callback) = cb.progress {
                    callback(pct, crate::ProgressType::Diarize, "progressSteps.diarize");
                }
            };
            let diarize_progress_callback = cb
                .progress
                .map(|_| &diarize_progress as &diarize::ProgressFn<'_>);

            speech_segments = diarize::diarize(
                &original_samples,
                16000,
                &diarize_options,
                diarize_progress_callback,
                cb.is_cancelled.as_deref(),
            )?;
        } else if let Some(true) = options.enable_vad {
            // Use provided VAD model path if present; otherwise download via ModelManager.
            // These stages reuse ProgressType::Download, so the app-level progress logger
            // (which logs once per ProgressType) stays silent here — hence the explicit
            // info! markers below, so a stall in the VAD fetch or inference is visible.
            let vad_model_path: PathBuf = if let Some(ref p) = self.cfg.vad_model_path {
                PathBuf::from(p)
            } else {
                tracing::info!("VAD: ensuring Silero VAD model is available");
                let p = self
                    .models
                    .ensure_vad_model(cb.progress, cb.is_cancelled.as_deref())
                    .await?;
                tracing::info!("VAD: model ready at {}", p.display());
                p
            };

            // `vad::get_segments` expects a &str path; convert from PathBuf
            let vad_model_path_str = vad_model_path.to_string_lossy().to_string();
            tracing::info!(
                "VAD: running speech detection on {} samples ({:.2}s of audio)",
                original_samples.len(),
                original_samples.len() as f64 / 16000.0
            );
            let vad_start = std::time::Instant::now();
            speech_segments = crate::vad::get_segments(&vad_model_path_str, &original_samples)
                .map_err(|e| eyre!("{:?}", e))?;
            tracing::info!(
                "VAD: detected {} speech segment(s) in {:.2}s",
                speech_segments.len(),
                vad_start.elapsed().as_secs_f64()
            );
        }
        else {
            speech_segments = vec![SpeechSegment {
                start: 0.0,
                end: original_samples.len() as f64 / 16000.0,
                samples: original_samples.clone(),
                speaker_id: None,
            }];
        }

        let num_samples: usize = speech_segments.iter().map(|s| s.samples.len()).sum();
        let audio_duration_sec = num_samples as f64 / 16000.0;

        tracing::info!(
            "starting transcription pipeline: segments={}, total_audio_duration={:.2}s, model={}",
            speech_segments.len(),
            audio_duration_sec,
            options.model
        );

        if let Some(progress_callback) = cb.progress {
            progress_callback(0, crate::ProgressType::Transcribe, "workspace.empty.loadingModel");
        }

        let transcribe_start = std::time::Instant::now();

        // Capture translation options before moving `options` into the pipeline
        let translate_to = options.translate_target.clone();
        let from_lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
        let use_native = options.use_native_translation.unwrap_or(false);

        // Determine whether the selected engine can natively translate
        // (source → target). If not, we fall back to Google Translate post-pass.
        let native_target: Option<String> = if use_native {
            if let Some(ref target) = translate_to {
                if is_whisper && target == "en" {
                    Some(target.clone()) // Whisper built-in translate-to-English
                } else if engine_kind == ModelEngine::Canary
                    && crate::engines::canary::canary_supports_translation(&from_lang, target)
                {
                    Some(target.clone()) // Canary native translation
                } else {
                    None // Not supported natively → Google fallback
                }
            } else {
                None
            }
        } else {
            None
        };

        let (mut segments, detected_lang) = match engine_kind {
            ModelEngine::Parakeet => {
                crate::engines::parakeet::transcribe_parakeet(
                    _model_path.as_path(),
                    speech_segments,
                    &options,
                    cb.progress,
                    cb.new_segment_callback,
                    cb.is_cancelled,
                )
                .await?
            }
            ModelEngine::Moonshine => {
                let (variant, _lang) = moonshine_variant_from_model_name(&options.model)
                    .ok_or_else(|| eyre!("Unknown Moonshine model: {}", options.model))?;

                crate::engines::moonshine::transcribe_moonshine(
                    _model_path.as_path(),
                    variant,
                    speech_segments,
                    &options,
                    cb.progress,
                    cb.new_segment_callback,
                    cb.is_cancelled,
                )
                .await?
            }
            ModelEngine::Whisper => {
                // Whisper context creation loads the model into the (GPU) backend
                // and can stall on some drivers — log around it so a hang is visible.
                tracing::info!(
                    "Whisper: loading model context (model={}, use_gpu={:?})",
                    options.model,
                    self.cfg.use_gpu
                );
                let ctx_start = std::time::Instant::now();
                let ctx = crate::engines::whisper::create_context(
                    _model_path.as_path(),
                    &options.model,
                    self.cfg.gpu_device,
                    self.cfg.use_gpu,
                    self.cfg.enable_dtw,
                    self.cfg.enable_flash_attn,
                    Some(num_samples),
                )
                .map_err(|e| eyre!("Failed to create Whisper context: {}", e))?;
                tracing::info!(
                    "Whisper: model context ready in {:.2}s",
                    ctx_start.elapsed().as_secs_f64()
                );

                crate::engines::whisper::run_transcription_pipeline(
                    ctx,
                    speech_segments,
                    options,
                    cb.progress,
                    cb.new_segment_callback,
                    cb.is_cancelled,
                )
                .await?
            }
            ModelEngine::SenseVoice => {
                crate::engines::sense_voice::transcribe_sense_voice(
                    _model_path.as_path(),
                    speech_segments,
                    &options,
                    cb.progress,
                    cb.new_segment_callback,
                    cb.is_cancelled,
                )
                .await?
            }
            ModelEngine::Canary => {
                crate::engines::canary::transcribe_canary(
                    _model_path.as_path(),
                    speech_segments,
                    &options,
                    native_target.as_deref(),
                    cb.progress,
                    cb.new_segment_callback,
                    cb.is_cancelled,
                )
                .await?
            }
            ModelEngine::Cohere => {
                crate::engines::cohere::transcribe_cohere(
                    _model_path.as_path(),
                    speech_segments,
                    &options,
                    cb.progress,
                    cb.new_segment_callback,
                    cb.is_cancelled,
                )
                .await?
            }
            // Engines whose wrappers land in a later step.
            other => {
                return Err(eyre!(
                    "Transcription engine {:?} (model '{}') is not yet supported",
                    other,
                    options.model
                ));
            }
        };

        // Choose effective language: detected if present, otherwise the user-provided from_lang
        let effective_lang: &str = detected_lang.as_deref().unwrap_or(&from_lang);

        // `use_native_translation` requests the model's built-in translation.
        // The routing above determined `native_target` — when set, the engine
        // already produced output in the target language, so we suppress the
        // Google Translate post-pass. When None (model can't do native for this
        // pair), we fall back to Google Translate if `translate_target` is set.
        let suppress_post_translation = native_target.is_some();

        if !suppress_post_translation {
            if let Some(to_lang) = translate_to.as_deref() {
                crate::translate::translate_segments(segments.as_mut_slice(), effective_lang, to_lang, cb.progress)
                    .await
                    .map_err(|e| eyre!("{}", e))?;
            }
        }

        // Determine the final output language of the transcript.
        // - Native translation (Whisper→en or Canary→supported) => the target
        // - Post-translation via Google Translate => the target
        // - Otherwise => effective (detected or user-specified) language
        // Since `translate_target` always carries the target when translation
        // is on (including "en"), this covers both native and Google paths.
        let output_lang: String = if let Some(ref to_lang) = translate_to {
            to_lang.clone()
        } else {
            effective_lang.to_string()
        };

        // Build a config from the output language, not the source language.
        // Using the source language here was the cause of the spacing bug: when translating
        // from a CJK language (e.g. Japanese) to English, the CJK profile (insert_interword_space=false)
        // was applied to English output, stripping all inter-word spaces.
        //
        // When the output language is still "auto" (engine reported no detected
        // language and no translate target), infer the script from the transcribed
        // text so CJK/Korean/RTL/Indic/SE-Asian output is not formatted with Latin
        // spacing/wrapping rules. Engines like SenseVoice/Canary/Cohere/Parakeet do
        // not surface a detected language, so this is the only way to pick the right
        // profile for their `auto` output.
        let mut pp_cfg = if output_lang == "auto" {
            let joined: String = segments
                .iter()
                .map(|s| s.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            PostProcessConfig::for_text(&joined)
        } else {
            PostProcessConfig::for_language(&output_lang)
        };
        if let Some(d) = density {
            pp_cfg.apply_density(d);
            // If custom density, set max_chars_per_line directly from the provided value
            if d == TextDensity::Custom {
                if let Some(custom_cpl) = custom_max_chars_per_line {
                    pp_cfg.max_chars_per_line = custom_cpl;
                }
            }
        }
        if let Some(ml) = max_lines { pp_cfg.max_lines = ml; }
        if let Some(cf) = content_formatting {
            pp_cfg.text_case = cf.text_case;
            pp_cfg.remove_punctuation = cf.remove_punctuation;
            pp_cfg.censored_words = cf.censored_words;
        }

        // Run structural + content formatting to produce the display-ready segments,
        // while preserving the raw post-translation `segments` as `original_segments`
        // so the frontend can reformat later without re-transcribing.
        let formatted_segments = process_segments(&segments, &pp_cfg);

        let elapsed = transcribe_start.elapsed();
        tracing::info!(
            "transcription complete: processed {:.2}s of audio in {:.2}s ({:.2}x speed)",
            audio_duration_sec,
            elapsed.as_secs_f64(),
            audio_duration_sec / elapsed.as_secs_f64()
        );

        Ok((segments, formatted_segments, output_lang))
    }

    pub async fn delete_whisper_model(&self, model_name: &str) -> eyre::Result<()> {
        self.models.delete_whisper_model(model_name)
    }

    /// List all cached models (Whisper, Moonshine, Parakeet) in the cache directory.
    /// Returns a vector of model names (e.g., "tiny", "base", "moonshine-tiny", "parakeet").
    pub fn list_cached_models(&self) -> eyre::Result<Vec<String>> {
        self.models.list_cached_models()
    }

    /// Delete a cached model by name. Handles Whisper, Moonshine, and Parakeet models.
    /// Returns true if successfully deleted, false if model doesn't exist or deletion failed.
    pub fn delete_cached_model(&self, model_name: &str) -> bool {
        self.models.delete_cached_model(model_name)
    }
}
