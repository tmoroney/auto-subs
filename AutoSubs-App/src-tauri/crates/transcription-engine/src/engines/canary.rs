//! Canary speech recognition backend.

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::{
    canary::{CanaryModel, CanaryParams},
    Quantization,
};
use transcribe_rs::{SpeechModel, TranscriptionResult};

// Canary encodes a whole clip per call; cap chunk length to bound memory.
const MAX_SEGMENT_SECONDS: f64 = 30.0;

const CANARY_TRANSLATION_LANGUAGES: &[&str] = &[
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt",
    "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
];

pub fn canary_supports_translation(from: &str, to: &str) -> bool {
    from != "auto"
        && CANARY_TRANSLATION_LANGUAGES.contains(&from)
        && CANARY_TRANSLATION_LANGUAGES.contains(&to)
}

pub struct CanaryEngine {
    model: CanaryModel,
    params: CanaryParams,
    detected_lang: Option<String>,
}

impl OnnxEngine for CanaryEngine {
    const MAX_SEGMENT_SECONDS: f64 = MAX_SEGMENT_SECONDS;

    fn load(model_path: &Path) -> Result<Self> {
        let model = CanaryModel::load(model_path, &Quantization::Int8)
            .map_err(|e| eyre!("Failed to load Canary model: {}", e))?;

        Ok(Self {
            model,
            params: CanaryParams::default(),
            detected_lang: None,
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples, &self.params)
            .map_err(|e| eyre!("Canary transcription failed: {}", e))
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::Interpolated
    }

    fn detected_lang(&self) -> Option<String> {
        self.detected_lang.clone()
    }
}

pub async fn transcribe_canary(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    native_target: Option<&str>,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Canary transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    let lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
    if lang == "auto" {
        eyre::bail!(
            "Canary cannot auto-detect the source language. Please select an explicit \
             source language from Canary's supported set (e.g. en, de, es, fr, ...) or \
             use an auto-detecting engine such as Whisper, SenseVoice, or Parakeet."
        );
    }

    let mut engine = crate::engines::onnx::load_with_directml_fallback(|| CanaryEngine::load(model_path))?;
    let supported_languages = engine.model.capabilities().languages;
    if !supported_languages.is_empty() && !supported_languages.contains(&lang.as_str()) {
        eyre::bail!(
            "Canary does not support source language '{}'. Supported languages: {}",
            lang,
            supported_languages.join(", "),
        );
    }

    engine.params.language = Some(lang.clone());
    engine.params.target_language = native_target.map(|t| t.to_string());
    engine.detected_lang = if let Some(t) = native_target {
        Some(t.to_string())
    } else {
        Some(lang)
    };

    run_onnx_pipeline(
        engine,
        speech_segments,
        options.offset.unwrap_or(0.0),
        progress_callback,
        new_segment_callback,
        abort_callback,
    )
    .await
}
