pub mod audio;
pub mod engine;
pub mod engines;
pub mod model_manager;
pub mod vad;
pub mod types;
pub mod translate;
pub mod utils;
pub mod formatting;
pub mod speaker;

// Re-exports (crate users only need these)
pub use engine::{Engine, EngineConfig, Callbacks};
pub use vad::get_segments;
pub use types::{TranscribeOptions, Segment, WordTimestamp, ProgressType};
pub use model_manager::ModelManager;
pub use utils::{get_translate_languages, get_whisper_languages};
pub use formatting::{PostProcessConfig, process_segments, FormattingOverrides, apply_overrides};

/// Convenience function to list all cached Whisper models.
/// Creates a temporary Engine with default config (except cache_dir) to access the cache.
pub fn list_cached_models(cache_dir: &std::path::Path) -> eyre::Result<Vec<String>> {
    let mut config = EngineConfig::default();
    config.cache_dir = cache_dir.to_path_buf();
    let engine = Engine::new(config);
    engine.list_cached_models()
}

/// Convenience function to delete a cached Whisper model.
/// Creates a temporary Engine with default config (except cache_dir) to access the cache.
/// Returns true if successfully deleted, false if model doesn't exist or deletion failed.
pub fn delete_cached_model(cache_dir: &std::path::Path, model_name: &str) -> bool {
    let mut config = EngineConfig::default();
    config.cache_dir = cache_dir.to_path_buf();
    let engine = Engine::new(config);
    engine.delete_cached_model(model_name)
}