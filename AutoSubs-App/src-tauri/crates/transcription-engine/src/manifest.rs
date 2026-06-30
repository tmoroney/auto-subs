//! Compile-time model manifest.
//!
//! The single source of truth for *where to download each model from* and the
//! display metadata shown in the UI lives in `AutoSubs-App/models.json`. That
//! file is embedded into the binary at build time via [`include_str!`] and
//! parsed once into [`MANIFEST`]. The same JSON is imported directly by the
//! frontend (`src/lib/models.ts`) so the two never drift.
//!
//! To add a model hosted on Hugging Face, add an entry to `models.json` — for
//! engines that already have a wrapper this requires no Rust changes.
//!
//! NOTE (step 1): this module currently only *describes* the existing models.
//! Wiring `model_manager` / `engine` routing to consume it happens in later
//! steps, so adding this module is a no-op at runtime.

use once_cell::sync::Lazy;
use serde::Deserialize;

/// Raw manifest JSON, embedded at compile time.
///
/// Path is relative to this source file:
/// `crates/transcription-engine/src/` → `../../../../models.json` is
/// `AutoSubs-App/models.json` (shared by the Rust crate and the Vite frontend).
pub const MANIFEST_JSON: &str = include_str!("../../../../models.json");

/// Parsed manifest. Panics at first access if `models.json` is malformed, which
/// — together with the tests below — turns a bad manifest into a build/test
/// failure rather than a runtime surprise.
pub static MANIFEST: Lazy<Manifest> = Lazy::new(|| {
    serde_json::from_str(MANIFEST_JSON)
        .expect("AutoSubs-App/models.json is malformed (compile-time model manifest)")
});

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub models: Vec<ModelEntry>,
    /// Voice-activity detection model (auto-downloaded, not user-selectable).
    pub vad: VadModel,
    /// Speaker diarization model (user-downloadable, has a UI card).
    pub diarize: DiarizeModel,
}

/// Silero VAD model, fetched on demand during transcription.
#[derive(Debug, Clone, Deserialize)]
pub struct VadModel {
    /// `owner/name`.
    pub repo: String,
    /// Single model filename within the repo.
    pub file: String,
}

/// Speaker diarization bundle (a user-downloadable model with a UI card).
#[derive(Debug, Clone, Deserialize)]
pub struct DiarizeModel {
    /// Stable id used in cache list/delete (e.g. "speaker-diarize").
    pub id: String,
    /// `owner/name`.
    pub repo: String,
    /// The ONNX files that make up the bundle.
    pub files: Vec<String>,
    #[serde(default)]
    pub ui: Option<Ui>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelEntry {
    /// Stable identifier used everywhere: UI value, cache lookups, routing.
    pub id: String,
    /// Which transcribe-rs backend loads this model.
    pub engine: Engine,
    /// Quantization handed to the ONNX loaders (ignored by the Whisper engine).
    #[serde(default)]
    pub quantization: Option<Quant>,
    /// Moonshine variant key (e.g. "tiny", "tiny-ar"). Only set for Moonshine.
    #[serde(rename = "moonshineVariant", default)]
    pub moonshine_variant: Option<String>,
    /// Where the model files come from.
    pub source: Source,
    /// Display metadata consumed by the frontend. Optional for backend-only use.
    #[serde(default)]
    pub ui: Option<Ui>,
}

impl ModelEntry {
    /// The Hugging Face `owner/name` repo, if this model is sourced from HF.
    pub fn hf_repo(&self) -> Option<&str> {
        match &self.source {
            Source::Hf { repo, .. } => Some(repo.as_str()),
            Source::WhisperGgml { .. } => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Engine {
    Whisper,
    Parakeet,
    Moonshine,
    Canary,
    Cohere,
    Gigaam,
    SenseVoice,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Quant {
    Int8,
    Int4,
    Fp16,
    Fp32,
}

/// Where a model's files come from.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Source {
    /// Files fetched from a Hugging Face repo.
    Hf {
        /// `owner/name`.
        repo: String,
        /// Files to fetch (string = keep name, object = flatten/rename).
        files: Vec<FileSpec>,
    },
    /// A whisper.cpp GGML model — expands to `ggml-{model}.bin` from
    /// `ggerganov/whisper.cpp` (plus the optional CoreML encoder on macOS).
    WhisperGgml { model: String },
}

/// A single file to download. A plain string keeps the repo-relative name and
/// is fetched from the entry's source repo; a `{ path, dest?, repo? }` object
/// can flatten/rename (`dest`) and/or pull the file from a *different* HF repo
/// (`repo`) — e.g. Moonshine's nested layout + shared tokenizer, or Canary's
/// `nemo128.onnx` preprocessor which only ships in the Parakeet repo.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum FileSpec {
    Plain(String),
    Detailed(FileEntry),
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileEntry {
    /// Repo-relative path to download.
    pub path: String,
    /// Local filename to store it as. Defaults to the basename of `path`.
    #[serde(default)]
    pub dest: Option<String>,
    /// HF repo to fetch from, overriding the entry's source repo.
    #[serde(default)]
    pub repo: Option<String>,
}

impl FileSpec {
    /// Repo-relative path to download.
    pub fn path(&self) -> &str {
        match self {
            FileSpec::Plain(p) => p,
            FileSpec::Detailed(f) => &f.path,
        }
    }

    /// Local filename the file should end up as (defaults to `path`'s basename).
    pub fn dest(&self) -> &str {
        match self {
            FileSpec::Plain(p) => p,
            FileSpec::Detailed(f) => match &f.dest {
                Some(d) => d,
                None => f.path.rsplit('/').next().unwrap_or(&f.path),
            },
        }
    }

    /// Per-file repo override, if any.
    pub fn repo(&self) -> Option<&str> {
        match self {
            FileSpec::Plain(_) => None,
            FileSpec::Detailed(f) => f.repo.as_deref(),
        }
    }

    /// Whether this file is flattened/renamed relative to its repo layout
    /// (an explicit `dest` differing from the basename, or a nested `path`).
    pub fn is_renamed(&self) -> bool {
        match self {
            FileSpec::Plain(_) => false,
            FileSpec::Detailed(f) => {
                let basename = f.path.rsplit('/').next().unwrap_or(&f.path);
                f.dest.as_deref().map(|d| d != basename).unwrap_or(false)
                    || f.path.contains('/')
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Ui {
    pub size: String,
    pub ram: String,
    pub image: String,
    pub accuracy: u8,
    pub weight: u8,
    #[serde(rename = "languageSupport")]
    pub language_support: LanguageSupport,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LanguageSupport {
    Multilingual,
    SingleLanguage { language: String },
    Restricted { languages: Vec<String> },
}

// ---- Lookups ----

impl Manifest {
    pub fn get(&self, id: &str) -> Option<&ModelEntry> {
        self.models.iter().find(|m| m.id == id)
    }
}

/// Look up a model entry by id from the embedded manifest.
pub fn get(id: &str) -> Option<&'static ModelEntry> {
    MANIFEST.get(id)
}

/// The engine that loads a given model id, if known.
pub fn engine_for(id: &str) -> Option<Engine> {
    MANIFEST.get(id).map(|m| m.engine)
}

/// The VAD model.
pub fn vad() -> &'static VadModel {
    &MANIFEST.vad
}

/// The speaker-diarization model.
pub fn diarize() -> &'static DiarizeModel {
    &MANIFEST.diarize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_parses_and_is_nonempty() {
        let m = &*MANIFEST;
        assert_eq!(m.schema_version, 1);
        assert!(!m.models.is_empty(), "manifest has no models");
    }

    #[test]
    fn model_ids_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for e in &MANIFEST.models {
            assert!(seen.insert(e.id.as_str()), "duplicate model id: {}", e.id);
        }
    }

    #[test]
    fn hf_sources_are_wellformed() {
        for e in &MANIFEST.models {
            if let Source::Hf { repo, files } = &e.source {
                assert!(repo.contains('/'), "{}: hf repo must be owner/name", e.id);
                assert!(!files.is_empty(), "{}: hf source needs >=1 file", e.id);
                for f in files {
                    assert!(!f.path().is_empty(), "{}: empty file path", e.id);
                    assert!(!f.dest().is_empty(), "{}: empty file dest", e.id);
                }
            }
        }
    }

    #[test]
    fn whisper_engine_uses_ggml_source() {
        for e in &MANIFEST.models {
            if e.engine == Engine::Whisper {
                assert!(
                    matches!(e.source, Source::WhisperGgml { .. }),
                    "{}: whisper engine expects a whisper-ggml source",
                    e.id
                );
            }
        }
    }

    #[test]
    fn vad_and_diarize_are_wellformed() {
        let v = vad();
        assert!(v.repo.contains('/'), "vad repo must be owner/name");
        assert!(!v.file.is_empty(), "vad file must be set");
        let d = diarize();
        assert!(d.repo.contains('/'), "diarize repo must be owner/name");
        assert!(!d.id.is_empty(), "diarize id must be set");
        assert!(!d.files.is_empty(), "diarize needs >=1 file");
    }

    #[test]
    fn every_model_engine_has_a_wrapper() {
        // Engines wired up in engine.rs. Adding a manifest row for an engine
        // without a transcribe wrapper would fail transcription at runtime, so
        // guard it here. Update this set when a new engine wrapper lands.
        for e in &MANIFEST.models {
            assert!(
                matches!(
                    e.engine,
                    Engine::Whisper
                        | Engine::Parakeet
                        | Engine::Moonshine
                        | Engine::SenseVoice
                        | Engine::Canary
                        | Engine::Cohere
                ),
                "model '{}' uses engine {:?} which has no wrapper yet",
                e.id,
                e.engine
            );
        }
    }

    #[test]
    fn moonshine_entries_have_a_variant() {
        for e in &MANIFEST.models {
            if e.engine == Engine::Moonshine {
                assert!(
                    e.moonshine_variant.is_some(),
                    "{}: moonshine entry needs a moonshineVariant",
                    e.id
                );
            }
        }
    }
}
