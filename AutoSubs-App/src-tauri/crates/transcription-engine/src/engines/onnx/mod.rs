use crate::types::{
    LabeledProgressFn, NewSegmentFn, ProgressType, Segment, SpeechSegment, WordTimestamp,
};
use crate::utils::{interpolate_word_timestamps, push_segment_clamped, split_speech_segment};
use eyre::{bail, Result};
use transcribe_rs::{TranscriptionResult, TranscriptionSegment};
#[cfg(all(target_os = "windows", feature = "directml"))]
use transcribe_rs::{get_ort_accelerator, set_ort_accelerator, OrtAccelerator};

/// How an engine derives word timestamps.
#[derive(Clone, Copy)]
pub enum WordTiming {
    /// Real per-token/word segments. The mapper receives transcribe-rs segments
    /// and the chunk's absolute base offset.
    FromTokens {
        map: fn(&[TranscriptionSegment], f64) -> Vec<WordTimestamp>,
        interpolate_on_empty: bool,
    },
    /// No timing surfaced: interpolate across the chunk window.
    Interpolated,
}

/// Per-engine adapter for ONNX-backed models.
pub trait OnnxEngine: Sized {
    /// Maximum chunk length in seconds.
    const MAX_SEGMENT_SECONDS: f64;

    fn load(model_path: &std::path::Path) -> Result<Self>;
    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult>;
    fn word_timing(&self) -> WordTiming;
    fn detected_lang(&self) -> Option<String>;
}

#[cfg(all(target_os = "windows", feature = "directml"))]
static ONNX_ACCEL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Load an ONNX engine while the process-wide transcribe-rs accelerator is
/// configured for this request's GPU preference. On Windows builds with the
/// DirectML feature enabled, a user-allowed GPU request selects DirectML;
/// CPU-only selects CpuOnly. If DirectML fails to initialize, we retry once
/// with Auto (CPU) and restore the previous accelerator if that also fails.
pub fn load_with_directml_fallback<F, E>(_use_gpu: Option<bool>, mut loader: F) -> Result<E>
where
    F: FnMut() -> Result<E>,
{
    #[cfg(all(target_os = "windows", feature = "directml"))]
    {
        let use_gpu = _use_gpu;
        let _guard = ONNX_ACCEL_LOCK.lock().unwrap();
        let prev = get_ort_accelerator();
        let desired = if use_gpu.unwrap_or(true) {
            OrtAccelerator::DirectMl
        } else {
            OrtAccelerator::CpuOnly
        };

        if prev != desired {
            set_ort_accelerator(desired);
        }

        let result = match loader() {
            Ok(engine) => Ok(engine),
            Err(e) if desired == OrtAccelerator::DirectMl => {
                tracing::warn!("ONNX DirectML init failed ({}); falling back to CPU/Auto", e);
                set_ort_accelerator(OrtAccelerator::Auto);
                let retry = loader();
                if retry.is_err() {
                    set_ort_accelerator(prev);
                }
                retry
            }
            Err(e) => Err(e),
        };

        // If we errored without a fallback path, leave the process-wide state
        // as we found it so the next request starts from a known place.
        if result.is_err() && desired != OrtAccelerator::Auto && prev != desired {
            set_ort_accelerator(prev);
        }

        return result;
    }

    #[cfg(not(all(target_os = "windows", feature = "directml")))]
    loader()
}

/// Shared driver for the ONNX engines.
pub async fn run_onnx_pipeline<E: OnnxEngine>(
    mut engine: E,
    speech_segments: Vec<SpeechSegment>,
    user_offset: f64,
    progress: Option<&LabeledProgressFn>,
    new_segment: Option<&NewSegmentFn>,
    abort: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    let cancelled = || abort.as_ref().map(|c| c()).unwrap_or(false);

    let mut expanded: Vec<SpeechSegment> = Vec::new();
    for seg in &speech_segments {
        expanded.extend(split_speech_segment(seg, E::MAX_SEGMENT_SECONDS));
    }

    let total = expanded.len().max(1);
    let mut segments: Vec<Segment> = Vec::new();

    for (i, speech_segment) in expanded.iter().enumerate() {
        if cancelled() {
            bail!("Transcription cancelled");
        }

        let samples: Vec<f32> = speech_segment
            .samples
            .iter()
            .map(|&s| s as f32 / 32768.0)
            .collect();

        let result = engine
            .transcribe_chunk(&samples)
            .map_err(|e| eyre::eyre!("{}", e))?;

        if cancelled() {
            bail!("Transcription cancelled");
        }

        let text = result.text.trim().to_string();
        if text.is_empty() {
            if let Some(progress_callback) = progress {
                let pct = ((i + 1) as f64 / total as f64 * 100.0) as i32;
                progress_callback(pct, ProgressType::Transcribe, "progressSteps.transcribe");
            }
            continue;
        }

        let seg_start = speech_segment.start + user_offset;
        let seg_end = speech_segment.end + user_offset;

        let word_timing = engine.word_timing();
        let mut words = match word_timing {
            WordTiming::FromTokens { map, interpolate_on_empty } => {
                let mapped = map(result.segments.as_deref().unwrap_or(&[]), seg_start);
                if mapped.is_empty() && interpolate_on_empty {
                    interpolate_word_timestamps(&text, seg_start, seg_end)
                } else {
                    mapped
                }
            }
            WordTiming::Interpolated => interpolate_word_timestamps(&text, seg_start, seg_end),
        };

        let (segment_start, segment_end) = match word_timing {
            WordTiming::FromTokens { interpolate_on_empty: true, .. } if !words.is_empty() => {
                (words.first().unwrap().start, words.last().unwrap().end)
            }
            WordTiming::FromTokens { interpolate_on_empty: true, .. } => (seg_start, seg_end),
            WordTiming::FromTokens { interpolate_on_empty: false, .. } => (seg_start, seg_start + (speech_segment.end - speech_segment.start)),
            WordTiming::Interpolated => (seg_start, seg_end),
        };

        let segment = Segment {
            speaker_id: speech_segment.speaker_id.clone(),
            start: segment_start,
            end: segment_end,
            text,
            words: (!words.is_empty()).then_some(std::mem::take(&mut words)),
        };

        if let Some(cb) = new_segment {
            cb(i, &segment);
        }

        push_segment_clamped(&mut segments, segment);

        if let Some(progress_callback) = progress {
            let pct = ((i + 1) as f64 / total as f64 * 100.0) as i32;
            progress_callback(pct, ProgressType::Transcribe, "progressSteps.transcribe");
        }
    }

    Ok((segments, engine.detected_lang()))
}
