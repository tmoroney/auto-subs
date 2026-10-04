//! Canary AED model vendored from `transcribe-rs` v0.3.11 (MIT, (c) CJ Pais),
//! extended with keyword biasing through the model's native context slot:
//! tokenized keyword text is injected between <|startofcontext|> and
//! <|startoftranscript|>, the mechanism Canary-2 was trained with.

use std::path::Path;
use std::time::Instant;

use ort::session::Session;
use ort::value::Tensor;

use super::decoder::decode_autoregressive;
use super::vocab::Vocab;
use crate::vendor::onnx::{session, Quantization};
use crate::vendor::{TranscribeError, TranscriptionResult};

use crate::keyword_boost;

/// Known Canary model variants, auto-detected from vocabulary size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CanaryVariant {
    /// Canary Flash models (180M Flash, 1B Flash) — 4 languages.
    Flash,
    /// Canary 1B v2 — 27 languages.
    V2,
}

const FLASH_LANGUAGES: &[&str] = &["en", "de", "es", "fr"];

const V2_LANGUAGES: &[&str] = &[
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt",
    "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
];

impl CanaryVariant {
    fn detect(vocab_size: usize) -> Self {
        if vocab_size < 10_000 {
            CanaryVariant::Flash
        } else {
            CanaryVariant::V2
        }
    }

    pub fn languages(self) -> &'static [&'static str] {
        match self {
            CanaryVariant::Flash => FLASH_LANGUAGES,
            CanaryVariant::V2 => V2_LANGUAGES,
        }
    }
}

/// Per-model inference parameters for Canary.
#[derive(Debug, Clone)]
pub struct CanaryParams {
    /// Source language hint (e.g. "en", "de"). Defaults to "en".
    pub language: Option<String>,
    /// Target language for translation (e.g. "en"). Defaults to source language.
    pub target_language: Option<String>,
    /// Punctuation and capitalization. When true, the model adds proper punctuation
    /// and capitalization to the output. When false, output is more literal/raw.
    /// Defaults to true.
    pub use_pnc: bool,
    /// Inverse text normalization. When true, spoken numbers and quantities are
    /// converted to written form (e.g. "one hundred twenty three" → "123").
    /// Only supported on V2 models; silently ignored on Flash models.
    /// Defaults to true.
    pub use_itn: bool,
    /// Maximum number of tokens to generate. Defaults to 1024.
    pub max_sequence_length: usize,
}

impl Default for CanaryParams {
    fn default() -> Self {
        Self {
            language: None,
            target_language: None,
            use_pnc: true,
            use_itn: true,
            max_sequence_length: 1024,
        }
    }
}

/// Canary speech model backed by three ONNX sessions (preprocessor, encoder, decoder).
pub struct CanaryModel {
    preprocessor: Session,
    encoder: Session,
    decoder: Session,
    vocab: Vocab,
    variant: CanaryVariant,
    context_ids: Vec<i64>,
}

impl CanaryModel {
    /// Load a Canary model from `model_dir`.
    ///
    /// Expected directory contents:
    /// - `nemo128.onnx` (preprocessor, always FP32)
    /// - `encoder-model[.int8|.fp16].onnx` (quantization-aware)
    /// - `decoder-model[.int8|.fp16].onnx` (quantization-aware)
    /// - `vocab.txt`
    pub fn load(
        model_dir: &Path,
        quantization: &Quantization,
    ) -> Result<Self, TranscribeError> {
        if !model_dir.exists() {
            return Err(TranscribeError::ModelNotFound(model_dir.to_path_buf()));
        }

        let load_start = Instant::now();

        // Preprocessor is always FP32
        let preprocessor_path = model_dir.join("nemo128.onnx");
        tracing::info!(
            "Loading Canary preprocessor from {:?}...",
            preprocessor_path
        );
        let preprocessor = session::create_session(&preprocessor_path)?;

        // Encoder and decoder respect quantization
        let encoder_path =
            session::resolve_model_path(model_dir, "encoder-model", quantization);
        tracing::info!("Loading Canary encoder from {:?}...", encoder_path);
        let encoder = session::create_session(&encoder_path)?;

        let decoder_path =
            session::resolve_model_path(model_dir, "decoder-model", quantization);
        tracing::info!("Loading Canary decoder from {:?}...", decoder_path);
        let decoder = session::create_session(&decoder_path)?;

        // Vocabulary
        let vocab_path = model_dir.join("vocab.txt");
        let vocab = Vocab::load(&vocab_path)?;

        let variant = CanaryVariant::detect(vocab.size());
        tracing::info!(
            "Canary model loaded in {:.2?} (variant: {:?}, vocab: {} tokens)",
            load_start.elapsed(),
            variant,
            vocab.size()
        );

        Ok(Self {
            preprocessor,
            encoder,
            decoder,
            vocab,
            variant,
            context_ids: Vec::new(),
        })
    }

    /// Tokenize `keywords` into the decoder's context slot. The context is a
    /// comma-separated phrase list, matching how context was presented to the
    /// model during training. Whole phrases only — keywords that would push
    /// the context past the cap are dropped whole, since the context shares
    /// the model's 1024-position window with the generated text.
    pub fn set_keywords(&mut self, keywords: &[String]) {
        self.context_ids =
            keyword_boost::tokenize_context(&self.vocab.pieces(), keywords, keyword_boost::MAX_CONTEXT_TOKENS)
                .into_iter()
                .map(i64::from)
                .collect();
    }

    /// Languages supported by the loaded variant.
    pub fn languages(&self) -> &'static [&'static str] {
        self.variant.languages()
    }

    /// Transcribe with model-specific parameters.
    pub fn transcribe_with(
        &mut self,
        samples: &[f32],
        params: &CanaryParams,
    ) -> Result<TranscriptionResult, TranscribeError> {
        let src_lang = params.language.as_deref().unwrap_or("en");
        let tgt_lang = params.target_language.as_deref().unwrap_or(src_lang);

        // Flash models don't support ITN — silently disable to avoid empty output
        let use_itn = params.use_itn && self.variant != CanaryVariant::Flash;

        let total_start = Instant::now();

        // --- Step 1: Preprocess audio -> mel features ---
        let preprocess_start = Instant::now();
        let num_samples = samples.len();

        tracing::debug!("Preprocessor input: waveforms shape [1, {}]", num_samples);

        let waveforms = Tensor::from_array((
            vec![1i64, num_samples as i64],
            samples.to_vec().into_boxed_slice(),
        ))?;
        let waveforms_lens =
            Tensor::from_array((vec![1i64], vec![num_samples as i64].into_boxed_slice()))?;

        let mut preprocess_out = self.preprocessor.run(ort::inputs![
            "waveforms" => waveforms,
            "waveforms_lens" => waveforms_lens
        ])?;

        tracing::debug!(
            "Preprocessor output: features shape {:?} ({:.2?})",
            preprocess_out["features"].shape(),
            preprocess_start.elapsed()
        );

        // Pass outputs directly to encoder (no data copy)
        let features = preprocess_out
            .remove("features")
            .ok_or_else(|| TranscribeError::Inference("Missing features output".to_string()))?;
        let features_lens = preprocess_out.remove("features_lens").ok_or_else(|| {
            TranscribeError::Inference("Missing features_lens output".to_string())
        })?;

        // --- Step 2: Encode mel features -> encoder embeddings ---
        let encode_start = Instant::now();

        let mut encoder_out = self.encoder.run(ort::inputs![
            "audio_signal" => features,
            "length" => features_lens
        ])?;

        tracing::debug!(
            "Encoder output: embeddings shape {:?}, mask shape {:?} ({:.2?})",
            encoder_out["encoder_embeddings"].shape(),
            encoder_out["encoder_mask"].shape(),
            encode_start.elapsed()
        );

        // Pass outputs directly to decoder (no data copy)
        let encoder_embeddings = encoder_out.remove("encoder_embeddings").ok_or_else(|| {
            TranscribeError::Inference("Missing encoder_embeddings output".to_string())
        })?;
        let encoder_mask = encoder_out
            .remove("encoder_mask")
            .ok_or_else(|| TranscribeError::Inference("Missing encoder_mask output".to_string()))?;

        // --- Step 3: Build prompt tokens ---
        let prompt_tokens = self.vocab.build_prompt(
            src_lang,
            tgt_lang,
            params.use_pnc,
            use_itn,
            &self.context_ids,
        )?;

        tracing::debug!(
            "Prompt tokens ({}): {:?}",
            prompt_tokens.len(),
            prompt_tokens
        );

        // --- Step 4: Autoregressive decoding ---
        let decode_start = Instant::now();

        let text = decode_autoregressive(
            &mut self.decoder,
            &encoder_embeddings,
            &encoder_mask,
            prompt_tokens,
            &self.vocab,
            params.max_sequence_length,
        )?;

        tracing::debug!("Decoding completed in {:.2?}", decode_start.elapsed());
        tracing::info!(
            "Transcription completed in {:.2?}: \"{}\"",
            total_start.elapsed(),
            text
        );

        Ok(TranscriptionResult {
            text,
            segments: None,
        })
    }
}

