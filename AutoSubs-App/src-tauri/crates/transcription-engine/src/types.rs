use serde::{Deserialize, Serialize};
use std::sync::Arc;

// Unified pipeline phases for the labeled progress callback
#[derive(Clone, Debug, PartialEq)]
pub enum ProgressType {
    Prepare,
    Analyze,
    Transcribe,
    Refine,
    Finish,
}

/// Which pipeline stage produced a segment update.
///
/// The same segment index can be emitted twice over a run — first when the
/// ASR engine produces it, then again once its word timings are refined by
/// forced alignment. The stage lets the UI tell "this is new text" apart from
/// "these timings were refined".
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SegmentStage {
    Transcribe,
    Translate,
    Align,
}

// Shared callback types
pub type LabeledProgressFn = dyn Fn(i32, ProgressType, &str) + Send + Sync; // progress with type and label
pub type NewSegmentFn = dyn Fn(usize, &Segment, SegmentStage) + Send + Sync; // (index, segment, stage) segment notifications
pub type SpeakersIdentifiedFn = dyn Fn(usize) + Send + Sync; // number of distinct speakers found by diarization

/// Owned callbacks shared between the pipeline and spawned worker tasks.
#[derive(Clone)]
pub struct Callbacks {
    pub progress: Option<Arc<LabeledProgressFn>>,
    pub new_segment_callback: Option<Arc<NewSegmentFn>>,
    pub speakers_identified: Option<Arc<SpeakersIdentifiedFn>>,
    pub is_cancelled: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
}

impl Default for Callbacks {
    fn default() -> Self {
        Self {
            progress: None,
            new_segment_callback: None,
            speakers_identified: None,
            is_cancelled: None,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct AdvancedTranscribe {
    pub sampling_strategy: Option<String>, // "beam_search" or "greedy"
    pub best_of_or_beam_size: Option<i32>, // The maximum width of the beam. Higher values are better (to a point) at the cost of exponential CPU time. Defaults to 5 in whisper.cpp. Will be clamped to at least 1.
    pub n_threads: Option<i32>, // Number of threads used for decoding. Defaults to min(4, std::thread::hardware_concurrency()).
    pub temperature: Option<f32>, // Temperature for sampling. Defaults to 0.7.
    pub max_text_ctx: Option<i32>, // The maximum number of tokens to keep in the text context. Defaults to 16000.
    pub init_prompt: Option<String>, // Initial prompt for the model (whisper only).
    pub keywords: Option<Vec<String>>, // Keyword phrases to boost during decoding (non-whisper engines). Parsed from the same custom prompt as init_prompt.
    pub diarize_threshold: Option<f32>, // Threshold for diarization
}

/// Which speaker-diarization model to run.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum DiarizeBackend {
    /// NVIDIA Sortformer: more accurate, handles overlapping speech, up to 8 speakers.
    #[default]
    Sortformer,
    /// pyannote + speaker embeddings: smaller download, less memory, any speaker count.
    Pyannote,
}

impl DiarizeBackend {
    /// Parse the frontend's value ("sortformer" / "pyannote"); anything else is `None`.
    pub fn from_name(name: &str) -> Option<Self> {
        match name.trim().to_ascii_lowercase().as_str() {
            "sortformer" => Some(Self::Sortformer),
            "pyannote" => Some(Self::Pyannote),
            _ => None,
        }
    }

    /// The backend that will actually run: Sortformer cannot label more speakers than
    /// its output channels, so a larger `max_speakers` falls back to pyannote.
    pub fn resolve(requested: Option<Self>, max_speakers: Option<usize>) -> Self {
        match requested.unwrap_or_default() {
            Self::Sortformer
                if max_speakers.is_some_and(|n| n > diarize::SORTFORMER_MAX_SPEAKERS) =>
            {
                Self::Pyannote
            }
            backend => backend,
        }
    }
}

// TranscribeOptions references AdvancedTranscribe optionally
#[derive(Clone, Debug)]
pub struct TranscribeOptions {
    pub offset: Option<f64>, // Move all timestamps forward by this amount (seconds) - useful for aligning with video timestamps
    pub model: String,
    pub lang: Option<String>,

    // If true, prefer the model's built-in translation when it supports the
    // (source, target) pair. Whisper can natively translate to English only;
    // Canary can natively translate between any of its supported languages.
    // If the model can't do native translation for the requested pair, falls
    // back to Google Translate post-pass (when `translate_target` is set).
    pub use_native_translation: Option<bool>,

    // Target language for translation. Always set when translation is enabled
    // (including "en"). The engine layer decides whether to fulfill this
    // natively or via Google Translate post-pass.
    pub translate_target: Option<String>,

    pub enable_vad: Option<bool>, // Enable Voice Activity Detection to isolate speech segments
    pub enable_diarize: Option<bool>, // Labels segments with speaker_id
    pub enable_forced_alignment: Option<bool>,
    pub max_speakers: Option<usize>, // Max number of speakers to detect (otherwise auto detection may create too many speakers)
    pub diarize_backend: Option<DiarizeBackend>, // None = default (Sortformer); see DiarizeBackend::resolve
    pub advanced: Option<AdvancedTranscribe>, // Optional knobs
}

impl Default for TranscribeOptions {
    fn default() -> Self {
        Self {
            offset: Some(0.0),
            model: "base".to_string(), // Default to base model
            lang: Some("auto".to_string()),
            use_native_translation: Some(false),
            translate_target: None,
            enable_vad: Some(true),
            enable_diarize: None,
            enable_forced_alignment: Some(false),
            max_speakers: None,
            diarize_backend: None,
            advanced: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordTimestamp {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probability: Option<f32>,
}

// Transcribe function will return a list of segments
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<WordTimestamp>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_id: Option<String>,
}

pub use diarize::SpeechSegment;

#[cfg(test)]
mod diarize_backend_tests {
    use super::DiarizeBackend;

    #[test]
    fn defaults_to_sortformer() {
        assert_eq!(DiarizeBackend::resolve(None, None), DiarizeBackend::Sortformer);
        assert_eq!(DiarizeBackend::resolve(None, Some(8)), DiarizeBackend::Sortformer);
    }

    #[test]
    fn more_than_eight_speakers_falls_back_to_pyannote() {
        assert_eq!(DiarizeBackend::resolve(None, Some(9)), DiarizeBackend::Pyannote);
        assert_eq!(
            DiarizeBackend::resolve(Some(DiarizeBackend::Sortformer), Some(10)),
            DiarizeBackend::Pyannote
        );
    }

    #[test]
    fn explicit_pyannote_is_respected() {
        assert_eq!(
            DiarizeBackend::resolve(Some(DiarizeBackend::Pyannote), Some(2)),
            DiarizeBackend::Pyannote
        );
    }

    #[test]
    fn parses_frontend_names() {
        assert_eq!(DiarizeBackend::from_name("Sortformer"), Some(DiarizeBackend::Sortformer));
        assert_eq!(DiarizeBackend::from_name("pyannote"), Some(DiarizeBackend::Pyannote));
        assert_eq!(DiarizeBackend::from_name("fast"), None);
    }
}
