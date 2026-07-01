### Summary
Add the MMS-300M forced aligner (`onnx-community/mms-300m-1130-forced-aligner-ONNX`, int8 = 317MB) as an opt-in post-transcription stage that produces true word-level timestamps via CTC forced alignment. It runs a second ONNX inference pass (Wav2Vec2-CTC) over the audio + a Viterbi DP alignment against the final transcript text, replacing the interpolated word timestamps currently used by Moonshine/Cohere/Canary and optionally refining Whisper/Parakeet/SenseVoice. Driven by the `ort` crate (already used by `diarize`) and the `uroman` crate for romanization.

### How the model works
1. **Inference**: 16kHz mono waveform → ONNX session (`input_values` → `logits` `[1,T,32]`) → `log_softmax` → append a zero column for a synthetic `<star>` token (id 32) → `[T,33]` per-frame log-probs. Long audio chunked (30s windows, 2s context) then stitched.
2. **Text prep**: normalize → lowercase → strip punctuation → **romanize non-Latin via `uroman` crate** → split into words → interleave `<star>` → map chars to vocab ids (a-z=4..29, `'`=28, blank=0).
3. **CTC forced alignment**: Viterbi DP over `[T, 2L+1]` (blank-inserted target) → most likely monotonic token→frame path + per-frame scores.
4. **Span extraction**: merge repeated labels → char segments → group into words using `<star>` delimiters → frame indices → seconds via computed stride (~20ms) → pad word boundaries at adjacent blank midpoints → per-word confidence.

### Decisions
- **Romanization**: Use the [`uroman`](https://crates.io/crates/uroman) crate (v0.6.5) — pure-Rust reimplementation of the exact `uroman` tool the Python reference uses. Full multi-language coverage, no Java dependency.
- **Scope**: Optional refinement for **all** engines (user toggle).
- **Model**: `onnx/model_int8.onnx` (317MB) default.

### Implementation Steps

#### 1. `transcription-engine/Cargo.toml` — add `ort` + `uroman`
- Add `ort = { version = "2.0.0-rc.12", features = ["ndarray"] }` (pinned to match `diarize`/`transcribe-rs`).
- Add `uroman = "0.6.5"`.
- Add EP feature passthroughs mirroring `diarize/Cargo.toml`: extend `coreml`/`directml` to include `ort/coreml`/`ort/directml`, add `load-dynamic = ["ort/load-dynamic"]` and wire into `cuda`/`mac-x86_64` presets.

#### 2. `AutoSubs-App/models.json` + `manifest.rs` — add aligner manifest entry
- `models.json`: add top-level `aligner` (next to `vad`/`diarize`):
  ```json
  "aligner": {
    "id": "mms-forced-aligner",
    "repo": "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    "files": ["onnx/model_int8.onnx", "tokenizer.json", "vocab.json"],
    "ui": { "size": "317MB", "ram": "1GB", "image": "aligner.png", "accuracy": 5, "weight": 1, "languageSupport": { "kind": "multilingual" } }
  }
  ```
- `manifest.rs`: add `AlignerModel` struct (id/repo/files/ui) + `aligner()` accessor; extend `vad_and_diarize_are_wellformed` test to cover `aligner`.

#### 3. `model_manager.rs` — `ensure_aligner_model()`
- Add `pub async fn ensure_aligner_model(&self, progress, is_cancelled) -> Result<PathBuf>` modeled on `ensure_vad_model()`: downloads the 3 files via `ensure_hf_snapshot`/`ensure_hf_flat` into cache, returns path to the `.onnx`. Wrap in `tokio::time::timeout` (per the #530 hang fix).

#### 4. **NEW** `crates/transcription-engine/src/align.rs` — core forced-alignment module
- **`Aligner` struct**: holds `ort::Session` + vocab map (32 entries, loaded from downloaded `vocab.json`) + a `uroman::Uroman` instance.
- **`Aligner::load(onnx_path, vocab_path) -> Result<Self>`**: session via `GraphOptimizationLevel::Level3` pattern from `diarize/src/session.rs`; parse `vocab.json` into a `HashMap<String, i64>`; construct `Uroman::new()` (infallible).
- **`generate_emissions(&self, samples: &[f32]) -> Result<Array2<f64>>`**: run session (`input_values` `[1,N]`), extract `logits`, `log_softmax`, append `<star>` zero column → `[T,33]`. Chunked (30s/2s context) + stitched.
- **`forced_align(log_probs, targets, blank) -> (Vec<i64>, Vec<f64>)`**: pure-Rust port of torchaudio CTC `forced_align` Viterbi DP (forward over `[T,2L+1]` + backtrack).
- **`get_spans / merge_repeats / postprocess_results`**: ports of the Python reference → `Vec<WordTimestamp>` with real start/end/confidence.
- **`romanize(text, iso_lang) -> String`**: thin wrapper around `self.uroman.romanize_string::<rom_format::Str>(text, Some(iso_lang))`. Maps AutoSubs language codes (ISO 639-1 like `"ja"`, `"ru"`) to ISO 639-3 (`"jpn"`, `"rus"`) as expected by uroman.
- **`pub fn align_words(&self, samples: &[f32], text: &str, lang: Option<&str>) -> Result<Vec<WordTimestamp>>`**: top-level API. Normalizes text, romanizes via uroman, tokenizes to char-ids, runs emissions + forced_align + get_spans, returns `Vec<WordTimestamp>`.

#### 5. `types.rs` + `engine.rs` — wire into pipeline
- `types.rs`: add `enable_forced_alignment: Option<bool>` to `TranscribeOptions`; add `ProgressType::Align`.
- `engine.rs`: add `aligner_model_path: Option<String>` to `EngineConfig` (mirrors `vad_model_path`); update `Default` impl.
- In `transcribe_audio`, **after** `crate::engines::run_engine(...)` returns and **after** the translation post-pass (so we align the final output text), **before** `build_post_process_config`/`process_segments`:
  - If `enable_forced_alignment` is set: ensure/download aligner model via `ensure_aligner_model` (progress=`Download`, cancellation), load `Aligner` once.
  - For each `Segment`: slice `original_samples` to `[seg.start, seg.end]` (16kHz), call `aligner.align_words(slice, &seg.text, Some(&output_lang))`. Overwrite `seg.words` with the aligned result (clamped to `[seg.start, seg.end]`). On error for a segment, log + fall back to existing words for that segment.
- `lib.rs`: add `pub mod align;` + re-export `Aligner`.

#### 6. `transcription_api.rs` + React frontend — expose toggle
- Thread `enable_forced_alignment` through the `transcribe_audio` Tauri command + `EngineConfig` (mirror `enable_vad`).
- Add a UI toggle next to VAD/Diarize with tooltip: "Improves word-level timing using a forced-alignment pass (downloads ~317MB). Best for Moonshine/Cohere/Canary; can also refine Whisper." + i18n strings.
- Add aligner model card to the model manager UI (downloadable like diarize).

### Files to Modify
- `AutoSubs-App/src-tauri/crates/transcription-engine/Cargo.toml` — `ort` + `uroman` deps + feature passthroughs
- `AutoSubs-App/models.json` — `aligner` manifest entry
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/manifest.rs` — `AlignerModel` + accessor + test
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/model_manager.rs` — `ensure_aligner_model()`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/align.rs` — **NEW**: emissions, Viterbi DP, span extraction, uroman wrapper, `align_words`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/lib.rs` — `pub mod align;` + re-exports
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/types.rs` — `enable_forced_alignment`, `ProgressType::Align`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/engine.rs` — `aligner_model_path` in `EngineConfig`/`Default`, alignment stage after `run_engine` + translation
- `AutoSubs-App/src-tauri/src/transcription_api.rs` — thread option through Tauri command
- React frontend — toggle UI + i18n + aligner model card (specific files TBD during impl)

### Verification
- [ ] `cargo build --features mac-aarch` succeeds in `src-tauri`
- [ ] Manifest test extended to cover `aligner` passes
- [ ] Unit test in `align.rs`: `forced_align` on a synthetic log-prob matrix returns the expected path (golden vector from torchaudio reference)
- [ ] Unit test: `generate_emissions` output shape `[T,33]` and finite
- [ ] Unit test: `romanize` via uroman converts CJK/Cyrillic samples to Latin correctly
- [ ] Integration: transcribe a short clip with Moonshine + flag on → `segment.words` populated with non-uniform timestamps matching audio
- [ ] Integration: Whisper/Parakeet/SenseVoice unaffected when flag off; refinement works when flag on
- [ ] Integration: non-Latin language (e.g. Japanese with Moonshine) → alignment works via uroman romanization
- [ ] Cancellation + download progress work for aligner model fetch

### Risks / Considerations
- **License `cc-by-nc-4.0`** (non-commercial): fine for personal/local-first use; note in README/UI if AutoSubs has commercial distribution.
- **`uroman` crate maturity**: v0.6.5, pure Rust, passes original test suite. Verify publish date is >7 days old per dependency policy before adding.
- **Runtime/memory**: +317MB model + a second full-audio inference pass (~0.1–0.3x realtime on CPU) + uroman romanization (fast, 27x Python). Chunked emissions bound peak memory. Opt-in only.
- **ort pinning**: must stay `=2.0.0-rc.12` to match `diarize`/`transcribe-rs` (symbol conflicts otherwise).
- **Stride**: computed from `emissions.size(0)` vs. audio length (not hardcoded) to stay robust to chunking rounding.
- **Whisper DTW vs aligner**: aligner may or may not beat DTW; user chooses via the toggle.
- **Alignment stage placement**: runs after translation so it aligns the final output text; before formatting so the formatter benefits from real word timing. This is unchanged from the pre-refactor flow — `run_engine` returns segments, translation is applied, then alignment would insert here, then `process_segments`.