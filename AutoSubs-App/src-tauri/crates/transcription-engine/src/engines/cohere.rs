//! Cohere speech recognition backend.
//!
//! Wraps the transcribe-rs Cohere engine (Cohere's transcription ONNX export).
//! Produces segment-level text; word timestamps are interpolated across each
//! segment, mirroring the Moonshine/SenseVoice backends.

use crate::types::{SpeechSegment, Segment, TranscribeOptions, LabeledProgressFn, NewSegmentFn, ProgressType};
use crate::utils::{interpolate_word_timestamps, split_speech_segment};
use eyre::{Result, bail, eyre};
use std::path::Path;
use transcribe_rs::onnx::{
    Quantization,
    cohere::{CohereModel, CohereParams},
};

// Cohere decodes autoregressively per clip; cap chunk length to bound work/memory.
const MAX_SEGMENT_SECONDS: f64 = 30.0;

/// Languages supported by Cohere's transcription ONNX export.
pub const COHERE_LANGUAGES: &[&str] = &[
    "en", "de", "fr", "it", "es", "pt", "el", "nl", "pl", "ar", "vi", "zh", "ja", "ko",
];

/// Transcribe audio segments using the Cohere engine.
///
/// Returns `(segments, detected_language)`. Cohere does not surface a detected
/// language, so we echo the requested language hint. The source language must
/// be concrete (not `auto`); this function bails with a descriptive error if
/// the caller leaves it at `auto`, since Cohere has no auto-detection and
/// silently coercing to English would corrupt non-English transcripts.
pub async fn transcribe_cohere(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Cohere transcribe called with model: {:?}", model_path);

    // transcribe-rs 0.3.11 exposes no in-flight abort hook on Cohere, so we can
    // only stop between chunks. Bounding latency to one chunk (~30s) is far
    // better than running to completion.
    let cancelled = || abort_callback.as_ref().map(|c| c()).unwrap_or(false);

    if cancelled() { bail!("Transcription cancelled"); }

    let mut model = CohereModel::load(model_path, &Quantization::Int4)
        .map_err(|e| eyre!("Failed to load Cohere model: {}", e))?;

    let lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
    // Cohere is an autoregressive ASR with no built-in language detection; it
    // requires a concrete source language hint. Silently coercing "auto" to
    // "en" (as the underlying library does) would decode non-English audio with
    // an English prompt, producing a garbage transcript. Refuse instead so the
    // UI can prompt the user to pick an explicit supported language or switch
    // to an auto-detecting engine (Whisper/SenseVoice/Parakeet).
    if lang == "auto" {
        bail!(
            "Cohere cannot auto-detect the source language. Please select an explicit \
             source language from Cohere's supported set (e.g. en, de, fr, ja, zh, ...) or \
             use an auto-detecting engine such as Whisper, SenseVoice, or Parakeet."
        );
    }
    if !COHERE_LANGUAGES.contains(&lang.as_str()) {
        bail!(
            "Cohere does not support source language '{}'. Supported languages: {}",
            lang,
            COHERE_LANGUAGES.join(", "),
        );
    }
    let params = CohereParams {
        language: Some(lang.clone()),
        ..Default::default()
    };
    let user_offset = options.offset.unwrap_or(0.0);

    let mut expanded: Vec<SpeechSegment> = Vec::new();
    for seg in &speech_segments {
        expanded.extend(split_speech_segment(seg, MAX_SEGMENT_SECONDS));
    }

    let total_segments = expanded.len().max(1);
    let mut segments: Vec<Segment> = Vec::new();

    for (i, speech_segment) in expanded.iter().enumerate() {
        if cancelled() { bail!("Transcription cancelled"); }

        let samples: Vec<f32> = speech_segment.samples
            .iter()
            .map(|&s| s as f32 / 32768.0)
            .collect();

        let result = model
            .transcribe_with(&samples, &params)
            .map_err(|e| eyre!("Cohere transcription failed: {}", e))?;

        if cancelled() { bail!("Transcription cancelled"); }

        let text = result.text.trim().to_string();
        if text.is_empty() {
            if let Some(progress_callback) = progress_callback {
                let progress = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
                progress_callback(progress, ProgressType::Transcribe, "progressSteps.transcribe");
            }
            continue;
        }

        let seg_start = speech_segment.start + user_offset;
        let seg_end = speech_segment.end + user_offset;

        let word_timestamps = interpolate_word_timestamps(&text, seg_start, seg_end);
        let words_opt = (!word_timestamps.is_empty()).then_some(word_timestamps);

        if let Some(last) = segments.last_mut() {
            if last.end > seg_start {
                last.end = seg_start;
            }
            if let Some(words) = &mut last.words {
                if let Some(last_word) = words.last_mut() {
                    if last_word.end > last.end {
                        last_word.end = last.end;
                    }
                }
            }
        }

        let segment = Segment {
            speaker_id: speech_segment.speaker_id.clone(),
            start: seg_start,
            end: seg_end,
            text,
            words: words_opt,
        };

        if let Some(cb) = new_segment_callback {
            cb(&segment);
        }

        segments.push(segment);

        if let Some(progress_callback) = progress_callback {
            let progress = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
            progress_callback(progress, ProgressType::Transcribe, "progressSteps.transcribe");
        }
    }

    let detected_lang = Some(lang);
    Ok((segments, detected_lang))
}
