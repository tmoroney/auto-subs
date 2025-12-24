//! Parakeet (NeMo) speech recognition backend.
//!
//! This module wraps the transcribe-rs Parakeet engine to provide
//! NVIDIA NeMo Parakeet speech-to-text capabilities.

use crate::types::{SpeechSegment, Segment, WordTimestamp, TranscribeOptions, LabeledProgressFn, NewSegmentFn, ProgressType};
use eyre::{Result, eyre};
use std::path::Path;
use transcribe_rs::{
    TranscriptionEngine,
    engines::parakeet::{ParakeetEngine, ParakeetModelParams, ParakeetInferenceParams, TimestampGranularity},
};

/// Transcribe audio segments using the Parakeet engine.
///
/// This function handles the conversion between internal types and transcribe-rs types,
/// and processes speech segments through the Parakeet model.
///
/// # Arguments
/// * `model_path` - Path to the Parakeet model directory
/// * `speech_segments` - Pre-processed speech segments from VAD/diarization
/// * `options` - Transcription options (note: Parakeet is English-only, language options are ignored)
/// * `progress_callback` - Optional callback for progress updates
/// * `new_segment_callback` - Optional callback for new segment notifications
/// * `_abort_callback` - Optional callback to check for cancellation (not yet implemented for Parakeet)
///
/// # Returns
/// A tuple of (segments, detected_language) where detected_language is always Some("en") for Parakeet.
pub async fn transcribe_parakeet(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    _abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Parakeet transcribe called with model: {:?}", model_path);

    // Create and load Parakeet engine
    let mut engine = ParakeetEngine::new();
    
    let model_params = ParakeetModelParams::int8();
    
    engine.load_model_with_params(model_path, model_params)
        .map_err(|e| eyre!("Failed to load Parakeet model: {}", e))?;

    // Configure inference for word-level timestamps
    let inference_params = ParakeetInferenceParams {
        timestamp_granularity: TimestampGranularity::Word,
    };

    // Apply user offset
    let user_offset = options.offset.unwrap_or(0.0);

    let mut segments: Vec<Segment> = Vec::new();
    let total_segments = speech_segments.len();

    for (i, speech_segment) in speech_segments.iter().enumerate() {
        // Convert i16 samples to f32 for Parakeet
        let samples: Vec<f32> = speech_segment.samples
            .iter()
            .map(|&s| s as f32 / 32768.0)
            .collect();

        // Transcribe this segment
        let result = engine.transcribe_samples(samples, Some(inference_params.clone()))
            .map_err(|e| eyre!("Parakeet transcription failed: {}", e))?;

        // Base offset for this chunk
        let base_offset = speech_segment.start + user_offset;

        // Convert transcribe-rs segments to our internal format
        if let Some(transcribe_segments) = result.segments {
            for seg in transcribe_segments {
                let seg_start = base_offset + seg.start as f64;
                let seg_end = base_offset + seg.end as f64;
                let text = seg.text.trim().to_string();

                if text.is_empty() {
                    continue;
                }

                // For Parakeet, we get word-level segments directly
                // Create word timestamps from the segment
                let words = Some(vec![WordTimestamp {
                    text: text.clone(),
                    start: seg_start,
                    end: seg_end,
                    probability: None,
                }]);

                // Prevent overlaps with previous segment
                if let Some(last) = segments.last_mut() {
                    if last.end > seg_start {
                        last.end = seg_start;
                    }
                    if let Some(last_words) = &mut last.words {
                        if let Some(last_word) = last_words.last_mut() {
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
                    words,
                };

                // Emit new segment callback
                if let Some(cb) = new_segment_callback {
                    cb(&segment);
                }

                segments.push(segment);
            }
        } else if !result.text.trim().is_empty() {
            // Fallback: if no segments but we have text, create a single segment
            let text = result.text.trim().to_string();
            let seg_start = base_offset;
            let seg_end = base_offset + (speech_segment.end - speech_segment.start);

            let segment = Segment {
                speaker_id: speech_segment.speaker_id.clone(),
                start: seg_start,
                end: seg_end,
                text: text.clone(),
                words: Some(vec![WordTimestamp {
                    text,
                    start: seg_start,
                    end: seg_end,
                    probability: None,
                }]),
            };

            if let Some(cb) = new_segment_callback {
                cb(&segment);
            }

            segments.push(segment);
        }

        // Emit progress update
        if let Some(progress_callback) = progress_callback {
            let progress = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
            progress_callback(progress, ProgressType::Transcribe, "Transcribing audio (Parakeet)");
        }
    }

    tracing::debug!("Parakeet transcription complete: {} segments", segments.len());

    Ok((segments, None))
}

/// Check if a model name refers to a Parakeet model.
pub fn is_parakeet_model(model_name: &str) -> bool {
    model_name.to_lowercase().starts_with("parakeet")
}
