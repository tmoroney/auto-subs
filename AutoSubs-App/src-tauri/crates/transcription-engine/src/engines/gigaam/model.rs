//! GigaAM CTC model vendored from `transcribe-rs` v0.3.11 (MIT, (c) CJ Pais),
//! extended with keyword boosting: with a `KeywordGraph` set, the CTC argmax
//! runs over `log_softmax(logits) + alpha * bonus` per frame.

use ort::inputs;
use ort::session::Session;
use ort::value::TensorRef;
use std::path::Path;

use transcribe_rs::decode::{ctc_greedy_decode, sentencepiece_to_text};
use transcribe_rs::decode::tokens::load_vocab;
use transcribe_rs::features::{compute_mel, MelConfig, WindowType};
use transcribe_rs::onnx::{session, Quantization};
use transcribe_rs::TranscribeError;
use transcribe_rs::TranscriptionResult;

use crate::keyword_boost::{self, KeywordGraph};

pub struct GigaAMModel {
    session: Session,
    mel_config: MelConfig,
    vocab: Vec<String>,
    blank_idx: i64,
    space_idx: i64,
    boost: Option<KeywordGraph>,
    boost_alpha: f32,
}

impl GigaAMModel {
    pub fn load(model_dir: &Path, quantization: &Quantization) -> Result<Self, TranscribeError> {
        let model_path = session::resolve_model_path(model_dir, "model", quantization);
        let vocab_path = model_dir.join("vocab.txt");

        if !model_path.exists() {
            return Err(TranscribeError::ModelNotFound(model_path));
        }
        if !vocab_path.exists() {
            return Err(TranscribeError::ModelNotFound(vocab_path));
        }

        tracing::info!("Loading GigaAM model from {:?}...", model_path);
        let session = session::create_session(&model_path)?;

        let (vocab, blank_idx) = load_vocab(&vocab_path)?;
        let blank_idx = blank_idx.unwrap_or(vocab.len() as i32) as i64;
        let space_idx = vocab
            .iter()
            .position(|piece| piece == " ")
            .map(|i| i as i64)
            .unwrap_or(-1);

        tracing::info!(
            "Loaded vocabulary with {} tokens, blank_idx={}",
            vocab.len(),
            blank_idx
        );

        let mel_config = MelConfig {
            sample_rate: 16000,
            num_mels: 64,
            n_fft: 320,
            hop_length: 160,
            window: WindowType::Hann,
            f_min: 0.0,
            f_max: Some(8000.0),
            pre_emphasis: None,
            snip_edges: false,
            normalize_samples: true,
        };

        Ok(Self {
            session,
            mel_config,
            vocab,
            blank_idx,
            space_idx,
            boost: None,
            boost_alpha: keyword_boost::DEFAULT_BOOST_ALPHA,
        })
    }

    /// Compile `keywords` into the boosting tree used at decode time.
    /// `alpha` of `None` keeps the default (1.0).
    pub fn set_keywords(&mut self, keywords: &[String], alpha: Option<f32>) {
        self.boost = KeywordGraph::from_keywords(&self.vocab, keywords);
        if let Some(alpha) = alpha {
            self.boost_alpha = alpha;
        }
    }

    pub fn transcribe_with(
        &mut self,
        samples: &[f32],
    ) -> Result<TranscriptionResult, TranscribeError> {
        self.infer(samples)
    }

    fn infer(&mut self, samples: &[f32]) -> Result<TranscriptionResult, TranscribeError> {
        if samples.len() < self.mel_config.n_fft {
            return Ok(TranscriptionResult {
                text: String::new(),
                segments: None,
            });
        }

        // 1. Compute mel spectrogram [frames, mels]
        let mel = compute_mel(samples, &self.mel_config);
        let time_steps = mel.shape()[0];

        // 2. Prepare input tensors: features [1, n_mels, time], feature_lengths [1]
        let features = mel.t().to_owned().insert_axis(ndarray::Axis(0)); // [1, 64, T]
        let features_dyn = features.into_dyn();
        let feature_lengths = ndarray::arr1(&[time_steps as i64]).into_dyn();

        // 3. Run ONNX forward pass
        let t_features = TensorRef::from_array_view(features_dyn.view())?;
        let t_lengths = TensorRef::from_array_view(feature_lengths.view())?;
        let inputs = inputs! {
            "features" => t_features,
            "feature_lengths" => t_lengths,
        };
        let outputs = self.session.run(inputs)?;

        // 4. Extract log_probs [1, T', vocab_size]
        let log_probs = outputs[0].try_extract_array::<f32>()?;
        let log_probs = log_probs.to_owned().into_dimensionality::<ndarray::Ix3>()?;

        // 5. CTC decode (keyword-boosted when a graph is set)
        let num_frames = log_probs.shape()[1] as i64;
        let logits_lengths = vec![num_frames];
        let boundary = (self.space_idx >= 0).then_some(self.space_idx as i32);
        let results = match &self.boost {
            Some(graph) => keyword_boost::ctc_greedy_decode_boosted(
                &log_probs.view(),
                &logits_lengths,
                self.blank_idx,
                graph,
                self.boost_alpha,
                boundary,
            ),
            None => ctc_greedy_decode(&log_probs.view(), &logits_lengths, self.blank_idx),
        };

        // 6. Convert token IDs to text
        let tokens: Vec<&str> = results[0]
            .tokens
            .iter()
            .filter_map(|&id| {
                let idx = id as usize;
                if idx < self.vocab.len() {
                    let token = self.vocab[idx].as_str();
                    if token == "<unk>" {
                        None
                    } else {
                        Some(token)
                    }
                } else {
                    None
                }
            })
            .collect();

        let text = sentencepiece_to_text(&tokens);

        Ok(TranscriptionResult {
            text,
            segments: None,
        })
    }
}
