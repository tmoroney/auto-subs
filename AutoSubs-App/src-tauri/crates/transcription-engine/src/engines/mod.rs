//! Transcription engine backends.
//!
//! This module provides different speech recognition backends:
//! - **Whisper**: OpenAI's Whisper model via whisper-rs (GGML format)
//! - **Parakeet**: NVIDIA's NeMo Parakeet model via transcribe-rs (ONNX format)
//! - **Moonshine**: Useful Sensors' Moonshine via transcribe-rs (ONNX format)
//! - **SenseVoice**: FunAudioLLM SenseVoice via transcribe-rs (ONNX format)
//! - **OmniAsr**: Facebook Omni-ASR 300M CTC via ORT (ONNX format)

use crate::engine::EngineConfig;
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions};
use crate::manifest::Engine as ModelEngine;
use eyre::{eyre, Result};
use std::path::Path;

pub mod whisper;

pub mod onnx;
pub mod canary;
pub mod cohere;
pub mod moonshine;
pub mod omni_asr;
pub mod parakeet;
pub mod sense_voice;

// Re-export commonly used items
pub use whisper::{create_context, run_transcription_pipeline, SHOULD_CANCEL};

pub use canary::transcribe_canary;
pub use cohere::transcribe_cohere;
pub use moonshine::transcribe_moonshine;
pub use parakeet::transcribe_parakeet;
pub use omni_asr::transcribe_omni_asr;
pub use sense_voice::transcribe_sense_voice;

#[allow(clippy::too_many_arguments)]
pub async fn run_engine(
    engine_kind: ModelEngine,
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    native_target: Option<&str>,
    cfg: &EngineConfig,
    progress: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    let num_samples: usize = speech_segments.iter().map(|s| s.samples.len()).sum();

    let use_gpu = cfg.use_gpu;
    match engine_kind {
        ModelEngine::Parakeet => {
            crate::engines::parakeet::transcribe_parakeet(
                model_path,
                speech_segments,
                options,
                use_gpu,
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        ModelEngine::Moonshine => {
            let (variant, _lang) = crate::engines::moonshine::moonshine_variant_from_model_name(&options.model)
                .ok_or_else(|| eyre!("Unknown Moonshine model: {}", options.model))?;

            crate::engines::moonshine::transcribe_moonshine(
                model_path,
                variant,
                speech_segments,
                options,
                use_gpu,
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        ModelEngine::Whisper => {
            tracing::info!(
                "Whisper: loading model context (model={}, use_gpu={:?})",
                options.model,
                cfg.use_gpu
            );
            let ctx_start = std::time::Instant::now();
            let ctx = crate::engines::whisper::create_context(
                model_path,
                &options.model,
                cfg.gpu_device,
                cfg.use_gpu,
                cfg.enable_dtw,
                cfg.enable_flash_attn,
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
                options.clone(),
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        ModelEngine::SenseVoice => {
            crate::engines::sense_voice::transcribe_sense_voice(
                model_path,
                speech_segments,
                options,
                use_gpu,
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        ModelEngine::Canary => {
            crate::engines::canary::transcribe_canary(
                model_path,
                speech_segments,
                options,
                native_target,
                use_gpu,
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        ModelEngine::Cohere => {
            crate::engines::cohere::transcribe_cohere(
                model_path,
                speech_segments,
                options,
                use_gpu,
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        ModelEngine::OmniAsr => {
            crate::engines::omni_asr::transcribe_omni_asr(
                model_path,
                speech_segments,
                options,
                use_gpu,
                progress,
                new_segment_callback,
                abort_callback,
            )
            .await
        }
        other => Err(eyre!(
            "Transcription engine {:?} (model '{}') is not yet supported",
            other,
            options.model
        )),
    }
}
