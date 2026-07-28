//! GigaAM (Sber) Russian speech recognition backend.

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, ProgressType, Segment, SpeechSegment, TranscribeOptions};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::{
    gigaam::{GigaAMModel, GigaAMParams},
    Quantization,
};
use transcribe_rs::TranscriptionResult;

pub struct GigaamEngine {
    model: GigaAMModel,
    params: GigaAMParams,
}

impl OnnxEngine for GigaamEngine {
    // The Conformer encoder attends over the whole chunk, so memory grows
    // quadratically with its length; cap it like the other ONNX engines.
    const MAX_SEGMENT_SECONDS: f64 = 25.0;

    fn load(model_path: &Path) -> Result<Self> {
        let model = GigaAMModel::load(model_path, &Quantization::Int8)
            .map_err(|e| eyre!("Failed to load GigaAM model: {}", e))?;

        Ok(Self {
            model,
            params: GigaAMParams::default(),
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples, &self.params)
            .map_err(|e| eyre!("GigaAM transcription failed: {}", e))
    }

    // The CTC head emits no token timings, so word boundaries are spread
    // across the chunk window and refined later by the optional aligner.
    fn word_timing(&self) -> WordTiming {
        WordTiming::Interpolated
    }

    fn detected_lang(&self) -> Option<String> {
        None
    }
}

pub async fn transcribe_gigaam(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    use_gpu: Option<bool>,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("GigaAM transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    if let Some(cb) = progress_callback {
        cb(0, ProgressType::Analyze, "progressSteps.analyze.loading");
    }
    let engine = crate::engines::onnx::load_with_directml_fallback(use_gpu, || GigaamEngine::load(model_path))?;
    if let Some(cb) = progress_callback {
        cb(100, ProgressType::Analyze, "progressSteps.analyze.loading");
    }

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
