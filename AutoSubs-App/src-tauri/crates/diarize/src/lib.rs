mod session;

mod embedding;
mod identify;
mod plda;
mod segment;
mod wav;

use eyre::{eyre, Result};
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct DiarizeOptions {
    pub segment_model_path: PathBuf,
    pub embedding_model_path: PathBuf,
    pub threshold: f32,
    pub max_speakers: usize,
}

#[derive(Debug, Clone)]
pub struct SpeechSegment {
    pub start: f64,
    pub end: f64,
    pub samples: Vec<i16>,
    pub speaker_id: Option<String>,
}

pub type ProgressFn<'a> = dyn Fn(i32) + Send + Sync + 'a;

#[doc(hidden)]
pub mod raw {
    pub use crate::embedding::EmbeddingExtractor;
    pub use crate::identify::EmbeddingManager;
    pub use crate::segment::{get_segments, Segment};
    pub use crate::wav::read_wav;
    pub use knf_rs::{compute_fbank, convert_integer_to_float_audio};
}

pub fn diarize(
    samples: &[i16],
    sample_rate: u32,
    options: &DiarizeOptions,
    progress_callback: Option<&ProgressFn<'_>>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<Vec<SpeechSegment>> {
    let mut speech_segments = segment_speech(samples, sample_rate, options)?;
    label_speakers(
        speech_segments.as_mut_slice(),
        options,
        progress_callback,
        is_cancelled,
    )?;
    Ok(speech_segments)
}

pub fn segment_speech(
    samples: &[i16],
    sample_rate: u32,
    options: &DiarizeOptions,
) -> Result<Vec<SpeechSegment>> {
    let diarize_segments = segment::get_segments(samples, sample_rate, &options.segment_model_path)?;
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

pub fn label_speakers(
    speech_segments: &mut [SpeechSegment],
    options: &DiarizeOptions,
    progress_callback: Option<&ProgressFn<'_>>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<()> {
    if speech_segments.is_empty() {
        return Ok(());
    }

    let total_segments = speech_segments.len();
    let mut embedding_manager = identify::EmbeddingManager::new(options.max_speakers);
    let mut extractor = embedding::EmbeddingExtractor::new(&options.embedding_model_path)
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
                if embedding_manager.get_all_speakers().len() == options.max_speakers {
                    embedding_manager
                        .get_best_speaker_match(embedding_vec)
                        .map(|speaker| speaker.to_string())
                        .unwrap_or("?".into())
                } else {
                    embedding_manager
                        .search_speaker(embedding_vec, options.threshold)
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
    fn segment_speaker_id_defaults_to_none() {
        let segment = SpeechSegment {
            start: 0.0,
            end: 1.0,
            samples: vec![0; 16_000],
            speaker_id: None,
        };

        assert_eq!(segment.speaker_id, None);
    }

    #[test]
    fn empty_speaker_labeling_does_not_touch_models_or_cancellation() {
        let options = DiarizeOptions {
            segment_model_path: PathBuf::from("missing-segmentation.onnx"),
            embedding_model_path: PathBuf::from("missing-embedding.onnx"),
            threshold: 0.5,
            max_speakers: 2,
        };
        let cancelled = || true;
        let mut segments = Vec::new();

        label_speakers(&mut segments, &options, None, Some(&cancelled)).unwrap();
    }
}
