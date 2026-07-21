use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions};
use eyre::{eyre, Result};
use std::path::Path;
use transcribe_rs::onnx::{
    moonshine::{MoonshineModel, MoonshineParams, MoonshineVariant},
    Quantization,
};
use transcribe_rs::{TranscriptionResult};

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
    pub fn load(model_path: &Path, variant: MoonshineVariant) -> Result<Self> {
        let model = MoonshineModel::load(model_path, variant, &Quantization::default())
            .map_err(|e| eyre!("Failed to load Moonshine model: {}", e))?;

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

        MoonshineEngine::load(model_path, variant)
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
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Moonshine transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        eyre::bail!("Transcription cancelled");
    }

    let engine = crate::engines::onnx::load_with_directml_fallback(|| MoonshineEngine::load(model_path, variant))?;
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
