# Diarization Improvement Plan

Plan for improving speaker-assignment quality in this crate (`diarize`), handed off
for evaluation and implementation. Written 2026-09-29 against the current code.

## Context

This crate is an internalized fork of `thewh1teagle/pyannote-rs`
(see `AUTOSUBS_IMPORT.md`). It is called only from `transcription-engine`
(`crates/transcription-engine/src/engine.rs`, `prepare_speech_segments`) and its
output feeds the transcription engines — each `SpeechSegment` is transcribed and
its `speaker_id` copied onto every emitted chunk
(`engines/whisper.rs`, `engines/onnx/mod.rs`, then grouped in `formatting.rs`).

Models ship from `altunenes/speaker-diarization-community-1-onnx` (two files:
`segmentation-community-1.onnx`, `embedding_model.onnx`), declared in
`models.json` (`diarize` key) and downloaded by
`transcription-engine/src/model_manager.rs::ensure_diarize_models`. The
segmentation model is the ONNX export of pyannote `community-1` segmentation; the
embedding model is a wespeaker-family speaker encoder (256-d output).

## Current pipeline (as built)

1. **Segmentation** (`src/segment.rs`): the audio is processed in 10s windows
   stepped by 9s (1s overlap, deduplicated via `last_emitted_offset`). Per frame
   (~270 samples ≈ 16.9ms), the model's powerset-class logits are reduced to
   `argmax != 0` — a binary speech/non-speech decision. The powerset classes'
   per-frame *local speaker* and *overlap* information is discarded. Boundaries
   are produced by hand-tuned hysteresis: 500ms onset hysteresis, 5-frame gap
   tolerance, 150ms minimum segment duration. Output is a strictly disjoint,
   ordered stream of `Segment { start, end, samples }`.
2. **Embedding** (`src/embedding.rs`): each segment's samples are converted to
   kaldi fbank features via `knf-rs` and run through `embedding_model.onnx`,
   producing one raw 256-d embedding per segment regardless of segment length.
   A PLDA path (`new_with_plda`, `src/plda.rs`) exists but production uses
   `EmbeddingExtractor::new` — no whitening/LDA.
3. **Speaker assignment** (`src/identify.rs`, `src/lib.rs::label_speakers`):
   single left-to-right pass. Each embedding is compared by cosine similarity
   against each known speaker's *first-seen* embedding (no centroid update).
   Best match above `threshold` (default 0.5, from
   `options.advanced.diarize_threshold` in `engine.rs`) is assigned; otherwise a
   new speaker is created until `max_speakers` (`usize::MAX` when unset), after
   which the best match is force-assigned. Unassigned segments get `"?"`.

## Comparison reference

`pyannote/speaker-diarization-community-1` (HF model card) uses the same
segmentation + wespeaker components but: (a) decodes full powerset output,
including overlapped speech; (b) clusters all embeddings globally (card cites
VBx — Bayesian HMM clustering, Landini 2022); (c) ships an "exclusive" output
that resolves each frame to the dominant speaker for easier transcript
reconciliation. This crate already always produces exclusive output, but by
argmax rather than dominant-speaker selection.

## Hard constraints (do not break)

- **Output contract**: `diarize()` must keep returning disjoint, time-ordered
  `SpeechSegment`s with `speaker_id: Option<String>`; `"?"` is the unassigned
  sentinel and must not count as a speaker (UI counts distinct labels).
  Downstream transcribes per segment and cannot represent two simultaneous
  speakers — overlap must be *resolved* to one speaker, not emitted as
  overlapping segments.
- **Callbacks**: `progress_callback: Option<&ProgressFn>` (0–100) and
  `is_cancelled` must keep working; check cancellation inside any new loop.
- **Errors**: `eyre::Result` throughout (AGENTS.md §5).
- **Acceleration**: `ort` sessions are single-threaded with Level3 opts
  (`src/session.rs`); `coreml`/`directml` cargo features must keep compiling.
- **No new heavyweight deps without need**: current deps are `ort`, `ndarray`,
  `ndarray-npy`, `knf-rs`, `hound`, `eyre`, `tracing`, `sysinfo`.

## Work items

Ordered by expected impact per effort. Items 1–2 are independent; item 3 builds
on 1; item 4 is the largest and subsumes some of 2's motivation.

### 0. Eval harness — do first

Today the only quality gate is `tests/example_audio.rs`, a regression test over
a single gitignored fixture (`example.wav` + local models + `xvec_transform.npz`
+ `plda.npz`) that asserts exact boundaries and labels. Before changing
clustering, add a repeatable way to tell improvement from regression:

- Assemble a small set of labeled fixtures (or at minimum: audio files with
  known speaker counts and a few hand-checked turn boundaries). Keep them out
  of git as the existing fixture does, or in a HF repo next to the models.
- Extend the test pattern to score *speaker-count accuracy* and a simple
  per-segment label-agreement metric (exact DER is overkill; Hungarian-matched
  label agreement per segment is enough).
- This can be a `tests/` file gated on artifact presence like
  `example_audio.rs`, or an `examples/` binary for manual runs.

### 1. Speaker centroids + reassignment pass (small, do regardless)

Cheap improvements to `EmbeddingManager` that keep the current online structure:

- Maintain a running centroid (mean of assigned embeddings) per speaker instead
  of the first-seen embedding forever. A noise-dominated first segment currently
  poisons the speaker for the whole file.
- After the labeling pass, do a second pass reassigning every segment to its
  nearest centroid (above threshold), so early segments benefit from speakers
  discovered later.
- Acceptance: identical public API; existing test still passes (update expected
  labels if the fixture legitimately relabels); speaker count on fixture audio
  stable or improved.

### 2. Global clustering (medium, main quality win)

Replace the online assignment in `label_speakers` with a two-phase approach:

- Phase A: compute embeddings for all segments (keep per-segment progress +
  cancellation; this is the slow part anyway).
- Phase B: cluster embeddings globally, then map clusters back to segments.
  - Recommended: **agglomerative hierarchical clustering** with cosine distance
    and average/complete linkage. The `kodama` crate is a solid pure-Rust option;
    a hand-rolled O(n²) AHC is also fine at this scale (segments per file are
    typically < a few thousand).
  - `threshold` becomes the merge stop criterion (`1 - threshold` as distance);
    `max_speakers` becomes a hard cap on cluster count. Preserve the semantics
    that `max_speakers` set means "never exceed", not "exactly N".
  - Segments below a minimum duration (~0.5–1s) produce unreliable embeddings:
    exclude them from clustering input and assign them to the nearest cluster
    centroid afterwards (or `"?"` if below threshold).
- Stretch goal (only if item 3 lands and evals justify it): VBx-style
  refinement (PLDA scoring + VB-HMM over the AHC initialization), matching what
  community-1 cites. AHC + PLDA scoring captures most of the benefit at a
  fraction of the complexity.

### 3. Wire PLDA into production (small-medium, gated on assets)

`new_with_plda` + `src/plda.rs` are implemented and exercised by
`tests/example_audio.rs`, but unused in production and the required
`xvec_transform.npz`/`plda.npz` are **not** in the downloaded model bundle
(verify: the HF repo ships only the two ONNX files).

- Source the transform assets (pyannote-rs upstream releases carried them;
  pyannote pipeline bundles ship equivalent files — verify compatibility with
  the wespeaker embedding dims: 256 in, ~128 out).
- Extend `models.json`'s `diarize.files` and `ensure_diarize_models` to download
  them; currently the function assumes exactly `files[0]`/`files[1]`.
- Recalibrate the similarity threshold: PLDA-space cosine has a different scale
  than raw 256-d cosine. The default 0.5 will not transfer; pick from the eval
  harness and update the default in `engine.rs`.
- Keep raw-cosine as a fallback when the npz files are absent.

### 4. Powerset decoding + overlap resolution (largest)

`segment.rs` reduces `[frames, K]` powerset logits to binary speech. The
community-1 segmentation model emits per-frame powerset classes (local speaker
sets, including simultaneous pairs — confirm K from the ONNX output shape
before designing around it; pyannote uses 7 for 3 local speakers with ≤2
simultaneous). Using them properly unlocks:

- **Overlap detection** for free (pair classes).
- **Exclusive dominant-speaker frames**: instead of argmax over classes →
  speech flag, resolve each frame to the single most probable local speaker —
  community-1's "exclusive" mode, and directly compatible with our disjoint
  output contract.
- **Local speaker tracking within/across windows**: frames attributed to the
  same local speaker give clean embedding input — embed only single-speaker
  spans rather than whole segments that may straddle a turn change.
- Note pyannote additionally tracks local speakers across the sliding window
  (each window has its own speaker numbering); a simpler equivalent is to use
  local-speaker attribution only for *cleaning embedding input* and let global
  clustering (item 2) handle file-level identity.

This item requires restructuring `Segment`/`get_segments` output (a segment's
`samples` may no longer be contiguous single-speaker audio), so it should be
scoped and eval'd separately from items 1–3.

### 5. Binarization parity (medium, cheap if item 4 lands)

Replace argmax + fixed hysteresis with probability-based decisions comparable
to pyannote's `binarize`: sigmoid the per-frame speech probability, onset/offset
thresholds (~0.5/0.7), `min_duration_on`/`min_duration_off` in place of
`gap_tolerance_frames`/`start_hysteresis`. The 500ms onset hysteresis almost
certainly swallows short backchannels today; whether that matters for
subtitling is a judgment call — measure.

### 6. Embedding hygiene (medium)

- Gate embedding computation by segment duration; very short segments yield
  noise embeddings that currently become speaker anchors.
- For long segments, consider extracting embeddings over a sliding sub-window
  (pyannote embeds fixed crops inside speech turns, not one-per-segment).
- With item 4: mask/median-pool embeddings over frames attributed to the same
  local speaker rather than averaging over the whole segment.

## Verification

- `cargo test -p diarize` (existing unit tests + fixture regression).
- `cargo build` under each feature combo used by the app builds
  (`mac-aarch` → `coreml`, `windows` → `directml`, `linux` → none) — see
  `AutoSubs-App` npm scripts for the exact flags.
- End-to-end: `npm run dev` in `AutoSubs-App`, transcribe a multi-speaker file
  with diarization on; check speaker labels in the subtitle view and that the
  "N speakers" count looks right.
- Eval harness results before/after each item (item 0).

## Risks / open questions

- **Threshold recalibration** when moving to PLDA space or clustered centroids —
  the 0.5 default is tuned (loosely) to raw wespeaker cosine.
- **Ordering**: `get_segments` is a lazy iterator interleaved with ONNX calls;
  item 4 restructures this — keep the streaming API or make buffering explicit.
- **PLDA asset licensing/provenance** — confirm the npz files' source and
  license before bundling them in `models.json`.
- **`max_speakers` UX**: unlimited default means clustering quality alone
  decides speaker count; AHC thresholding is the only guard against
  over-splitting on noisy audio.
- **Perf**: clustering is O(n²) in segments — fine for subtitle-scale files;
  embeddings remain the bottleneck. Keep per-segment progress reporting.
