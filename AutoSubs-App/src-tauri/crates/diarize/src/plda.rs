use eyre::{Context, Result};
use ndarray::{Array1, Array2, ArrayView1};
use std::path::Path;

/// PLDA transformation for speaker embeddings
///
/// Applies two transformations:
/// 1. X-vector transform (xvec_transform.npz) - centering and whitening
/// 2. PLDA transform (plda.npz) - LDA projection
#[derive(Debug)]
#[allow(dead_code)]
pub struct PLDA {
    /// X-vector transformation mean
    xvec_mean: Array1<f64>,
    /// X-vector transformation whitening matrix
    xvec_transform: Array2<f64>,
    /// PLDA mean
    plda_mean: Array1<f64>,
    /// PLDA transformation matrix
    plda_transform: Array2<f64>,
    /// PLDA psi (between-class covariance)
    plda_psi: Array1<f64>,
    /// LDA dimension to use (default 128)
    lda_dimension: usize,
}

#[allow(dead_code)]
impl PLDA {
    /// Load PLDA from xvec_transform.npz and plda.npz files
    pub fn new<P: AsRef<Path>>(
        xvec_transform_path: P,
        plda_path: P,
        lda_dimension: usize,
    ) -> Result<Self> {
        // Load xvec_transform.npz
        let mut xvec_npz = ndarray_npy::NpzReader::new(std::fs::File::open(xvec_transform_path.as_ref())?)?;


        let xvec_mean: Array1<f64> = xvec_npz.by_name("mean1.npy")
            .context("Failed to read mean1.npy from xvec_transform.npz")?;

        // Read lda as
        let xvec_lda_f32: Array2<f32> = xvec_npz.by_name("lda.npy")
            .context("Failed to read lda.npy from xvec_transform.npz")?;
        let xvec_transform = xvec_lda_f32.mapv(|x| x as f64);

        // Load plda.npz
        let mut plda_npz = ndarray_npy::NpzReader::new(std::fs::File::open(plda_path.as_ref())?)?;

        let plda_mean: Array1<f64> = plda_npz.by_name("mu.npy")
            .context("Failed to read mu.npy from plda.npz")?;

        let plda_transform: Array2<f64> = plda_npz.by_name("tr.npy")
            .context("Failed to read tr.npy from plda.npz")?;

        let plda_psi: Array1<f64> = plda_npz.by_name("psi.npy")
            .context("Failed to read psi.npy from plda.npz")?;

        Ok(Self {
            xvec_mean,
            xvec_transform,
            plda_mean,
            plda_transform,
            plda_psi,
            lda_dimension,
        })
    }

    /// x-vector transformation (centering and whitening)
    fn apply_xvec_transform(&self, embedding: ArrayView1<f64>) -> Array1<f64> {
        // Center: subtract mean
        let centered = &embedding - &self.xvec_mean;

        // Apply LDA transformation: result = centered @ lda^T
        // lda is (output_dim, input_dim), so we transpose it to (input_dim, output_dim)
        // Then centered (input_dim,) @ lda^T gives (output_dim,)
        self.xvec_transform.t().dot(&centered)
    }

    /// Apply PLDA transformation with LDA dimension
    fn apply_plda_transform(&self, xvec_transformed: ArrayView1<f64>) -> Array1<f64> {
        // Center: subtract PLDA mean
        let centered = &xvec_transformed - &self.plda_mean;

        // Apply PLDA transformation and take first lda_dimension dimensions
        let transformed = self.plda_transform.dot(&centered);

        // Return only the first lda_dimension elements
        transformed.slice(ndarray::s![..self.lda_dimension]).to_owned()
    }

    /// Transform embedding through both x-vector and PLDA transformations
    ///
    /// # Arguments
    /// * `embedding` - Raw embedding vector (e.g., 256 dimensions)
    ///
    /// # Returns
    /// Transformed embedding in PLDA space (lda_dimension dimensions, typically 128)
    pub fn transform(&self, embedding: ArrayView1<f64>) -> Array1<f64> {
        let xvec_transformed = self.apply_xvec_transform(embedding);
        self.apply_plda_transform(xvec_transformed.view())
    }

    /// Get the between-class covariance (phi) in PLDA space
    pub fn phi(&self) -> ArrayView1<f64> {
        self.plda_psi.slice(ndarray::s![..self.lda_dimension])
    }
}
