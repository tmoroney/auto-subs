# AutoSubs Audit and Performance Plan

**Status:** Phases 1 and 2 implemented and unit-tested; runtime benchmark pending
**Date:** 2026-10-23
**Scope:** `TYFALY/auto-subs` fork at `main` (`c98f6df804bf49ab8ff14ee8f24ef1413211dec2`), app version 3.11.0
**Method:** static call-path review, fork-versus-upstream comparison, and unit tests. No runtime benchmark has been run yet.

## 0. Repository snapshot

- Tauri v2 app: React/TypeScript frontend and Rust backend.
- Rust: 62 files, ~16.3k lines. TypeScript/TSX: 151 files, ~22.9k lines. Lua modules: 9 files, ~4.2k lines. Adobe extension: 12 files, ~11.1k lines.
- ~143 Rust tests (139 `#[test]`, 4 `#[tokio::test]`).
- The fork `main` is byte-identical to upstream `tmoroney/auto-subs` `main` at the reviewed commit. There are no fork-specific code changes yet, so every finding below applies to upstream 3.11.0 as well. The one fork-specific risk is distribution metadata (see 2.7).

Reviewed: transcription pipeline, VAD, diarization, Whisper/ONNX engines, formatting, Tauri commands, Resolve and Adobe bridges, subtitle persistence, media player, Tauri config and capabilities, CI workflows.

Not reviewed yet: Adobe CEP JavaScript, the full Resolve Lua modules, installer scripts, updater/signing flow end to end, accessibility, and visual regression.

## 1. Headline optimization: one Whisper call per ~30 seconds, not per VAD segment

### 1.1 Evidence

- VAD is enabled by default: `src/stores/settings-store.ts:49`.
- Silero VAD returns many short, disjoint `SpeechSegment`s. It only breaks on 500 ms of silence and pads boundaries by 200 ms: `crates/transcription-engine/src/vad.rs:25-31`, `crates/transcription-engine/src/vad.rs:46-64`.
- Each segment is transcribed with its own `state.full(...)` call: `crates/transcription-engine/src/engines/whisper.rs:512-528`.
- Whisper.cpp pads every call to the fixed 30-second encoder geometry, regardless of the actual clip length. The codebase documents this in `crates/transcription-engine/src/utils.rs:13-16`: "`whisper_full` pads shorter audio to the full 1500 audio-token geometry".
- The only chunk-shaping function was `split_overlong_segments`, which splits segments longer than 30 seconds. Before Phase 1, nothing merged short neighbors: `crates/transcription-engine/src/engines/whisper.rs:413-445`.
- With VAD disabled, the pipeline sends the whole file as one segment and then splits it into 30-second chunks (`engine.rs:196-203`), which is the efficient path.

### 1.2 Why this matters

The encoder always processes 30 seconds of mel frames. For a 5-second VAD segment, the encoder does 6 times more work than the audio requires. If encoder work dominates, the practical overhead is roughly `30 / segment_length` for that part of the graph. Short conversational turns (2-10 seconds) are common, so the default VAD path can easily be 2-5 times slower than the same audio sent as full 30-second chunks. It also pays DTW and decoder setup per call.

This is likely the single largest performance lever in the app, and fixing it does not require changing models or sacrificing VAD. Long silences can still be skipped; only short pauses are bridged.

Expected result: VAD-on throughput approaches VAD-off throughput on speech-dense material, while sparse material still benefits from skipping long silence. Whisper also gets more acoustic context per call, which usually reduces boundary hallucinations.

### 1.3 Proposed change

Add `merge_speech_segments` next to `split_overlong_segments` in `whisper.rs`, and call it before the split:

```text
merge_speech_segments(segments, max_chunk_seconds = 29.5, max_gap_seconds = 1.0)
```

Rules:

- Only merge adjacent segments with the same `speaker_id` (`None` matches `None`; never merge different named speakers).
- Do not merge overlapping segments. Either skip them or resolve the overlap explicitly.
- Do not merge when the resulting span would exceed 29.5 seconds. The 0.5-second margin avoids a 30.0-second rounding failure at the ggml boundary.
- Do not merge when the gap exceeds `max_gap_seconds`; this preserves VAD's ability to skip real silence.
- Fill the gap with zero samples at 16 kHz so the merged `samples` stay contiguous and timestamps remain correct. The merged segment keeps the first segment's `start` and the last segment's `end`.
- Preallocate `Vec` capacity to avoid repeated reallocations.
- Keep the function behind a private constant or an environment flag (`AUTOSUBS_DISABLE_SEGMENT_MERGE=1`) so the old behavior remains available for A/B testing and rollback.

Pseudo-code:

```rust
const SAMPLE_RATE: f64 = 16_000.0;
const MAX_CHUNK_SECONDS: f64 = 29.5;
const MAX_GAP_SECONDS: f64 = 1.0;

fn merge_speech_segments(segments: Vec<SpeechSegment>) -> Vec<SpeechSegment> {
    let mut out: Vec<SpeechSegment> = Vec::with_capacity(segments.len());
    for segment in segments {
        if let Some(last) = out.last_mut() {
            let gap = segment.start - last.end;
            let same_speaker = last.speaker_id == segment.speaker_id;
            let merged_len = segment.end - last.start;
            if same_speaker
                && gap >= 0.0
                && gap <= MAX_GAP_SECONDS
                && merged_len <= MAX_CHUNK_SECONDS
            {
                let silence = (gap * SAMPLE_RATE).round() as usize;
                last.samples.reserve(silence + segment.samples.len());
                last.samples.extend(std::iter::repeat(0).take(silence));
                last.samples.extend_from_slice(&segment.samples);
                last.end = segment.end;
                continue;
            }
        }
        out.push(segment);
    }
    out
}
```

Call site in `run_transcription_pipeline`:

```rust
let speech_segments = merge_speech_segments(speech_segments);
let speech_segments = split_overlong_segments(speech_segments);
```

Implemented in `AutoSubs-App/src-tauri/crates/transcription-engine/src/engines/whisper.rs`. The chunk margin is `MERGE_CHUNK_MARGIN_SECONDS = 0.5`, the gap threshold is `MAX_MERGE_GAP_SECONDS = 1.0`, and `AUTOSUBS_DISABLE_SEGMENT_MERGE=1` restores the old one-call-per-segment behavior. The per-segment `speech_segment.samples.clone()` in the inference loop was also removed; the float conversion now borrows the segment's samples.

### 1.4 Tests

- [x] Unit tests in `whisper.rs` (8 tests, all passing):
  - Two 5-second segments with a 0.5-second gap merge into one 10.5-second segment; sample count is exactly 168,000 at 16 kHz; start/end are unchanged.
  - Different speakers do not merge.
  - A gap above the threshold does not merge.
  - A merged span above 29.5 seconds does not merge.
  - Overlapping segments do not merge.
  - Empty input returns empty output.
  - Output remains time-ordered and timeline-preserving.
  - Ten 5-second VAD-style segments collapse to two chunks.
- [ ] Integration test: transcribe a fixture with VAD on before and after the change; assert the text content is equivalent (normalized word sequence) and no words disappear at merge boundaries.
- [ ] Timing test or benchmark example prints real-time factor (RTF) and peak RSS for a fixture.

### 1.5 Risks and mitigations

- **Quality across silence:** bridging a pause can change punctuation or capitalization. Start with `max_gap_seconds = 1.0`, A/B against the current pipeline on multilingual fixtures, and only raise it if the WER/timestamp checks pass.
- **Speaker boundaries:** the same-speaker guard prevents merging across diarization turns. Verify against overlapping-speaker fixtures.
- **Timestamp drift:** the inserted silence must match the timestamp gap exactly. Test sample counts and word boundaries, not just text.
- **DTW memory:** fewer chunks means fewer DTW backtraces and less peak allocation, so this change should reduce memory, not increase it.
- **Very short final chunk:** a final partial chunk is still padded by whisper.cpp; that is unavoidable and already the floor.

### 1.6 Acceptance criteria

- At least 2x faster on a 60-minute speech-dense fixture with VAD on and DTW on, compared with the current build.
- Throughput within 10% of the VAD-off path on the same fixture.
- No WER regression above 0.5 percentage points and no mean word-boundary drift above 50 ms against the current output.
- Peak RSS no higher than the current build.
- All existing Rust tests pass.

## 2. Prioritized findings

### 2.1 P1: audio memory is copied several times

- `read_wav` loads the whole file into `Vec<i16>`: `crates/transcription-engine/src/audio.rs:4`.
- VAD converts the whole buffer to `Vec<f32>` for Silero, then copies every detected span into its own `Vec<i16>`: `vad.rs:17-18`, `vad.rs:51-58`.
- `split_overlong_segments` copies every overlong chunk again: `whisper.rs:435-437`.
- Whisper cloned each segment's samples before converting to float; this was removed in Phase 1: `whisper.rs:512-517`.
- `SpeechSegment` owns `Vec<i16>`: `crates/diarize/src/lib.rs:38-43`.

For one hour of 16 kHz mono audio, the PCM alone is about 115 MB. Several full copies plus the float buffer can exceed 500 MB before model weights, which matches the OOM reports this design invites on long files.

Fixes, in order of effort:

1. Done: removed the `speech_segment.samples.clone()` in the Whisper loop and convert from a borrowed slice.
2. Drop the full `original_samples` buffer as soon as alignment no longer needs it. Today it stays alive across the whole Whisper run even when forced alignment is disabled.
3. Evaluate a shared audio buffer plus `Range<usize>` in `SpeechSegment` (or `Arc<[i16]>` with slice views) so VAD and splitting do not copy. This touches the diarize crate API and all engines, so treat it as a separate refactor.
4. Stream `read_wav` into the shared buffer where possible; at minimum, avoid holding both the WAV file bytes and the decoded vector.

Acceptance: peak RSS for a 60-minute fixture stays below 1.5x the decoded PCM size plus model memory, and no extra full-buffer copy occurs in the Whisper loop.

### 2.2 P1: subtitle saves can exhaust WebView2 memory and lose edits

- Every debounced edit reads the full document, parses it, mutates it, stringifies it with two-space indentation, and writes it back: `AutoSubs-App/src/utils/file-utils.ts:789-828`.
- The document contains both `originalSegments` (immutable during editing) and `segments`, plus per-word timings, so the file can be several megabytes.
- The code itself documents that repeated read-parse-write cycles can trigger an Out of Memory crash in WebView2: `src/contexts/SubtitleDocumentContext.tsx:184-190`.
- `updateSubtitleDocument` also rewrites the transcript index on every save: `file-utils.ts:828`.
- Saves are debounced by 500 ms, but there is no write queue. If one save takes longer than 500 ms, a second save can start while the first is in flight, producing overlapping read-modify-write cycles and potentially lost edits.

Fixes:

1. Serialize saves per file through an in-memory promise chain or mutex.
2. Keep the loaded document in memory and write only the changed fields instead of re-reading and re-parsing on every edit.
3. Write compact JSON for machine-managed transcript files. `JSON.stringify(value, null, 2)` roughly doubles file size and slows serialization.
4. Move `originalSegments` to a sidecar file or write it only when it changes. It is needed for reformatting, not for every keystroke save.
5. Update the transcript index only when metadata changed, not on every subtitle save.
6. Write to a temporary file and rename atomically so a crash cannot truncate the transcript.

Acceptance: editing a two-hour transcript does not exceed a reasonable WebView heap, no edit is lost under slow disk writes, and a save writes at most one copy of the immutable source.

### 2.3 P1: line numbers are wrong for languages without spaces

Both conversion paths infer which line a word belongs to by splitting the line text on whitespace:

- `AutoSubs-App/src/api/formatting-api.ts:28-45`
- `AutoSubs-App/src/utils/file-utils.ts:687-707`

For Japanese, Chinese, Thai, Lao, Khmer, and other scripts that do not separate words with spaces, each line tokenizes to a single token. Only the first word gets the correct line number; every remaining word is forced onto the last line. That breaks two-line cues, word-move logic, and any line-aware animation or export.

Fix: have the Rust formatting pass emit a `line_number` per word, since it already knows the line boundaries in `formatting.rs`, and pass it through the `WordTimestamp`/`Word` types. If changing the shared type is undesirable, implement a grapheme-count-based mapping on the frontend that compares cumulative line lengths rather than whitespace tokens. Add Japanese and Chinese fixtures with at least two lines per cue.

Note: `subtitle-edits.ts` partly compensates by disabling inserted spaces for `ja`/`zh`, but the stored `line_number` values remain wrong.

### 2.4 P1: normalization always runs, shares one filename, and never cleans up

- `should_normalize` unconditionally returns `true`: `src-tauri/src/transcription_api.rs:643-645`.
- The output path is always `<app_cache>/normalized_audio.wav`: `transcription_api.rs:680-685`.

Consequences:

- Even an already-mono 16 kHz PCM WAV is re-encoded through ffmpeg.
- Two transcriptions (for example GUI plus CLI, or two app windows) write the same file concurrently and can race.
- Stale files remain in the cache forever.
- A failed or cancelled run can leave a partially written file that a later run reads.

Fixes:

1. Probe the source first. If it is already mono 16 kHz PCM16 WAV, return it unchanged. A WAV header check with `hound` is enough; no subprocess needed.
2. Key the cache on source path, size, and modification time (or a content hash). Use a per-source filename.
3. Write to a unique temporary file and rename atomically.
4. Delete stale normalized files at startup or with an age/count policy.
5. Add a test for concurrent normalization requests.

### 2.5 P1: heavy synchronous work runs on the async runtime

`transcribe_audio` is an async Tauri command (`transcription_api.rs:287`) but the engine performs Whisper inference, diarization, and alignment synchronously inside it. There is no `spawn_blocking` or `block_in_place` anywhere in the Rust backend.

While a transcription runs, the same runtime also serves the Adobe WebSocket bridge, Resolve mailbox polling, model downloads, progress emission, and UI commands. A long CPU/GPU call can starve those tasks and make the integration appear disconnected.

Fixes:

- Move CPU-bound inference into `tauri::async_runtime::spawn_blocking` or `tokio::task::block_in_place`, keeping the async wrapper for downloads and progress.
- Use `tokio::fs` or `spawn_blocking` for the Resolve bridge's file reads and writes; `resolve_bridge.rs:327` uses `std::fs::read_to_string` on the async path.
- Replace `std::thread::sleep` in the async `delete_request_file` path with `tokio::time::sleep`: `resolve_bridge.rs:344`.

Acceptance: the Adobe bridge and Resolve polling remain responsive (sub-second) while a transcription is in progress.

### 2.6 P1: the Adobe bridge accepts any local client

- The server binds to `127.0.0.1:8185`: `src-tauri/src/adobe_bridge.rs:13`.
- The only handshake is a JSON message with `type: "handshake"` and an arbitrary `payload` used as the app name: `adobe_bridge.rs:91-112`.
- There is no shared secret, no origin validation, and connections are keyed only by that self-declared name. A local process can impersonate Premiere or After Effects, receive subtitle payloads, or replace the real extension's connection.

This is a local-only threat, but it is a meaningful one for a desktop app that handles media paths and transcript content.

Fixes:

- Generate a random token at startup, store it in a user-only file that the CEP extension can read, and require it in the handshake.
- Allow only `premiere` and `aftereffects` as app names.
- Reject a second connection for an app name while the first is healthy, or require explicit replacement.
- Consider validating the WebSocket `Origin` header for known CEP origins.
- Add an integration test that an unauthenticated client is rejected.

### 2.7 P2: fork updater points at upstream

`tauri.conf.json:218-222` uses upstream's public key and `https://github.com/tmoroney/auto-subs/releases/latest/download/latest.json`.

Consequences for this fork:

- If upstream publishes a release, the fork will download and install it, silently replacing fork-specific changes.
- If the fork publishes its own signed release, the app will reject it unless the public key is replaced.
- The "open GitHub" allowlist in `capabilities/default.json` also points at upstream.

Decide explicitly: track upstream (keep the endpoint, accept overwrites) or distribute independently (own endpoint, own signing key, own links). Do not leave it implicit.

### 2.8 P2: CI does not build or test the Rust backend

`.github/workflows/frontend-tests.yml` runs only `npm test`, which covers the Node test files. It does not run `tsc`, `vite build`, `cargo test`, `cargo clippy`, `cargo fmt --check`, or the Lua syntax check.

With 16k lines of Rust and 143 tests, regressions can merge without any backend signal. Add a CI job that runs:

- `npm ci`
- `npm test`
- `npm run build:web` (this runs `tsc`)
- `cargo fmt --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace`
- `luajit -bl <each module> /dev/null`
- the i18n length/dash budget script from `AGENTS.md`

Run the Rust job on Windows at minimum, since that is the primary packaging target, and ideally on macOS and Linux with a reduced feature set.

### 2.9 P2: Tauri hardening

- `"csp": null` in `tauri.conf.json:15` disables Content Security Policy. Add a policy that permits the app's own assets, the asset protocol for local media, and the specific HTTPS endpoints used for model downloads and links. Test the media player and thumbnails after tightening.
- `capabilities/default.json` grants `shell:default`, `fs:default`, and write/rename/remove scopes over `$DOCUMENT/**`, `$DOWNLOAD/**`, `$VIDEO/**`, and `$APPLOCALDATA/**`. Trim to the commands actually used. `shell:default` is especially broad; only two dialogs need `open`.
- Validate any frontend-supplied filename before joining it to a directory. Generated names are sanitized, but the load/update/delete APIs accept a filename argument.

### 2.10 P2: smaller items

- **Resolve bridge polling:** `resolve_bridge.rs:42` polls `Fusion.prefs` every 50 ms and reads the whole file when it changes. Measure the cost on large prefs files; use metadata/mtime checks or adaptive backoff. Keep the file-mailbox design; it is required by Resolve 21.1's sandbox.
- **Resolve script installer thread:** `resolve_scripts.rs:40-46` starts a thread that sleeps forever and retries installation. Stop after a bounded number of attempts or when the app exits.
- **Waveform peaks:** `extract_audio_peaks` re-decodes the media through ffmpeg when the media player mounts, and the cache is only in memory (`media-player.tsx:95-152`). Cache peaks on disk keyed by path, size, and mtime; long timelines otherwise pay a full decode on every open.
- **Dead progress hook:** `PROGRESS_CALLBACK` is declared and read but never set (`whisper.rs:10`, `whisper.rs:421`). Remove it or wire it; do not leave a no-op global mutex in the inner loop.
- **Resolve payload size:** `AddSubtitles` sends the entire subtitle document through prefs/base64 in one request. Measure the mailbox payload and Lua prefs write time for a two-hour transcript. If it dominates, batch cues without changing the mailbox protocol.
- **`originalSegments` and `editedSegments`:** confirm the semantics when a user edits, reformats, and edits again. The first edit creates `editedSegments`; a later reformat must not silently discard corrections. Add a regression test.
- **Test gaps:** there are many formatting and VAD tests, and merge behavior is now covered by 8 unit tests. Still missing: normalization caching, concurrent saves, Adobe authentication, and CJK line mapping.

## 3. Phased execution plan

### Phase 0: baseline and guardrails (0.5 day)

- Build the frontend (`npm ci`, `npm run build:web`) and run `cargo test --workspace` to confirm the local baseline.
- Add the CI job from 2.8 so every later change is gated.
- Create three fixtures: 30 seconds, 10 minutes with two speakers, 60 minutes of dense speech. Add a sparse 60-minute fixture if available.
- Record baseline wall time, RTF, peak RSS, segment count, transcript hash, and word-timestamp drift for VAD on/off and DTW on/off.

Exit criteria: reproducible benchmark output checked into `plans/` or `scripts/bench/`, and a green baseline CI run.

### Phase 1: inference throughput (1-2 days)

- [x] Implement `merge_speech_segments`, its tests, and the temporary environment flag.
- [x] Remove the per-segment sample clone.
- [x] Drop the source buffer early when alignment is disabled.
- [ ] A/B benchmark against baseline; inspect transcript diffs on the multilingual fixtures.
- [ ] Tune `max_gap_seconds` (start at 1.0) and the 29.5-second limit.
- [ ] Decide whether to expose the merge as a user setting. If yes, add all eight locale strings at once.

Local verification on 2026-10-23: `cargo test -p transcription-engine --lib --no-default-features --features load-dynamic` passed 105 tests with 1 ignored. The local machine uses the GNU Windows toolchain, which required target-only workarounds (LLVM, MinGW include paths, a `CXX` wrapper that removes `/utf-8`, copied static libs, and `u32` enum aliases in generated bindings); these are not part of the change and should not be needed on the project's MSVC CI. The runtime benchmark is still blocked on model and fixture availability.

Exit criteria: section 1.6 met; no regression in existing tests; a short note in the PR with before/after numbers.

### Phase 2: memory and runtime hygiene (1-2 days)

- [x] Evaluate the shared-buffer `SpeechSegment` refactor; if too invasive, ship the clone removal and early drop first. Shipped the early drop instead of the invasive buffer refactor.
- [x] Move inference to a blocking thread and convert the Resolve bridge's blocking I/O to async-friendly calls.
- [x] Implement normalization probing, keyed cache files, atomic writes, and cleanup.
- [ ] Measure peak RSS and Adobe/Resolve responsiveness during a long transcription.

Local verification on 2026-10-23: `cargo check -p autosubs --tests --no-default-features --features transcription-engine/load-dynamic` passed, and the five `normalized_audio_cache_tests` passed via the binary test harness. App test binaries using the normal `cdylib` crate type still cannot link with GNU `ld` locally (`export ordinal too large`), so the temporary `rlib`-only manifest edit was used for that run and reverted. Runtime measurement remains blocked on models, fixtures, and a running Resolve session.

Exit criteria: memory target met for a 60-minute fixture; bridge latency stays sub-second during inference; normalization is skipped for already-normalized WAVs. Probing and cache behavior are covered by tests; the memory and latency measurements are still pending.

### Phase 3: data integrity and multilingual correctness (1-2 days)

- Add a per-file save queue, in-memory document reuse, compact serialization, and an atomic write.
- Split `originalSegments` into a sidecar or write-once path.
- Fix `line_number` at the source (Rust formatting) and add Japanese/Chinese tests.
- Add regression tests for edit, reformat, edit, and save sequencing.

Exit criteria: two-hour transcript editing remains responsive with no lost updates; CJK two-line cues have correct per-word line numbers.

### Phase 4: security and distribution (1 day)

- Add the Adobe bridge token handshake, app-name allowlist, and single-connection policy; update the CEP extension to send the token.
- Add a CSP and trim the capability set; verify media playback, thumbnails, model downloads, and external links.
- Decide the fork update strategy and configure the endpoint/key or disable updates; update the GitHub allowlist.
- Add path validation for filename arguments.

Exit criteria: unauthenticated bridge clients are rejected, the extension still works on Windows and macOS, and the fork cannot be silently replaced by upstream.

### Phase 5: hardening (0.5-1 day)

- Disk-cache waveform peaks.
- Bound the Resolve installer retries.
- Remove dead progress code.
- Add the benchmark and fixtures to CI as a non-blocking job.
- Document the new behavior in `AGENTS.md` and the relevant READMEs.

Total: roughly 5-7 engineer-days for one person, with Phase 1 delivering most of the user-visible value.

## 4. Benchmark protocol

**Fixtures**

- 30-second clean speech, one speaker.
- 10-minute two-speaker interview with natural pauses.
- 60-minute dense lecture.
- 60-minute sparse recording with long silences (if available).

**Matrix**

- VAD on/off.
- DTW on/off.
- Diarization off for the throughput comparison; a separate two-speaker run for quality.
- Models: `tiny.en` for iteration, `small` or `large-v3-turbo` for realistic numbers.
- GPU and CPU on the target Windows machine; at least one macOS run before release.

**Metrics**

- Wall-clock time and RTF (audio seconds divided by wall seconds).
- Peak RSS for the process.
- Number of `state.full` calls and total audio duration sent to Whisper.
- WER/CER against a hand-corrected reference, or a normalized word-sequence diff against the current build.
- Mean and p95 absolute word-boundary drift.
- Number of empty or hallucinated segments.

**Pass/fail**

- Phase 1: at least 2x RTF improvement on dense speech, within 10% of VAD-off throughput, no WER regression above 0.5 points, no drift above 50 ms.
- Memory: no higher peak RSS; target below 1.5x decoded PCM plus model.
- Responsiveness: Adobe and Resolve bridge round-trip stays under one second during transcription.

## 5. Verification commands

From `AutoSubs-App/`:

```powershell
npm ci
npm test
npm run build:web
```

From `AutoSubs-App/src-tauri/`:

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Note: `cargo fmt --check` already fails on the 3.11.0 baseline because wide parts of the crate are not rustfmt-formatted. Do not mix a whole-crate reformat into this work; format touched files only, or land a separate mechanical formatting commit first.

Lua syntax check from the repository root:

```powershell
Get-ChildItem AutoSubs-App/src-tauri/resources/modules -Filter *.lua | ForEach-Object {
    luajit -bl $_.FullName NUL
}
```

If `luajit` is unavailable on Windows, run the same check on macOS or in the CI Linux job. The modules reference Resolve globals at load time, so parse-only checks are the correct gate.

i18n budget check: run the Python snippet in `AGENTS.md`. Any new UI string must land in all eight locale files in the same change.

## 6. Open questions

1. Is the fork intended to track upstream, or to diverge? This determines the updater and merge strategy.
2. Which model and hardware should be the reference for the performance targets?
3. Is a small punctuation/capitalization change acceptable when merging across short pauses, or must output remain byte-identical?
4. Should segment merging be a user-visible setting, or an internal default with an environment-variable escape hatch?
5. Is the Adobe bridge threat model limited to local processes, or should it also resist a compromised renderer/webview?
