//! Real-audio regression test for the Sortformer backend, checked against the pyannote
//! backend on the same file. Like `example_audio.rs`, it needs local, gitignored
//! artifacts in the crate directory and skips when they are missing:
//!
//! ```text
//! wget https://github.com/thewh1teagle/pyannote-rs/releases/download/v0.1.0/6_speakers.wav
//! wget https://huggingface.co/altunenes/parakeet-rs/resolve/4d2a8bc71f5c896ec40faa59732e6716295edaf2/nemotron-3-diarization/nemotron3_diar_v3.onnx
//! wget https://huggingface.co/altunenes/speaker-diarization-community-1-onnx/resolve/main/segmentation-community-1.onnx
//! wget https://huggingface.co/altunenes/speaker-diarization-community-1-onnx/resolve/main/embedding_model.onnx
//! cargo test --release -p diarize --test sortformer_audio
//! ```

use diarize::{DiarizeBackend, DiarizeOptions, SpeechSegment};
use eyre::Result;
use std::collections::BTreeSet;
use std::path::Path;

const AUDIO: &str = "6_speakers.wav";
const SORTFORMER: &str = "nemotron3_diar_v3.onnx";
const SEGMENTATION: &str = "segmentation-community-1.onnx";
const EMBEDDING: &str = "embedding_model.onnx";

fn has_artifacts() -> bool {
    [AUDIO, SORTFORMER, SEGMENTATION, EMBEDDING]
        .iter()
        .all(|path| Path::new(path).exists())
}

fn run(samples: &[i16], sample_rate: u32, backend: DiarizeBackend) -> Result<Vec<SpeechSegment>> {
    let options = DiarizeOptions {
        backend,
        threshold: 0.5,
        max_speakers: usize::MAX,
    };
    diarize::diarize(samples, sample_rate, &options, None, None)
}

/// Seconds of `segment` covered by any of `covering`.
fn covered(segment: &SpeechSegment, covering: &[SpeechSegment]) -> f64 {
    covering
        .iter()
        .map(|c| (segment.end.min(c.end) - segment.start.max(c.start)).max(0.0))
        .sum()
}

#[test]
fn sortformer_keeps_every_utterance_pyannote_finds() -> Result<()> {
    if !has_artifacts() {
        eprintln!("skipping sortformer audio regression test: local ignored artifacts are missing");
        return Ok(());
    }

    let (samples, sample_rate) = diarize::raw::read_wav(AUDIO)?;
    let duration = samples.len() as f64 / sample_rate as f64;
    let sortformer = run(
        &samples,
        sample_rate,
        DiarizeBackend::Sortformer {
            model_path: SORTFORMER.into(),
        },
    )?;
    let pyannote = run(
        &samples,
        sample_rate,
        DiarizeBackend::Pyannote {
            segment_model_path: SEGMENTATION.into(),
            embedding_model_path: EMBEDDING.into(),
        },
    )?;

    // Output contract: disjoint, ordered, inside the audio, samples match the span.
    for pair in sortformer.windows(2) {
        assert!(pair[0].end <= pair[1].start, "overlapping segments: {pair:?}");
    }
    for segment in &sortformer {
        assert!(segment.start >= 0.0 && segment.end <= duration + 1e-6);
        let expected = ((segment.end - segment.start) * sample_rate as f64).round() as usize;
        assert!(segment.samples.len().abs_diff(expected) <= 1);
    }

    // Labels are "1".."N" with no gaps, first appearance first.
    let mut seen: Vec<String> = Vec::new();
    for id in sortformer.iter().filter_map(|s| s.speaker_id.clone()) {
        if !seen.contains(&id) {
            seen.push(id);
        }
    }
    let expected: Vec<String> = (1..=seen.len()).map(|n| n.to_string()).collect();
    assert_eq!(seen, expected);
    assert!((2..=8).contains(&seen.len()), "implausible speaker count {}", seen.len());

    // No utterance the former backend transcribes may disappear. This includes the last
    // one (39.4 s to 40.7 s), where Sortformer splits its probability between two
    // speakers and per-speaker thresholding outputs nothing.
    for segment in &pyannote {
        let length = segment.end - segment.start;
        let share = covered(segment, &sortformer) / length;
        assert!(
            share >= 0.5,
            "pyannote speech {:.2}-{:.2} is only {:.0}% covered by Sortformer",
            segment.start,
            segment.end,
            share * 100.0
        );
    }

    let speakers: BTreeSet<_> = pyannote.iter().filter_map(|s| s.speaker_id.clone()).collect();
    eprintln!(
        "sortformer: {} segments, {} speakers; pyannote: {} segments, {} speakers",
        sortformer.len(),
        seen.len(),
        pyannote.len(),
        speakers.len()
    );
    Ok(())
}
