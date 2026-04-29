use crate::{plda::PLDA, session};
use eyre::{Context, ContextCompat, Result};
use ndarray::{Array1, Array2};
use ort::{session::Session, value::Tensor};
use std::path::Path;

#[derive(Debug)]
pub struct EmbeddingExtractor {
    session: Session,
    plda: Option<PLDA>,
}

impl EmbeddingExtractor {
    /// Create a new embedding extractor
    ///
    /// # Arguments
    /// * `model_path` - Path to the ONNX embedding model (e.g., embedding_model.onnx)
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let session = session::create_session(model_path.as_ref())?;
        Ok(Self {
            session,
            plda: None,
        })
    }

    /// Create a new embedding extractor with PLDA transformation
    ///
    /// # Arguments
    /// * `model_path` - Path to the ONNX embedding model
    /// * `xvec_transform_path` - Path to xvec_transform.npz
    /// * `plda_path` - Path to plda.npz
    /// * `lda_dimension` - LDA dimension (default: 128)
    pub fn new_with_plda<P: AsRef<Path>>(
        model_path: P,
        xvec_transform_path: P,
        plda_path: P,
        lda_dimension: usize,
    ) -> Result<Self> {
        let session = session::create_session(model_path.as_ref())?;
        let plda = PLDA::new(xvec_transform_path, plda_path, lda_dimension)?;
        Ok(Self {
            session,
            plda: Some(plda),
        })
    }

    /// Compute embeddings from audio samples
    ///
    /// Returns a Vec<f32> containing the embedding.
    /// If PLDA is enabled, the embedding is transformed to PLDA space (lda_dimension dims).
    /// Otherwise, returns raw embedding (256 dims).
    pub fn compute(&mut self, samples: &[i16]) -> Result<Vec<f32>> {
        // Convert to f32 precisely
        let mut samples_f32 = vec![0.0; samples.len()];
        knf_rs::convert_integer_to_float_audio(samples, &mut samples_f32);
        let samples = &samples_f32;

        let features: Array2<f32> = knf_rs::compute_fbank(samples)?;
        let (num_frames, num_bins) = features.dim();
        let feature_values = features
            .as_slice_memory_order()
            .context("fbank features should be contiguous")?
            .to_vec();
        let inputs = ort::inputs![
            "fbank_features" => Tensor::from_array(([1usize, num_frames, num_bins], feature_values))?
        ];

        let ort_outs = self.session.run(inputs)?;
        let ort_out = ort_outs
            .get("embeddings")
            .context("Output tensor 'embeddings' not found")?
            .try_extract_tensor::<f32>()
            .context("Failed to extract tensor")?;

        let raw_embeddings: Vec<f32> = ort_out.1.iter().copied().collect();
        // Apply PLDA transformation if available
        if let Some(plda) = &self.plda {
            // Convert f32 embeddings to f64 for PLDA transformation: see plda.rs
            let embedding_f64: Vec<f64> = raw_embeddings.iter().map(|&x| x as f64).collect();
            let embedding_array = Array1::from_vec(embedding_f64);
            let transformed = plda.transform(embedding_array.view());
            // Convert back to f32
            Ok(transformed.iter().map(|&x| x as f32).collect())
        } else {
            Ok(raw_embeddings)
        }
    }

    /// Get embedding dimension
    ///
    /// Returns lda_dimension if PLDA is enabled, otherwise returns raw embedding dimension
    pub fn embedding_dim(&self) -> usize {
        // PLDA dimension is typically 128, raw embedding is 256
        if self.plda.is_some() {
            128 // lda_dimension
        } else {
            256 // raw embedding dimension
        }
    }
}
