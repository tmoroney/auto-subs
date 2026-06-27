//! Transcription engine backends.
//!
//! This module provides different speech recognition backends:
//! - **Whisper**: OpenAI's Whisper model via whisper-rs (GGML format)
//! - **Parakeet**: NVIDIA's NeMo Parakeet model via transcribe-rs (ONNX format)
//! - **Moonshine**: Useful Sensors' Moonshine via transcribe-rs (ONNX format)
//! - **SenseVoice**: FunAudioLLM SenseVoice via transcribe-rs (ONNX format)

pub mod whisper;

pub mod canary;
pub mod cohere;
pub mod moonshine;
pub mod parakeet;
pub mod sense_voice;

// Re-export commonly used items
pub use whisper::{create_context, run_transcription_pipeline, SHOULD_CANCEL};

pub use canary::transcribe_canary;
pub use cohere::transcribe_cohere;
pub use moonshine::transcribe_moonshine;
pub use parakeet::transcribe_parakeet;
pub use sense_voice::transcribe_sense_voice;
