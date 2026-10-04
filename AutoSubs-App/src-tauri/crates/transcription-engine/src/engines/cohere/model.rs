//! Cohere AED model vendored from `transcribe-rs` v0.3.11 (MIT, (c) CJ Pais),
//! extended with keyword biasing through the model's native context slot:
//! tokenized keyword text is injected between <|startofcontext|> and
//! <|startoftranscript|> (the canary2 prompt layout it was trained with).

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use ndarray::{Array2, ArrayD, Ix3, IxDyn};
use ort::session::Session;
use ort::session::SessionInputValue;
use ort::value::DynValue;

use transcribe_rs::decode::{load_vocab, parse_byte_token, GreedyDecoder};
use transcribe_rs::onnx::{session, Quantization};
use transcribe_rs::{TranscribeError, TranscriptionResult};

use crate::keyword_boost;

const NUM_DECODER_LAYERS: usize = 8;
const NUM_HEADS: usize = 8;
const HEAD_DIM: usize = 128;
const MAX_SEQ_LEN: usize = 1024;
const DEFAULT_MAX_NEW_TOKENS: usize = 512;

#[derive(Debug, Clone, Default)]
pub struct CohereParams {
    /// Language hint for prompt tokens. Defaults to English.
    pub language: Option<String>,
    /// Translation is currently ignored by the local ONNX export.
    pub translate: bool,
    /// Maximum number of autoregressive tokens to emit per chunk.
    pub max_new_tokens: Option<usize>,
}

pub struct CohereModel {
    encoder: Session,
    decoder: Session,
    vocab: Vec<String>,
    token_to_id: HashMap<String, i64>,
    eos_id: i64,
    encoder_input_name: String,
    decoder_input_names: Vec<String>,
    context_ids: Vec<i64>,
}

impl CohereModel {
    pub fn load(model_dir: &Path, quantization: &Quantization) -> Result<Self, TranscribeError> {
        let encoder_path = resolve_model_file(
            model_dir,
            encoder_candidates(quantization),
            "cohere-encoder.int4.onnx",
        )?;
        let decoder_path = resolve_model_file(
            model_dir,
            decoder_candidates(quantization),
            "cohere-decoder.int4.onnx",
        )?;
        let vocab_path =
            resolve_model_file(model_dir, &["tokens.txt", "vocabulary.txt"], "tokens.txt")?;

        tracing::info!("Loading Cohere encoder from {:?}...", encoder_path);
        let encoder = session::create_session(&encoder_path)?;

        tracing::info!("Loading Cohere decoder from {:?}...", decoder_path);
        let decoder = session::create_session(&decoder_path)?;

        let (vocab, _) = load_vocab(&vocab_path)?;
        let token_to_id = vocab
            .iter()
            .enumerate()
            .filter(|(_, token)| !token.is_empty())
            .map(|(id, token)| (token.clone(), id as i64))
            .collect::<HashMap<_, _>>();

        let encoder_input_name = encoder
            .inputs()
            .first()
            .map(|input| input.name().to_string())
            .unwrap_or_else(|| "audio".to_string());
        let decoder_input_names = decoder
            .inputs()
            .iter()
            .map(|input| input.name().to_string())
            .collect::<Vec<_>>();
        let eos_id = token_to_id.get("<|endoftext|>").copied().unwrap_or(3);

        Ok(Self {
            encoder,
            decoder,
            vocab,
            token_to_id,
            eos_id,
            encoder_input_name,
            decoder_input_names,
            context_ids: Vec::new(),
        })
    }

    /// Tokenize `keywords` into the decoder's context slot, as a
    /// comma-separated phrase list. `load_vocab` already turned `▁` into
    /// spaces, so the pieces can be matched against plain text. Whole phrases
    /// only — keywords that would push the context past the cap are dropped
    /// whole, since the context shares the model's 1024-position window with
    /// the generated text.
    pub fn set_keywords(&mut self, keywords: &[String]) {
        self.context_ids =
            keyword_boost::tokenize_context(&self.vocab, keywords, keyword_boost::MAX_CONTEXT_TOKENS)
                .into_iter()
                .map(i64::from)
                .collect();
    }

    /// Languages supported by the Cohere export.
    pub fn languages(&self) -> &'static [&'static str] {
        &[
            "en", "de", "fr", "it", "es", "pt", "el", "nl", "pl", "ar", "vi", "zh", "ja", "ko",
        ]
    }

    pub fn transcribe_with(
        &mut self,
        samples: &[f32],
        params: &CohereParams,
    ) -> Result<TranscriptionResult, TranscribeError> {
        if params.translate {
            tracing::warn!(
                "Cohere ONNX export does not support local translation; ignoring translate=true"
            );
        }

        if samples.is_empty() {
            return Ok(TranscriptionResult {
                text: String::new(),
                segments: None,
            });
        }

        let prompt_ids = self.build_prompt_ids(params.language.as_deref(), &self.context_ids);
        let max_new_tokens = params
            .max_new_tokens
            .unwrap_or(DEFAULT_MAX_NEW_TOKENS)
            .min(MAX_SEQ_LEN.saturating_sub(prompt_ids.len()));

        let text = self.transcribe_chunk(samples, &prompt_ids, max_new_tokens)?;

        Ok(TranscriptionResult {
            text,
            segments: None,
        })
    }

    fn transcribe_chunk(
        &mut self,
        samples: &[f32],
        prompt_ids: &[i64],
        max_new_tokens: usize,
    ) -> Result<String, TranscribeError> {
        let audio = Array2::from_shape_vec((1, samples.len()), samples.to_vec())?.into_dyn();
        let (cross_k, cross_v) = {
            let mut encoder_outputs = self.encoder.run(vec![(
                Cow::Owned(self.encoder_input_name.clone()),
                ort::value::Value::from_array(audio)?.into_dyn(),
            )])?;
            let cross_k = remove_output(&mut encoder_outputs, "n_layer_cross_k")?;
            let cross_v = remove_output(&mut encoder_outputs, "n_layer_cross_v")?;
            (cross_k, cross_v)
        };

        // Resolve decoder input names once before the loop.
        let token_name = self.decoder_input_name("tokens", &["input_ids"]);
        let self_k_name = self.decoder_input_name(
            "in_n_layer_self_k_cache",
            &["past_key_values", "past_key_values.key"],
        );
        let self_v_name =
            self.decoder_input_name("in_n_layer_self_v_cache", &["past_key_values.value"]);
        let cross_k_name = self.decoder_input_name("n_layer_cross_k", &["encoder_kv_cache.key"]);
        let cross_v_name = self.decoder_input_name("n_layer_cross_v", &["encoder_kv_cache.value"]);
        let offset_name = self.decoder_input_name("offset", &["cache_position"]);

        let mut greedy = GreedyDecoder::new(self.eos_id);
        let mut generated_ids: Vec<i64> = Vec::new();
        let mut current_tokens = prompt_ids.to_vec();
        let mut offset = 0_i64;

        let mut self_k_cache: DynValue =
            ort::value::Value::from_array(ArrayD::<f32>::zeros(IxDyn(&[
                NUM_DECODER_LAYERS,
                1,
                NUM_HEADS,
                MAX_SEQ_LEN,
                HEAD_DIM,
            ])))?
            .into_dyn();
        let mut self_v_cache: DynValue =
            ort::value::Value::from_array(ArrayD::<f32>::zeros(IxDyn(&[
                NUM_DECODER_LAYERS,
                1,
                NUM_HEADS,
                MAX_SEQ_LEN,
                HEAD_DIM,
            ])))?
            .into_dyn();

        for _ in 0..max_new_tokens {
            let n_tokens = current_tokens.len();
            let tokens = Array2::from_shape_vec((1, n_tokens), current_tokens.clone())?.into_dyn();
            let offset_tensor = ndarray::arr0(offset).into_dyn();

            // Build inputs: move self caches (replaced from output below),
            // borrow cross caches (constant across the loop).
            let inputs: Vec<(Cow<str>, SessionInputValue)> = vec![
                (
                    Cow::Borrowed(token_name.as_str()),
                    SessionInputValue::from(ort::value::Value::from_array(tokens)?),
                ),
                (
                    Cow::Borrowed(self_k_name.as_str()),
                    SessionInputValue::from(self_k_cache),
                ),
                (
                    Cow::Borrowed(self_v_name.as_str()),
                    SessionInputValue::from(self_v_cache),
                ),
                (
                    Cow::Borrowed(cross_k_name.as_str()),
                    SessionInputValue::from(&cross_k),
                ),
                (
                    Cow::Borrowed(cross_v_name.as_str()),
                    SessionInputValue::from(&cross_v),
                ),
                (
                    Cow::Borrowed(offset_name.as_str()),
                    SessionInputValue::from(ort::value::Value::from_array(offset_tensor)?),
                ),
            ];

            let mut decoder_outputs = self.decoder.run(inputs)?;

            // Extract last-position logits in a scoped borrow, then release before remove().
            let last_logits = {
                let logits = decoder_outputs
                    .get("logits")
                    .ok_or_else(|| TranscribeError::Inference("Missing logits output".into()))?
                    .try_extract_array::<f32>()?;
                let logits = logits
                    .into_dimensionality::<Ix3>()
                    .map_err(|e| TranscribeError::Inference(e.to_string()))?;
                let last_pos = logits.shape()[1].saturating_sub(1);
                logits.slice(ndarray::s![0, last_pos, ..]).to_vec()
            };

            let next_token = match greedy.next_token(&last_logits) {
                Some(t) => t,
                None => break,
            };

            generated_ids.push(next_token);
            current_tokens = vec![next_token];
            offset += n_tokens as i64;

            // Take KV caches directly from outputs (no data copy).
            self_k_cache = remove_output(&mut decoder_outputs, "out_n_layer_self_k_cache")?;
            self_v_cache = remove_output(&mut decoder_outputs, "out_n_layer_self_v_cache")?;
        }

        Ok(self.decode_ids(&generated_ids))
    }

    fn build_prompt_ids(&self, language: Option<&str>, context_ids: &[i64]) -> Vec<i64> {
        let requested = match language.unwrap_or("en") {
            "auto" => "en",
            "zh-Hans" | "zh-Hant" => "zh",
            other => other,
        };

        let language_token = format!("<|{requested}|>");
        let chosen_language = if self.token_to_id.contains_key(&language_token) {
            requested
        } else {
            "en"
        };

        [
            "<|startofcontext|>".to_string(),
            "<|startoftranscript|>".to_string(),
            "<|emo:undefined|>".to_string(),
            format!("<|{chosen_language}|>"),
            format!("<|{chosen_language}|>"),
            "<|pnc|>".to_string(),
            "<|noitn|>".to_string(),
            "<|notimestamp|>".to_string(),
            "<|nodiarize|>".to_string(),
        ]
        .iter()
        .enumerate()
        .flat_map(|(i, token)| {
            let id = match self.token_to_id.get(token).copied() {
                Some(id) => id,
                None => {
                    tracing::warn!("Prompt token not found in vocab: {}", token);
                    return Vec::new();
                }
            };
            // Context tokens go between <|startofcontext|> and the rest.
            match i {
                0 => vec![id]
                    .into_iter()
                    .chain(context_ids.iter().copied())
                    .collect::<Vec<_>>(),
                _ => vec![id],
            }
        })
        .collect()
    }

    fn decode_ids(&self, token_ids: &[i64]) -> String {
        let tokens: Vec<&str> = token_ids
            .iter()
            .filter_map(|&id| self.vocab.get(id as usize))
            .filter(|token| {
                !token.trim().is_empty()
                    && !token.starts_with("<|")
                    && token.as_str() != "<unk>"
                    && token.as_str() != "<pad>"
            })
            .map(|token| token.as_str())
            .collect();

        // Handle byte-level BPE tokens (<0xNN>) by collecting into a byte buffer.
        // SentencePiece tokenizers emit these for characters outside the base vocabulary
        // (e.g. CJK characters are split into individual UTF-8 bytes).
        let mut bytes: Vec<u8> = Vec::new();
        for token in &tokens {
            if let Some(byte_val) = parse_byte_token(token) {
                bytes.push(byte_val);
            } else {
                bytes.extend(token.as_bytes());
            }
        }

        let text = String::from_utf8_lossy(&bytes);
        let text = text.trim();
        // Clean up contraction spacing (e.g. "can 't" → "can't")
        text.replace(" '", "'")
    }

    fn decoder_input_name(&self, preferred: &str, fallbacks: &[&str]) -> String {
        if self
            .decoder_input_names
            .iter()
            .any(|name| name == preferred)
        {
            return preferred.to_string();
        }

        for fallback in fallbacks {
            if self.decoder_input_names.iter().any(|name| name == fallback) {
                return (*fallback).to_string();
            }
        }

        preferred.to_string()
    }
}

fn resolve_model_file(
    model_dir: &Path,
    candidates: &[&str],
    missing_name: &str,
) -> Result<PathBuf, TranscribeError> {
    for base_dir in [model_dir.to_path_buf(), model_dir.join("onnx")] {
        for candidate in candidates {
            let path = base_dir.join(candidate);
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Err(TranscribeError::ModelNotFound(model_dir.join(missing_name)))
}

fn encoder_candidates(quantization: &Quantization) -> &'static [&'static str] {
    match quantization {
        Quantization::Int4 => &["cohere-encoder.int4.onnx", "encoder_model.int4.onnx"],
        Quantization::Int8 => &["cohere-encoder.int8.onnx", "encoder_model.int8.onnx"],
        Quantization::FP16 => &["cohere-encoder.fp16.onnx", "encoder_model_fp16.onnx"],
        Quantization::FP32 => &["cohere-encoder.onnx", "encoder_model.onnx"],
    }
}

fn decoder_candidates(quantization: &Quantization) -> &'static [&'static str] {
    match quantization {
        Quantization::Int4 => &["cohere-decoder.int4.onnx", "decoder_model_merged.int4.onnx"],
        Quantization::Int8 => &["cohere-decoder.int8.onnx", "decoder_model_merged.int8.onnx"],
        Quantization::FP16 => &["cohere-decoder.fp16.onnx", "decoder_model_merged_fp16.onnx"],
        Quantization::FP32 => &["cohere-decoder.onnx", "decoder_model_merged.onnx"],
    }
}

fn remove_output(
    outputs: &mut ort::session::SessionOutputs,
    name: &str,
) -> Result<DynValue, TranscribeError> {
    outputs
        .remove(name)
        .ok_or_else(|| TranscribeError::Inference(format!("Missing expected output: {name}")))
}
