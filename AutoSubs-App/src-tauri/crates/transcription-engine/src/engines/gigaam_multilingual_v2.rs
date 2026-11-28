//! GigaAM Multilingual-v2 offline RNN-T backend.

use std::path::Path;

use eyre::Result;
use transcribe_rs::TranscriptionResult;
use transcribe_rs::onnx::gigaam_multilingual_v2::{
    GigaamMultilingualV2Model, GigaamMultilingualV2Params,
};

use crate::engines::onnx::{
    OnnxEngine, WordTiming, load_with_directml_fallback, run_onnx_pipeline,
};
use crate::types::{
    LabeledProgressFn, NewSegmentFn, ProgressType, Segment, SpeechSegment, TranscribeOptions,
};

struct GigaamMultilingualV2Engine {
    model: GigaamMultilingualV2Model,
    params: GigaamMultilingualV2Params,
}

impl OnnxEngine for GigaamMultilingualV2Engine {
    const MAX_SEGMENT_SECONDS: f64 = 30.0;

    fn load(model_path: &Path) -> Result<Self> {
        Ok(Self {
            model: GigaamMultilingualV2Model::load(model_path)?,
            params: GigaamMultilingualV2Params::default(),
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        Ok(self.model.transcribe_with(samples, &self.params)?)
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::Interpolated
    }

    fn detected_lang(&self) -> Option<String> {
        None
    }
}

pub(super) async fn transcribe(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    use_gpu: Option<bool>,
    progress: Option<&LabeledProgressFn>,
    new_segment: Option<&NewSegmentFn>,
    abort: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    if abort.as_ref().is_some_and(|cancel| cancel()) {
        eyre::bail!("Transcription cancelled");
    }
    if let Some(cb) = progress {
        cb(0, ProgressType::Analyze, "progressSteps.analyze.loading");
    }
    let mut engine =
        load_with_directml_fallback(use_gpu, || GigaamMultilingualV2Engine::load(model_path))?;
    if let Some(cb) = progress {
        cb(100, ProgressType::Analyze, "progressSteps.analyze.loading");
    }
    engine.params.language = options.lang.clone();

    run_onnx_pipeline(
        engine,
        speech_segments,
        options.offset.unwrap_or(0.0),
        progress,
        new_segment,
        abort,
    )
    .await
}
