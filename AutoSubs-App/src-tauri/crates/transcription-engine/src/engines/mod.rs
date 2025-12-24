//! Transcription engine backends.
//!
//! This module provides different speech recognition backends:
//! - **Whisper**: OpenAI's Whisper model via whisper-rs (GGML format)
//! - **Parakeet**: NVIDIA's NeMo Parakeet model via transcribe-rs (ONNX format)

pub mod whisper;

pub mod moonshine;
pub mod parakeet;

// Re-export commonly used items
pub use whisper::{create_context, run_transcription_pipeline, SHOULD_CANCEL};

pub use moonshine::transcribe_moonshine;
pub use parakeet::transcribe_parakeet;
