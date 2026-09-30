mod session;

mod pyannote;
mod sortformer;
mod wav;

use eyre::Result;
use std::path::PathBuf;

/// Which diarization model runs, with the model files it needs.
#[derive(Clone, Debug)]
pub enum DiarizeBackend {
    /// NVIDIA Nemotron-3-Diarization (Sortformer v3). The accurate default; handles
    /// overlapping speech, labels at most [`SORTFORMER_MAX_SPEAKERS`] speakers.
    Sortformer { model_path: PathBuf },
    /// pyannote segmentation + WeSpeaker embeddings. Smaller download and lighter on
    /// memory; the only backend that can label more than 8 speakers.
    Pyannote {
        segment_model_path: PathBuf,
        embedding_model_path: PathBuf,
    },
}

/// The most speakers the Sortformer backend can tell apart.
pub const SORTFORMER_MAX_SPEAKERS: usize = sortformer::MAX_SPEAKERS;

#[derive(Clone, Debug)]
pub struct DiarizeOptions {
    pub backend: DiarizeBackend,
    /// Cosine-similarity threshold for starting a new speaker. Pyannote backend only.
    pub threshold: f32,
    /// Hard cap on distinct speakers (`usize::MAX` for no cap). Never exceeded; speech
    /// beyond the cap is attributed to the closest allowed speaker, not dropped.
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
    pub use crate::pyannote::embedding::EmbeddingExtractor;
    pub use crate::pyannote::identify::EmbeddingManager;
    pub use crate::pyannote::segment::{get_segments, Segment};
    pub use crate::sortformer::features::Sample;
    pub use crate::sortformer::model::SortformerModel;
    pub use crate::wav::read_wav;
    pub use knf_rs::{compute_fbank, convert_integer_to_float_audio};
}

/// Split `samples` (mono, 16 kHz for Sortformer) into disjoint, time-ordered speech
/// segments, each labelled with a speaker (`"1"`, `"2"`, ... by first appearance; `"?"`
/// when the pyannote backend cannot assign one).
pub fn diarize(
    samples: &[i16],
    sample_rate: u32,
    options: &DiarizeOptions,
    progress_callback: Option<&ProgressFn<'_>>,
    is_cancelled: Option<&(dyn Fn() -> bool + Send + Sync)>,
) -> Result<Vec<SpeechSegment>> {
    match &options.backend {
        DiarizeBackend::Sortformer { model_path } => sortformer::diarize(
            samples,
            sample_rate,
            model_path,
            options.max_speakers,
            progress_callback,
            is_cancelled,
        ),
        DiarizeBackend::Pyannote {
            segment_model_path,
            embedding_model_path,
        } => pyannote::diarize(
            samples,
            sample_rate,
            segment_model_path,
            embedding_model_path,
            options.threshold,
            options.max_speakers,
            progress_callback,
            is_cancelled,
        ),
    }
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
    fn sortformer_on_empty_audio_does_not_touch_the_model() {
        let options = DiarizeOptions {
            backend: DiarizeBackend::Sortformer {
                model_path: PathBuf::from("missing-sortformer.onnx"),
            },
            threshold: 0.5,
            max_speakers: usize::MAX,
        };
        assert!(diarize(&[], 16_000, &options, None, None).unwrap().is_empty());
    }

    #[test]
    fn sortformer_rejects_other_sample_rates() {
        let options = DiarizeOptions {
            backend: DiarizeBackend::Sortformer {
                model_path: PathBuf::from("missing-sortformer.onnx"),
            },
            threshold: 0.5,
            max_speakers: usize::MAX,
        };
        assert!(diarize(&[0; 100], 44_100, &options, None, None).is_err());
    }
}
