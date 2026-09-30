//! Streaming Sortformer inference (Nemotron-3-Diarization / Sortformer v3, 8 speakers).
//!
//! Ported from `altunenes/parakeet-rs` `src/sortformer.rs` (MIT, see `AUTOSUBS_IMPORT.md`),
//! which reproduces NeMo's `SortformerEncLabelModel` streaming loop: a FIFO of recent frames
//! and an arrival-order speaker cache compressed to its most informative frames. AutoSubs
//! always has the whole file, so only the offline profile (30.4 s chunks) is used, which is
//! both the fastest and the most accurate setting.
//!
//! The model tracks the stream at 80 ms frames (these drive the speaker cache) and predicts
//! speaker activity at 10 ms frames, which is what [`SortformerModel::predict`] returns.

use super::features::{MelExtractor, Sample, N_MELS};
use crate::session;
use eyre::{bail, eyre, Context, Result};
use ndarray::{concatenate, s, Array1, Array2, Array3, ArrayView3, Axis};
use ort::session::{Session, SessionOutputs};
use ort::value::{Tensor, TensorRef};
use std::path::Path;

pub const NUM_SPEAKERS: usize = 8;
/// Mel frames (10 ms) per model frame (80 ms).
const SUBSAMPLING: usize = 8;
/// Output frames (10 ms) per model frame (80 ms).
const UPSAMPLE_FACTOR: usize = 8;
const EMB_DIM: usize = 512;

// Offline profile; the exporter writes the same values into the ONNX metadata.
const CHUNK_LEN: usize = 340;
const RIGHT_CONTEXT: usize = 40;
const FIFO_LEN: usize = 40;
const SPKCACHE_LEN: usize = 264;
const SPKCACHE_UPDATE_PERIOD: usize = 300;

// Speaker-cache compression constants, as NeMo.
const SPKCACHE_SIL_FRAMES_PER_SPK: usize = 1;
const PRED_SCORE_THRESHOLD: f32 = 0.25;
const STRONG_BOOST_RATE: f32 = 0.75;
const WEAK_BOOST_RATE: f32 = 1.5;
const MIN_POS_SCORES_RATE: f32 = 0.5;
const SCORES_BOOST_LATEST: f32 = 0.05;

pub struct SortformerModel {
    session: Session,
    mel: MelExtractor,
    chunk_len: usize,
    right_context: usize,
    fifo_len: usize,
    spkcache_len: usize,
    spkcache_update_period: usize,
    /// Learned embedding for silence / unused cache slots (from ONNX metadata).
    sil_emb: Array1<f32>,
    state: StreamState,
}

/// Per-recording streaming state.
struct StreamState {
    spkcache: Array3<f32>,               // (1, 0..spkcache_len, EMB_DIM)
    spkcache_preds: Option<Array3<f32>>, // (1, 0..spkcache_len, NUM_SPEAKERS), 80 ms
    fifo: Array3<f32>,                   // (1, 0..fifo_len, EMB_DIM)
    fifo_preds: Array3<f32>,             // (1, 0..fifo_len, NUM_SPEAKERS), 80 ms
}

impl StreamState {
    fn new() -> Self {
        Self {
            spkcache: Array3::zeros((1, 0, EMB_DIM)),
            spkcache_preds: None,
            fifo: Array3::zeros((1, 0, EMB_DIM)),
            fifo_preds: Array3::zeros((1, 0, NUM_SPEAKERS)),
        }
    }
}

impl SortformerModel {
    pub fn new(model_path: &Path, intra_threads: usize) -> Result<Self> {
        let session = session::create_session_with_threads(model_path, intra_threads)?;

        let has_output = |name: &str| session.outputs().iter().any(|o| o.name() == name);
        if !has_output("preds_diar") || !has_output("preds_hires") {
            bail!(
                "{} is not a Nemotron-3-Diarization (Sortformer v3) export: it has no \
                 preds_diar/preds_hires outputs",
                model_path.display()
            );
        }

        let (params, sil_emb) = {
            let metadata = session.metadata().ok();
            let custom = |key: &str| metadata.as_ref().and_then(|m| m.custom(key));
            let get = |key: &str, default: usize| -> usize {
                custom(key).and_then(|v| v.parse().ok()).unwrap_or(default)
            };
            let sil_emb = custom("learnable_sil_emb")
                .map(|raw| {
                    raw.split(',')
                        .filter_map(|v| v.trim().parse().ok())
                        .collect::<Vec<f32>>()
                })
                .filter(|v| v.len() == EMB_DIM)
                .map(Array1::from_vec)
                .unwrap_or_else(|| Array1::zeros(EMB_DIM));
            let params = [
                get("chunk_len", CHUNK_LEN),
                get("right_context", RIGHT_CONTEXT),
                get("fifo_len", FIFO_LEN),
                get("spkcache_len", SPKCACHE_LEN),
                get("spkcache_update_period", SPKCACHE_UPDATE_PERIOD),
            ];
            (params, sil_emb)
        };
        let [chunk_len, right_context, fifo_len, spkcache_len, spkcache_update_period] = params;

        let model = Self {
            session,
            mel: MelExtractor::new(),
            chunk_len,
            right_context,
            fifo_len,
            spkcache_len,
            spkcache_update_period,
            sil_emb,
            state: StreamState::new(),
        };
        if model.chunk_len == 0 || model.spkcache_len == 0 || model.spkcache_len % NUM_SPEAKERS != 0 {
            bail!("invalid Sortformer streaming parameters in ONNX metadata");
        }
        Ok(model)
    }

    /// Speaker activity probabilities `[frames, NUM_SPEAKERS]`, one row per 10 ms, for a
    /// whole 16 kHz mono recording (i16, or f32 in [-1, 1]). Channels are ordered by each
    /// speaker's first appearance. `on_chunk(done, total)` runs after every model call and
    /// returns `false` to cancel.
    pub fn predict<S: Sample>(
        &mut self,
        audio: &[S],
        mut on_chunk: impl FnMut(usize, usize) -> bool,
    ) -> Result<Array2<f32>> {
        self.state = StreamState::new();

        let total_frames = MelExtractor::num_frames(audio.len());
        let chunk_stride = self.chunk_len * SUBSAMPLING;
        let feed_size = (self.chunk_len + self.right_context) * SUBSAMPLING;
        let num_chunks = total_frames.div_ceil(chunk_stride);

        let mut all_preds = Vec::with_capacity(num_chunks);
        for chunk_idx in 0..num_chunks {
            let start = chunk_idx * chunk_stride;
            let end = (start + feed_size).min(total_frames);
            let current_len = end - start;

            // The graph has dynamic time axes; it only needs whole 80 ms frames.
            let padded_len = current_len.next_multiple_of(SUBSAMPLING);
            let mut chunk = Array3::<f32>::zeros((1, padded_len, N_MELS));
            chunk
                .slice_mut(s![0, ..current_len, ..])
                .assign(&self.mel.frames(audio, start, end)?);

            all_preds.push(self.streaming_update(chunk.view(), current_len)?);

            if !on_chunk(chunk_idx + 1, num_chunks) {
                bail!("Cancelled");
            }
        }

        let views: Vec<_> = all_preds.iter().map(|p| p.view()).collect();
        let mut preds = if views.is_empty() {
            Array2::zeros((0, NUM_SPEAKERS))
        } else {
            concatenate(Axis(0), &views)?
        };
        // The last chunk rounds up to whole 80 ms frames; trim to the 10 ms frame count.
        if preds.nrows() > total_frames {
            preds = preds.slice(s![..total_frames, ..]).to_owned();
        }
        Ok(preds)
    }

    /// NeMo's `streaming_update` with speaker-cache compression. The 80 ms predictions update
    /// the FIFO and speaker cache; the chunk's 10 ms predictions are returned.
    fn streaming_update(&mut self, chunk: ArrayView3<f32>, current_len: usize) -> Result<Array2<f32>> {
        let cache_len = self.state.spkcache.shape()[1];
        let fifo_len = self.state.fifo.shape()[1];

        let chunk_value = tensor_view(chunk)?;
        let spkcache_value = tensor_view(self.state.spkcache.view())?;
        let fifo_value = tensor_view(self.state.fifo.view())?;
        let outputs = self
            .session
            .run(ort::inputs![
                "chunk" => chunk_value,
                "chunk_lengths" => Tensor::from_array(([1usize], vec![current_len as i64]))?,
                "spkcache" => spkcache_value,
                "spkcache_lengths" => Tensor::from_array(([1usize], vec![cache_len as i64]))?,
                "fifo" => fifo_value,
                "fifo_lengths" => Tensor::from_array(([1usize], vec![fifo_len as i64]))?
            ])
            .map_err(|e| eyre!("Sortformer inference failed: {e}"))?;
        let preds_diar = extract_3d(&outputs, "preds_diar")?;
        let preds_hires = extract_3d(&outputs, "preds_hires")?;
        let chunk_embs = extract_3d(&outputs, "chunk_pre_encode_embs")?;
        drop(outputs);

        // Right-context frames only provided lookahead; keep the chunk's own frames.
        let keep = self.chunk_len.min(current_len.div_ceil(SUBSAMPLING));
        let chunk_start = cache_len + fifo_len;

        let fifo_preds = preds_diar.slice(s![.., cache_len..chunk_start, ..]).to_owned();
        let chunk_preds = preds_diar
            .slice(s![.., chunk_start..chunk_start + keep, ..])
            .to_owned();
        let hires_start = chunk_start * UPSAMPLE_FACTOR;
        let chunk_preds_hires = preds_hires
            .slice(s![0, hires_start..hires_start + keep * UPSAMPLE_FACTOR, ..])
            .to_owned();

        let state = &mut self.state;
        state.fifo = concat1(&state.fifo, &chunk_embs.slice(s![.., ..keep, ..]).to_owned())?;
        state.fifo_preds = concat1(&fifo_preds, &chunk_preds)?;

        // Move the oldest FIFO frames into the speaker cache once the FIFO overflows.
        let fifo_len_after = state.fifo.shape()[1];
        if fifo_len_after > self.fifo_len {
            let pop_len = self
                .spkcache_update_period
                .max((keep + fifo_len).saturating_sub(self.fifo_len))
                .min(fifo_len_after);

            let pop_embs = state.fifo.slice(s![.., ..pop_len, ..]).to_owned();
            let pop_preds = state.fifo_preds.slice(s![.., ..pop_len, ..]).to_owned();
            state.fifo = state.fifo.slice(s![.., pop_len.., ..]).to_owned();
            state.fifo_preds = state.fifo_preds.slice(s![.., pop_len.., ..]).to_owned();

            state.spkcache = concat1(&state.spkcache, &pop_embs)?;
            if let Some(cache_preds) = &state.spkcache_preds {
                state.spkcache_preds = Some(concat1(cache_preds, &pop_preds)?);
            }

            if state.spkcache.shape()[1] > self.spkcache_len {
                if state.spkcache_preds.is_none() {
                    let initial = preds_diar.slice(s![.., ..cache_len, ..]).to_owned();
                    state.spkcache_preds = Some(concat1(&initial, &pop_preds)?);
                }
                self.compress_spkcache();
            }
        }

        Ok(chunk_preds_hires)
    }

    /// Keep the `spkcache_len` most informative cache frames, per speaker, as NeMo.
    fn compress_spkcache(&mut self) {
        let Some(cache_preds) = self.state.spkcache_preds.take() else {
            return;
        };
        let preds = cache_preds.slice(s![0, .., ..]).to_owned();
        let n_frames = preds.nrows();

        let per_spk = self.spkcache_len / NUM_SPEAKERS;
        if per_spk <= SPKCACHE_SIL_FRAMES_PER_SPK {
            self.state.spkcache = self.state.spkcache.slice(s![.., ..self.spkcache_len, ..]).to_owned();
            self.state.spkcache_preds = Some(cache_preds.slice(s![.., ..self.spkcache_len, ..]).to_owned());
            return;
        }
        let len_per_spk = per_spk - SPKCACHE_SIL_FRAMES_PER_SPK;
        let strong_boost = (len_per_spk as f32 * STRONG_BOOST_RATE) as usize;
        let weak_boost = (len_per_spk as f32 * WEAK_BOOST_RATE) as usize;
        let min_pos_scores = (len_per_spk as f32 * MIN_POS_SCORES_RATE) as usize;

        let mut scores = log_pred_scores(&preds);
        disable_low_scores(&preds, &mut scores, min_pos_scores);

        // Slightly favour frames appended since the last compression.
        for t in self.spkcache_len.min(n_frames)..n_frames {
            for spk in 0..NUM_SPEAKERS {
                scores[[t, spk]] += SCORES_BOOST_LATEST;
            }
        }

        boost_topk_scores(&mut scores, strong_boost, 2.0);
        boost_topk_scores(&mut scores, weak_boost, 1.0);

        // Silence placeholders always win a slot.
        let mut padded = Array2::from_elem(
            (n_frames + SPKCACHE_SIL_FRAMES_PER_SPK, NUM_SPEAKERS),
            f32::NEG_INFINITY,
        );
        padded.slice_mut(s![..n_frames, ..]).assign(&scores);
        padded.slice_mut(s![n_frames.., ..]).fill(f32::INFINITY);

        let selected = topk_frames(&padded, n_frames, self.spkcache_len);

        let mut new_embs = Array3::zeros((1, self.spkcache_len, EMB_DIM));
        let mut new_preds = Array3::zeros((1, self.spkcache_len, NUM_SPEAKERS));
        for (i, frame) in selected.into_iter().enumerate() {
            match frame {
                // Disabled slots get the silence embedding; predictions stay zero.
                None => new_embs.slice_mut(s![0, i, ..]).assign(&self.sil_emb),
                Some(idx) if idx < self.state.spkcache.shape()[1] => {
                    new_embs
                        .slice_mut(s![0, i, ..])
                        .assign(&self.state.spkcache.slice(s![0, idx, ..]));
                    new_preds
                        .slice_mut(s![0, i, ..])
                        .assign(&cache_preds.slice(s![0, idx, ..]));
                }
                Some(_) => {}
            }
        }
        self.state.spkcache = new_embs;
        self.state.spkcache_preds = Some(new_preds);
    }
}

/// Zero-copy input view. Built through `ort`'s own ndarray version rather than a
/// `(shape, &[f32])` pair, because ort rejects zero-length dimensions from raw slices and
/// the speaker cache and FIFO start out empty.
fn tensor_view(array: ArrayView3<'_, f32>) -> Result<TensorRef<'_, f32>> {
    let data = array
        .to_slice()
        .ok_or_else(|| eyre!("Sortformer input tensor is not contiguous"))?;
    let shape = (array.shape()[0], array.shape()[1], array.shape()[2]);
    let view = ort_ndarray::ArrayView3::from_shape(shape, data)?;
    TensorRef::from_array_view(view).map_err(|e| eyre!("Failed to prepare inputs: {e}"))
}

fn extract_3d(outputs: &SessionOutputs<'_>, name: &str) -> Result<Array3<f32>> {
    let (shape, data) = outputs
        .get(name)
        .ok_or_else(|| eyre!("Sortformer output '{name}' not found"))?
        .try_extract_tensor::<f32>()
        .with_context(|| format!("Failed to extract '{name}'"))?;
    if shape.len() != 3 {
        bail!("Expected a 3D tensor for '{name}', got {} dims", shape.len());
    }
    let dims = (shape[0] as usize, shape[1] as usize, shape[2] as usize);
    Ok(Array3::from_shape_vec(dims, data.to_vec())?)
}

fn concat1(a: &Array3<f32>, b: &Array3<f32>) -> Result<Array3<f32>> {
    if a.shape()[1] == 0 {
        return Ok(b.clone());
    }
    if b.shape()[1] == 0 {
        return Ok(a.clone());
    }
    Ok(concatenate(Axis(1), &[a.view(), b.view()])?)
}

/// NeMo: `log(p) - log(1 - p) + sum_s log(1 - p_s) - log(0.5)`, each term clamped.
fn log_pred_scores(preds: &Array2<f32>) -> Array2<f32> {
    let mut scores = Array2::zeros(preds.dim());
    for t in 0..preds.nrows() {
        let log_1_probs_sum: f32 = (0..NUM_SPEAKERS)
            .map(|spk| (1.0 - preds[[t, spk]]).max(PRED_SCORE_THRESHOLD).ln())
            .sum();
        for spk in 0..NUM_SPEAKERS {
            let p = preds[[t, spk]];
            let log_p = p.max(PRED_SCORE_THRESHOLD).ln();
            let log_1_p = (1.0 - p).max(PRED_SCORE_THRESHOLD).ln();
            scores[[t, spk]] = log_p - log_1_p + log_1_probs_sum - 0.5f32.ln();
        }
    }
    scores
}

/// Disable non-speech frames, and overlapped-speech frames for speakers with enough
/// clean frames.
fn disable_low_scores(preds: &Array2<f32>, scores: &mut Array2<f32>, min_pos_scores: usize) {
    let mut pos_count = [0usize; NUM_SPEAKERS];
    for t in 0..scores.nrows() {
        for (spk, count) in pos_count.iter_mut().enumerate() {
            if scores[[t, spk]] > 0.0 {
                *count += 1;
            }
        }
    }
    for t in 0..preds.nrows() {
        for spk in 0..NUM_SPEAKERS {
            let non_speech = preds[[t, spk]] <= 0.5;
            let overlapped = scores[[t, spk]] <= 0.0 && pos_count[spk] >= min_pos_scores;
            if non_speech || overlapped {
                scores[[t, spk]] = f32::NEG_INFINITY;
            }
        }
    }
}

fn boost_topk_scores(scores: &mut Array2<f32>, n_boost: usize, scale: f32) {
    for spk in 0..NUM_SPEAKERS {
        let mut order: Vec<usize> = (0..scores.nrows()).collect();
        order.sort_by(|&a, &b| {
            scores[[b, spk]]
                .partial_cmp(&scores[[a, spk]])
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        for &t in order.iter().take(n_boost) {
            if scores[[t, spk]] != f32::NEG_INFINITY {
                scores[[t, spk]] -= scale * 0.5f32.ln();
            }
        }
    }
}

/// Top `k` (speaker, frame) scores, flattened speaker-major as NeMo, returned in ascending
/// flat order as frame indices. `None` marks a disabled slot (non-finite score, or a
/// silence placeholder frame at or past `n_real_frames`).
fn topk_frames(scores: &Array2<f32>, n_real_frames: usize, k: usize) -> Vec<Option<usize>> {
    let n_frames = scores.nrows();
    let mut flat: Vec<(usize, f32)> = (0..NUM_SPEAKERS)
        .flat_map(|spk| (0..n_frames).map(move |t| (spk * n_frames + t, spk, t)))
        .map(|(idx, spk, t)| (idx, scores[[t, spk]]))
        .collect();
    // Stable sort, so ties keep flat order as `torch.topk` does on CPU.
    flat.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut top: Vec<usize> = flat
        .iter()
        .take(k)
        .map(|&(idx, score)| if score == f32::NEG_INFINITY { usize::MAX } else { idx })
        .collect();
    top.sort_unstable();

    let mut selected = vec![None; k];
    for (slot, flat_idx) in selected.iter_mut().zip(top) {
        if flat_idx != usize::MAX {
            let frame = flat_idx % n_frames;
            if frame < n_real_frames {
                *slot = Some(frame);
            }
        }
    }
    selected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topk_prefers_high_scores_and_disables_negative_infinity() {
        let mut scores = Array2::from_elem((4, NUM_SPEAKERS), f32::NEG_INFINITY);
        scores[[2, 0]] = 3.0;
        scores[[1, 1]] = 2.0;
        let selected = topk_frames(&scores, 4, 3);
        // Flat order: speaker 0 frame 2 (idx 2), then speaker 1 frame 1 (idx 5).
        assert_eq!(selected, vec![Some(2), Some(1), None]);
    }

    #[test]
    fn silence_placeholder_frames_are_disabled() {
        let mut scores = Array2::from_elem((3, NUM_SPEAKERS), f32::NEG_INFINITY);
        scores[[2, 0]] = f32::INFINITY; // placeholder row at index n_real_frames
        let selected = topk_frames(&scores, 2, 2);
        assert_eq!(selected, vec![None, None]);
    }

    #[test]
    fn non_speech_frames_are_never_cache_candidates() {
        let mut preds = Array2::zeros((3, NUM_SPEAKERS));
        preds[[0, 0]] = 0.9;
        preds[[1, 0]] = 0.4;
        let mut scores = log_pred_scores(&preds);
        disable_low_scores(&preds, &mut scores, 10);
        assert!(scores[[0, 0]].is_finite());
        assert_eq!(scores[[1, 0]], f32::NEG_INFINITY);
        assert_eq!(scores[[2, 3]], f32::NEG_INFINITY);
    }
}
