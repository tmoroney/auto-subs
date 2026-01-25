use serde::{Deserialize, Serialize};

// Progress types for the labeled progress callback
#[derive(Clone, Debug, PartialEq)]
pub enum ProgressType {
    Download,
    Transcribe,
    Translate,
}

// Shared callback types
pub type LabeledProgressFn = dyn Fn(i32, ProgressType, &str) + Send + Sync;     // progress with type and label
pub type NewSegmentFn = dyn Fn(&Segment) + Send + Sync;           // new segment notifications

#[derive(Clone, Debug, Default)]
pub struct AdvancedTranscribe {
    pub sampling_strategy: Option<String>, // "beam_search" or "greedy"
    pub best_of_or_beam_size: Option<i32>, // The maximum width of the beam. Higher values are better (to a point) at the cost of exponential CPU time. Defaults to 5 in whisper.cpp. Will be clamped to at least 1.
    pub n_threads: Option<i32>, // Number of threads used for decoding. Defaults to min(4, std::thread::hardware_concurrency()).
    pub temperature: Option<f32>, // Temperature for sampling. Defaults to 0.7.
    pub max_text_ctx: Option<i32>, // The maximum number of tokens to keep in the text context. Defaults to 16000.
    pub init_prompt: Option<String>, // Initial prompt for the model.
    pub diarize_threshold: Option<f32>, // Threshold for diarization
}

// TranscribeOptions references AdvancedTranscribe optionally
#[derive(Clone, Debug)]
pub struct TranscribeOptions {
    pub offset: Option<f64>, // Move all timestamps forward by this amount (seconds) - useful for aligning with video timestamps
    pub model: String,
    pub lang: Option<String>,

    // If true, use Whisper's built-in translation-to-English during transcription.
    // Ignored if `translate_target` is set to a non-English language.
    pub whisper_to_english: Option<bool>,

    // If set, perform a post-pass translation of segments to this target language using Google Translate.
    // If set to "en", this takes precedence over `whisper_to_english` (for explicit control).
    pub translate_target: Option<String>,

    pub enable_vad: Option<bool>, // Enable Voice Activity Detection to isolate speech segments
    pub enable_diarize: Option<bool>, // Labels segments with speaker_id
    pub max_speakers: Option<usize>, // Max number of speakers to detect (otherwise auto detection may create too many speakers)
    pub advanced: Option<AdvancedTranscribe>, // Optional knobs
}

impl Default for TranscribeOptions {
    fn default() -> Self {
        Self {
            offset: Some(0.0),
            model: "base".to_string(), // Default to base model
            lang: Some("auto".to_string()),
            whisper_to_english: Some(false),
            translate_target: None,
            enable_vad: Some(true),
            enable_diarize: None,
            max_speakers: None,
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

// Internal struct for VAD and Pyannote diarization segments
#[derive(Debug, Clone)]
pub struct SpeechSegment {
    pub start: f64,
    pub end: f64,
    pub samples: Vec<i16>,
    pub speaker_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DiarizeOptions {
    pub segment_model_path: String,
    pub embedding_model_path: String,
    pub threshold: f32,
    pub max_speakers: usize,
}