//! Omni-ASR 300M CTC speech recognition backend.
//!
//! Uses the ONNX-converted Facebook Omni-ASR CTC model directly through
//! `ort`. The 300M CTC variant is lightweight, supports 1600+ languages, and
//! does not produce capitalization or punctuation. Word timestamps are not
//! emitted by the model, so the shared ONNX driver interpolates them over each
//! chunk. Forced alignment (when enabled) refines those timings afterwards.

use crate::engines::onnx::{run_onnx_pipeline, OnnxEngine, WordTiming};
use crate::types::{LabeledProgressFn, NewSegmentFn, Segment, SpeechSegment, TranscribeOptions};
use eyre::{bail, eyre, Context, Result};
use ndarray::{Array2, Array3};
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use std::collections::HashMap;
use std::path::Path;
use transcribe_rs::TranscriptionResult;

pub struct OmniAsrEngine {
    session: Session,
    id_to_token: HashMap<i64, String>,
    blank_id: i64,
}

impl OmniAsrEngine {
    /// Load the model from a directory containing `model.onnx` and `tokens.txt`.
    fn load(model_dir: &Path) -> Result<Self> {
        let model_path = model_dir.join("model.onnx");
        let tokens_path = model_dir.join("tokens.txt");

        if !model_path.is_file() {
            bail!("Omni-ASR model not found at {}", model_path.display());
        }
        if !tokens_path.is_file() {
            bail!("Omni-ASR tokens not found at {}", tokens_path.display());
        }

        let session = Session::builder()
            .map_err(|e| eyre!("{e}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| eyre!("{e}"))?
            .with_intra_threads(1)
            .map_err(|e| eyre!("{e}"))?
            .with_inter_threads(1)
            .map_err(|e| eyre!("{e}"))?
            .commit_from_file(&model_path)
            .map_err(|e| eyre!("Failed to load Omni-ASR ONNX model: {e}"))?;

        let id_to_token = Self::load_tokens(&tokens_path)?;

        Ok(Self {
            session,
            id_to_token,
            blank_id: 0,
        })
    }

    /// Parse the `symbol id` tokens file used by sherpa-onnx.
    /// Token 4 is the space character, so we split on the last whitespace.
    fn load_tokens(path: &Path) -> Result<HashMap<i64, String>> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read tokens from {path:?}"))?;

        let mut map = HashMap::new();
        for line in content.lines() {
            if line.is_empty() {
                continue;
            }
            let split_pos = line
                .rfind(|c: char| c.is_whitespace())
                .ok_or_else(|| eyre!("Invalid tokens.txt line: {line}"))?;

            let symbol = &line[..split_pos];
            let id: i64 = line[split_pos..]
                .trim()
                .parse()
                .with_context(|| format!("Failed to parse token id in line: {line}"))?;

            map.insert(id, symbol.to_string());
        }

        Ok(map)
    }

    /// Normalize audio to zero mean and unit variance.
    ///
    /// This matches the preprocessing the model expects: a raw 16kHz mono
    /// waveform with per-chunk normalization.
    fn normalize(samples: &[f32]) -> Vec<f32> {
        if samples.is_empty() {
            return Vec::new();
        }

        let mean = samples.iter().copied().sum::<f32>() / samples.len() as f32;
        let var = samples.iter().map(|&s| (s - mean).powi(2)).sum::<f32>() / samples.len() as f32;
        let eps = 1e-5f32;
        let std = (var + eps).sqrt().max(eps);

        samples.iter().map(|&s| (s - mean) / std).collect()
    }

    /// Greedy CTC decoding: argmax per frame, collapse repeats, skip blanks.
    fn decode(&self, logits: &Array2<f32>) -> String {
        let mut prev_id: i64 = -1;
        let mut text = String::new();

        for row in logits.rows() {
            let id = row
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i as i64)
                .unwrap_or(-1);

            if id == self.blank_id {
                // A blank separates repeated labels, so reset repeat suppression.
                prev_id = id;
                continue;
            }
            if id == prev_id {
                continue;
            }

            if let Some(token) = self.id_to_token.get(&id) {
                // Skip special control tokens such as <pad>, </s>, <unk>.
                if token.starts_with('<') && token.ends_with('>') {
                    prev_id = id;
                    continue;
                }
                text.push_str(token);
            }

            prev_id = id;
        }

        // Trim and collapse any consecutive whitespace introduced by CTC.
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}

impl OnnxEngine for OmniAsrEngine {
    /// The 300M CTC model is trained on ≤30s chunks and rejects audio ≥40s.
    const MAX_SEGMENT_SECONDS: f64 = 30.0;

    fn load(model_path: &Path) -> Result<Self> {
        Self::load(model_path)
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> Result<TranscriptionResult> {
        let normalized = Self::normalize(samples);

        let inputs = ort::inputs![
            "x" => ort::value::Tensor::from_array(([1usize, normalized.len()], normalized))?,
        ];

        let outputs = self
            .session
            .run(inputs)
            .map_err(|e| eyre!("Omni-ASR inference failed: {e}"))?;

        let logits_tensor = outputs
            .get("logits")
            .ok_or_else(|| eyre!("Omni-ASR output 'logits' not found"))?;

        let (shape, data) = logits_tensor
            .try_extract_tensor::<f32>()
            .map_err(|e| eyre!("Failed to extract logits tensor: {e}"))?;

        let shape: &[i64] = shape;
        if shape.len() != 3 {
            bail!("Unexpected logits shape: expected 3D, got {:?}", shape);
        }

        let n = shape[0] as usize;
        let frames = shape[1] as usize;
        let vocab = shape[2] as usize;
        if n != 1 {
            bail!("Omni-ASR only supports batch size 1, got {n}");
        }

        let logits_3d = Array3::from_shape_vec((n, frames, vocab), data.to_vec())
            .map_err(|e| eyre!("Failed to reshape logits: {e}"))?;
        let logits_2d = logits_3d.index_axis_move(ndarray::Axis(0), 0);

        // `outputs` borrows `self.session`, so release it before the decode step.
        drop(outputs);

        let text = self.decode(&logits_2d);

        Ok(TranscriptionResult {
            text,
            segments: None,
        })
    }

    fn word_timing(&self) -> WordTiming {
        WordTiming::Interpolated
    }

    fn detected_lang(&self) -> Option<String> {
        None
    }
}

pub async fn transcribe_omni_asr(
    model_path: &Path,
    speech_segments: Vec<SpeechSegment>,
    options: &TranscribeOptions,
    progress_callback: Option<&LabeledProgressFn>,
    new_segment_callback: Option<&NewSegmentFn>,
    abort_callback: Option<Box<dyn Fn() -> bool + Send + Sync>>,
) -> Result<(Vec<Segment>, Option<String>)> {
    tracing::debug!("Omni-ASR transcribe called with model: {:?}", model_path);

    if abort_callback.as_ref().map(|c| c()).unwrap_or(false) {
        bail!("Transcription cancelled");
    }

    let engine = OmniAsrEngine::load(model_path)?;
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
