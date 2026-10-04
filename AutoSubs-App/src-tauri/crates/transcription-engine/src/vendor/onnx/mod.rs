//! ONNX session plumbing vendored from `transcribe-rs` v0.3.11 (MIT).
//! The model pipelines themselves live in `crate::engines`.

pub mod session;

/// Preferred precision for ONNX model loading.
///
/// This selects which model file variant to load. If the requested
/// variant is not found on disk, falls back to FP32 with a warning.
/// ONNX quantization is baked into the model file — this enum controls
/// file selection, not runtime behavior.
#[derive(Debug, Clone, Default, PartialEq)]
pub enum Quantization {
    #[default]
    FP32,
    FP16,
    Int8,
    Int4,
}
