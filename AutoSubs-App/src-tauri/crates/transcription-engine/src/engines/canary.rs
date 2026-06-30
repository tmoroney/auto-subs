//! Canary speech recognition backend.
//!
//! Wraps the transcribe-rs Canary engine (NVIDIA NeMo Canary, multilingual
//! European-language ASR). Canary is an attention-based autoregressive
//! encoder/decoder whose ONNX decoder exposes no alignment signal, so
//! transcribe-rs returns `segments: None` and `supports_timestamps: false`.
//! Real token timestamps are therefore unavailable; word timestamps are
//! interpolated across each segment, mirroring the Moonshine backend. (Unlike
//! Canary, the CTC-based SenseVoice backend does surface real token timing.)

use crate::types::{SpeechSegment, Segment, TranscribeOptions, LabeledProgressFn, NewSegmentFn, ProgressType};
use crate::utils::{interpolate_word_timestamps, split_speech_segment};
use eyre::{Result, bail, eyre};
use std::path::Path;
use transcribe_rs::onnx::{
    Quantization,
    canary::{CanaryModel, CanaryParams},
};

// Canary encodes a whole clip per call; cap chunk length to bound memory.
const MAX_SEGMENT_SECONDS: f64 = 30.0;

/// Languages supported by Canary 1B v2 for both transcription and translation.
/// (Canary Flash supports only en/de/es/fr, but the manifest currently ships
/// only V2. If a Flash variant is added later, differentiate by model id.)
pub const CANARY_V2_LANGUAGES: &[&str] = &[
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt",
    "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
];

/// Returns true if Canary can natively translate from `from` to `to`.
/// Canary requires a concrete source language (no auto-detection) and both
/// languages must be in its supported set.
pub fn canary_supports_translation(from: &str, to: &str) -> bool {
    from != "auto"
        && CANARY_V2_LANGUAGES.contains(&from)
        && CANARY_V2_LANGUAGES.contains(&to)
}

/// Transcribe audio segments using the Canary engine.
///
/// Returns `(segments, detected_language)`. Canary does not surface a detected
/// language, so we echo the requested language hint. The source language must
/// be concrete (not `auto`); this function bails with a descriptive error if
/// the caller leaves it at `auto`, since Canary has no auto-detection and
/// silently coercing to English would corrupt non-English transcripts.
/// When `native_target` is `Some`, Canary's built-in translation is used to
/// translate each segment to that target language.
pub async fn transcribe_canary(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    native_target: Option<&str>,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Canary transcribe called with model: {:?}", model_path);

    // transcribe-rs 0.3.11 exposes no in-flight abort hook on Canary, so we can
    // only stop between chunks. Bounding latency to one chunk (~30s) is far
    // better than running to completion.
    let cancelled = || abort_callback.as_ref().map(|c| c()).unwrap_or(false);

    if cancelled() { bail!("Transcription cancelled"); }

    let mut model = CanaryModel::load(model_path, &Quantization::Int8)
        .map_err(|e| eyre!("Failed to load Canary model: {}", e))?;

    let lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
    // Canary is an attention-based ASR with no built-in language detection; it
    // requires a concrete source language hint. Silently coercing "auto" to
    // "en" would decode non-English audio with an English prompt, producing a
    // garbage transcript (and, if native translation is enabled, a translation
    // based on that garbage). Refuse instead so the UI can prompt the user to
    // pick an explicit supported language or switch to an auto-detecting engine
    // (Whisper/SenseVoice/Parakeet).
    if lang == "auto" {
        bail!(
            "Canary cannot auto-detect the source language. Please select an explicit \
             source language from Canary's supported set (e.g. en, de, es, fr, ...) or \
             use an auto-detecting engine such as Whisper, SenseVoice, or Parakeet."
        );
    }
    if !CANARY_V2_LANGUAGES.contains(&lang.as_str()) {
        bail!(
            "Canary does not support source language '{}'. Supported languages: {}",
            lang,
            CANARY_V2_LANGUAGES.join(", "),
        );
    }
    let params = CanaryParams {
        language: Some(lang.clone()),
        target_language: native_target.map(|t| t.to_string()),
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
            .map_err(|e| eyre!("Canary transcription failed: {}", e))?;

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

    // When native translation is used, the output language is the target.
    // Otherwise echo the requested language hint (which is guaranteed concrete
    // here, since "auto" was rejected above).
    let detected_lang = if let Some(t) = native_target {
        Some(t.to_string())
    } else {
        Some(lang)
    };
    Ok((segments, detected_lang))
}
