#[cfg(feature = "coreml")]
use ort::ep::CoreML;
#[cfg(feature = "directml")]
use ort::ep::DirectML;
#[cfg(feature = "rocm")]
use ort::ep::ROCm;
#[cfg(any())]
use ort::ep::TensorRT;
#[cfg(any())]
use ort::ep::WebGPU;
#[cfg(any())]
use ort::ep::XNNPACK;
use ort::ep::CPU;
#[cfg(feature = "cuda")]
use ort::ep::CUDA;

use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use std::path::Path;

use crate::vendor::accel::{get_ort_accelerator, OrtAccelerator};

/// Build the execution provider list based on the global accelerator preference.
fn execution_providers() -> Vec<ort::ep::ExecutionProviderDispatch> {
    let pref = get_ort_accelerator();
    let mut eps = Vec::new();

    match pref {
        OrtAccelerator::CpuOnly => {
            // CPU only — no GPU providers
        }
        OrtAccelerator::Cuda => {
            #[cfg(feature = "cuda")]
            eps.push(CUDA::default().build());
            #[cfg(not(feature = "cuda"))]
            tracing::warn!(
                "Accelerator set to CUDA but ort-cuda feature is not enabled; falling back to CPU"
            );
        }
        OrtAccelerator::TensorRt => {
            #[cfg(any())]
            {
                eps.push(TensorRT::default().build());
                // CUDA as fallback for ops TensorRT doesn't support
                eps.push(CUDA::default().build());
            }
            tracing::warn!(
                "Accelerator set to TensorRT but ort-tensorrt feature is not enabled; falling back to CPU"
            );
        }
        OrtAccelerator::DirectMl => {
            #[cfg(feature = "directml")]
            eps.push(DirectML::default().build());
            #[cfg(not(feature = "directml"))]
            tracing::warn!("Accelerator set to DirectML but ort-directml feature is not enabled; falling back to CPU");
        }
        OrtAccelerator::Rocm => {
            #[cfg(feature = "rocm")]
            eps.push(ROCm::default().build());
            #[cfg(not(feature = "rocm"))]
            tracing::warn!(
                "Accelerator set to ROCm but ort-rocm feature is not enabled; falling back to CPU"
            );
        }
        OrtAccelerator::CoreMl => {
            #[cfg(feature = "coreml")]
            eps.push(CoreML::default().build());
            #[cfg(not(feature = "coreml"))]
            tracing::warn!(
                "Accelerator set to CoreML but ort-coreml feature is not enabled; falling back to CPU"
            );
        }
        OrtAccelerator::WebGpu => {
            #[cfg(any())]
            eps.push(WebGPU::default().build());
            tracing::warn!(
                "Accelerator set to WebGPU but ort-webgpu feature is not enabled; falling back to CPU"
            );
        }
        OrtAccelerator::Xnnpack => {
            #[cfg(any())]
            {
                // XNNPACK manages its own threadpool. Configure it with the
                // available logical core count; the session-level intra-op
                // pool is forced to 1 in build_session() when XNNPACK is
                // active to avoid contention.
                let n = std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(1);
                if let Some(nz) = core::num::NonZeroUsize::new(n) {
                    eps.push(XNNPACK::default().with_intra_op_num_threads(nz).build());
                } else {
                    eps.push(XNNPACK::default().build());
                }
            }
            tracing::warn!(
                "Accelerator set to XNNPACK but ort-xnnpack feature is not enabled; falling back to CPU"
            );
        }
        OrtAccelerator::Auto => {
            // Add compiled-in GPU EPs in priority order.
            // DirectML and WebGPU are excluded from Auto because they require
            // parallel_execution(false) and memory_pattern(false),
            // which would penalize other backends. Use the explicit variant
            // to opt in.
            // Ref: https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
            //      https://onnxruntime.ai/docs/execution-providers/WebGPU-ExecutionProvider.html
            // TensorRT before CUDA so it gets first crack; CUDA handles unsupported ops.
            #[cfg(any())]
            eps.push(TensorRT::default().build());
            #[cfg(feature = "cuda")]
            eps.push(CUDA::default().build());
            #[cfg(feature = "rocm")]
            eps.push(ROCm::default().build());
            // CoreML is safe for Auto on macOS — analogous to CUDA on NVIDIA
            // and ROCm on AMD. It does not require sequential execution or
            // disabled memory patterns.
            #[cfg(feature = "coreml")]
            eps.push(CoreML::default().build());
        }
    }

    // CPU is always the final fallback
    eps.push(CPU::default().build());
    eps
}

/// Returns true if the selected execution provider requires sequential execution
/// and disabled memory patterns (DirectML, WebGPU).
fn requires_sequential_session() -> bool {
    let pref = get_ort_accelerator();
    (pref == OrtAccelerator::DirectMl && cfg!(feature = "directml"))
        || (pref == OrtAccelerator::WebGpu && cfg!(any()))
}

/// Returns true if the XNNPACK EP is selected and compiled in. XNNPACK runs
/// its own threadpool, so the session intra-op pool should be reduced to a
/// single non-spinning thread to avoid contention.
fn is_xnnpack_active() -> bool {
    let pref = get_ort_accelerator();
    pref == OrtAccelerator::Xnnpack && cfg!(any())
}

/// Internal session builder with full control over threading and EP selection.
fn build_session(
    path: &Path,
    intra_threads: Option<usize>,
    parallel_execution: bool,
) -> Result<Session, ort::Error> {
    let mut builder =
        Session::builder()?.with_optimization_level(GraphOptimizationLevel::Level3)?;

    if is_xnnpack_active() {
        // See ort::ep::XNNPACK docs: disable session intra-op spinning and
        // force a single intra-op thread when XNNPACK is the active EP.
        builder = builder.with_intra_op_spinning(false)?;
        builder = builder.with_intra_threads(1)?;
    } else if let Some(n) = intra_threads {
        if n > 0 {
            builder = builder.with_intra_threads(n)?;
        }
    }

    // DirectML and WebGPU require parallel_execution(false) and memory_pattern(false)
    let use_parallel = if requires_sequential_session() {
        false
    } else {
        parallel_execution
    };

    builder = builder.with_parallel_execution(use_parallel)?;

    if requires_sequential_session() {
        builder = builder.with_memory_pattern(false)?;
    }

    let session = builder
        .with_execution_providers(execution_providers())?
        .commit_from_file(path)?;

    for input in session.inputs() {
        tracing::info!(
            "Model input: name={}, type={:?}",
            input.name(),
            input.dtype()
        );
    }
    for output in session.outputs() {
        tracing::info!(
            "Model output: name={}, type={:?}",
            output.name(),
            output.dtype()
        );
    }

    Ok(session)
}

/// Create an ONNX session with standard settings.
pub fn create_session(path: &Path) -> Result<Session, ort::Error> {
    build_session(path, None, true)
}

/// Create an ONNX session with configurable thread count.
pub fn create_session_with_threads(path: &Path, num_threads: usize) -> Result<Session, ort::Error> {
    build_session(path, Some(num_threads), true)
}

/// Resolve a model file path for the requested quantization level.
///
/// Looks for `{name}.{suffix}.onnx` based on the quantization variant,
/// falling back to `{name}.onnx` (FP32) if the requested file doesn't exist.
pub fn resolve_model_path(
    dir: &Path,
    name: &str,
    quantization: &super::Quantization,
) -> std::path::PathBuf {
    let suffix = match quantization {
        super::Quantization::FP32 => None,
        super::Quantization::FP16 => Some("fp16"),
        super::Quantization::Int8 => Some("int8"),
        super::Quantization::Int4 => Some("int4"),
    };

    if let Some(suffix) = suffix {
        let path = dir.join(format!("{name}.{suffix}.onnx"));
        if path.exists() {
            tracing::info!("Loading {} model: {}", suffix, path.display());
            return path;
        }
        tracing::warn!(
            "{} model not found at {}, falling back to {}.onnx",
            suffix,
            path.display(),
            name
        );
    }

    dir.join(format!("{name}.onnx"))
}

/// Read a custom metadata string from an ONNX session.
pub fn read_metadata_str(session: &Session, key: &str) -> Result<Option<String>, ort::Error> {
    let meta = session.metadata()?;
    Ok(meta.custom(key).filter(|s| !s.is_empty()))
}

/// Read a custom metadata i32 value, with optional default.
pub fn read_metadata_i32(
    session: &Session,
    key: &str,
    default: Option<i32>,
) -> Result<Option<i32>, crate::vendor::TranscribeError> {
    let str_val = read_metadata_str(session, key).map_err(|e| {
        crate::vendor::TranscribeError::Config(format!("failed to read metadata '{key}': {e}"))
    })?;
    match str_val {
        Some(v) => Ok(Some(v.parse::<i32>().map_err(|e| {
            crate::vendor::TranscribeError::Config(format!("failed to parse '{key}': {e}"))
        })?)),
        None => Ok(default),
    }
}

/// Read a comma-separated float vector from metadata.
pub fn read_metadata_float_vec(
    session: &Session,
    key: &str,
) -> Result<Option<Vec<f32>>, crate::vendor::TranscribeError> {
    let str_val = read_metadata_str(session, key).map_err(|e| {
        crate::vendor::TranscribeError::Config(format!("failed to read metadata '{key}': {e}"))
    })?;
    match str_val {
        Some(v) => {
            let floats: Result<Vec<f32>, _> =
                v.split(',').map(|s| s.trim().parse::<f32>()).collect();
            Ok(Some(floats.map_err(|e| {
                crate::vendor::TranscribeError::Config(format!(
                    "failed to parse floats in '{key}': {e}"
                ))
            })?))
        }
        None => Ok(None),
    }
}
