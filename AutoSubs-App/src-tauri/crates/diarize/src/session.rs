use std::path::Path;

use eyre::{eyre, Result};
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;

pub fn create_session<P: AsRef<Path>>(path: P) -> Result<Session> {
    let session = Session::builder()
        .map_err(|e| eyre!("{e}"))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| eyre!("{e}"))?
        .with_intra_threads(1)
        .map_err(|e| eyre!("{e}"))?
        .with_inter_threads(1)
        .map_err(|e| eyre!("{e}"))?
        .commit_from_file(path.as_ref())
        .map_err(|e| eyre!("{e}"))?;
    Ok(session)
}
