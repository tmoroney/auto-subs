use std::path::PathBuf;
use eyre::eyre;
use crate::types::{SpeechSegment, DiarizeOptions, LabeledProgressFn, NewSegmentFn, Segment};
use crate::formatting::{process_segments, PostProcessConfig, TextDensity};

use crate::engines::moonshine::{is_moonshine_model, moonshine_variant_from_model_name};

use crate::engines::parakeet::is_parakeet_model;
use crate::speaker::label_speakers;

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
        cb: Option<Callbacks<'_>>,
    ) -> eyre::Result<Vec<Segment>> {
        let cb = cb.unwrap_or_default();
        if !std::path::PathBuf::from(audio_path).exists() {
            eyre::bail!("audio file doesn't exist")
        }

        // Route to appropriate engine based on model name
        let is_moonshine = is_moonshine_model(&options.model);
        let is_parakeet = is_parakeet_model(&options.model);

        // Ensure/download the appropriate model
        let _model_path = if is_moonshine {
            self
                .models
                .ensure_moonshine_model(&options.model, cb.progress, cb.is_cancelled.as_deref())
                .await?
        } else if is_parakeet {
            self
                .models
                .ensure_parakeet_v3_model(cb.progress, cb.is_cancelled.as_deref())
                .await?
        } else {
            self
                .models
                .ensure_whisper_model(&options.model, cb.progress, cb.is_cancelled.as_deref())
                .await?
        };

        let original_samples = crate::audio::read_wav(&audio_path)?;

        let mut speech_segments: Vec<SpeechSegment> = Vec::new();

        if let Some(true) = options.enable_diarize {
            let seg_url = "https://huggingface.co/altunenes/speaker-diarization-community-1-onnx/blob/main/segmentation-community-1.onnx";
            let emb_url = "https://huggingface.co/altunenes/speaker-diarization-community-1-onnx/blob/main/embedding_model.onnx";

            // Ensure/download diarization models if not provided
            let (seg_path, emb_path) = match (&self.cfg.diarize_segment_model_path, &self.cfg.diarize_embedding_model_path) {
                (Some(seg), Some(emb)) => (PathBuf::from(seg), PathBuf::from(emb)),
                _ => self
                    .models
                    .ensure_diarize_models(seg_url, emb_url, cb.progress, cb.is_cancelled.as_deref())
                    .await?,
            };

            // Set diarize options
            let threshold = options.advanced.as_ref().and_then(|a| a.diarize_threshold).unwrap_or(0.5);
            let diarize_options = DiarizeOptions {
                segment_model_path: seg_path.to_string_lossy().to_string(),
                embedding_model_path: emb_path.to_string_lossy().to_string(),
                threshold,
                max_speakers: match options.max_speakers {
                    Some(0) | None => usize::MAX,
                    Some(n) => n,
                },
            };

            // Consume the lazy pyannote_rs iterator: the for-loop calls `next()` under the hood,
            // forcing evaluation as we go. Each yielded pyannote_rs::Segment is converted into
            // our SpeechSegment and appended to `speech_segments` immediately.
            let diarize_segments_iter = pyannote_rs::get_segments(&original_samples, 16000, &seg_path)
                .map_err(|e| eyre!("{:?}", e))?;
            for seg_res in diarize_segments_iter {
                let seg = seg_res.map_err(|e| eyre!("{:?}", e))?;
                speech_segments.push(SpeechSegment { start: seg.start, end: seg.end, samples: seg.samples, speaker_id: None });
            }

            // Compute speaker IDs once and propagate to all engines
            label_speakers(
                speech_segments.as_mut_slice(),
                &diarize_options,
                cb.progress,
                cb.is_cancelled.as_deref(),
            )?;
        } else if let Some(true) = options.enable_vad {
            // Use provided VAD model path if present; otherwise download via ModelManager
            let vad_model_path: PathBuf = if let Some(ref p) = self.cfg.vad_model_path {
                PathBuf::from(p)
            } else {
                self
                    .models
                    .ensure_vad_model(cb.progress, cb.is_cancelled.as_deref())
                    .await?
            };

            // `vad::get_segments` expects a &str path; convert from PathBuf
            let vad_model_path_str = vad_model_path.to_string_lossy().to_string();
            speech_segments = crate::vad::get_segments(&vad_model_path_str, &original_samples)
                .map_err(|e| eyre!("{:?}", e))?;
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

        println!("Transcribing {} segments", speech_segments.len());

        // Capture translation options before moving `options` into the pipeline
        let translate_to = options.translate_target.clone();
        let from_lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
        let whisper_to_en = options.whisper_to_english.unwrap_or(false);

        let (mut segments, detected_lang) = if is_parakeet {
            // Use Parakeet engine
            crate::engines::parakeet::transcribe_parakeet(
                _model_path.as_path(),
                speech_segments,
                &options,
                cb.progress,
                cb.new_segment_callback,
                cb.is_cancelled,
            )
            .await?
        } else if is_moonshine {
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
        } else {
            // Use Whisper engine
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

            crate::engines::whisper::run_transcription_pipeline(
                ctx,
                speech_segments,
                options,
                cb.progress,
                cb.new_segment_callback,
                cb.is_cancelled,
            )
            .await?
        };

        // Choose effective language: detected if present, otherwise the user-provided from_lang
        let effective_lang: &str = detected_lang.as_deref().unwrap_or(&from_lang);

        // `whisper_to_english` only applies to Whisper models (they can do built-in translate-to-English).
        // If a non-Whisper model is used, we should not suppress the normal post-translation step.
        let suppress_post_translation = !is_parakeet && !is_moonshine && whisper_to_en;

        if !suppress_post_translation {
            if let Some(to_lang) = translate_to.as_deref() {
                crate::translate::translate_segments(segments.as_mut_slice(), effective_lang, to_lang, cb.progress)
                    .await
                    .map_err(|e| eyre!("{}", e))?;
            }
        }

        // Build a config from the chosen preset; apply density and max_lines.
        let mut pp_cfg = PostProcessConfig::for_language(effective_lang);
        if let Some(d) = density { pp_cfg.apply_density(d); }
        if let Some(ml) = max_lines { pp_cfg.max_lines = ml; }

        Ok(process_segments(&segments, &pp_cfg))
    }

    // TODO: Make equivalent functions for Parakeet and Moonshine models - also possibly merge with delete_cached_model
    pub async fn delete_whisper_model(&self, model_name: &str) -> eyre::Result<()> {
        self.models.delete_whisper_model(model_name)
    }

    // TODO: Make equivalent functions for Parakeet and Moonshine models
    /// List all cached Whisper models in the cache directory.
    /// Returns a vector of model names (e.g., "tiny", "base", "small").
    pub fn list_cached_models(&self) -> eyre::Result<Vec<String>> {
        self.models.list_cached_models()
    }

    /// Delete a cached Whisper model by name.
    /// Returns true if successfully deleted, false if model doesn't exist or deletion failed.
    pub fn delete_cached_model(&self, model_name: &str) -> bool {
        self.models.delete_cached_model(model_name)
    }
}