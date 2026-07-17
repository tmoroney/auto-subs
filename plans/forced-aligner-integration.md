### Summary

Add the MMS-300M forced aligner (`onnx-community/mms-300m-1130-forced-aligner-ONNX`, INT8 = 317MB) as an opt-in, non-translation post-transcription stage that produces acoustically grounded word-level timestamps via CTC forced alignment. It runs a second ONNX inference pass over the original 16kHz audio and aligns the source-language transcript with a Viterbi path. This replaces interpolated word timestamps from Moonshine/Cohere/Canary and can optionally refine native timestamps from Whisper/Parakeet/SenseVoice.

The feature uses the existing `ort` version already shared by `diarize` and `transcribe-rs`, plus `uroman` for scripts that need romanization. The MMS weights are licensed separately under CC BY-NC 4.0, are downloaded on demand, and are not covered by AutoSubs' MIT license.

### How the model works

1. **Audio preprocessing**: Convert the normalized WAV's `i16` mono samples to `f32` in `[-1, 1]`, then reproduce `Wav2Vec2FeatureExtractor(do_normalize=true)` by applying zero-mean/unit-variance normalization over valid samples.
2. **Inference**: 16kHz mono waveform → ONNX session (`input_values` → `logits` `[1,T,31]`) → `log_softmax` → append a zero-log-probability column for synthetic `<star>` token ID 31 → `[T,32]` emissions.
3. **Chunking**: For long input, use 30s windows with 2s left/right context. Window and context sample counts must be exact multiples of the model's 320-sample input-to-logit ratio. Trim context and final extension frames exactly as the Python reference does, then stitch retained frames.
4. **Text preparation**: Apply language-aware Unicode normalization, mappings, punctuation/deletion rules, number handling, whitespace normalization, and lowercase behavior matching the reference implementation. Romanize through `uroman` where needed, while retaining a mapping from every normalized alignment unit back to the original displayed word/character.
5. **Tokenization**: Load all token IDs from `vocab.json`; never assume alphabetical or contiguous IDs. Interleave synthetic `<star>` alignment units using the reference policy. Japanese and Chinese use character-level source units; space-delimited languages use words.
6. **CTC forced alignment**: Run a log-space Viterbi alignment equivalent to torchaudio's `forced_align`, including blank transitions, repeated-token constraints, traceback, and per-frame scores. Reject targets when `T < target_len + consecutive_repeat_count` before allocating the DP workspace.
7. **Span extraction**: Merge repeated labels, recover alignment-unit spans, divide adjacent blank regions at their midpoint, map units back to the original display text, and produce local start/end/confidence values.
8. **Timestamp conversion**: Convert frames using the fixed model ratio (`320 / 16000 = 0.020s` per retained frame), not `audio_duration / frame_count`, which can drift because convolution output lengths round down.

### Decisions

- **Model**: `onnx/model_int8.onnx` (317MB) is the default artifact.
- **Scope**: Optional refinement for all transcription engines when the final transcript still represents the spoken audio.
- **Translation**: Forced alignment is disabled whenever translation is enabled, including native Whisper/Canary translation and the Google Translate post-pass. Translated words are not the words spoken in the audio and therefore cannot be force-aligned. Existing translated-word interpolation remains unchanged.
- **Romanization**: Use `uroman = "0.6.5"`. It is an Apache-2.0 Rust reimplementation and was published more than seven days ago.
- **Timeline offsets**: Audio slicing uses source-audio time (`segment timestamp - user offset`); returned local alignment times are shifted back onto the absolute segment timeline.
- **Failure policy**: A model download/load failure fails the requested alignment stage with a user-visible error. A single unalignable segment logs a structured warning and retains that segment's previous words.
- **License boundary**: Download the MMS model on demand, show its CC BY-NC 4.0 status before download, and keep its license/attribution separate from AutoSubs' MIT license.

### Implementation Steps

#### 1. `transcription-engine/Cargo.toml` — add direct alignment dependencies

- Add exact ORT and ndarray dependencies:
  ```toml
  ort = { version = "=2.0.0-rc.12", features = ["ndarray"] }
  ndarray = "0.16"
  uroman = "0.6.5"
  unicode-normalization = "0.1"
  ```
- Keep the ORT version exact to avoid multiple incompatible prerelease versions/symbols in the dependency graph.
- Extend the crate's execution-provider features directly:
  - `coreml` includes `ort/coreml`.
  - `directml` includes `ort/directml`.
  - Add `load-dynamic = ["ort/load-dynamic"]` and use it in the same platform presets that currently use `diarize/load-dynamic`.
- Preserve existing `diarize` feature passthroughs; direct ORT features are required because `transcription-engine` will now call ORT itself.
- Confirm `cargo tree -d` contains only the intended ORT/`ort-sys` versions.

#### 2. `AutoSubs-App/models.json` + `manifest.rs` — add an aligner bundle and license metadata

- Add top-level `aligner` next to `vad` and `diarize`:
  ```json
  "aligner": {
    "id": "mms-forced-aligner",
    "repo": "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    "files": [
      "onnx/model_int8.onnx",
      "vocab.json",
      "config.json",
      "preprocessor_config.json"
    ],
    "license": {
      "spdx": "CC-BY-NC-4.0",
      "url": "https://creativecommons.org/licenses/by-nc/4.0/",
      "attribution": "Meta MMS forced-alignment model; ONNX conversion by onnx-community",
      "commercialUse": false
    },
    "ui": {
      "size": "317MB",
      "ram": "1GB",
      "image": "aligner.png",
      "accuracy": 4,
      "weight": 1,
      "languageSupport": { "kind": "multilingual" }
    }
  }
  ```
- Add an `AlignerModel` struct with `id`, `repo`, `files`, `license`, and `ui`, plus an `aligner()` accessor.
- Reuse `FileSpec` where practical so nested paths are represented consistently.
- Extend the manifest tests to verify:
  - non-empty stable ID and repo in `owner/name` form;
  - exactly one ONNX artifact;
  - required config/vocab files;
  - declared CC BY-NC 4.0 license and `commercialUse == false`;
  - valid UI metadata and referenced image.

#### 3. `model_manager.rs` — ensure, list, and delete the aligner bundle

- Add `ensure_aligner_model(progress, is_cancelled) -> Result<PathBuf>` returning the bundle directory, not only the ONNX path, so `Aligner::load` can also read vocab/config/preprocessor metadata.
- Use the existing `ensure_hf_snapshot`/`ensure_hf_flat` retry, validation, cancellation, resume, and stall-watchdog infrastructure. Do not add a short whole-download timeout around a 317MB transfer.
- Validate every required file and preserve nested `onnx/model_int8.onnx` layout or flatten it explicitly through `FileSpec`.
- Include `mms-forced-aligner` in cached-model listing and deletion, using the same stable manifest ID shown in the UI.
- Ensure cached fast paths emit no unnecessary download stage.
- If `EngineConfig.aligner_model_dir` is supplied, validate and use that directory without downloading.

#### 4. **NEW** `crates/transcription-engine/src/align.rs` — core forced-alignment module

- **`Aligner`** holds an `ort::Session`, parsed vocabulary, blank/star IDs, preprocessing metadata, and a `uroman::Uroman` instance.
- **`Aligner::load(model_dir) -> Result<Self>`**:
  - load `onnx/model_int8.onnx` with the established `diarize/src/session.rs` optimization/EP pattern;
  - read `vocab.json`, asserting model output classes match the 31-entry vocabulary;
  - derive blank from `<blank>` and synthetic star as `vocab.len()` (31);
  - read `config.json` and assert `inputs_to_logits_ratio == 320` or derive 320 from the convolution strides;
  - read `preprocessor_config.json` and require 16kHz input plus waveform normalization.
- **`normalize_samples(samples: &[i16]) -> Vec<f32>`** converts PCM to float and performs the same zero-mean/unit-variance normalization as Hugging Face's Wav2Vec2 feature extractor, with epsilon handling for silence.
- **`generate_emissions(samples, cancellation) -> Result<Array2<f32>>`**:
  - accept normalized `f32` samples;
  - run exact 30s/2s-context chunking and frame trimming;
  - verify logits are finite and shaped `[1,T,31]`;
  - apply numerically stable row-wise `log_softmax`;
  - append the zero `<star>` column to obtain `[T,32]`;
  - check cancellation before every chunk.
- **Language/text preprocessing**:
  - port the reference normalization behavior rather than using a generic punctuation regex only;
  - include a centralized ISO 639-1/AutoSubs-code → ISO 639-3 mapping covering every selectable AutoSubs language, with aliases such as Chinese handled explicitly;
  - permit `None`/unknown language for Latin text and best-effort default uroman behavior, but log and safely fall back when non-Latin text cannot be prepared reliably;
  - preserve `AlignmentUnit { original_text, normalized_tokens }` so romanization that expands one source word still produces one original `WordTimestamp`;
  - use character units for Japanese/Chinese in parity with the reference.
- **`forced_align(log_probs, targets, blank, cancellation)`**:
  - implement the torchaudio-compatible log-space Viterbi recurrence and traceback;
  - validate target IDs, prohibit blank in targets, account for adjacent repeats, and enforce the frame feasibility bound;
  - bound allocation with checked arithmetic and return an error rather than panicking/OOMing;
  - check cancellation periodically during long DP rows.
- **Span helpers** port `merge_repeats`, `get_spans`, midpoint blank padding, and confidence aggregation with golden parity tests.
- **`align_words(samples, text, lang, cancellation) -> Result<Vec<WordTimestamp>>`** returns timestamps local to the provided audio slice and preserves original display text/spacing conventions expected by `formatting.rs`.
- Avoid `unwrap`, unchecked indexing, and assertion-only validation on runtime inputs.

#### 5. `types.rs`, `engine.rs`, and examples — wire alignment into the pipeline

- `types.rs`:
  - add `enable_forced_alignment: Option<bool>` to `TranscribeOptions` with default `false`;
  - add `ProgressType::Align`.
- Update all exhaustive `ProgressType` matches in examples and tests.
- `EngineConfig`:
  - add `aligner_model_dir: Option<String>` and update `Default`;
  - treat it as a complete bundle directory containing model and metadata files.
- In `transcribe_audio`, capture `enable_forced_alignment` and `user_offset` before `options` is moved.
- Run alignment after `run_engine` and language detection, before formatting, but only when `translate_target.is_none()`:
  1. Ensure/load the aligner once per transcription request.
  2. Emit `ProgressType::Align` from 0–100 across eligible segments.
  3. For each non-empty segment, compute source-audio bounds:
     ```text
     audio_start = clamp(segment.start - user_offset - context_pad, 0, audio_duration)
     audio_end   = clamp(segment.end   - user_offset + context_pad, 0, audio_duration)
     ```
     Use a small fixed context pad (for example 250ms) to avoid cutting boundary phonemes.
  4. Convert bounds to checked 16kHz sample indices and copy/normalize the `i16` slice.
  5. Align against `segment.text` using the effective detected/selected source language.
  6. Convert each local result to absolute timeline time by adding `audio_start + user_offset`, then clamp words to `[segment.start, segment.end]` and enforce monotonic `start <= end`.
  7. Replace `segment.words` only when alignment succeeds and produces a non-empty result consistent with the source alignment units; otherwise preserve the previous words and log the reason.
- Skip alignment with an informational event/log whenever translation is enabled. Do not align translated output and do not run an alignment whose results will immediately be overwritten by `translate_segments`.
- Run model loading/inference/DP work outside the async runtime's core worker where necessary (`spawn_blocking` or the project's established blocking inference pattern), while preserving progress and cancellation callbacks.
- Check cancellation before model load, between segments, between inference chunks, and during long DP processing.

#### 6. `transcription_api.rs`, CLI, and app tests — expose and log the option

- Add `enable_forced_alignment: Option<bool>` to `FrontendTranscribeOptions` (`camelCase` wire name: `enableForcedAlignment`).
- Add it to `TranscribeOptionsLogView` without logging transcript/audio content.
- Map it into `TranscribeOptions.enable_forced_alignment`.
- Add `aligner_model_dir: None` to `EngineConfig` construction.
- Include whether the aligner is enabled/cached in startup logs and pending-download decisions.
- Ensure cancellation during alignment produces the same user-visible cancelled state as transcription.
- Update every `FrontendTranscribeOptions` literal in `src-tauri/src/tests.rs` and elsewhere.
- Add a CLI `--forced-alignment` flag and map it in `src-tauri/src/cli.rs`; reject or clearly skip the combination with `--translate` using the same rule as the GUI/backend.
- Keep download-on-first-use behavior consistent with diarization: the transcription pipeline downloads the aligner after the user has enabled the feature and accepted the license notice; the cached-model manager lists/deletes it afterward. Do not invent a separate download command unless the model manager is intentionally redesigned for all auxiliary models.

#### 7. React frontend — settings, compatibility, progress, and model management

Update the concrete frontend surfaces rather than leaving them TBD:

- `src/types.ts`:
  - add `enableForcedAlignment` to persisted `Settings` and `TranscriptionOptions`;
  - extend `Model` with optional license/attribution metadata needed by auxiliary model cards.
- `src/stores/settings-store.ts`: default forced alignment to `false` and persist it through the existing settings schema/migration behavior.
- `src/components/transcription/transcription-panel.tsx`:
  - send `enableForcedAlignment` to Tauri;
  - include the aligner in `hasPendingDownloads` when enabled;
  - pass the setting into progress setup.
- Add an alignment toggle in the transcription options UI near timestamp/speaker processing options, with tooltip text explaining the extra pass and 317MB download.
- When translation is enabled:
  - leave the persisted preference unchanged but disable the toggle with an explanation that translated text cannot be aligned to source speech;
  - send `enableForcedAlignment: false` for that run;
  - enforce the same restriction in Rust even if a stale/external caller submits both flags.
- `src/lib/models.ts`:
  - extend `ManifestFile` with `aligner` and license metadata;
  - export `alignerModel` separately from selectable transcription models, like `diarizeModel`.
- Enabling alignment while the model is uncached must show a confirmation containing the size, attribution, and `CC BY-NC 4.0 · Noncommercial` restriction before the transcription/download starts.
- Model manager/settings dropdown:
  - append the aligner to the manager list when its stable ID appears in `downloadedModelValues`, matching the existing diarization pattern;
  - support deletion through the existing generic `delete_model` command and refresh cached state afterward;
  - show `CC BY-NC 4.0 · Noncommercial` on the cached model card/details;
  - link to the model repository and license without suggesting Meta endorses AutoSubs.
- Update `ModelsContext.tsx` only if auxiliary-model metadata/state is centralized there; otherwise keep the existing downloaded-ID plus settings-dropdown composition pattern.
- Add `public/aligner.png` or deliberately reuse an existing checked-in model image.
- `ProgressContext.tsx` and processing-step UI:
  - add `Align` title/description;
  - order it after `Transcribe` and before final formatting/completion;
  - include it only when the setting is active and translation is off.
- Update run summary text to show when forced alignment will run.
- Add all new toggle, compatibility, download, progress, attribution, and license strings to every locale. Do not leave English-only fallback strings for release.

#### 8. Licensing and attribution

- Add a third-party model notice identifying:
  - Meta's MMS forced-alignment model;
  - the upstream `MahmoudAshraf/mms-300m-1130-forced-aligner` conversion;
  - the `onnx-community` ONNX/INT8 conversion;
  - CC BY-NC 4.0 and its canonical URL;
  - that conversion/quantization changes were made by the respective conversion projects.
- State clearly in the README/model manager:
  > AutoSubs code is MIT-licensed. The optional MMS forced-alignment weights are downloaded separately and licensed under CC BY-NC 4.0 for noncommercial use. Users are responsible for ensuring their use complies with the model license.
- Preserve the model license notice in cached-model metadata/about UI and release packaging.
- Include Apache-2.0/NOTICE obligations for `uroman` and any other new dependency in the existing third-party notice process.
- Do not describe the MMS weights themselves as MIT-licensed or commercially permissive.

### Files to Modify

- `AutoSubs-App/src-tauri/crates/transcription-engine/Cargo.toml`
- `AutoSubs-App/models.json`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/manifest.rs`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/model_manager.rs`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/align.rs` — **new**
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/lib.rs`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/types.rs`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/engine.rs`
- `AutoSubs-App/src-tauri/crates/transcription-engine/examples/*.rs` where `ProgressType` is exhaustively matched
- `AutoSubs-App/src-tauri/src/transcription_api.rs`
- `AutoSubs-App/src-tauri/src/cli.rs`
- `AutoSubs-App/src-tauri/src/tests.rs` and other option-struct test fixtures
- `AutoSubs-App/src/types.ts`
- `AutoSubs-App/src/stores/settings-store.ts`
- `AutoSubs-App/src/lib/models.ts`
- `AutoSubs-App/src/components/transcription/transcription-panel.tsx`
- Transcription options/run-summary components selected during implementation
- `AutoSubs-App/src/contexts/ProgressContext.tsx`
- `AutoSubs-App/src/contexts/ModelsContext.tsx` if auxiliary state is centralized
- `AutoSubs-App/src/components/transcription/settings-dropdown.tsx`
- `AutoSubs-App/src/components/settings/model-manager.tsx`
- Every `AutoSubs-App/src/i18n/locales/*/translation.json`
- Existing third-party notices/about UI and README license section
- `AutoSubs-App/public/aligner.png` if a new asset is used

### Verification

#### Dependency and build verification

- [ ] `cargo tree -d` shows one intended ORT/`ort-sys` prerelease version.
- [ ] `cargo build --features mac-aarch` succeeds in `src-tauri`.
- [ ] `cargo test -p transcription-engine --features mac-aarch` passes.
- [ ] Relevant Windows/DirectML and Linux/Vulkan CI builds compile.
- [ ] `npm run build:web` succeeds.
- [ ] Manifest parsing/well-formedness tests cover aligner files, UI, and license metadata.

#### Golden unit tests

- [ ] `vocab.json` loads 31 model classes; blank is 0; synthetic star is 31; augmented emissions have 32 columns.
- [ ] PCM conversion and waveform normalization match Hugging Face/Python golden vectors, including silence.
- [ ] `log_softmax` is finite and matches a Python golden matrix.
- [ ] `forced_align` matches torchaudio/Python paths and scores for normal, repeated-letter, blank-heavy, and star-token targets.
- [ ] Feasibility rejection covers `T < L + repeats`, empty target, blank in target, unknown token, and checked-allocation overflow.
- [ ] Span extraction/midpoint padding matches Python golden output.
- [ ] Romanization/normalization tests cover Latin, apostrophes, digits, punctuation, Cyrillic, Arabic, Japanese, and Chinese.
- [ ] Romanization expansion still maps results back to the exact original displayed unit.
- [ ] Empty, whitespace-only, punctuation-only, numeric-only, unsupported-character, and non-finite-output cases return errors without panic.

#### Chunking and timing tests

- [ ] Emission stitching matches a non-chunked/reference run for audio below 30s, exactly 30s, just above 30s, multiple windows, and a padded final window.
- [ ] Frame timestamps use exactly 20ms stride and do not accumulate duration-dependent drift.
- [ ] A non-zero user timeline offset slices the correct source samples and returns correctly shifted absolute timestamps.
- [ ] Context padding is clamped at file start/end and final words remain inside segment bounds.
- [ ] Adjacent output words are monotonic and satisfy `segment.start <= word.start <= word.end <= segment.end`.

#### Integration tests

- [ ] Moonshine + alignment populates acoustically non-uniform word timestamps.
- [ ] Whisper/Parakeet/SenseVoice retain existing behavior when disabled and can be refined when enabled.
- [ ] Diarization + alignment preserves speaker IDs and produces valid word timings.
- [ ] Japanese/Chinese produce character-aligned output with original script preserved.
- [ ] Cyrillic/Arabic alignment works through romanization on representative clips.
- [ ] Translation + alignment requested together is rejected/skipped deterministically; translated words retain existing interpolation.
- [ ] One failed segment retains its previous words while other segments align successfully.
- [ ] Model load/download failure is user-visible rather than silently disabling the requested feature.
- [ ] Cancellation works during download, between segments, between inference chunks, and during long DP work.
- [ ] Cached aligner listing, explicit download, deletion, redownload, and corrupt-file recovery work.
- [ ] UI disables alignment during translation and correctly shows pending download/license/progress states.

#### Accuracy and performance validation

- [ ] Compare Rust output against the Python `ctc-forced-aligner` reference on the same clips and transcript units.
- [ ] Measure boundary error on a small manually annotated multilingual fixture rather than only checking for non-uniform timestamps.
- [ ] Benchmark CPU and each supported execution provider with short and long clips.
- [ ] Record peak RAM and verify chunking/DP bounds remain acceptable on minimum-supported hardware.
- [ ] Compare Whisper native DTW versus MMS before recommending alignment by default for Whisper.

### Risks / Considerations

- **CC BY-NC 4.0**: Suitable for the project's intended free/noncommercial distribution when properly attributed, but not commercially permissive. Open-source code and a no-warranty clause do not remove the restriction. Commercial users/forks must assess their own use or choose another model.
- **Translation incompatibility**: Forced alignment cannot align translated words to source-language speech. The feature must remain disabled for all translation paths unless a future design retains a separate source transcript and accepts that translated word timing still requires interpolation.
- **Normalization parity**: Omitting Wav2Vec2 waveform normalization or simplifying language-specific text normalization can materially reduce alignment accuracy.
- **Model dimensions**: The selected ONNX model outputs 31 classes; the synthetic star creates 32. Hard-coded `[T,33]` or alphabetical ID assumptions are incorrect.
- **Text-to-display mapping**: Romanization and CJK splitting can change unit counts. Original text must be carried alongside normalized targets rather than reconstructed afterward.
- **Runtime/memory**: Adds a 317MB download and second inference pass. Chunking bounds emission memory, while per-segment alignment and checked DP allocation bound Viterbi memory.
- **Cancellation**: ONNX Runtime cannot necessarily interrupt a single in-flight session run; cancellation latency is bounded by the chosen chunk duration.
- **Execution providers**: Quantized Wav2Vec2 operator support/performance must be tested on CPU, CoreML, DirectML, and other enabled EPs; fallback behavior should be explicit.
- **Community conversion trust**: Pin repository revision/checksums in the manifest/download metadata if supported, and validate the ONNX conversion against upstream outputs before release.
- **Whisper DTW**: MMS may not consistently improve Whisper's native DTW. Keep the user choice opt-in until benchmarks justify engine-specific defaults.
- **Automatic language**: Some engines do not return a detected language. Latin text can often align without a language hint; non-Latin auto-language text may require best-effort uroman behavior or segment fallback.

### Alternative Aligner Models

MMS is selected because it is the only compact, single-model option found with extremely broad language coverage and a straightforward Wav2Vec2/CTC ONNX implementation. Keep the alignment abstraction model-agnostic enough to support these alternatives later.

| Model | License | Coverage | Practical artifact | Resolution / approach | Advantages | Drawbacks |
|---|---|---:|---:|---|---|---|
| **MMS-300M forced aligner (selected)** | CC BY-NC 4.0 | 1,130 languages | 317MB INT8 ONNX | 20ms Wav2Vec2 character CTC + uroman | Best coverage-to-size ratio; matches existing ORT stack; simple Viterbi pipeline | Noncommercial restriction; romanization/normalization complexity |
| `facebook/wav2vec2-lv-60-espeak-cv-ft` | Apache 2.0 | Roughly 50–60+ languages/zero-shot | 318MB INT8 ONNX | 20ms Wav2Vec2 IPA-phoneme CTC | Closest permissive technical replacement; same runtime class and size | Requires reliable multilingual grapheme-to-phoneme conversion; permissive Rust G2P coverage is currently limited; accuracy varies by language |
| NVIDIA Canary-1B-v2 auxiliary CTC aligner | CC BY 4.0 | 25 European languages | ~392MB Q4 GGUF or 669MB INT8 ONNX | ~80ms FastConformer subword CTC | Commercially permissive with attribution; strong fit for the same language set as Parakeet; tokenizes arbitrary transcripts | Lower temporal resolution; no CJK/Arabic; GGUF path adds another native runtime and ONNX is larger |
| Qwen3-ForcedAligner-0.6B | Apache 2.0 | 11 languages | ~1GB Q4 ONNX | Non-autoregressive timestamp-slot prediction at 80ms buckets | Permissive; supports English, Chinese/Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian, Spanish; strong published accuracy | ~918M parameters, substantially heavier, different preprocessing/inference architecture, 5-minute input limit |
| Montreal Forced Aligner | MIT code; commonly CC BY 4.0 models | Many languages via separate acoustic/dictionary packs | Varies per language | Kaldi GMM/HMM or model-specific phoneme alignment | Mature and permissive model options; accurate dictionary-based alignment | Not one universal model; heavy Kaldi/runtime packaging; pronunciation dictionaries and per-language downloads |
| WhisperX language-specific aligners | BSD code; model licenses vary | Many languages via separate Wav2Vec2 models | Varies per language | Usually character/phoneme CTC | Proven workflow and potentially high per-language quality | Patchwork model licenses, separate downloads, uneven coverage, and no single predictable runtime/model contract |
