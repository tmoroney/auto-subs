//! SenseVoice speech recognition backend.

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{
    LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions, WordTimestamp,
};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::{
    sense_voice::{SenseVoiceModel, SenseVoiceParams},
    Quantization,
};
use transcribe_rs::{TranscriptionSegment, TranscriptionResult};

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

pub struct SenseVoiceEngine {
    model: SenseVoiceModel,
    params: SenseVoiceParams,
    detected_lang: Option<String>,
}

fn sense_voice_segments_to_words(segments: &[TranscriptionSegment], base_offset: f64) -> Vec<WordTimestamp> {
    let mut words: Vec<WordTimestamp> = Vec::new();
    let mut is_first_word = true;

    for t in segments {
        let had_word_marker = t.text.starts_with('\u{2581}');
        let mut w_text = t
            .text
            .replace('\u{2581}', " ")
            .trim_end_matches(|c: char| c.is_whitespace() || c == '\0')
            .to_string();
        if w_text.trim().is_empty() {
            continue;
        }

        if !had_word_marker && is_cjk_text(w_text.trim()) {
            w_text = format!(" {}", w_text.trim());
        }

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

    words
}

impl OnnxEngine for SenseVoiceEngine {
    const MAX_SEGMENT_SECONDS: f64 = MAX_SEGMENT_SECONDS;

    fn load(model_path: &Path) -> Result<Self> {
        let model = SenseVoiceModel::load(model_path, &Quantization::Int8)
            .map_err(|e| eyre!("Failed to load SenseVoice model: {}", e))?;

        Ok(Self {
            model,
            params: SenseVoiceParams {
                language: Some("auto".to_string()),
                use_itn: Some(true),
            },
            detected_lang: None,
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples, &self.params)
            .map_err(|e| eyre!("SenseVoice transcription failed: {}", e))
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::FromTokens { map: sense_voice_segments_to_words, interpolate_on_empty: true }
    }

    fn detected_lang(&self) -> Option<String> {
        self.detected_lang.clone()
    }
}

pub async fn transcribe_sense_voice(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("SenseVoice transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    let mut engine = SenseVoiceEngine::load(model_path)?;
    let lang = options.lang.clone().unwrap_or_else(|| "auto".to_string());
    engine.params.language = Some(lang.clone());
    engine.detected_lang = if lang == "auto" { None } else { Some(lang) };

    run_onnx_pipeline(
        engine,
        speech_segments,
        options.offset.unwrap_or(0.0),
        progress_callback,
        new_segment_callback,
        abort_callback,
    )
    .await
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
