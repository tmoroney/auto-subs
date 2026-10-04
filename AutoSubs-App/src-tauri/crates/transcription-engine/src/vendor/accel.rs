//! Per-engine accelerator preferences.
//!
//! Each engine family has its own accelerator enum containing only the options
//! meaningful for that engine. Call the appropriate setter early in your program
//! before loading models.

use std::fmt;
use std::str::FromStr;
use std::sync::atomic::{AtomicU8, Ordering};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// ORT accelerator
// ---------------------------------------------------------------------------

/// Preferred hardware accelerator for ORT-based engines (SenseVoice, GigaAM, Parakeet, Moonshine).
///
/// Each variant requires its corresponding `ort-*` feature flag to be enabled at compile time.
/// If the selected accelerator's feature is not enabled, session creation falls back to CPU
/// with a log warning.
///
/// **Binary size note:** Enabling `ort-cuda` pulls in the CUDA execution provider libraries
/// (~800 MB+), significantly increasing the final binary and its runtime dependencies
/// (CUDA toolkit / cuDNN). Prefer `CpuOnly` or lighter providers unless GPU acceleration
/// is specifically required.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
#[repr(u8)]
pub enum OrtAccelerator {
    /// Automatically select the best available execution provider (default).
    /// DirectML and WebGPU are excluded from auto-selection because they
    /// require sequential execution mode; set them explicitly to use.
    Auto = 0,
    /// Force CPU-only execution — no GPU providers.
    #[serde(rename = "cpu", alias = "cpu_only")]
    CpuOnly = 1,
    /// NVIDIA CUDA (requires `ort-cuda` feature; adds ~800 MB to binary size).
    Cuda = 2,
    /// NVIDIA TensorRT (requires `ort-tensorrt` feature; builds on CUDA with optimised graph compilation).
    #[serde(rename = "tensorrt", alias = "tensor_rt")]
    TensorRt = 7,
    /// Microsoft DirectML (Windows).
    #[serde(rename = "directml", alias = "direct_ml")]
    DirectMl = 3,
    /// AMD ROCm.
    Rocm = 4,
    /// Apple CoreML (macOS/iOS — Neural Engine, GPU, or CPU).
    #[serde(rename = "coreml")]
    CoreMl = 5,
    /// WebGPU via Dawn (Windows, Linux, WebAssembly).
    #[serde(rename = "webgpu")]
    WebGpu = 6,
    /// XNNPACK CPU acceleration (ARM, x86_64). Optimised for Conv/Gemm/MatMul
    /// kernels; uses its own threadpool independent of the session intra-op pool.
    #[serde(rename = "xnnpack")]
    Xnnpack = 8,
}

static ORT_ACCELERATOR: AtomicU8 = AtomicU8::new(OrtAccelerator::Auto as u8);

/// Set the global ORT accelerator preference.
///
/// Call once, early in the program, before any ORT models are loaded.
pub fn set_ort_accelerator(pref: OrtAccelerator) {
    ORT_ACCELERATOR.store(pref as u8, Ordering::Relaxed);
}

/// Get the current ORT accelerator preference.
pub fn get_ort_accelerator() -> OrtAccelerator {
    OrtAccelerator::from_u8(ORT_ACCELERATOR.load(Ordering::Relaxed))
}

impl OrtAccelerator {
    /// Return the list of ORT accelerators that are compiled-in for the current build.
    ///
    /// Always includes `CpuOnly`. Only includes GPU accelerators whose corresponding
    /// feature flag is enabled.
    pub fn available() -> Vec<OrtAccelerator> {
        #[allow(unused_mut)]
        let mut v = vec![OrtAccelerator::CpuOnly];

        #[cfg(feature = "cuda")]
        v.push(OrtAccelerator::Cuda);

        #[cfg(any())]
        v.push(OrtAccelerator::TensorRt);

        #[cfg(feature = "directml")]
        v.push(OrtAccelerator::DirectMl);

        #[cfg(feature = "rocm")]
        v.push(OrtAccelerator::Rocm);

        #[cfg(feature = "coreml")]
        v.push(OrtAccelerator::CoreMl);

        #[cfg(any())]
        v.push(OrtAccelerator::WebGpu);

        #[cfg(any())]
        v.push(OrtAccelerator::Xnnpack);

        v
    }

    fn from_u8(val: u8) -> Self {
        match val {
            0 => Self::Auto,
            1 => Self::CpuOnly,
            2 => Self::Cuda,
            3 => Self::DirectMl,
            4 => Self::Rocm,
            5 => Self::CoreMl,
            6 => Self::WebGpu,
            7 => Self::TensorRt,
            8 => Self::Xnnpack,
            _ => Self::Auto,
        }
    }
}

impl Default for OrtAccelerator {
    fn default() -> Self {
        Self::Auto
    }
}

impl fmt::Display for OrtAccelerator {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Auto => "auto",
            Self::CpuOnly => "cpu",
            Self::Cuda => "cuda",
            Self::TensorRt => "tensorrt",
            Self::DirectMl => "directml",
            Self::Rocm => "rocm",
            Self::CoreMl => "coreml",
            Self::WebGpu => "webgpu",
            Self::Xnnpack => "xnnpack",
        };
        f.write_str(s)
    }
}

impl FromStr for OrtAccelerator {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "auto" => Ok(Self::Auto),
            "cpu" | "cpu_only" | "cpuonly" => Ok(Self::CpuOnly),
            "cuda" => Ok(Self::Cuda),
            "tensorrt" | "trt" | "tensor_rt" => Ok(Self::TensorRt),
            "directml" | "dml" => Ok(Self::DirectMl),
            "rocm" => Ok(Self::Rocm),
            "coreml" | "core_ml" => Ok(Self::CoreMl),
            "webgpu" | "web_gpu" => Ok(Self::WebGpu),
            "xnnpack" => Ok(Self::Xnnpack),
            other => Err(format!("unknown ORT accelerator: {other}")),
        }
    }

}
