use crate::types::{SpeechSegment, Segment, WordTimestamp, TranscribeOptions, LabeledProgressFn, NewSegmentFn, ProgressType};
use eyre::{Result, eyre};
use std::path::Path;
use transcribe_rs::{
    TranscriptionEngine,
    engines::moonshine::{ModelVariant, MoonshineEngine, MoonshineInferenceParams, MoonshineModelParams},
};

const SAMPLE_RATE: usize = 16000;
const MAX_SEGMENT_SECONDS: f64 = 64.0;

fn interpolate_word_timestamps(line: &str, start: f64, end: f64) -> Vec<WordTimestamp> {
    let dur = (end - start).max(0.0);
    if dur <= 0.0 { return Vec::new(); }

    let tokens: Vec<&str> = line
        .split_whitespace()
        .filter(|t| !t.trim_matches('\0').trim().is_empty())
        .collect();
    if tokens.is_empty() { return Vec::new(); }

    let weights: Vec<usize> = tokens
        .iter()
        .map(|t| t.chars().filter(|c| c.is_alphanumeric()).count().max(1))
        .collect();
    let total_w: usize = weights.iter().sum();
    if total_w == 0 { return Vec::new(); }

    let mut out: Vec<WordTimestamp> = Vec::with_capacity(tokens.len());
    let mut acc = 0usize;
    for (i, tok) in tokens.iter().enumerate() {
        let t0 = start + (acc as f64 / total_w as f64) * dur;
        let t1 = if i + 1 == tokens.len() {
            end
        } else {
            start + ((acc + weights[i]) as f64 / total_w as f64) * dur
        };
        acc += weights[i];
        // formatting.rs infers `leading_space` from WordTimestamp.text starting with a space/newline.
        // Without this, it treats every token as a continuation piece and may merge whole sentences.
        let text = if i == 0 {
            (*tok).to_string()
        } else {
            format!(" {}", tok)
        };
        out.push(WordTimestamp { text, start: t0, end: t1, probability: None });
    }
    out
}

fn split_speech_segment(seg: &SpeechSegment, max_seconds: f64) -> Vec<SpeechSegment> {
    let max_samples = (max_seconds * SAMPLE_RATE as f64) as usize;
    if seg.samples.len() <= max_samples {
        return vec![seg.clone()];
    }

    let mut out = Vec::new();
    let mut idx = 0usize;
    while idx < seg.samples.len() {
        let end_idx = (idx + max_samples).min(seg.samples.len());
        let start_s = idx as f64 / SAMPLE_RATE as f64;
        let end_s = end_idx as f64 / SAMPLE_RATE as f64;
        out.push(SpeechSegment {
            start: seg.start + start_s,
            end: seg.start + end_s,
            samples: seg.samples[idx..end_idx].to_vec(),
            speaker_id: seg.speaker_id.clone(),
        });
        idx = end_idx;
    }
    out
}

pub fn is_moonshine_model(model_name: &str) -> bool {
    model_name.to_lowercase().starts_with("moonshine-")
}

pub fn moonshine_variant_from_model_name(model_name: &str) -> Option<(ModelVariant, Option<&'static str>)> {
    let m = model_name.to_lowercase();
    let suffix = m.strip_prefix("moonshine-")?;

    let (variant, lang) = match suffix {
        "tiny" => (ModelVariant::Tiny, Some("en")),
        "tiny-ar" => (ModelVariant::TinyAr, Some("ar")),
        "tiny-zh" => (ModelVariant::TinyZh, Some("zh")),
        "tiny-ja" => (ModelVariant::TinyJa, Some("ja")),
        "tiny-ko" => (ModelVariant::TinyKo, Some("ko")),
        "tiny-uk" => (ModelVariant::TinyUk, Some("uk")),
        "tiny-vi" => (ModelVariant::TinyVi, Some("vi")),
        "base" => (ModelVariant::Base, Some("en")),
        "base-es" => (ModelVariant::BaseEs, Some("es")),
        _ => return None,
    };

    Some((variant, lang))
}

pub async fn transcribe_moonshine(
    model_path: &Path,
    variant: ModelVariant,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    _abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Moonshine transcribe called with model: {:?}", model_path);

    let mut engine = MoonshineEngine::new();
    engine
        .load_model_with_params(model_path, MoonshineModelParams::variant(variant))
        .map_err(|e| eyre!("Failed to load Moonshine model: {}", e))?;

    let params = MoonshineInferenceParams { max_length: None };
    let user_offset = options.offset.unwrap_or(0.0);

    let mut expanded: Vec<SpeechSegment> = Vec::new();
    for seg in &speech_segments {
        expanded.extend(split_speech_segment(seg, MAX_SEGMENT_SECONDS));
    }

    let total_segments = expanded.len().max(1);
    let mut segments: Vec<Segment> = Vec::new();

    for (i, speech_segment) in expanded.iter().enumerate() {
        let samples: Vec<f32> = speech_segment.samples
            .iter()
            .map(|&s| s as f32 / 32768.0)
            .collect();

        let result = engine
            .transcribe_samples(samples, Some(params.clone()))
            .map_err(|e| eyre!("Moonshine transcription failed: {}", e))?;

        let text = result.text.trim().to_string();
        if text.is_empty() {
            if let Some(progress_callback) = progress_callback {
                let progress = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
                progress_callback(progress, ProgressType::Transcribe, "Transcribing audio (Moonshine)");
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
            progress_callback(progress, ProgressType::Transcribe, "Transcribing audio (Moonshine)");
        }
    }

    let detected_lang = moonshine_variant_from_model_name(&options.model)
        .and_then(|(_, lang)| lang)
        .map(|s| s.to_string());

    Ok((segments, detected_lang))
}
