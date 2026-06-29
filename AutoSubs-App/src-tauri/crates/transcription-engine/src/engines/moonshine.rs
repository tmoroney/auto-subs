use crate::types::{SpeechSegment, Segment, TranscribeOptions, LabeledProgressFn, NewSegmentFn, ProgressType};
use eyre::{Result, bail, eyre};
use std::path::Path;
use transcribe_rs::onnx::{
    Quantization,
    moonshine::{MoonshineModel, MoonshineParams, MoonshineVariant},
};

const MAX_SEGMENT_SECONDS: f64 = 64.0;

use crate::utils::{interpolate_word_timestamps, split_speech_segment};

pub fn moonshine_variant_from_model_name(model_name: &str) -> Option<(MoonshineVariant, Option<&'static str>)> {
    let m = model_name.to_lowercase();
    let suffix = m.strip_prefix("moonshine-")?;

    let (variant, lang) = match suffix {
        "tiny" => (MoonshineVariant::Tiny, Some("en")),
        "tiny-ar" => (MoonshineVariant::TinyAr, Some("ar")),
        "tiny-zh" => (MoonshineVariant::TinyZh, Some("zh")),
        "tiny-ja" => (MoonshineVariant::TinyJa, Some("ja")),
        "tiny-ko" => (MoonshineVariant::TinyKo, Some("ko")),
        "tiny-uk" => (MoonshineVariant::TinyUk, Some("uk")),
        "tiny-vi" => (MoonshineVariant::TinyVi, Some("vi")),
        "base" => (MoonshineVariant::Base, Some("en")),
        "base-es" => (MoonshineVariant::BaseEs, Some("es")),
        _ => return None,
    };

    Some((variant, lang))
}

pub async fn transcribe_moonshine(
    model_path: &Path,
    variant: MoonshineVariant,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Moonshine transcribe called with model: {:?}", model_path);

    // transcribe-rs 0.3.11 exposes no in-flight abort hook on Moonshine, so we
    // can only stop between chunks (~64s max). Bounding latency is far better
    // than running to completion.
    let cancelled = || abort_callback.as_ref().map(|c| c()).unwrap_or(false);

    if cancelled() { bail!("Transcription cancelled"); }

    let mut model = MoonshineModel::load(model_path, variant, &Quantization::default())
        .map_err(|e| eyre!("Failed to load Moonshine model: {}", e))?;

    let params = MoonshineParams { max_length: None, ..Default::default() };
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
            .map_err(|e| eyre!("Moonshine transcription failed: {}", e))?;

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

    let detected_lang = moonshine_variant_from_model_name(&options.model)
        .and_then(|(_, lang)| lang)
        .map(|s| s.to_string());

    Ok((segments, detected_lang))
}
