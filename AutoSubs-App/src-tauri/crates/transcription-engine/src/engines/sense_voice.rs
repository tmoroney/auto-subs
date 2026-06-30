//! SenseVoice speech recognition backend.
//!
//! Wraps the transcribe-rs SenseVoice engine (FunAudioLLM SenseVoice, a
//! non-autoregressive multilingual ASR covering zh/en/ja/ko/yue). SenseVoice is
//! a CTC model, so transcribe-rs surfaces real per-token timestamps in
//! `TranscriptionResult.segments`. We group those subword tokens into word
//! timestamps (mirroring the Parakeet backend) and fall back to interpolation
//! only when the model does not return token timing.

use crate::types::{SpeechSegment, Segment, WordTimestamp, TranscribeOptions, LabeledProgressFn, NewSegmentFn, ProgressType};
use crate::utils::{interpolate_word_timestamps, split_speech_segment};
use eyre::{Result, bail, eyre};
use std::path::Path;
use transcribe_rs::onnx::{
    Quantization,
    sense_voice::{SenseVoiceModel, SenseVoiceParams},
};

// SenseVoice processes a whole clip in one non-autoregressive pass; cap chunk
// length to bound memory on very long speech segments.
const MAX_SEGMENT_SECONDS: f64 = 30.0;

/// Returns true if `s` is non-empty and consists solely of CJK characters
/// (Han ideographs, Hiragana, Katakana, Hangul, and fullwidth/halfwidth forms).
/// Used to synthesize word boundaries for SenseVoice CJK tokens that arrive
/// without the sentencepiece `▁` word-start marker.
fn is_cjk_text(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| {
           ('\u{3040}'..='\u{30FF}').contains(&c) // Hiragana + Katakana (incl. halfwidth katakana)
        || ('\u{3400}'..='\u{4DBF}').contains(&c) // CJK Unified Ideographs Extension A
        || ('\u{4E00}'..='\u{9FFF}').contains(&c) // CJK Unified Ideographs
        || ('\u{F900}'..='\u{FAFF}').contains(&c) // CJK Compatibility Ideographs
        || ('\u{AC00}'..='\u{D7AF}').contains(&c) // Hangul Syllables
        || ('\u{1100}'..='\u{11FF}').contains(&c) // Hangul Jamo
        || ('\u{3130}'..='\u{318F}').contains(&c) // Hangul Compatibility Jamo
        || ('\u{FF00}'..='\u{FFEF}').contains(&c) // Fullwidth/Halfwidth forms
    })
}

/// Transcribe audio segments using the SenseVoice engine.
///
/// Returns `(segments, detected_language)`. SenseVoice does not surface a
/// detected language, so we echo the requested language hint (or `None` when
/// the caller asked for auto-detection).
pub async fn transcribe_sense_voice(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("SenseVoice transcribe called with model: {:?}", model_path);

    // transcribe-rs 0.3.11 exposes no in-flight abort hook on SenseVoice, so we
    // can only stop between chunks. Bounding latency to one chunk (~30s) is far
    // better than running to completion. The upstream Tauri command maps any
    // error here to "Transcription cancelled" when SHOULD_CANCEL is set.
    let cancelled = || abort_callback.as_ref().map(|c| c()).unwrap_or(false);

    if cancelled() { bail!("Transcription cancelled"); }

    let mut model = SenseVoiceModel::load(model_path, &Quantization::Int8)
        .map_err(|e| eyre!("Failed to load SenseVoice model: {}", e))?;

    let lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
    let params = SenseVoiceParams {
        language: Some(lang.clone()),
        use_itn: Some(true),
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
            .map_err(|e| eyre!("SenseVoice transcription failed: {}", e))?;

        if cancelled() { bail!("Transcription cancelled"); }

        let text = result.text.trim().to_string();
        if text.is_empty() {
            if let Some(progress_callback) = progress_callback {
                let progress = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
                progress_callback(progress, ProgressType::Transcribe, "progressSteps.transcribe");
            }
            continue;
        }

        let base_offset = speech_segment.start + user_offset;
        let fallback_end = speech_segment.end + user_offset;

        // SenseVoice is a CTC model, so transcribe-rs returns real per-token
        // timestamps (subword pieces with the `▁` U+2581 word-start marker).
        // Build word timestamps from those, mirroring the Parakeet backend, and
        // fall back to interpolation only when token timing is unavailable.
        let mut words: Vec<WordTimestamp> = Vec::new();
        if let Some(token_segments) = &result.segments {
            let mut is_first_word = true;
            for t in token_segments {
                // Record whether the sentencepiece `▁` (U+2581) word-start marker
                // was present before stripping it; CJK tokens commonly arrive
                // without it (see the boundary synthesis below).
                let had_word_marker = t.text.starts_with('\u{2581}');
                // Convert the sentencepiece `▁` (U+2581) word-start marker into a
                // leading space. Because `▁` always sits at the front of a
                // word-initial token, this naturally yields a leading space for new
                // words and none for continuation pieces — exactly what the
                // formatter uses to decide spacing and merge subword fragments.
                let mut w_text = t
                    .text
                    .replace('\u{2581}', " ")
                    .trim_end_matches(|c: char| c.is_whitespace() || c == '\0')
                    .to_string();
                if w_text.trim().is_empty() {
                    continue;
                }

                // SenseVoice CJK output commonly emits adjacent Han/Kana/Hangul
                // tokens *without* the `▁` word-start marker. After the conversion
                // above those tokens have no leading boundary, so the formatter's
                // `merge_continuations` would treat zero-gap alphabetic tokens as
                // subword continuations and collapse an entire sentence into one
                // "word" — defeating both CJK caption wrapping and the per-token
                // timing this engine is meant to preserve. Synthesize a leading
                // space for markerless CJK tokens so each is treated as its own
                // word, mirroring how the `▁` marker delineates Latin words.
                if !had_word_marker && is_cjk_text(w_text.trim()) {
                    w_text = format!(" {}", w_text.trim());
                }

                // The first emitted word should not carry a leading space.
                if is_first_word {
                    w_text = w_text.trim_start().to_string();
                    if w_text.is_empty() {
                        continue;
                    }
                }

                words.push(WordTimestamp {
                    text: w_text,
                    start: base_offset + t.start as f64,
                    end: base_offset + t.end as f64,
                    probability: None,
                });

                is_first_word = false;
            }
        }

        let (seg_start, seg_end) = if let (Some(first), Some(last)) = (words.first(), words.last()) {
            (first.start, last.end)
        } else {
            // No token timing available: interpolate across the chunk window.
            let s = base_offset;
            let e = fallback_end;
            words = interpolate_word_timestamps(&text, s, e);
            (s, e)
        };

        let words_opt = (!words.is_empty()).then_some(words);

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

    let detected_lang = if lang == "auto" { None } else { Some(lang) };
    Ok((segments, detected_lang))
}

#[cfg(test)]
mod tests {
    use super::is_cjk_text;

    #[test]
    fn is_cjk_text_detects_cjk_scripts() {
        // Han
        assert!(is_cjk_text("你好"));
        assert!(is_cjk_text("世界"));
        // Hiragana / Katakana
        assert!(is_cjk_text("こんにちは"));
        assert!(is_cjk_text("テスト"));
        // Hangul
        assert!(is_cjk_text("안녕하세요"));
        // Mixed CJK scripts still count as CJK
        assert!(is_cjk_text("你好テスト안녕"));
    }

    #[test]
    fn is_cjk_text_rejects_latin_and_mixed() {
        assert!(!is_cjk_text(""));
        assert!(!is_cjk_text("hello"));
        assert!(!is_cjk_text("Hello"));
        // A Latin letter mixed into CJK disqualifies the token
        assert!(!is_cjk_text("你A好"));
        // Punctuation alone is not CJK text
        assert!(!is_cjk_text("。"));
    }

    /// Build the word texts the same way the transcription loop does, so this
    /// test pins the boundary-synthesis behavior that prevents
    /// `merge_continuations` from collapsing markerless CJK tokens.
    fn synthesize_word(raw_token: &str, is_first: bool) -> String {
        let had_word_marker = raw_token.starts_with('\u{2581}');
        let mut w_text = raw_token
            .replace('\u{2581}', " ")
            .trim_end_matches(|c: char| c.is_whitespace() || c == '\0')
            .to_string();
        if w_text.trim().is_empty() {
            return String::new();
        }
        if !had_word_marker && is_cjk_text(w_text.trim()) {
            w_text = format!(" {}", w_text.trim());
        }
        if is_first {
            w_text = w_text.trim_start().to_string();
        }
        w_text
    }

    #[test]
    fn cjk_tokens_without_marker_get_leading_space() {
        // First word: leading space is trimmed, but boundary is still recorded
        // (the token is its own word — no continuation merge into a predecessor).
        assert_eq!(synthesize_word("你好", true), "你好");
        // Subsequent markerless CJK tokens must gain a leading space so the
        // formatter treats each as a separate word instead of merging them.
        assert_eq!(synthesize_word("世界", false), " 世界");
        assert_eq!(synthesize_word("テスト", false), " テスト");
        assert_eq!(synthesize_word("안녕", false), " 안녕");
    }

    #[test]
    fn cjk_tokens_with_marker_keep_leading_space() {
        // Tokens that already carry the `▁` marker behave as before.
        assert_eq!(synthesize_word("▁你好", false), " 你好");
        assert_eq!(synthesize_word("▁你好", true), "你好");
    }

    #[test]
    fn latin_continuation_tokens_do_not_get_synthesized_boundary() {
        // A markerless Latin subword piece must NOT gain a leading space —
        // otherwise subword continuation merging would break.
        assert_eq!(synthesize_word("ing", false), "ing");
        assert_eq!(synthesize_word("▁play", false), " play");
    }
}
