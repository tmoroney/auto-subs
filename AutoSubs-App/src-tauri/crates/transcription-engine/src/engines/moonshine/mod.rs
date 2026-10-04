//! Moonshine speech recognition backend.

mod model;

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, ProgressType, Segment, SpeechSegment, TranscribeOptions};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::Quantization;
use transcribe_rs::TranscriptionResult;

use self::model::{MoonshineModel, MoonshineParams};

pub const SAMPLE_RATE: u32 = 16000;

/// Moonshine model variant (vendored from `transcribe-rs` v0.3.11).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoonshineVariant {
    Tiny,
    TinyAr,
    TinyZh,
    TinyJa,
    TinyKo,
    TinyUk,
    TinyVi,
    Base,
    BaseEs,
}

impl MoonshineVariant {
    pub fn num_layers(&self) -> usize {
        match self {
            MoonshineVariant::Tiny
            | MoonshineVariant::TinyAr
            | MoonshineVariant::TinyZh
            | MoonshineVariant::TinyJa
            | MoonshineVariant::TinyKo
            | MoonshineVariant::TinyUk
            | MoonshineVariant::TinyVi => 6,
            MoonshineVariant::Base | MoonshineVariant::BaseEs => 8,
        }
    }

    pub fn num_key_value_heads(&self) -> usize {
        8
    }

    pub fn head_dim(&self) -> usize {
        match self {
            MoonshineVariant::Tiny
            | MoonshineVariant::TinyAr
            | MoonshineVariant::TinyZh
            | MoonshineVariant::TinyJa
            | MoonshineVariant::TinyKo
            | MoonshineVariant::TinyUk
            | MoonshineVariant::TinyVi => 36,
            MoonshineVariant::Base | MoonshineVariant::BaseEs => 52,
        }
    }

    pub fn token_rate(&self) -> usize {
        match self {
            MoonshineVariant::Tiny | MoonshineVariant::Base | MoonshineVariant::BaseEs => 6,
            MoonshineVariant::TinyUk => 8,
            MoonshineVariant::TinyAr
            | MoonshineVariant::TinyZh
            | MoonshineVariant::TinyJa
            | MoonshineVariant::TinyKo
            | MoonshineVariant::TinyVi => 13,
        }
    }
}

pub fn moonshine_variant_from_model_name(model_name: &str) -> Option<(MoonshineVariant, Option<&'static str>)> {
    let m = model_name.to_lowercase();
    let suffix = m.strip_prefix("moonshine-")?;

    let (variant, lang) = match suffix {
        "tiny" => (MoonshineVariant::Tiny, Some("en")),
        "tiny-ar" => (MoonshineVariant::TinyAr, Some("ar")),
        "tiny-zh" => (MoonshineVariant::TinyZh, Some("zh")),
        "tiny-ja" => (MoonshineVariant::TinyJa, Some("ja")),
        "tiny-ko" => (MoonshineVariant::TinyKo, Some("ko")),
        "tiny-uk" => (MoonshineVariant::TinyUk, Some("uk")),
        "tiny-vi" => (MoonshineVariant::TinyVi, Some("vi")),
        "base" => (MoonshineVariant::Base, Some("en")),
        "base-es" => (MoonshineVariant::BaseEs, Some("es")),
        _ => return None,
    };

    Some((variant, lang))
}

fn moonshine_lang_from_variant(variant: MoonshineVariant) -> Option<&'static str> {
    match variant {
        MoonshineVariant::Tiny => Some("en"),
        MoonshineVariant::TinyAr => Some("ar"),
        MoonshineVariant::TinyZh => Some("zh"),
        MoonshineVariant::TinyJa => Some("ja"),
        MoonshineVariant::TinyKo => Some("ko"),
        MoonshineVariant::TinyUk => Some("uk"),
        MoonshineVariant::TinyVi => Some("vi"),
        MoonshineVariant::Base => Some("en"),
        MoonshineVariant::BaseEs => Some("es"),
    }
}

pub struct MoonshineEngine {
    model: MoonshineModel,
    params: MoonshineParams,
    detected_lang: Option<String>,
}

impl MoonshineEngine {
    pub fn load_with_keywords(
        model_path: &Path,
        variant: MoonshineVariant,
        keywords: &[String],
    ) -> Result<Self> {
        let mut model = MoonshineModel::load(model_path, variant, &Quantization::default())
            .map_err(|e| eyre!("Failed to load Moonshine model: {}", e))?;
        if !keywords.is_empty() {
            model.set_keywords(keywords, None);
        }

        Ok(Self {
            model,
            params: MoonshineParams {
                max_length: None,
                ..Default::default()
            },
            detected_lang: moonshine_lang_from_variant(variant).map(|s| s.to_string()),
        })
    }
}

impl OnnxEngine for MoonshineEngine {
    const MAX_SEGMENT_SECONDS: f64 = 64.0;

    fn load(model_path: &Path) -> Result<Self> {
        let model_name = model_path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| eyre!("Unknown Moonshine model: {}", model_path.display()))?;
        let (variant, _) = moonshine_variant_from_model_name(model_name)
            .ok_or_else(|| eyre!("Unknown Moonshine model: {}", model_name))?;

        MoonshineEngine::load_with_keywords(model_path, variant, &[])
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        self.model
            .transcribe_with(samples, &self.params)
            .map_err(|e| eyre!("Moonshine transcription failed: {}", e))
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::Interpolated
    }

    fn detected_lang(&self) -> Option<String> {
        self.detected_lang.clone()
    }
}

pub async fn transcribe_moonshine(
    model_path: &Path,
    variant: MoonshineVariant,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    use_gpu: Option<bool>,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Moonshine transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    if let Some(cb) = progress_callback {
        cb(0, ProgressType::Analyze, "progressSteps.analyze.loading");
    }
    let keywords = options
        .advanced
        .as_ref()
        .and_then(|a| a.keywords.clone())
        .unwrap_or_default();
    let engine = crate::engines::onnx::load_with_directml_fallback(use_gpu, || {
        MoonshineEngine::load_with_keywords(model_path, variant, &keywords)
    })?;
    if let Some(cb) = progress_callback {
        cb(100, ProgressType::Analyze, "progressSteps.analyze.loading");
    }

    run_onnx_pipeline(
        engine,
        speech_segments,
        options.offset.unwrap_or(0.0),
        progress_callback,
        new_segment_callback,
        abort_callback,
    )
    .await
}
