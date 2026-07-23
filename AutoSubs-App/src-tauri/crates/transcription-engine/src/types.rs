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

// Shared callback types
pub type LabeledProgressFn = dyn Fn(i32, ProgressType, &str) + Send + Sync; // progress with type and label
pub type NewSegmentFn = dyn Fn(usize, &Segment) + Send + Sync; // (index, segment) new segment notifications

/// Owned callbacks shared between the pipeline and spawned worker tasks.
#[derive(Clone)]
pub struct Callbacks {
    pub progress: Option<Arc<LabeledProgressFn>>,
    pub new_segment_callback: Option<Arc<NewSegmentFn>>,
    pub is_cancelled: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
}

impl Default for Callbacks {
    fn default() -> Self {
        Self {
            progress: None,
            new_segment_callback: None,
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
    pub init_prompt: Option<String>, // Initial prompt for the model.
    pub diarize_threshold: Option<f32>, // Threshold for diarization
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
