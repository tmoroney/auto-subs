# Diarization Improvement Plan (revision 2)

Revised 2026-09-29. Supersedes the first revision (in git history at `dadb103`),
which only compared this crate against `pyannote/speaker-diarization-community-1`.
This revision adds NVIDIA's Sortformer family, which hands-on testing found to be
clearly better, and re-ranks the original work items around it.

## TL;DR

1. **Add a Sortformer backend and make it the default.** Use
   **Nemotron-3-Diarization** (Sortformer v3, released 2026-09-23), not the older
   `diar_streaming_sortformer_4spk-v2.1`. It is better on every public benchmark,
   handles 8 speakers instead of 4, was trained on multilingual data, and ships
   under the permissive OpenMDW-1.1 license.
2. **Keep the current pyannote pipeline as the "Fast" backend** and as the
   automatic fallback when the user asks for more than 8 speakers. Its models are
   32 MB (vs 107 MB int8 or 400 MB fp32) and it uses a third or less of the memory.
3. **Vendor, don't depend.** Port the MIT-licensed Sortformer runtime from
   `altunenes/parakeet-rs` into this crate. Taking the crate as a dependency
   conflicts with our pinned `ort` and `ndarray` versions.
4. **The hard part is post-processing, not inference.** Sortformer emits
   overlapping per-speaker probabilities. Turning them into the disjoint,
   ASR-friendly `SpeechSegment`s AutoSubs needs is where our own code must be
   careful (see "Exclusive conversion" below: the naive approach drops speech).
5. **Ship an int8 model.** A dynamic int8 quantization is 107 MB instead of
   400 MB, 1.4 to 1.9x faster on CPU, and closely matched fp32 on the sample tested.
   It needs a proper eval before release.
6. Of the original plan, keep the eval harness (now essential), centroid
   updates and global clustering (for the Fast backend). Drop PLDA, powerset
   decoding and VBx: Sortformer makes them not worth the effort.

## Current pipeline (unchanged, for reference)

`segment.rs` runs pyannote `segmentation-community-1` over 10 s windows and
reduces its powerset output to binary speech/non-speech with hand-tuned
hysteresis. `embedding.rs` computes one 256-d WeSpeaker embedding per segment.
`identify.rs` assigns speakers in a single left-to-right pass by cosine
similarity against each speaker's *first-seen* embedding (threshold 0.5, no
centroid update, no second pass). Output is disjoint `SpeechSegment`s with
`speaker_id` `"1"`, `"2"`, ... or `"?"`.

Its weaknesses are structural: one embedding per segment regardless of length,
no overlap handling, and online assignment that can never revise an early
mistake. The benchmark below shows the last one directly: the same 40 s clip
repeated 15 times yields 7 speakers instead of the 5 found on a single copy.

## Candidates

| | Current (pyannote seg + WeSpeaker) | Streaming Sortformer 4spk v2.1 | **Nemotron-3-Diarization** |
|---|---|---|---|
| Approach | segmentation, per-segment embedding, online cosine matching | end-to-end, arrival-order speaker cache | end-to-end, arrival-order speaker cache |
| Max speakers | unlimited | 4 (degrades at 5+) | 8 |
| Overlap handling | none (argmax to speech flag) | native | native |
| Params / ONNX size | ~7M / 32 MB | 117M / 492 MB | 100M / 400 MB fp32, 107 MB int8 |
| Training languages | n/a (acoustic) | mostly English | multilingual (EN, ZH, Hindi, Indic, YODAS) |
| Output resolution | ~17 ms | 80 ms | 10 ms |
| License | MIT code; pyannote models MIT/CC-BY | NVIDIA Open Model License | **OpenMDW-1.1** (permissive, keep the license text) |
| ONNX export available | yes (in use) | yes (several) | yes, `altunenes/parakeet-rs`, validated against NeMo to ~7e-6 |

NVIDIA's own numbers for Nemotron-3 vs Sortformer v2.1 (offline config, DER %,
lower is better; SCA = speaker-count accuracy):

| Benchmark | v2.1 DER | Nemotron-3 DER | v2.1 SCA | Nemotron-3 SCA |
|---|---|---|---|---|
| DIHARD III full (1 to 9 spk) | 19.09 | **12.73** | 75.3 | **81.5** |
| CALLHOME part 2 full | 10.32 | **9.10** | 84.4 | **91.6** |
| AMI SDM (far-field meeting) | 21.42 | **11.14** | 93.8 | 87.5 |
| NOTSOFAR1 SC full (3 to 7 spk) | 30.49 | **11.00** | 33.1 | **78.1** |

There is no reason to integrate v2.1 at this point. If earlier testing used
v2.1, Nemotron-3 should be at least as good.

## Measured on CPU (this investigation)

4-core Intel Xeon 2.1 GHz container, `6_speakers.wav` from the pyannote-rs
releases (40.7 s) and the same clip tiled 15x (10.2 min) for throughput.
Sortformer run through `parakeet-rs` 0.3.8 with the `offline()` profile.

| Pipeline | Threads | RTFx (10 min file) | Peak RSS | Speakers (40 s / 10 min) |
|---|---|---|---|---|
| Current diarize crate (production options) | 1 | 38x | 167 MB | 5 / 7 |
| Nemotron-3 fp32 | 1 | 15x | 883 MB | 4 / 5 |
| Nemotron-3 fp32 | 4 | 37x | 887 MB | 4 / 5 |
| Nemotron-3 int8 (dynamic, MatMul only) | 1 | 28x | 429 MB | 4 / 5 |
| Nemotron-3 int8 (dynamic, MatMul only) | 4 | 53x | 437 MB | 4 / 5 |

Takeaways:

- **Speed is not a blocker.** int8 Sortformer at 4 threads is faster than the
  current single-threaded pipeline, and even fp32 at 1 thread diarizes an hour
  in about 4 minutes, which is small next to CPU transcription time for the
  same hour. Diarization runs before transcription (not concurrently) in
  `prepare_speech_segments`, so giving it several threads is safe.
- **Memory is the real cost.** Roughly 430 MB (int8) or 880 MB (fp32) versus
  170 MB. That is the honest reason to keep the light backend.
- **Speaker identity is stable over long audio.** Sortformer gave the same count
  on 40 s and on 10 min of the same clip. The current pipeline drifted from 5
  to 7.
- **The 6-speaker clip is a poor quality benchmark** (short concatenated
  snippets, not a conversation) and both pipelines under-count on it. Quality
  claims must come from the eval harness (Phase 0), not from this clip.

### Finding: naive thresholding drops speech

On the 6-speaker clip, Sortformer outputs no segment at all for 39.4 to 40.7 s,
although the region is clearly speech (isolated, the same audio is detected).
The raw 10 ms probabilities there are about `0.40` for one speaker channel and
`0.22` for another: the model is sure someone is talking but unsure who, and no
single channel crosses the 0.5 threshold that NeMo's (and parakeet-rs's)
per-speaker binarization uses.

For a diarizer that is a speaker-confusion error. For AutoSubs it is worse:
diarization output decides which audio gets transcribed, so **those words would
vanish from the subtitles**. The exclusive conversion below must decide "is
anyone speaking" separately from "who is speaking".

## Recommended design

### Crate layout

```
diarize/src/
  lib.rs              DiarizeOptions gains `backend`; diarize() dispatches
  pyannote/           current segment.rs, embedding.rs, identify.rs, plda.rs
  sortformer/
    features.rs       128-bin log-mel (STFT, bf16-rounded window and filterbank)
    model.rs          ONNX session, streaming loop, speaker-cache compression
    exclusive.rs      probabilities to disjoint SpeechSegments (our code)
```

Public contract stays as it is: `diarize(samples, sample_rate, options,
progress, is_cancelled) -> eyre::Result<Vec<SpeechSegment>>`, disjoint and
time-ordered, `"?"` still the unassigned sentinel.

```rust
pub enum DiarizeBackend {
    Sortformer { model_path: PathBuf },
    Pyannote { segment_model_path: PathBuf, embedding_model_path: PathBuf },
}
```

### Vendoring the Sortformer runtime

`altunenes/parakeet-rs` (MIT, same author as the ONNX files we already use)
has a complete, NeMo-validated implementation in one file
(`src/sortformer.rs`, ~1,400 lines): mel features, the chunked streaming loop
with FIFO and arrival-order speaker cache, cache compression, and binarization.

Do not add `parakeet-rs` as a dependency:

- it requires `ort 2.0.0-rc.13`; `transcription-engine` pins `=2.0.0-rc.12`,
  and `ort-sys` uses `links`, so two versions cannot coexist in one build;
- it uses `ndarray 0.17` (we are on 0.16);
- it unconditionally pulls `tokenizers` with the `onig` C library.

Porting the file is mostly mechanical: swap its error type for `eyre`, its
`ModelConfig` session builder for our `session.rs`, and `ndarray` 0.17 calls for
0.16. The only new dependency is `realfft` (pure Rust). Record the upstream
revision and license in `AUTOSUBS_IMPORT.md`, as was done for pyannote-rs.

The ONNX uses opset 17 (checked from the file), so our ORT version loads it.
Streaming defaults and the learned silence embedding live in the ONNX metadata,
which the runtime already reads.

What to change while porting:

- **Always use the `offline()` profile** (chunk 340, right context 40, FIFO 40,
  cache 264, update period 300). AutoSubs has the whole file, and offline is
  both the most accurate and the fastest setting. The low-latency presets are
  not needed.
- **Progress and cancellation per chunk.** One model call per 340 frames
  (27.2 s of audio); report `chunk_index / total_chunks` and check
  `is_cancelled` before each call.
- **Threads.** Our `session.rs` hardcodes 1 intra-op thread. For Sortformer use
  `min(4, available_parallelism / 2)`; see benchmark above.
- **Features per chunk, not whole file.** parakeet-rs computes mel features for
  the whole file up front (1 h is ~180 MB of f32). Fine for a first version;
  compute per chunk later if memory matters.

### Exclusive conversion (our code, the part that needs the most care)

Input: `P[t, k]`, speaker activity probabilities per 10 ms frame, 8 channels
ordered by arrival. Output: disjoint `SpeechSegment`s suitable for per-segment
ASR. Proposed steps:

1. **Speech activity from all channels together:**
   `speech[t] = 1 - prod_k(1 - P[t, k])` (or simply `sum_k P[t, k]`, clamped),
   binarized with hysteresis (onset about 0.5, offset about 0.35). This is what
   fixes the dropped-speech case above (`1 - 0.6 * 0.78 = 0.53`).
2. **Speaker per speech frame:** `argmax_k P[t, k]`, smoothed with a median
   filter over about 150 ms to stop single-frame flips.
3. **Overlap resolution** falls out of step 2: the dominant speaker wins,
   matching community-1's "exclusive" mode.
4. **Minimum turn length.** Absorb speaker turns shorter than about 0.4 s into
   the neighbouring turn whose speaker has the higher mean probability over the
   short turn. Sortformer happily emits 0.25 s turns (see 18.9 to 28.4 s on the
   test clip, one speaker in six pieces); ASR run per segment on 250 ms of audio
   produces garbage or hallucinations.
5. **Gap merging.** Merge same-speaker runs separated by less than about 0.5 s
   of silence into one segment. Whisper's `split_overlong_segments` already
   handles segments that end up too long.
6. **Padding.** Extend each segment by up to 100 ms at each end (never into a
   neighbour) so word onsets and offsets are not clipped.
7. **Labels.** Renumber speakers by first appearance *after* steps 1 to 5, so a
   channel that lost all its frames does not leave a gap ("Speaker 1, 3, 4").

All thresholds here are starting points to tune with the eval harness.

### `max_speakers` and the threshold setting

- UI slider values are 0 (auto), 2 to 10 (`diarize-selector.tsx`).
- **Auto or 2 to 8:** Sortformer. If more channels are active than the cap,
  keep the `max_speakers` channels with the most total activity and restrict
  step 2's argmax to them. That preserves "never exceed N".
- **9 or 10:** Sortformer cannot represent them; use the pyannote backend
  automatically (and say so in the run summary).
- `advanced.diarize_threshold` is a cosine threshold. It only applies to the
  pyannote backend; do not reuse it for Sortformer onset values.

### Model distribution

- Publish our own ONNX in an AutoSubs-owned HF repo (or reference
  `altunenes/parakeet-rs`, `nemotron-3-diarization/nemotron3_diar_v3.onnx`,
  if the model manager handles a subfolder path). Owning the repo lets us ship
  the int8 file and pin a revision.
- **int8:** `onnxruntime.quantization.quantize_dynamic(..., QInt8,
  op_types_to_quantize=["MatMul"])` produced a 107 MB file in 8 s. On the test
  clip, segment boundaries matched fp32 within 150 ms and one 0.2 s segment
  was dropped. Gate on
  the eval harness; compare against fp32 on DER and speaker count. Check
  CoreML and DirectML separately: int8 may run slower on GPU EPs than fp32,
  in which case ship fp32 for those platforms or fall back to CPU.
- Keep `LICENSE` (OpenMDW-1.1) next to the model and add it to the app's
  third-party notices. The license requires retaining the agreement text and
  notices when redistributing.
- `models.json`: add a second diarize entry (for example `speaker-diarize-accurate`)
  and generalize `ensure_diarize_models`, which currently assumes exactly
  `files[0]` and `files[1]`. `delete_diarize_model` and the downloaded-models
  list need the same treatment.

### UI

- One choice in the diarization settings: **Accurate** (Sortformer, default)
  or **Fast** (current). Titles 25 characters, descriptions 60, all 8 locales,
  plain language (see AGENTS.md section 6). No mention of model names.
- Download sizes shown next to each option. The first run of Accurate
  downloads the model, as today.

### Platform risks to check early

- **CoreML (macOS):** dynamic time axes can force partial CPU fallback on the
  CoreML EP. parakeet-rs reports CoreML support, and plain CPU is already 30x
  real time on an M3 per its README. If CoreML misbehaves, run Sortformer on
  CPU on macOS.
- **DirectML (Windows):** untested; same fallback.
- Memory on 8 GB machines when a large Whisper model is loaded afterwards: the
  Sortformer session must be dropped before transcription starts.

## Work items

### Phase 0: Eval harness (do first, blocks everything else)

Unchanged in spirit from revision 1, but now it decides a default for every
user, so it matters more.

- Fixtures: a handful of **VoxConverse** test files (CC-BY 4.0, YouTube
  debates and news, the closest public match to video-editing content) plus a
  few AMI meetings. Keep them outside git, like `example.wav`.
- Metrics:
  - DER without collar, computed from the exclusive output (a simple frame-level
    implementation with Hungarian speaker mapping is enough).
  - Speaker-count error.
  - **Missed-speech rate on the exclusive output.** This is what catches the
    dropped-words failure mode, which DER alone under-weights.
  - Time and peak memory.
- Form: an `examples/eval.rs` binary that prints a table per backend, plus a
  gated test like `tests/example_audio.rs`.

### Phase 1: Sortformer backend

1. Vendor and port `sortformer.rs` into `src/sortformer/` with the changes
   above. Unit tests for features (the parakeet-rs STFT tests port directly).
2. Implement `exclusive.rs` with unit tests on synthetic probability matrices:
   the split-probability case, short-turn absorption, gap merging, relabelling,
   `max_speakers` capping.
3. `DiarizeBackend` enum and dispatch in `lib.rs`. Pyannote code moves to
   `src/pyannote/` unchanged.
4. Model manager: second manifest entry, generalized `ensure_diarize_models`.
5. `engine.rs`: choose the backend from settings and `max_speakers`.
6. Acceptance: eval harness shows Sortformer ahead of the current pipeline on
   DER and speaker count, with missed speech no worse than the current
   pipeline; builds pass for `mac-aarch`, `windows`, `linux` features.

### Phase 2: int8 model and UI

1. Produce and eval the int8 model; decide per platform.
2. Settings UI and i18n (8 locales).
3. End to end in the app: multi-speaker file, check labels and speaker count.

### Phase 3: Improve the Fast backend (from revision 1, still worth doing)

- **Running centroids plus a reassignment pass** (revision 1, item 1). Small,
  fixes the "noisy first segment poisons a speaker" problem and the long-file
  drift measured above.
- **Global clustering** (revision 1, item 2): embed everything, then
  agglomerative clustering on cosine distance, `max_speakers` as a hard cap,
  short segments (under ~0.8 s) excluded from clustering and attached to the
  nearest centroid afterwards. This is the main quality win for the Fast
  backend and the only path for more than 8 speakers.
- **Speech-activity decision from probabilities** (revision 1, item 5) only
  if the eval shows the 500 ms onset hysteresis is losing short utterances.

### Dropped from revision 1

- **PLDA in production (item 3):** needs extra assets of unclear provenance and
  a recalibrated threshold, for a backend that is no longer the default.
- **Powerset decoding and overlap resolution (item 4):** Sortformer handles
  overlap natively; not worth restructuring the Fast backend for it.
- **VBx refinement:** same reasoning.
- **Embedding hygiene (item 6):** fold the duration gate into global
  clustering; skip sub-window embeddings.

## Alternatives considered

- **Depend on `parakeet-rs`:** version conflicts described above.
- **Sortformer v2 or v2.1 (4 speakers):** worse accuracy, half the speakers,
  more restrictive license, larger file.
- **NeMo-Speech.cpp / GGUF (q8_0, 107 MB):** adds a second native inference
  runtime next to ORT and whisper.cpp. ONNX through the existing `ort` is
  simpler and the int8 ONNX is the same size.
- **sherpa-onnx:** another native runtime; its offline diarization is the same
  segmentation plus embedding plus clustering design as the Fast backend.
- **Sortformer for local segments plus embeddings and clustering for more than
  8 speakers (NeMo-style long-form hybrid):** substantial complexity for a rare
  case. Revisit only if users with large panels ask for it.
- **Low-latency streaming profiles:** AutoSubs processes whole files; streaming
  buys nothing and costs speed and accuracy.

## Hard constraints (carried over)

- Output contract: disjoint, time-ordered `SpeechSegment`s,
  `speaker_id: Option<String>`, `"?"` never counted as a speaker.
- `progress_callback` (0 to 100) and `is_cancelled` keep working in every new
  loop.
- `eyre::Result` throughout (AGENTS.md section 5).
- `coreml` and `directml` cargo features keep compiling.

## References

- Nemotron-3-Diarization model card: https://huggingface.co/nvidia/nemotron-3-diarization
- ONNX export and Rust runtime: https://huggingface.co/altunenes/parakeet-rs/tree/main/nemotron-3-diarization,
  https://github.com/altunenes/parakeet-rs (`src/sortformer.rs`)
- Streaming Sortformer v2.1: https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1
- Streaming Sortformer paper: https://arxiv.org/abs/2507.18446
- pyannote community-1: https://huggingface.co/pyannote/speaker-diarization-community-1
