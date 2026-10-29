//! ONNX transcription plumbing vendored from `transcribe-rs` v0.3.11
//! (MIT, https://github.com/cjpais/transcribe-rs).
//!
//! AutoSubs previously consumed this crate for its ONNX pipelines; those
//! pipelines now live in `crate::engines` so keyword boosting can hook the
//! decode loops. What remains here is the shared plumbing they still use:
//! session setup and accelerator selection, decode utilities, mel/CMVN/LFR
//! feature extraction, the error type, and the transcription result types.

pub mod accel;
pub mod decode;
pub mod error;
pub mod features;
pub mod onnx;

pub use accel::{get_ort_accelerator, set_ort_accelerator, OrtAccelerator};
pub use error::TranscribeError;

/// The result of a transcription operation.
///
/// Contains both the full transcribed text and detailed timing information
/// for individual segments within the audio.
#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    /// The complete transcribed text from the audio
    pub text: String,
    /// Individual segments with timing information
    pub segments: Option<Vec<TranscriptionSegment>>,
}

impl TranscriptionResult {
    /// Shift all segment timestamps by `offset_secs`, clamping to zero.
    ///
    /// Use a negative offset to compensate for leading silence padding,
    /// or a positive offset to place a chunk within a longer audio stream.
    pub fn offset_timestamps(&mut self, offset_secs: f32) {
        if let Some(segs) = &mut self.segments {
            for seg in segs {
                seg.start = (seg.start + offset_secs).max(0.0);
                seg.end = (seg.end + offset_secs).max(0.0);
            }
        }
    }
}

/// A single transcribed segment with timing information.
///
/// Represents a portion of the transcribed audio with start and end timestamps
/// and the corresponding text content.
#[derive(Debug, Clone)]
pub struct TranscriptionSegment {
    /// Start time of the segment in seconds
    pub start: f32,
    /// End time of the segment in seconds
    pub end: f32,
    /// The transcribed text for this segment
    pub text: String,
}
