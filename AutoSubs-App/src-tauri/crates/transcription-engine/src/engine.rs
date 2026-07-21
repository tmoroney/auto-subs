use crate::formatting::{PostProcessConfig, TextCase, TextDensity, process_segments};
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment};
use eyre::eyre;
use std::path::PathBuf;
use std::sync::Arc;
#[cfg(all(target_os = "windows", feature = "directml"))]
use transcribe_rs::{get_ort_accelerator, set_ort_accelerator, OrtAccelerator};

/// Frontend-requested content formatting applied after structural line-wrapping.
#[derive(Clone, Debug, Default)]
pub struct ContentFormatting {
    pub text_case: TextCase,
    pub remove_punctuation: bool,
    pub censored_words: Vec<String>,
}

use crate::manifest::{self, Engine as ModelEngine};
// callback type aliases are defined in crate::types

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub cache_dir: PathBuf,              // Cache directory for downloaded models
    pub enable_dtw: Option<bool>, // Enable DTW for better word timestamps - this will disable flash attention
    pub enable_flash_attn: Option<bool>, // Enable flash attention for faster inference (works best for larger models)
    pub use_gpu: Option<bool>,           // Enable GPU acceleration
    pub gpu_device: Option<i32>,         // GPU device id, default 0
    pub vad_model_path: Option<String>,  // Path to Voice Activity Detection (VAD) model
    pub diarize_segment_model_path: Option<String>, // Optional path to diarization segmentation model; if None, it will be downloaded
    pub diarize_embedding_model_path: Option<String>, // Optional path to diarization embedding model; if None, it will be downloaded
    pub aligner_model_dir: Option<String>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            cache_dir: "./cache".into(),
            enable_dtw: Some(true),
            enable_flash_attn: Some(false),
            use_gpu: Some(true),
            gpu_device: None,
            vad_model_path: None,
            diarize_segment_model_path: None,
            diarize_embedding_model_path: None,
            aligner_model_dir: None,
        }
    }
}

#[derive(Default)]
pub struct Callbacks<'a> {
    // Unified progress callback: receives percent and a label describing the stage
    pub progress: Option<&'a LabeledProgressFn>,
    pub new_segment_callback: Option<&'a NewSegmentFn>,
    pub is_cancelled: Option<Box<dyn Fn() -> bool + Send + Sync + 'static>>,
}

async fn prepare_speech_segments(
    models: &mut crate::model_manager::ModelManager,
    cfg: &EngineConfig,
    audio_samples: &[i16],
    options: &crate::TranscribeOptions,
    progress: Option<&LabeledProgressFn>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync + 'static)>,
) -> eyre::Result<Vec<SpeechSegment>> {
    let speech_segments = if let Some(true) = options.enable_diarize {
        let (seg_path, emb_path) = match (
            &cfg.diarize_segment_model_path,
            &cfg.diarize_embedding_model_path,
        ) {
            (Some(seg), Some(emb)) => (PathBuf::from(seg), PathBuf::from(emb)),
            _ => models.ensure_diarize_models(progress, is_cancelled).await?,
        };

        let threshold = options
            .advanced
            .as_ref()
            .and_then(|a| a.diarize_threshold)
            .unwrap_or(0.5);
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
            if let Some(callback) = progress {
                callback(pct, crate::ProgressType::Diarize, "progressSteps.diarize");
            }
        };
        let diarize_progress_callback =
            progress.map(|_| &diarize_progress as &diarize::ProgressFn<'_>);

        diarize::diarize(
            audio_samples,
            16000,
            &diarize_options,
            diarize_progress_callback,
            is_cancelled,
        )?
    } else if let Some(true) = options.enable_vad {
        let vad_model_path: PathBuf = if let Some(ref p) = cfg.vad_model_path {
            PathBuf::from(p)
        } else {
            tracing::info!("VAD: ensuring Silero VAD model is available");
            let p = models.ensure_vad_model(progress, is_cancelled).await?;
            tracing::info!("VAD: model ready at {}", p.display());
            p
        };

        let vad_model_path_str = vad_model_path.to_string_lossy().to_string();
        tracing::info!(
            "VAD: running speech detection on {} samples ({:.2}s of audio)",
            audio_samples.len(),
            audio_samples.len() as f64 / 16000.0
        );
        let vad_start = std::time::Instant::now();
        let speech_segments = crate::vad::get_segments(&vad_model_path_str, audio_samples)
            .map_err(|e| eyre::eyre!("{:?}", e))?;
        tracing::info!(
            "VAD: detected {} speech segment(s) in {:.2}s",
            speech_segments.len(),
            vad_start.elapsed().as_secs_f64()
        );
        speech_segments
    } else {
        vec![SpeechSegment {
            start: 0.0,
            end: audio_samples.len() as f64 / 16000.0,
            samples: audio_samples.to_vec(),
            speaker_id: None,
        }]
    };

    Ok(speech_segments)
}

fn resolve_native_target(
    engine_kind: ModelEngine,
    from_lang: &str,
    translate_to: Option<&str>,
    use_native: bool,
) -> Option<String> {
    if !use_native {
        return None;
    }

    let target = translate_to?;
    // Skip native translation when the user explicitly set the source
    // language equal to the target — there's nothing to translate. The
    // "auto" case is handled after detection via the effective_lang check
    // in `transcribe_audio`.
    if from_lang != "auto" && from_lang == target {
        return None;
    }
    match engine_kind {
        ModelEngine::Whisper if target == "en" => Some(target.to_string()),
        ModelEngine::Canary
            if crate::engines::canary::canary_supports_translation(from_lang, target) =>
        {
            Some(target.to_string())
        }
        _ => None,
    }
}

fn align_segments(
    aligner_dir: &std::path::Path,
    audio_samples: &[i16],
    segments: &mut [Segment],
    language: Option<&str>,
    user_offset: f64,
    progress: Option<&LabeledProgressFn>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> eyre::Result<()> {
    let mut aligner = crate::align::Aligner::load(aligner_dir)?;
    let audio_duration = audio_samples.len() as f64 / 16_000.0;
    let eligible = segments
        .iter()
        .filter(|segment| !segment.text.trim().is_empty())
        .count();
    let mut completed = 0usize;
    if let Some(callback) = progress {
        callback(
            if eligible == 0 { 100 } else { 0 },
            crate::ProgressType::Align,
            "progressSteps.align",
        );
    }

    for segment in segments
        .iter_mut()
        .filter(|segment| !segment.text.trim().is_empty())
    {
        if is_cancelled.is_some_and(|cancelled| cancelled()) {
            eyre::bail!("Transcription cancelled");
        }
        let audio_start = (segment.start - user_offset - 0.25).clamp(0.0, audio_duration);
        let audio_end = (segment.end - user_offset + 0.25).clamp(audio_start, audio_duration);
        let sample_start = (audio_start * 16_000.0).floor() as usize;
        let sample_end = ((audio_end * 16_000.0).ceil() as usize).min(audio_samples.len());
        let result = aligner.align_words(
            &audio_samples[sample_start..sample_end],
            &segment.text,
            language,
            is_cancelled,
        );
        match result {
            Ok(mut words) if !words.is_empty() => {
                let shift = audio_start + user_offset;
                let mut previous_end = segment.start;
                for word in &mut words {
                    word.start = (word.start + shift).clamp(segment.start, segment.end);
                    word.end = (word.end + shift).clamp(word.start, segment.end);
                    word.start = word.start.max(previous_end).min(word.end);
                    previous_end = word.end;
                }
                segment.words = Some(words);
            }
            Ok(_) => tracing::warn!(
                segment_start = segment.start,
                segment_end = segment.end,
                "forced alignment produced no words; retaining existing timestamps"
            ),
            Err(error) => {
                if is_cancelled.is_some_and(|cancelled| cancelled()) {
                    eyre::bail!("Transcription cancelled");
                }
                tracing::warn!(
                    segment_start = segment.start,
                    segment_end = segment.end,
                    error = %error,
                    "forced alignment failed for segment; retaining existing timestamps"
                );
            }
        }
        completed += 1;
        if let Some(callback) = progress {
            let percent = if eligible == 0 {
                100
            } else {
                (completed * 100 / eligible) as i32
            };
            callback(percent, crate::ProgressType::Align, "progressSteps.align");
        }
    }
    Ok(())
}

fn build_post_process_config(
    output_lang: &str,
    density: Option<TextDensity>,
    max_lines: Option<usize>,
    custom_max_chars_per_line: Option<usize>,
    content_formatting: Option<ContentFormatting>,
    segments: &[Segment],
) -> PostProcessConfig {
    let mut pp_cfg = if output_lang == "auto" {
        let joined: String = segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        PostProcessConfig::for_text(&joined)
    } else {
        PostProcessConfig::for_language(output_lang)
    };

    if let Some(d) = density {
        pp_cfg.apply_density(d);
        if d == TextDensity::Custom {
            if let Some(custom_cpl) = custom_max_chars_per_line {
                pp_cfg.max_chars_per_line = custom_cpl;
            }
        }
    }
    if let Some(ml) = max_lines {
        pp_cfg.max_lines = ml;
    }
    if let Some(cf) = content_formatting {
        pp_cfg.text_case = cf.text_case;
        pp_cfg.remove_punctuation = cf.remove_punctuation;
        pp_cfg.censored_words = cf.censored_words;
    }

    pp_cfg
}

pub struct Engine {
    cfg: EngineConfig,
    models: crate::model_manager::ModelManager,
}

impl Engine {
    pub fn new(cfg: EngineConfig) -> Self {
        // On Windows builds with the DirectML feature enabled, default ONNX
        // execution to DirectML. `transcribe-rs`'s Auto accelerator does not
        // include DirectML, so Parakeet/SenseVoice/Moonshine would silently run
        // on the CPU even when a GPU is available.
        #[cfg(all(target_os = "windows", feature = "directml"))]
        if get_ort_accelerator() == OrtAccelerator::Auto {
            tracing::info!("defaulting ONNX execution provider to DirectML on Windows");
            set_ort_accelerator(OrtAccelerator::DirectMl);
        }

        Self {
            models: crate::model_manager::ModelManager::new(cfg.cache_dir.clone()),
            cfg,
        }
    }

    #[allow(clippy::too_many_arguments)]
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
        let engine_kind = model_entry
            .map(|e| e.engine)
            .unwrap_or(ModelEngine::Whisper);
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

        let original_samples = crate::audio::read_wav(audio_path)?;
        if original_samples.is_empty() {
            eyre::bail!("audio file contains no samples")
        }

        let speech_segments = prepare_speech_segments(
            &mut self.models,
            &self.cfg,
            &original_samples,
            &options,
            cb.progress,
            cb.is_cancelled.as_deref(),
        )
        .await?;

        let num_samples: usize = speech_segments.iter().map(|s| s.samples.len()).sum();
        let audio_duration_sec = num_samples as f64 / 16000.0;

        tracing::info!(
            "starting transcription pipeline: segments={}, total_audio_duration={:.2}s, model={}",
            speech_segments.len(),
            audio_duration_sec,
            options.model
        );

        if let Some(progress_callback) = cb.progress {
            progress_callback(
                0,
                crate::ProgressType::Transcribe,
                "workspace.empty.loadingModel",
            );
        }

        let transcribe_start = std::time::Instant::now();

        // Capture translation options before moving `options` into the pipeline
        let translate_to = options.translate_target.clone();
        let from_lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
        let use_native = options.use_native_translation.unwrap_or(false);
        let enable_forced_alignment = options.enable_forced_alignment.unwrap_or(false);
        let user_offset = options.offset.unwrap_or(0.0);
        let alignment_cancellation: Option<Arc<dyn Fn() -> bool + Send + Sync>> =
            cb.is_cancelled.map(Arc::from);
        let engine_cancellation = alignment_cancellation
            .clone()
            .map(|cancelled| Box::new(move || cancelled()) as Box<dyn Fn() -> bool + Send + Sync>);

        let native_target =
            resolve_native_target(engine_kind, &from_lang, translate_to.as_deref(), use_native);

        let mut engine_cfg = self.cfg.clone();
        if enable_forced_alignment {
            engine_cfg.enable_dtw = Some(false);
        }

        let (mut segments, detected_lang) = crate::engines::run_engine(
            engine_kind,
            _model_path.as_path(),
            speech_segments,
            &options,
            native_target.as_deref(),
            &engine_cfg,
            cb.progress,
            cb.new_segment_callback,
            engine_cancellation,
        )
        .await?;

        // Choose effective language: detected if present, otherwise the user-provided from_lang
        let effective_lang: &str = detected_lang.as_deref().unwrap_or(&from_lang);

        let has_native_word_timestamps = matches!(
            engine_kind,
            ModelEngine::Parakeet | ModelEngine::SenseVoice
        );

        if enable_forced_alignment && translate_to.is_none() && !has_native_word_timestamps {
            if alignment_cancellation
                .as_ref()
                .is_some_and(|cancelled| cancelled())
            {
                eyre::bail!("Transcription cancelled");
            }
            let aligner_dir = match &self.cfg.aligner_model_dir {
                Some(path) => {
                    let path = PathBuf::from(path);
                    for required in [
                        "onnx/model_int8.onnx",
                        "vocab.json",
                        "config.json",
                        "preprocessor_config.json",
                    ] {
                        if !path.join(required).is_file() {
                            eyre::bail!("Aligner model directory is missing {required}");
                        }
                    }
                    path
                }
                None => {
                    self.models
                        .ensure_aligner_model(cb.progress, alignment_cancellation.as_deref())
                        .await?
                }
            };
            align_segments(
                &aligner_dir,
                &original_samples,
                &mut segments,
                Some(effective_lang),
                user_offset,
                cb.progress,
                alignment_cancellation.as_deref(),
            )?;
        } else if enable_forced_alignment {
            if has_native_word_timestamps {
                tracing::info!(
                    "forced alignment skipped: {} provides native word-level timestamps",
                    options.model
                );
            } else {
                tracing::info!("forced alignment skipped because translation is enabled");
            }
        }

        // `use_native_translation` requests the model's built-in translation.
        // The routing above determined `native_target` — when set, the engine
        // already produced output in the target language, so we suppress the
        // Google Translate post-pass. When None (model can't do native for this
        // pair), we fall back to Google Translate if `translate_target` is set.
        let suppress_post_translation = native_target.is_some();

        if !suppress_post_translation {
            if let Some(to_lang) = translate_to.as_deref() {
                // Skip the Google Translate post-pass when the effective
                // (detected or user-specified) source language matches the
                // target — translating would be a wasteful no-op and could
                // even corrupt the text via a round-trip through the API.
                if effective_lang != to_lang {
                    crate::translate::translate_segments(
                        segments.as_mut_slice(),
                        effective_lang,
                        to_lang,
                        cb.progress,
                    )
                    .await
                    .map_err(|e| eyre!("{}", e))?;
                }
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
        let pp_cfg = build_post_process_config(
            &output_lang,
            density,
            max_lines,
            custom_max_chars_per_line,
            content_formatting,
            &segments,
        );

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
