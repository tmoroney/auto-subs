use whisper_rs::{WhisperVadContext, WhisperVadContextParams, WhisperVadParams};
use crate::types::SpeechSegment;
use eyre::Result;

/// Detect speech segments with Silero VAD via whisper-rs. Input `int_samples` must be mono i16 at 16_000 Hz.
pub fn get_segments(
    vad_model: &str,
    int_samples: &[i16],
) -> Result<Vec<SpeechSegment>> {
    // Convert entire integer buffer to f32 for VAD processing
    let mut samples = vec![0.0f32; int_samples.len()];
    whisper_rs::convert_integer_to_float_audio(&int_samples, &mut samples)?;

    let ctx = WhisperVadContextParams::new();
    let mut vad = WhisperVadContext::new(vad_model, ctx)?;

    let mut vadp = WhisperVadParams::new();
    vadp.set_min_silence_duration(200); // ms — silences shorter than this are not treated as breaks

    let segs = vad.segments_from_samples(vadp, &samples)?;

    // Convert VAD centiseconds to seconds and slice samples from the original buffer
    let n = int_samples.len();
    const SR: f32 = 16_000.0;
    let n_f32 = n as f32;

    let segments: Vec<SpeechSegment> = segs
        .map(|s| ((s.start as f64) / 100.0, (s.end as f64) / 100.0))
        .filter(|(st, en)| en > st)
        .map(|(start_sec, end_sec)| {
            let start_idx = ((start_sec as f32 * SR).round()).clamp(0.0, n_f32) as usize;
            let end_idx = ((end_sec as f32 * SR).round()).clamp(0.0, n_f32) as usize;

            let seg_samples: Vec<i16> = if end_idx > start_idx {
                int_samples[start_idx..end_idx].to_vec()
            } else {
                Vec::new()
            };

            SpeechSegment { start: start_sec, end: end_sec, samples: seg_samples, speaker_id: None }
        })
        .filter(|seg| seg.end > seg.start && !seg.samples.is_empty())
        .collect();

    Ok(segments)
}
