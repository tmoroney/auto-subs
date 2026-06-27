# Plan: compile-time model manifest + new transcribe-rs engines

## Goal
Replace per-model hardcoding with one declarative `models.json` that is the single source of truth for **both** the Rust download/load/delete logic and the frontend's display metadata. Compiled into the binary via `include_str!`; the frontend imports the same JSON directly. Then add the four new transcribe-rs engines (Canary, Cohere, GigaAM, SenseVoice) as pure manifest rows + thin wrappers.

## Canonical sources (from transcribe-rs 0.3.11 README)
| Engine | HF repo | Loader files |
|---|---|---|
| Canary 1B v2 | `istupakov/canary-1b-v2-onnx` | `nemo128.onnx`, `encoder-model.int8.onnx`, `decoder-model.int8.onnx`, `vocab.txt` |
| Canary 180M Flash | `istupakov/canary-180m-flash-onnx` | same shape |
| Cohere (int8) | `tristanripke/cohere-transcribe-onnx-int8` | `cohere-encoder.int8.onnx`, `cohere-decoder.int8.onnx`, `tokens.txt`/`vocabulary.txt` |
| GigaAM v3 | `istupakov/gigaam-v3-onnx` | encoder/decoder onnx + `vocab.txt` |
| SenseVoice | `csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17` | `model.int8.onnx`, `tokens.txt` |

✅ **SenseVoice mirror confirmed.** csukuangfj (the sherpa-onnx maintainer) hosts the same artifact transcribe-rs's README points at on HF, under the exact directory name used in the README example. File tree verified: `model.int8.onnx` (228 MB, resolved for `int8`), `model.onnx` (894 MB, resolved for `fp32`), `tokens.txt` — matches the loader at `sense_voice/mod.rs:60` (`resolve_model_path(dir, "model", quant)` + `tokens.txt`). So all four engines are clean HF rows; nothing is deferred. Caveat: the repo is unversioned/community-owned (authoritative author, low like count) — exactly the kind of entry the manifest makes easy to swap later.

## Schema (`models.json` at repo root)
```jsonc
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "parakeet",                 // value used in UI, cache dir, routing
      "engine": "parakeet",             // whisper|parakeet|moonshine|canary|cohere|gigaam|sense_voice
      "quantization": "int8",           // maps to transcribe_rs::onnx::Quantization
      "source": {
        "type": "hf",                   // "hf" | "whisper-ggml"
        "repo": "istupakov/parakeet-tdt-0.6b-v3-onnx",
        "files": [ "encoder-model.int8.onnx", "decoder_joint-model.int8.onnx",
                   "nemo128.onnx", "vocab.txt", "config.json" ]
        // each file: a string (download by repo path, keep name)
        //         OR { "path": "...", "dest": "..." } (download + flatten/rename)
      },
      "ui": {                            // consumed by frontend models.ts
        "size": "700MB", "ram": "2GB", "image": "parakeet.png",
        "accuracy": 3, "weight": 3,
        "languageSupport": { "kind": "restricted", "languages": ["en", "..."] }
      }
    }
  ]
}
```

The string-or-`{path,dest}` rule is what absorbs the two existing special cases without special code:
- **Moonshine** subfolder layout + borrowed-tokenizer trick → `{path,dest}` entries (deletes the URL-building block at [model_manager.rs:459](AutoSubs-App/src-tauri/crates/transcription-engine/src/model_manager.rs#L459)).
- **Whisper** ggml `.bin` + optional CoreML zip → `source.type: "whisper-ggml"` keeps the bespoke download+extract path; only the model name lives in the manifest.

## Rust changes (`transcription-engine` crate)

**1. New module `manifest.rs`**
- `serde`-deserialized structs: `Manifest`, `ModelEntry`, `Source` (enum `Hf { repo, files }` / `WhisperGgml { model }`), `FileSpec` (untagged enum: `Plain(String)` / `Renamed{path,dest}`), `Quantization` mapping helper.
- `static MANIFEST: Lazy<Manifest> = include_str!("../../../../models.json")` parsed once.
- Lookups: `get(id) -> Option<&ModelEntry>`, `engine_for(id)`, iterator for list/UI.
- A unit test that parses the embedded JSON and asserts every `engine` is known and every `hf` entry has ≥1 file — fails the build if the manifest is malformed.

**2. Collapse `model_manager.rs`**
- New generic `ensure_model(entry, progress, is_cancelled) -> PathBuf`:
  - `whisper-ggml` → existing `ensure_whisper_model` path (incl. CoreML).
  - `hf` → loop over `files` calling the existing `ensure_hub_model(repo, path, …)`; for `{path,dest}` entries, download+flatten into a per-model dir (reuse the moonshine `download_to` approach). Returns the dir handed to the loader.
- `delete_cached_model(id)` and `list_cached_models()` become manifest-driven: derive `models--owner--repo` and the presence-check file set from each entry instead of the hardcoded `delete_parakeet_model` / `delete_moonshine_model` / inline checks (lines 678–925). Keep the helpers only as thin internals if convenient.
- Keep all the hf-hub cache/lock/blob hygiene code as-is — transport is unchanged.

**3. Routing in `engine.rs`** ([:92](AutoSubs-App/src-tauri/crates/transcription-engine/src/engine.rs#L92), `:223`)
- Replace `is_moonshine_model`/`is_parakeet_model` with `manifest::engine_for(&options.model)`.
- `ensure` step → single `self.models.ensure_model(entry, …)`.
- Transcribe step → `match entry.engine { Whisper => …, Parakeet => …, Canary => …, … }`.
- Move the inline diarize URLs (lines 121–122) into the manifest as a non-transcription entry (or a small `diarize`/`vad` section) so those stop being hardcoded too.

**4. New engine wrappers** `engines/{canary,cohere,gigaam,sense_voice}.rs` (all four — SenseVoice included)
- Each ~30–50 lines, modeled on `parakeet.rs`/`moonshine.rs`: load via `Model::load(dir, &quant)`, loop speech segments, map `TranscriptionResult { text, segments }` → your internal `Segment`/`WordTimestamp`. Note these new engines return **segment-level** timing (`TranscriptionSegment{start,end,text}`), not word-level like Parakeet — wrappers fabricate word timing by even split or leave words empty, matching how Whisper segments without DTW are handled. Register each in `engines/mod.rs`.

## Frontend changes
- Move `models.json` (or symlink/copy via a build step) so `src/lib/models.ts` does `import manifest from "…/models.json"` and maps `ui` fields into the existing `Model[]`, instead of the 312-line hand-maintained array. Keep `modelFilterOrders` and the `languageSupport`/helper logic in `models.ts`.
- Add new models' i18n keys in `src/i18n/locales/*/translation.json` (label/description/details/badge) and provide images under `public/`.

## No change needed
- Tauri command layer ([models.rs](AutoSubs-App/src-tauri/src/models.rs)) already calls the generic `list_cached_models` / `delete_cached_model` free functions — they just get smarter underneath.

## Suggested commit order
1. Add `models.json` + `manifest.rs` (parse + test), no behavior change.
2. Migrate `ensure_*`/`delete`/`list` to manifest-driven; verify existing models still download/delete/list (regression check against current behavior).
3. Switch `engine.rs` routing to manifest; remove `is_*_model` helpers.
4. Point `models.ts` at the manifest; confirm UI parity.
5. Add Canary + Cohere + GigaAM + SenseVoice (wrappers + manifest rows + i18n + images).

## Status
- SenseVoice HF source resolved (`csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17`); no open questions.
- **Step 1 DONE:** `AutoSubs-App/models.json` (19 existing models faithfully mirrored from `models.ts`) + `transcription-engine/src/manifest.rs` (serde parser, `MANIFEST` lazy static via `include_str!("../../../../models.json")`, `get`/`engine_for` lookups, 5 validation tests). Registered in `lib.rs`. No runtime behavior change — nothing consumes the manifest yet. `cargo test -p transcription-engine manifest::` → 5 passed.
  - Manifest placed at `AutoSubs-App/models.json` (the Vite root, not the git repo root) so both the Rust crate and the frontend can reach it.
  - Added a `moonshineVariant` field per Moonshine entry to carry the variant key declaratively.
  - The 4 new engines are intentionally **not** in `models.json` yet: GigaAM (many `v3_*` variants, no literal `vocab.txt`) and Canary (loader wants `nemo128.onnx`, absent from the v2 repo tree) have loader-specific filename expectations that must be pinned against a real `Model::load` — done in step 5 with their wrappers.
- **Step 2 DONE:** `model_manager.rs` is manifest-driven.
  - New generic `ensure_model(entry, …)` dispatches on source/engine to three reusable workers: `ensure_whisper_model` (whisper-ggml + CoreML, unchanged), `ensure_hf_snapshot(repo, files)` (factored out of the old Parakeet body — serves Parakeet and the upcoming NeMo/ONNX engines), and `ensure_hf_flat(variant, repo, files)` (factored out of Moonshine — honors `{path,dest}` flatten/rename).
  - `ensure_parakeet_v3_model` / `ensure_moonshine_model` are now thin shims over `ensure_model` (kept so `engine.rs` still compiles until step 3).
  - `delete_cached_model` + `list_cached_models` iterate the manifest. Removed hardcoded `delete_parakeet_model` / `delete_moonshine_model`; added generic `delete_hf_repo(repo)` + `delete_moonshine_dir(variant)`. `delete_diarize_model` now routes through `delete_hf_repo`.
  - **Regression-safe:** verified every cache path is byte-identical to before (moonshine variant→dir + quantized/float, `models--owner--repo` for snapshot/diarize, `ggml-{model}.bin` for whisper). No re-downloads for existing users.
  - Verified by `cargo build -p transcription-engine` (clean, no warnings) + `cargo test … manifest::` (5 passed). `engine.rs` routing unchanged.
- **Step 3 DONE:** `engine.rs` routing is manifest-driven.
  - `transcribe_audio` now resolves `manifest::get(&options.model)` once → `engine_kind` (falls back to Whisper for ids not in the manifest, preserving legacy behavior). Ensure step calls the generic `ensure_model`; transcribe step is a `match engine_kind { Whisper | Parakeet | Moonshine … }` with a catch-all that errors for the not-yet-wired engines (Canary/Cohere/GigaAM/SenseVoice land in step 5).
  - `whisper_to_english` suppression now keys off `is_whisper` (so the new non-Whisper engines correctly use normal post-translation).
  - Removed the now-dead `is_parakeet_model` / `is_moonshine_model` helpers; kept `moonshine_variant_from_model_name`.
  - Verified: `cargo test … manifest::` (5 passed), `cargo build -p transcription-engine` and `cargo check -p autosubs` both clean, no warnings.
- **VAD + diarize in the manifest DONE** (was deferred; pulled in after noticing VAD wasn't in the manifest):
  - Added flat top-level `"vad"` and `"diarize"` keys to `models.json` (kept separate rather than a vague `support` bucket, since they're quite different — VAD is auto-downloaded infra, diarize is a user-downloadable model with a UI card). `manifest.rs` gained `VadModel`/`DiarizeModel` types inlined on `Manifest` + `manifest::vad()` / `manifest::diarize()` accessors + a validation test.
  - `ensure_vad_model` builds its URL + dest filename from `manifest::vad()`. `ensure_diarize_models` dropped its `seg_url`/`emb_url` params and now reads repo+files from `manifest::diarize()` (downloads via the hf-hub snapshot path); `engine.rs` no longer hardcodes the diarization blob URLs. Removed the `DIARIZE_*` consts and the now-dead `parse_hf_blob_url`/`url_filename` helpers; `list`/`delete` use `manifest::diarize()`.
  - Regression-safe: same repos, files, cache dirs, and progress splits.
- **Step 4 DONE:** `src/lib/models.ts` imports `../../models.json` and derives `models: Model[]` + `diarizeModel` from it via `toModel(id, ui, keyBase)`. Display strings stay i18n keys (key base = id with `.`/`-` → `_`; diarize uses the literal `"diarize"` base). `modelFilterOrders` and the `modelSupportsLanguage` / `getFirstRecommendedModelForLanguage` helpers are unchanged. The ~270-line hand-maintained array is gone; order/labels/sizes preserved. `tsc --noEmit` → 0 errors. Backend `cargo test -p transcription-engine` → 22 passed.
- **Step 5 IN PROGRESS — SenseVoice DONE:**
  - `engines/sense_voice.rs` wrapper (modeled on Moonshine: i16→f32, `transcribe_with`, segment text + interpolated word timestamps), registered in `engines/mod.rs`, `ModelEngine::SenseVoice` arm in `engine.rs`.
  - `models.json` row: `sense-voice` / engine `sense_voice` / int8 / repo `csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17` / files `["model.int8.onnx", "tokens.txt"]` (snapshot strategy, no rename — verified against the loader's `resolve_model_path(dir,"model",Int8)` + `tokens.txt`).
  - en i18n keys added; `modelFilterOrders` updated; image reuses `owl.png` as a **placeholder** (no dedicated SenseVoice art yet).
  - Verified: `cargo test … manifest::` (6 passed), `cargo build -p transcription-engine` clean, `cargo check -p autosubs` clean, `tsc` 0 errors. **Not runtime-tested** (needs a 228 MB model download + real audio) — the wrapper compiles and the file list matches the loader source, but end-to-end transcription should be confirmed with an actual run.

- **Canary + Cohere DONE** (GigaAM intentionally skipped):
  - **Schema/infra generalization:** `FileSpec` now supports `{ path, dest?, repo? }` — optional `dest` (defaults to the path basename) and an optional per-file `repo` override. `ensure_hf_flat` is generalized from moonshine-only to `<cache>/<subdir>/<key>` with per-file repo + a new `flat_layout(entry)` helper that decides snapshot-vs-flatten (any renamed/nested/cross-repo file ⇒ flatten). `list`/`delete` use the same helper. `download_to` now streams to disk in chunks (no whole-file buffering — matters for Canary's ~860 MB encoder). Moonshine/SenseVoice now share `utils::split_speech_segment` (removed 2 local copies).
  - **Canary:** `engines/canary.rs` wrapper + `ModelEngine::Canary` arm. Manifest row `canary` / int8 / repo `istupakov/canary-1b-v2-onnx`, files = encoder/decoder/vocab from that repo **plus `nemo128.onnx` pulled from `istupakov/parakeet-tdt-0.6b-v3-onnx`** via the per-file `repo` override (the preprocessor istupakov omitted from the Canary repos). 25 European languages, ~1 GB.
  - **Cohere:** `engines/cohere.rs` wrapper + `ModelEngine::Cohere` arm. Switched to the **int4** repo `cstr/cohere-transcribe-onnx-int4` (smaller + README-documented). Snapshot strategy; file list includes the split-weight `*.onnx.data` siblings. ~2 GB.
  - en i18n + `modelFilterOrders` updated for both. Added a `every_model_engine_has_a_wrapper` guard test.
  - Verified: `cargo test -p transcription-engine` → **23 passed**, `cargo build` clean, `cargo check -p autosubs` clean, `tsc` 0 errors. **Not runtime-tested** (can't download GB-scale models here): wrappers compile and file lists match loader sources, but Canary's cross-repo nemo128 fetch + Cohere's `.data` loading + actual transcription output should be confirmed with a real run.
  - **Placeholders to replace:** SenseVoice/Cohere reuse `owl.png`, Canary reuses `parakeet.png` — no dedicated art yet. Non-en locales lack the new i18n keys (fall back to en).

- **GigaAM (not done):** Russian-only; would need `v3_ctc.int8.onnx`→`model.int8.onnx` / `v3_vocab.txt`→`vocab.txt` rename — now trivial given the generalized flatten path, if ever wanted.

- **(historical) Remaining 3 engines each needed a schema/infra decision (loader source discoveries):**
  - **Cohere** (int8, English): snapshot strategy works, but the encoder ships **external weights** — files must include `cohere-encoder.int8.onnx.data` → `["cohere-encoder.int8.onnx", "cohere-encoder.int8.onnx.data", "cohere-decoder.int8.onnx", "tokens.txt"]`, ~2.9 GB total. Decision: accept 2.9 GB, or use the int4 repo (`cstr/cohere-transcribe-onnx-int4`), or skip — Cohere is heavy and English-only (overlaps Whisper/Parakeet).
  - **GigaAM** (Russian): loader wants `model.int8.onnx` + `vocab.txt`, but the repo names them `v3_ctc.int8.onnx` / `v3_vocab.txt` → needs the **rename/flatten** path. `ensure_hf_flat` is currently hardcoded to `cache/moonshine/<variant>`; must be generalized to a per-engine flat dir (e.g. `cache/<engine>/<id>`).
  - **Canary** (multilingual): loader requires `nemo128.onnx`, which is **absent from the Canary repos** — only the Parakeet repo ships it. Needs a **cross-repo file source** (per-file `repo` override on `FileSpec`, or a special-case fetch of `nemo128.onnx` from `istupakov/parakeet-tdt-0.6b-v3-onnx`). Highest uncertainty.