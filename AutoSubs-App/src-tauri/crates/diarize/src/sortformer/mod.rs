//! Default backend: NVIDIA Nemotron-3-Diarization (Streaming Sortformer v3), an end-to-end
//! model that labels up to 8 speakers and handles overlapping speech natively.

mod exclusive;
pub(crate) mod features;
pub(crate) mod model;

pub use exclusive::ExclusiveConfig;
pub use model::NUM_SPEAKERS as MAX_SPEAKERS;

use crate::{ProgressFn, SpeechSegment};
use eyre::{bail, Result};
use std::path::Path;

pub(crate) fn diarize(
    samples: &[i16],
    sample_rate: u32,
    model_path: &Path,
    max_speakers: usize,
    progress_callback: Option<&ProgressFn<'_>>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<Vec<SpeechSegment>> {
    if sample_rate as usize != features::SAMPLE_RATE {
        bail!("Sortformer expects 16 kHz audio, got {sample_rate} Hz");
    }
    if samples.is_empty() {
        return Ok(Vec::new());
    }
    let cancelled = || is_cancelled.is_some_and(|f| f());
    if cancelled() {
        bail!("Cancelled");
    }

    let mut model = model::SortformerModel::new(model_path, inference_threads())?;
    let probs = model.predict(samples, |done, total| {
        if let Some(callback) = progress_callback {
            callback((done * 100 / total.max(1)) as i32);
        }
        !cancelled()
    })?;
    drop(model);

    let turns = exclusive::exclusive_turns(&probs, samples.len(), max_speakers, &ExclusiveConfig::default());
    Ok(turns
        .into_iter()
        .map(|turn| SpeechSegment {
            start: turn.start as f64 / sample_rate as f64,
            end: turn.end as f64 / sample_rate as f64,
            samples: samples[turn.start..turn.end].to_vec(),
            speaker_id: Some((turn.speaker + 1).to_string()),
        })
        .collect())
}

/// Diarization runs before transcription, not alongside it, so it can use several cores.
/// Capped at 4: beyond that the 30 s chunks stop scaling.
fn inference_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| (n.get() / 2).clamp(1, 4))
        .unwrap_or(1)
}
