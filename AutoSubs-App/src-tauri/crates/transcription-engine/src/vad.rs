use whisper_rs::{WhisperVadContext, WhisperVadContextParams, WhisperVadParams};
use crate::types::SpeechSegment;
use eyre::Result;

/// Silero reports tight boundaries and can clip a word's onset/offset, so the
/// ASR sees a partial word at a chunk edge (half words, or stray symbols with
/// normalizing models). Boundaries are grown by this much, taking audio only
/// from the surrounding silence.
const SPEECH_PAD_MS: f64 = 200.0;

/// Detect speech segments with Silero VAD via whisper-rs. Input `int_samples` must be mono i16 at 16_000 Hz.
pub fn get_segments(
    vad_model: &str,
    int_samples: &[i16],
) -> Result<Vec<SpeechSegment>> {
    // Convert entire integer buffer to f32 for VAD processing
    let mut samples = vec![0.0f32; int_samples.len()];
    whisper_rs::convert_integer_to_float_audio(int_samples, &mut samples)?;

    // The VAD graph is tiny (a single-window Silero LSTM). Running it with
    // multiple threads hits a known ggml threadpool race/deadlock on tiny
    // graphs, especially on Windows, which can cause VAD to hang
    // indefinitely on longer audio. Use a single thread to avoid the threadpool.
    let mut ctx_params = WhisperVadContextParams::new();
    ctx_params.set_n_threads(1);
    let mut vad = WhisperVadContext::new(vad_model, ctx_params)?;

    let mut vadp = WhisperVadParams::new();
    // 500 ms aligns with common VAD defaults (Silero/pyannote). 200 ms was
    // aggressive and chopped natural mid-phrase pauses, particularly in
    // languages with more inter-word pausing (e.g. Russian).
    vadp.set_min_silence_duration(500); // ms — silences shorter than this are not treated as breaks

    let segs = vad.segments_from_samples(vadp, &samples)?;

    // Convert VAD centiseconds to seconds and slice samples from the original buffer
    let n = int_samples.len();
    const SR: f32 = 16_000.0;
    let n_f32 = n as f32;

    let raw: Vec<(f64, f64)> = segs
        .map(|s| ((s.start as f64) / 100.0, (s.end as f64) / 100.0))
        .filter(|(st, en)| en > st)
        .collect();

    let segments: Vec<SpeechSegment> = pad_boundaries(&raw, n as f64 / SR as f64)
        .into_iter()
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

/// Grow each boundary by up to [`SPEECH_PAD_MS`], but never past the audio ends
/// and never more than halfway into the gap to the neighbouring segment, so
/// segments stay disjoint and no speech is transcribed twice. Segments that the
/// VAD already reported as overlapping are trimmed back to the gap midpoint.
fn pad_boundaries(raw: &[(f64, f64)], total_sec: f64) -> Vec<(f64, f64)> {
    let pad = SPEECH_PAD_MS / 1000.0;
    raw.iter()
        .enumerate()
        .map(|(i, &(start_sec, end_sec))| {
            // Leading/trailing silence has no neighbour to share with, so the
            // first and last boundaries may use the full pad.
            let start_floor = i
                .checked_sub(1)
                .map_or(0.0, |prev| start_sec - (start_sec - raw[prev].1) / 2.0);
            let end_ceil = raw
                .get(i + 1)
                .map_or(total_sec, |next| end_sec + (next.0 - end_sec) / 2.0);
            let start = (start_sec - pad).max(start_floor).max(0.0);
            let end = (end_sec + pad).min(end_ceil).min(total_sec);
            (start, end.max(start))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 1e-9, "{actual} != {expected}");
    }

    #[test]
    fn pads_into_surrounding_silence_without_overlapping() {
        let raw = vec![(1.0, 2.0), (5.0, 6.0)];
        let padded = pad_boundaries(&raw, 10.0);
        assert_close(padded[0].0, 0.8);
        assert_close(padded[0].1, 2.2);
        assert_close(padded[1].0, 4.8);
        assert_close(padded[1].1, 6.2);
    }

    #[test]
    fn pad_is_limited_to_half_the_gap_and_audio_bounds() {
        // 0.1 s gap between the segments, 0.05 s of audio either side.
        let raw = vec![(0.05, 1.0), (1.1, 2.0)];
        let padded = pad_boundaries(&raw, 2.05);
        assert_close(padded[0].0, 0.0);
        assert_close(padded[0].1, 1.05);
        assert_close(padded[1].0, 1.05);
        assert_close(padded[1].1, 2.05);
    }

    #[test]
    fn overlapping_input_segments_are_trimmed_to_the_midpoint() {
        let raw = vec![(0.0, 1.2), (1.0, 2.0)];
        let padded = pad_boundaries(&raw, 3.0);
        assert!(padded[0].1 <= padded[1].0, "segments must stay disjoint: {padded:?}");
    }
}
