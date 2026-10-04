//! Parakeet/Orukeet (NeMo TDT) ONNX inference, adapted from transcribe-rs 0.3.11
//! (`src/onnx/parakeet`, MIT licensed, https://github.com/cjpais/transcribe-rs)
//! so the decode loop can carry keyword biasing. Session setup and vocab
//! loading still come from transcribe-rs; the greedy decode is unchanged, and
//! [`decode_sequence_boosted`] adds a beam search fused with a
//! [`crate::keyword_boost::KeywordGraph`] in the style of NeMo's GPU-PB
//! (arXiv 2508.07014) `malsd_batch` decoder.

use ndarray::{Array, Array1, Array2, Array3, ArrayD, ArrayViewD, IxDyn};
use once_cell::sync::Lazy;
use ort::inputs;
use ort::session::Session;
use ort::value::TensorRef;
use regex::Regex;
use std::path::Path;

use crate::vendor::decode::tokens::load_vocab;
use crate::vendor::onnx::{session, Quantization};
use crate::vendor::{TranscribeError, TranscriptionResult, TranscriptionSegment};

use crate::keyword_boost::{KeywordGraph, DEFAULT_BEAM_SIZE};

type DecoderState = (Array3<f32>, Array3<f32>);

const SUBSAMPLING_FACTOR: usize = 8;
const WINDOW_SIZE: f32 = 0.01;
const MAX_TOKENS_PER_STEP: usize = 10;

static DECODE_SPACE_RE: Lazy<Result<Regex, regex::Error>> =
    Lazy::new(|| Regex::new(r"\A\s|\s\B|(\s)\b"));

// Timestamp types for hierarchical segmentation

#[derive(Debug, Clone, PartialEq)]
struct Token {
    text: String,
    t_start: f32,
    t_end: f32,
    is_blank: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct Word {
    text: String,
    t_start: f32,
    t_end: f32,
}

struct TimestampedResult {
    text: String,
    timestamps: Vec<f32>,
    tokens: Vec<String>,
}

pub struct ParakeetModel {
    encoder: Session,
    decoder_joint: Session,
    preprocessor: Session,
    vocab: Vec<String>,
    blank_idx: i32,
    vocab_size: usize,
    /// Keyword boosting tree; `None` keeps the exact greedy path.
    boost: Option<KeywordGraph>,
    /// Decode-time boost multiplier (NeMo `boosting_tree_alpha`).
    boost_alpha: f32,
    /// Cancellation probe polled inside the (slower) boosted decode loop.
    abort: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>>,
}

impl ParakeetModel {
    pub fn load(model_dir: &Path, quantization: &Quantization) -> Result<Self, TranscribeError> {
        let encoder_path = session::resolve_model_path(model_dir, "encoder-model", quantization);
        let decoder_path =
            session::resolve_model_path(model_dir, "decoder_joint-model", quantization);
        let preprocessor_path = model_dir.join("nemo128.onnx");

        let encoder = session::create_session(&encoder_path)?;
        let decoder_joint = session::create_session(&decoder_path)?;
        let preprocessor = session::create_session(&preprocessor_path)?;

        let vocab_path = model_dir.join("vocab.txt");
        let (vocab, blank_idx) = load_vocab(&vocab_path)?;
        let blank_idx = blank_idx.ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Missing <blk> token in vocabulary",
            )
        })?;
        let vocab_size = vocab.len();

        Ok(Self {
            encoder,
            decoder_joint,
            preprocessor,
            vocab,
            blank_idx,
            vocab_size,
            boost: None,
            boost_alpha: crate::keyword_boost::DEFAULT_BOOST_ALPHA,
            abort: None,
        })
    }

    /// Set a cancellation probe polled every few encoder frames during
    /// boosted decode (the greedy path decodes a chunk fast enough that the
    /// pipeline-level check between chunks is sufficient).
    pub fn set_abort(&mut self, abort: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>>) {
        self.abort = abort;
    }

    /// Compile a boosting tree from keyword phrases against this model's vocab.
    /// Keywords that cannot be tokenized are skipped; if none survive, decoding
    /// stays on the greedy path.
    pub fn set_keywords(&mut self, keywords: &[String], alpha: Option<f32>) {
        self.boost = KeywordGraph::from_keywords(&self.vocab, keywords);
        self.boost_alpha = alpha.unwrap_or(crate::keyword_boost::DEFAULT_BOOST_ALPHA);
        if keywords.is_empty() {
            self.boost = None;
        }
        if self.boost.is_none() && !keywords.is_empty() {
            tracing::warn!("No keywords could be tokenized for this Parakeet vocabulary");
        }
    }

    /// Transcribe a chunk, returning word-granularity segments.
    ///
    /// Applies leading silence padding (default 250 ms) and adjusts
    /// timestamps.
    pub fn transcribe_with(
        &mut self,
        samples: &[f32],
    ) -> Result<TranscriptionResult, TranscribeError> {
        const LEAD_MS: u32 = 250;
        let padded = crate::audio::prepend_silence(samples, LEAD_MS);
        let timestamped_result = self.transcribe_samples_internal(padded)?;
        let segments = convert_to_hierarchical_word_segments(&timestamped_result);

        let mut result = TranscriptionResult {
            text: timestamped_result.text,
            segments: Some(segments),
        };
        result.offset_timestamps(-(LEAD_MS as f32 / 1000.0));
        Ok(result)
    }

    fn preprocess(
        &mut self,
        waveforms: &ArrayViewD<f32>,
        waveforms_lens: &ArrayViewD<i64>,
    ) -> Result<(ArrayD<f32>, ArrayD<i64>), TranscribeError> {
        let t_waveforms = TensorRef::from_array_view(waveforms.view())?;
        let t_waveforms_lens = TensorRef::from_array_view(waveforms_lens.view())?;
        let inputs = inputs![
            "waveforms" => t_waveforms,
            "waveforms_lens" => t_waveforms_lens,
        ];
        let outputs = self.preprocessor.run(inputs)?;

        let features = outputs
            .get("features")
            .ok_or_else(|| TranscribeError::Inference("Missing output: features".to_string()))?
            .try_extract_array()?;
        let features_lens = outputs
            .get("features_lens")
            .ok_or_else(|| TranscribeError::Inference("Missing output: features_lens".to_string()))?
            .try_extract_array()?;

        Ok((features.to_owned(), features_lens.to_owned()))
    }

    fn encode(
        &mut self,
        audio_signal: &ArrayViewD<f32>,
        length: &ArrayViewD<i64>,
    ) -> Result<(ArrayD<f32>, ArrayD<i64>), TranscribeError> {
        let t_audio_signal = TensorRef::from_array_view(audio_signal.view())?;
        let t_length = TensorRef::from_array_view(length.view())?;
        let inputs = inputs![
            "audio_signal" => t_audio_signal,
            "length" => t_length,
        ];
        let outputs = self.encoder.run(inputs)?;

        let encoder_output = outputs
            .get("outputs")
            .ok_or_else(|| TranscribeError::Inference("Missing output: outputs".to_string()))?
            .try_extract_array()?;
        let encoded_lengths = outputs
            .get("encoded_lengths")
            .ok_or_else(|| {
                TranscribeError::Inference("Missing output: encoded_lengths".to_string())
            })?
            .try_extract_array()?;

        let encoder_output = encoder_output.permuted_axes(IxDyn(&[0, 2, 1]));

        Ok((encoder_output.to_owned(), encoded_lengths.to_owned()))
    }

    fn create_decoder_state(&self) -> Result<DecoderState, TranscribeError> {
        let inputs = self.decoder_joint.inputs();

        let state1_shape = inputs
            .iter()
            .find(|input| input.name() == "input_states_1")
            .ok_or_else(|| TranscribeError::Inference("Missing input: input_states_1".to_string()))?
            .dtype()
            .tensor_shape()
            .ok_or_else(|| {
                TranscribeError::Inference(
                    "Failed to get tensor shape for input_states_1".to_string(),
                )
            })?;

        let state2_shape = inputs
            .iter()
            .find(|input| input.name() == "input_states_2")
            .ok_or_else(|| TranscribeError::Inference("Missing input: input_states_2".to_string()))?
            .dtype()
            .tensor_shape()
            .ok_or_else(|| {
                TranscribeError::Inference(
                    "Failed to get tensor shape for input_states_2".to_string(),
                )
            })?;

        let state1 = Array::zeros((state1_shape[0] as usize, 1, state1_shape[2] as usize));

        let state2 = Array::zeros((state2_shape[0] as usize, 1, state2_shape[2] as usize));

        Ok((state1, state2))
    }

    /// One prediction+joint step: feed the hypothesis's last token and LSTM
    /// states against a single encoder frame, returning joint logits and the
    /// successor states used when a non-blank token is emitted.
    fn decode_step(
        &mut self,
        prev_token: i32,
        prev_state: &DecoderState,
        encoder_out: &ArrayViewD<f32>,
    ) -> Result<(ArrayD<f32>, DecoderState), TranscribeError> {
        let encoder_outputs = encoder_out
            .to_owned()
            .insert_axis(ndarray::Axis(0))
            .insert_axis(ndarray::Axis(2));
        let targets = Array2::from_shape_vec((1, 1), vec![prev_token])?;
        let target_length = Array1::from_vec(vec![1]);

        let t_encoder_outputs = TensorRef::from_array_view(encoder_outputs.view())?;
        let t_targets = TensorRef::from_array_view(targets.view())?;
        let t_target_length = TensorRef::from_array_view(target_length.view())?;
        let t_input_states_1 = TensorRef::from_array_view(prev_state.0.view())?;
        let t_input_states_2 = TensorRef::from_array_view(prev_state.1.view())?;
        let inputs = inputs![
            "encoder_outputs" => t_encoder_outputs,
            "targets" => t_targets,
            "target_length" => t_target_length,
            "input_states_1" => t_input_states_1,
            "input_states_2" => t_input_states_2,
        ];

        let outputs = self.decoder_joint.run(inputs)?;

        let logits = outputs
            .get("outputs")
            .ok_or_else(|| TranscribeError::Inference("Missing output: outputs".to_string()))?
            .try_extract_array()?;
        let state1 = outputs
            .get("output_states_1")
            .ok_or_else(|| {
                TranscribeError::Inference("Missing output: output_states_1".to_string())
            })?
            .try_extract_array()?;
        let state2 = outputs
            .get("output_states_2")
            .ok_or_else(|| {
                TranscribeError::Inference("Missing output: output_states_2".to_string())
            })?
            .try_extract_array()?;

        let logits = logits.remove_axis(ndarray::Axis(0));

        let state1_3d = state1.to_owned().into_dimensionality::<ndarray::Ix3>()?;
        let state2_3d = state2.to_owned().into_dimensionality::<ndarray::Ix3>()?;

        Ok((logits.to_owned(), (state1_3d, state2_3d)))
    }

    fn transcribe_samples_internal(
        &mut self,
        samples: Vec<f32>,
    ) -> Result<TimestampedResult, TranscribeError> {
        let batch_size = 1;
        let samples_len = samples.len();

        let waveforms = Array2::from_shape_vec((batch_size, samples_len), samples)?.into_dyn();
        let waveforms_lens = Array1::from_vec(vec![samples_len as i64]).into_dyn();

        let (features, features_lens) = self.preprocess(&waveforms.view(), &waveforms_lens.view())?;
        let (encoder_out, encoder_out_lens) =
            self.encode(&features.view(), &features_lens.view())?;

        // Take the graph out of `self` so the decode methods can borrow `self`
        // mutably while scoring against it; restore it afterwards.
        let boost = self.boost.take();
        let mut results = Vec::new();
        for (encodings, &encodings_len) in encoder_out.outer_iter().zip(encoder_out_lens.iter()) {
            let (tokens, timestamps) = match &boost {
                Some(graph) => self.decode_sequence_boosted(
                    &encodings.view(),
                    encodings_len as usize,
                    graph,
                )?,
                None => self.decode_sequence(&encodings.view(), encodings_len as usize)?,
            };
            let result = self.decode_tokens(tokens, timestamps);
            results.push(result);
        }
        self.boost = boost;

        results.into_iter().next().ok_or_else(|| {
            TranscribeError::Inference("No transcription result returned".to_string())
        })
    }

    /// The untouched greedy TDT decode from transcribe-rs.
    fn decode_sequence(
        &mut self,
        encodings: &ArrayViewD<f32>,
        encodings_len: usize,
    ) -> Result<(Vec<i32>, Vec<usize>), TranscribeError> {
        let mut prev_state = self.create_decoder_state()?;
        let mut tokens = Vec::new();
        let mut timestamps = Vec::new();

        let mut t = 0;
        let mut emitted_tokens = 0;

        while t < encodings_len {
            let encoder_step = encodings.slice(ndarray::s![t, ..]);
            let encoder_step_dyn = encoder_step.to_owned().into_dyn();
            let (probs, new_state) =
                self.decode_step(tokens.last().copied().unwrap_or(self.blank_idx), &prev_state, &encoder_step_dyn.view())?;

            let vocab_logits_slice = probs
                .as_slice()
                .ok_or_else(|| TranscribeError::Inference("Logits not contiguous".to_string()))?;

            let vocab_logits = if probs.len() > self.vocab_size {
                &vocab_logits_slice[..self.vocab_size]
            } else {
                vocab_logits_slice
            };

            let token = vocab_logits
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(idx, _)| idx as i32)
                .unwrap_or(self.blank_idx);

            if token != self.blank_idx {
                prev_state = new_state;
                tokens.push(token);
                timestamps.push(t);
                emitted_tokens += 1;
            }

            if token == self.blank_idx || emitted_tokens == MAX_TOKENS_PER_STEP {
                t += 1;
                emitted_tokens = 0;
            }
        }

        Ok((tokens, timestamps))
    }

    /// Beam-search TDT decode fused with the keyword graph — the CPU/Rust
    /// counterpart of NeMo's `malsd_batch` + GPU-PB.
    ///
    /// Each hypothesis carries its own decoder states, emitted tokens, and
    /// boosting-tree position. Per encoder frame, hypotheses expand over their
    /// top-`beam_size` tokens: a blank advances the hypothesis to the next
    /// frame; a non-blank re-enters the decoder (TDT emits up to
    /// `MAX_TOKENS_PER_STEP` tokens per frame). Ranking is
    /// `model log-softmax + alpha * graph bonus`, mirroring the fused LM score.
    fn decode_sequence_boosted(
        &mut self,
        encodings: &ArrayViewD<f32>,
        encodings_len: usize,
        graph: &KeywordGraph,
    ) -> Result<(Vec<i32>, Vec<usize>), TranscribeError> {
        const BEAM: usize = DEFAULT_BEAM_SIZE;
        let alpha = self.boost_alpha as f64;

        struct Hyp {
            tokens: Vec<i32>,
            timestamps: Vec<usize>,
            state: DecoderState,
            /// Sum of log-softmax over emitted tokens and blanks.
            score: f64,
            /// Accumulated bonus of the current keyword path, always equal to
            /// `node_score(trie)` (refunded on divergence).
            boost: f64,
            /// Permanent bonus locked in by completed keywords.
            committed: f64,
            /// Trie node and path score of each completed keyword — used to
            /// tell how much of `boost` is already inside `committed` when a
            /// keyword extends a completed prefix. Nested commits keep the
            /// deepest one's score (it already contains the shallower ones).
            commits: Vec<(usize, f64)>,
            /// Ranking bonus: `committed` plus the part of `boost` not yet
            /// covered by a commit on the current path.
            bonus: f64,
            trie: usize,
        }

        impl Hyp {
            fn rank(&self, alpha: f64) -> f64 {
                self.score + alpha * self.bonus
            }
        }

        let initial_state = self.create_decoder_state()?;
        let mut beam = vec![Hyp {
            tokens: Vec::new(),
            timestamps: Vec::new(),
            state: initial_state,
            score: 0.0,
            boost: 0.0,
            committed: 0.0,
            commits: Vec::new(),
            bonus: 0.0,
            // Parakeet's BPE pieces carry the word-start marker inside the
            // piece, so hypotheses start at the root.
            trie: graph.initial_state(None),
        }];

        for t in 0..encodings_len {
            // The boosted loop can issue dozens of decoder calls per frame;
            // poll cancellation regularly so a long chunk still stops promptly.
            if t % 16 == 0 && self.abort.as_ref().map(|a| a()).unwrap_or(false) {
                return Err(TranscribeError::Inference("Transcription cancelled".to_string()));
            }
            let encoder_step = encodings.slice(ndarray::s![t, ..]);
            let encoder_step_dyn = encoder_step.to_owned().into_dyn();

            // Hypotheses that pick blank, plus any still emitting when the
            // per-frame token cap is hit, carry into the next frame.
            let mut advanced: Vec<Hyp> = Vec::new();
            let mut active = beam;

            for _round in 0..MAX_TOKENS_PER_STEP {
                if active.is_empty() {
                    break;
                }
                let mut next_active: Vec<Hyp> = Vec::new();
                for hyp in active.into_iter() {
                    let (probs, new_state) = self.decode_step(
                        hyp.tokens.last().copied().unwrap_or(self.blank_idx),
                        &hyp.state,
                        &encoder_step_dyn.view(),
                    )?;

                    let logits_slice = probs
                        .as_slice()
                        .ok_or_else(|| TranscribeError::Inference("Logits not contiguous".to_string()))?;
                    let vocab_logits: &[f32] = if probs.len() > self.vocab_size {
                        &logits_slice[..self.vocab_size]
                    } else {
                        logits_slice
                    };
                    let log_probs = log_softmax(vocab_logits);

                    // Candidates: the raw top-BEAM tokens plus blank plus
                    // every token the keyword graph can advance on from this
                    // hypothesis — boosting must be able to pull a keyword
                    // token into the candidate set even when the model ranks
                    // it below the beam. Top-K is kept by bounded insertion,
                    // not a full vocab sort.
                    let mut top: Vec<(i32, f64)> = Vec::with_capacity(BEAM + 1);
                    for (idx, &lp) in log_probs.iter().enumerate() {
                        if top.len() == BEAM && lp <= top[BEAM - 1].1 {
                            continue;
                        }
                        let pos = top.partition_point(|&(_, s)| s >= lp);
                        top.insert(pos, (idx as i32, lp));
                        if top.len() > BEAM {
                            top.pop();
                        }
                    }
                    if !top.iter().any(|&(token, _)| token == self.blank_idx) {
                        top.push((self.blank_idx, log_probs[self.blank_idx as usize]));
                    }
                    for &token in graph.transitions(hyp.trie).keys() {
                        if !top.iter().any(|&(t2, _)| t2 == token) {
                            top.push((token, log_probs[token as usize]));
                        }
                    }

                    for (token, logp) in top {
                        if token == self.blank_idx {
                            advanced.push(Hyp {
                                tokens: hyp.tokens.clone(),
                                timestamps: hyp.timestamps.clone(),
                                state: hyp.state.clone(),
                                score: hyp.score + logp,
                                boost: hyp.boost,
                                committed: hyp.committed,
                                commits: hyp.commits.clone(),
                                bonus: hyp.bonus,
                                trie: hyp.trie,
                            });
                        } else {
                            let (bonus, trie) = graph.advance(hyp.trie, token);
                            // `boost` tracks the current keyword path score
                            // (negative deltas refund it on divergence). A
                            // completed keyword's score is locked into
                            // `committed`, which is never refunded. `covered`
                            // is the portion of `boost` already committed by
                            // a completed keyword still on this path — the
                            // deepest such commit, whose score contains the
                            // shallower ones. So "cats" through "cat" credits
                            // only its extra score, while a divergent step
                            // drops the coverage and a following keyword
                            // scores in full.
                            let boost = hyp.boost + bonus as f64;
                            let covered = hyp
                                .commits
                                .iter()
                                // Strict ancestors only: reaching a node that
                                // already completed the same keyword is a new
                                // occurrence ("cat cat") and credits in full.
                                .filter(|&&(node, _)| {
                                    node != trie && graph.is_ancestor(node, trie)
                                })
                                .map(|&(_, s)| s)
                                .fold(0.0f64, f64::max);
                            let mut committed = hyp.committed;
                            let mut commits = hyp.commits.clone();
                            let mut bonus_rank = committed + boost - covered;
                            if graph.is_terminal(trie) {
                                committed += boost - covered;
                                commits.push((trie, boost));
                                bonus_rank = committed;
                            }
                            let mut tokens = hyp.tokens.clone();
                            tokens.push(token);
                            let mut timestamps = hyp.timestamps.clone();
                            timestamps.push(t);
                            next_active.push(Hyp {
                                tokens,
                                timestamps,
                                state: new_state.clone(),
                                score: hyp.score + logp,
                                boost,
                                committed,
                                commits,
                                bonus: bonus_rank,
                                trie,
                            });
                        }
                    }
                }
                active = next_active;
                if active.len() > BEAM {
                    active.sort_by(|a, b| {
                        b.rank(alpha).partial_cmp(&a.rank(alpha)).unwrap_or(std::cmp::Ordering::Equal)
                    });
                    active.truncate(BEAM);
                }
            }

            advanced.extend(active);
            advanced.sort_by(|a, b| {
                b.rank(alpha).partial_cmp(&a.rank(alpha)).unwrap_or(std::cmp::Ordering::Equal)
            });
            advanced.truncate(BEAM);
            beam = advanced;
        }

        let best = beam
            .into_iter()
            .max_by(|a, b| a.rank(alpha).partial_cmp(&b.rank(alpha)).unwrap_or(std::cmp::Ordering::Equal))
            .expect("beam is never empty");

        Ok((best.tokens, best.timestamps))
    }

    fn decode_tokens(&self, ids: Vec<i32>, timestamps: Vec<usize>) -> TimestampedResult {
        let tokens: Vec<String> = ids
            .iter()
            .filter_map(|&id| {
                let idx = id as usize;
                if idx < self.vocab.len() {
                    Some(self.vocab[idx].clone())
                } else {
                    None
                }
            })
            .collect();

        let text = match &*DECODE_SPACE_RE {
            Ok(regex) => regex
                .replace_all(&tokens.join(""), |caps: &regex::Captures| {
                    if caps.get(1).is_some() {
                        " "
                    } else {
                        ""
                    }
                })
                .to_string(),
            Err(_) => tokens.join(""),
        };

        let float_timestamps: Vec<f32> = timestamps
            .iter()
            .map(|&t| WINDOW_SIZE * SUBSAMPLING_FACTOR as f32 * t as f32)
            .collect();

        TimestampedResult {
            text,
            timestamps: float_timestamps,
            tokens,
        }
    }
}

fn log_softmax(logits: &[f32]) -> Vec<f64> {
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let mut sum = 0.0f64;
    for &x in logits {
        sum += ((x - max) as f64).exp();
    }
    let log_sum = sum.ln();
    logits
        .iter()
        .map(|&x| (x - max) as f64 - log_sum)
        .collect()
}

// ---- Timestamp conversion (verbatim from transcribe-rs) ----

fn convert_to_hierarchical_word_segments(
    timestamped_result: &TimestampedResult,
) -> Vec<TranscriptionSegment> {
    if timestamped_result.tokens.is_empty() || timestamped_result.timestamps.is_empty() {
        return Vec::new();
    }

    let tokens = create_tokens_from_timestamped_result(timestamped_result);
    let words = group_tokens_into_words(&tokens);

    words
        .iter()
        .filter(|w| !w.text.trim().is_empty())
        .map(|w| TranscriptionSegment {
            start: w.t_start,
            end: w.t_end,
            text: w.text.clone(),
        })
        .collect()
}

fn create_tokens_from_timestamped_result(timestamped_result: &TimestampedResult) -> Vec<Token> {
    timestamped_result
        .tokens
        .iter()
        .zip(timestamped_result.timestamps.iter())
        .enumerate()
        .map(|(i, (token_text, &timestamp))| {
            let t_end = timestamped_result
                .timestamps
                .get(i + 1)
                .copied()
                .unwrap_or(timestamp + 0.05);

            Token {
                text: token_text.clone(),
                t_start: timestamp,
                t_end,
                is_blank: token_text.trim().is_empty(),
            }
        })
        .collect()
}

fn group_tokens_into_words(tokens: &[Token]) -> Vec<Word> {
    let mut words = Vec::new();
    let mut current_word_tokens = Vec::new();

    for token in tokens {
        if token.is_blank {
            continue;
        }

        let starts_new_word = token.text.starts_with(' ')
            || token.text.starts_with("▁")
            || (current_word_tokens.is_empty() && !token.text.trim().is_empty());

        if starts_new_word && !current_word_tokens.is_empty() {
            let word = create_word_from_tokens(&current_word_tokens);
            if !word.text.is_empty() {
                words.push(word);
            }
            current_word_tokens.clear();
        }

        current_word_tokens.push(token.clone());
    }

    if !current_word_tokens.is_empty() {
        let word = create_word_from_tokens(&current_word_tokens);
        if !word.text.is_empty() {
            words.push(word);
        }
    }

    words
}

fn create_word_from_tokens(tokens: &[Token]) -> Word {
    if tokens.is_empty() {
        return Word {
            text: String::new(),
            t_start: 0.0,
            t_end: 0.0,
        };
    }

    let t_start = tokens.first().unwrap().t_start;
    let t_end = tokens.last().unwrap().t_end;

    let text = tokens
        .iter()
        .map(|t| {
            if t.text.starts_with("▁") {
                t.text.strip_prefix("▁").unwrap_or(&t.text)
            } else if t.text.starts_with(' ') {
                t.text.strip_prefix(' ').unwrap_or(&t.text)
            } else {
                &t.text
            }
        })
        .collect::<String>()
        .trim()
        .to_string();

    Word {
        text,
        t_start,
        t_end,
    }
}

