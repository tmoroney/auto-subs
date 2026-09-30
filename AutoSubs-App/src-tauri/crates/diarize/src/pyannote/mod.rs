//! Lightweight backend: pyannote segmentation + WeSpeaker embeddings, assigned to
//! speakers online by cosine similarity. Smaller and lighter on memory than
//! Sortformer, and the only backend that can label more than 8 speakers.

pub(crate) mod embedding;
pub(crate) mod identify;
pub(crate) mod plda;
pub(crate) mod segment;

use crate::{ProgressFn, SpeechSegment};
use eyre::{eyre, Result};
use std::path::Path;

pub(crate) fn diarize(
    samples: &[i16],
    sample_rate: u32,
    segment_model_path: &Path,
    embedding_model_path: &Path,
    threshold: f32,
    max_speakers: usize,
    progress_callback: Option<&ProgressFn<'_>>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<Vec<SpeechSegment>> {
    let mut speech_segments = segment_speech(samples, sample_rate, segment_model_path)?;
    label_speakers(
        speech_segments.as_mut_slice(),
        embedding_model_path,
        threshold,
        max_speakers,
        progress_callback,
        is_cancelled,
    )?;
    Ok(speech_segments)
}

fn segment_speech(
    samples: &[i16],
    sample_rate: u32,
    segment_model_path: &Path,
) -> Result<Vec<SpeechSegment>> {
    let diarize_segments = segment::get_segments(samples, sample_rate, segment_model_path)?;
    let mut speech_segments = Vec::new();

    for segment in diarize_segments {
        let segment = segment?;
        speech_segments.push(SpeechSegment {
            start: segment.start,
            end: segment.end,
            samples: segment.samples,
            speaker_id: None,
        });
    }

    Ok(speech_segments)
}

fn label_speakers(
    speech_segments: &mut [SpeechSegment],
    embedding_model_path: &Path,
    threshold: f32,
    max_speakers: usize,
    progress_callback: Option<&ProgressFn<'_>>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<()> {
    if speech_segments.is_empty() {
        return Ok(());
    }

    let total_segments = speech_segments.len();
    let mut embedding_manager = identify::EmbeddingManager::new(max_speakers);
    let mut extractor = embedding::EmbeddingExtractor::new(embedding_model_path)
        .map_err(|e| eyre!("{:?}", e))?;

    for (i, segment) in speech_segments.iter_mut().enumerate() {
        if let Some(is_cancelled) = is_cancelled {
            if is_cancelled() {
                return Err(eyre!("Cancelled"));
            }
        }

        let embedding_result = extractor.compute(&segment.samples);
        let speaker = match embedding_result {
            Ok(embedding_vec) => {
                if embedding_manager.get_all_speakers().len() == max_speakers {
                    embedding_manager
                        .get_best_speaker_match(embedding_vec)
                        .map(|speaker| speaker.to_string())
                        .unwrap_or("?".into())
                } else {
                    embedding_manager
                        .search_speaker(embedding_vec, threshold)
                        .map(|speaker| speaker.to_string())
                        .unwrap_or("?".into())
                }
            }
            Err(error) => {
                tracing::error!("speaker embedding failed: {:?}", error);
                "?".into()
            }
        };

        segment.speaker_id = Some(speaker);

        if let Some(callback) = progress_callback {
            let pct = ((i + 1) as f64 / total_segments as f64 * 100.0) as i32;
            callback(pct);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_speaker_labeling_does_not_touch_models_or_cancellation() {
        let cancelled = || true;
        let mut segments = Vec::new();

        label_speakers(
            &mut segments,
            Path::new("missing-embedding.onnx"),
            0.5,
            2,
            None,
            Some(&cancelled),
        )
        .unwrap();
    }
}
