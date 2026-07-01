//! Parakeet (NeMo) speech recognition backend.

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions, WordTimestamp};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::{
    parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity},
    Quantization,
};
use transcribe_rs::{TranscriptionSegment, TranscriptionResult};

pub struct ParakeetEngine {
    model: ParakeetModel,
    params: ParakeetParams,
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

impl OnnxEngine for ParakeetEngine {
    const MAX_SEGMENT_SECONDS: f64 = 30.0;

    fn load(model_path: &Path) -> Result<Self> {
        let model = ParakeetModel::load(model_path, &Quantization::Int8)
            .map_err(|e| eyre!("Failed to load Parakeet model: {}", e))?;

        Ok(Self {
            model,
            params: ParakeetParams {
                timestamp_granularity: Some(TimestampGranularity::Word),
                ..Default::default()
            },
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples, &self.params)
            .map_err(|e| eyre!("Parakeet transcription failed: {}", e))
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::FromTokens { map: parakeet_segments_to_words, interpolate_on_empty: false }
    }

    fn detected_lang(&self) -> Option<String> {
        None
    }
}

pub async fn transcribe_parakeet(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Parakeet transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    let engine = ParakeetEngine::load(model_path)?;
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
