//! Parakeet (NeMo) speech recognition backend.

mod model;

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, ProgressType, Segment, SpeechSegment, TranscribeOptions, WordTimestamp};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::Quantization;
use transcribe_rs::{TranscriptionSegment, TranscriptionResult};

use self::model::ParakeetModel;

pub struct ParakeetEngine {
    model: ParakeetModel,
}

fn parakeet_segments_to_words(segments: &[TranscriptionSegment], base_offset: f64) -> Vec<WordTimestamp> {
    let mut words = Vec::new();
    let mut is_first_word = true;

    for w in segments {
        let mut w_text = w
            .text
            .trim_end_matches(|c: char| c.is_whitespace() || c == '\0')
            .to_string();
        if w_text.trim().is_empty() {
            continue;
        }

        if !is_first_word && !w_text.starts_with(' ') && !w_text.starts_with('\n') {
            w_text.insert(0, ' ');
        }

        words.push(WordTimestamp {
            text: w_text,
            start: base_offset + w.start as f64,
            end: base_offset + w.end as f64,
            probability: None,
        });

        is_first_word = false;
    }

    words
}

impl ParakeetEngine {
    fn load_with_keywords(
        model_path: &Path,
        keywords: &[String],
        abort: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>>,
    ) -> Result<Self> {
        validate_config(model_path)?;
        let mut model = ParakeetModel::load(model_path, &Quantization::Int8)
            .map_err(|e| eyre!("Failed to load Parakeet model: {}", e))?;
        model.set_abort(abort);
        if !keywords.is_empty() {
            model.set_keywords(keywords, None);
        }

        Ok(Self { model })
    }
}

impl OnnxEngine for ParakeetEngine {
    const MAX_SEGMENT_SECONDS: f64 = 30.0;

    fn load(model_path: &Path) -> Result<Self> {
        Self::load_with_keywords(model_path, &[], None)
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples)
            .map_err(|e| eyre!("Parakeet transcription failed: {}", e))
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::FromTokens { map: parakeet_segments_to_words, interpolate_on_empty: false }
    }

    fn detected_lang(&self) -> Option<String> {
        None
    }
}

fn validate_config(model_path: &Path) -> Result<()> {
    let bytes = match std::fs::read(model_path.join("config.json")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let config: serde_json::Value = serde_json::from_slice(&bytes)?;
    eyre::ensure!(
        config["model_type"] == "nemo-conformer-tdt"
            && config["features_size"] == 128
            && config["subsampling_factor"] == 8,
        "Incompatible Parakeet model config: expected NeMo TDT, 128 features and 8x subsampling"
    );
    Ok(())
}

pub async fn transcribe_parakeet(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    use_gpu: Option<bool>,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Parakeet transcribe called with model: {:?}", model_path);

    let abort_shared: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>> =
        abort_callback.map(std::sync::Arc::from);
    if abort_shared.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    if let Some(cb) = progress_callback {
        cb(0, ProgressType::Analyze, "progressSteps.analyze.loading");
    }
    let keywords = options
        .advanced
        .as_ref()
        .and_then(|a| a.keywords.clone())
        .unwrap_or_default();
    let engine = crate::engines::onnx::load_with_directml_fallback(use_gpu, || {
        ParakeetEngine::load_with_keywords(model_path, &keywords, abort_shared.clone())
    })?;
    if let Some(cb) = progress_callback {
        cb(100, ProgressType::Analyze, "progressSteps.analyze.loading");
    }

    run_onnx_pipeline(
        engine,
        speech_segments,
        options.offset.unwrap_or(0.0),
        progress_callback,
        new_segment_callback,
        abort_shared.map(|a| -> Box<dyn Fn() -> bool + Send + Sync> { Box::new(move || a()) }),
    )
    .await
}
