//! Cohere speech recognition backend.

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::{
    cohere::{CohereModel, CohereParams},
    Quantization,
};
use transcribe_rs::{SpeechModel, TranscriptionResult};

// Cohere decodes autoregressively per clip; cap chunk length to bound work/memory.
const MAX_SEGMENT_SECONDS: f64 = 30.0;

pub struct CohereEngine {
    model: CohereModel,
    params: CohereParams,
    detected_lang: Option<String>,
}

impl OnnxEngine for CohereEngine {
    const MAX_SEGMENT_SECONDS: f64 = MAX_SEGMENT_SECONDS;

    fn load(model_path: &Path) -> Result<Self> {
        let model = CohereModel::load(model_path, &Quantization::Int4)
            .map_err(|e| eyre!("Failed to load Cohere model: {}", e))?;

        Ok(Self {
            model,
            params: CohereParams::default(),
            detected_lang: None,
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples, &self.params)
            .map_err(|e| eyre!("Cohere transcription failed: {}", e))
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::Interpolated
    }

    fn detected_lang(&self) -> Option<String> {
        self.detected_lang.clone()
    }
}

pub async fn transcribe_cohere(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    use_gpu: Option<bool>,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Cohere transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    let lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
    if lang == "auto" {
        eyre::bail!(
            "Cohere cannot auto-detect the source language. Please select an explicit \
             source language from Cohere's supported set (e.g. en, de, fr, ja, zh, ...) or \
             use an auto-detecting engine such as Whisper, SenseVoice, or Parakeet."
        );
    }

    let mut engine = crate::engines::onnx::load_with_directml_fallback(use_gpu, || CohereEngine::load(model_path))?;
    let supported_languages = engine.model.capabilities().languages;
    if !supported_languages.is_empty() && !supported_languages.contains(&lang.as_str()) {
        eyre::bail!(
            "Cohere does not support source language '{}'. Supported languages: {}",
            lang,
            supported_languages.join(", "),
        );
    }

    engine.params.language = Some(lang.clone());
    engine.detected_lang = Some(lang);

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
