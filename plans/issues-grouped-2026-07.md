# GitHub Issues — Last Month Grouped (2026-06-04 → 2026-07-04)

Auto-generated grouping of issues from the last 30 days. Issues that appear to describe the same underlying root cause are clustered together. Each cluster lists the issue numbers, the common symptom/error, and a short note on the likely root cause and any divergence between reports.

Total issues in window: **67** (across #567–#638).
Closed: #569, #585, #590, #594, #608, #631.

---

## Triage — Status vs. unreleased code (2026-07-04)

> **Context:** Latest released version is **v3.6.2** (~1 month old). Since then, **39 commits** have landed on `main` but are **not yet released**. This section records, per cluster, whether each issue is ✅ Fixed / 🟡 Partially Fixed / 🔴 Still Present / ⚪ N/A or Cannot Determine in the *current unreleased* code. Findings were verified against the actual files (cited inline) and spot-checked.
>
> Legend: ✅ Fixed · 🟡 Partially Fixed · 🔴 Still Present · ⚪ N/A / Cannot Determine

### Status by cluster

| Cluster | Issues | Status | Key evidence |
|---|---|---|---|
| **A1** exportEnd nil concat (Lua:750) | #638 #625 #622 #607 #591 #586 | 🔴 Still Present | `autosubs_core.lua:750` concatenates `exportStart`/`exportEnd` from `get_clip_boundaries()` with no nil-guard. Highest-impact unfixed Resolve bug. |
| **A2** GetMarkInOut missing | #580 | ✅ Fixed | Commit `5de405f`. Guards `if timeline.GetMarkInOut then` at lines 624 & 929; falls back to timeline start/end frames. |
| **A3** Generic error when Resolve closed | #583 | 🟡 Partially Fixed | `resolve_bridge.rs:53-56` adds debug log noting it's normal, but user-facing error is still generic `"resolve request failed: ..."`. |
| **A4** HTTP timeout (handler hangs) | #614 #589 | 🔴 Likely Still Present | No specific fix; downstream symptom of A1's nil-crash leaving the connection open. Will resolve once A1 is fixed. |
| **A5** Export path missing on Windows | #621 #616 #604 #582 #639 | ✅ Fixed | Root cause found: `GetExportProgress()` reported success whenever `IsRenderingInProgress()` went false, without checking the actual render job status, so failed renders were reported as completed with a non-existent file. Now checks `project:GetRenderJobStatus(pid)` and surfaces the real failure via `ResolveApiError`. `file-utils.ts:505-542`'s `validateExportedAudioFile()` retry logic remains as a second safety net. |
| **A6** Failed to start audio export | #631 #594 | ⚪ N/A | Already closed. |
| **B1** 'AutoSubs Caption' template not found | #620 #612 #601 #588 #575 | ✅ Fixed | Commits `5482913` + PR #581. `refresh_project()` (104-112) detects project switches and resets import flag; `get_templates()` (302-310) auto-imports from `caption-bin.drb`; `get_template()` retries after auto-import. |
| **B2** 'Default Template' not found | #587 #578 | 🔴 Still Present | Fallback chain (964-992) goes requested → "Default Template" → error. **No fallback to `AutoSubs Caption`** when the custom name is missing. |
| **B3** 'Text+' not found | #600 | 🔴 Still Present | Same fallback gap as B2 — user-selected templates that aren't in the pool fail with no recovery. |
| **B4** AppendToTimeline returns empty | #574 #573 | 🟡 Partially Fixed | Lines 1292-1301 now wrap in `pcall` and surface a clear error, but the underlying root cause (invalid template clip / locked track) isn't addressed. |
| **B5** Lua:1170 compare number with nil | #572 | 🔴 Still Present | `build_clip_list` (1100-1103) calls `to_frames(subtitle["start"/"end"], ...)` with no nil-guards. A nil segment time still propagates into arithmetic. |
| **B6** GetFusionCompCount returned nil | #636 | ✅ Fixed | Lines 1170-1174 now guard `if not fusionCompCount then` and aggregate failures into a warning (1222-1225, 1326-1328) instead of a hard crash. |
| **B7** Transcript has no segments | #592 | ✅ Fixed | Lines 1259-1261 catch empty transcripts early with a clear error message. |
| **C1** Subs revert to "Example Subtitle" on playback | #617 | 🟡 Partially Fixed | Commits `981154a`, `2232c1d`, `7ee73c9` reworked the macro's word-timing/animation. `StyledText`→`Follower1`→`CharacterLevelStyling1` binding chain is in place, but the hardcoded placeholder `"Subtitle Example Text"` still exists at `autosubs-macro.setting:1577`. May still revert if the binding doesn't refresh on playback — needs runtime verification. |
| **C2** Render settings reset after placement | #619 | 🔴 Still Present | `ExportAudio` (753-757) loads `'Audio Only'` preset and overwrites `TargetDir`/`CustomName`; `AddSubtitles` (1240) switches back to edit page but **never saves/restores** the user's original render settings. |
| **C3** In/Out markers removed | #618 | 🔴 Still Present | `get_marker_range()` (620-634) reads markers but doesn't save them; no restore logic exists. Resolve's render-job/page-switch flow appears to clear them with no restore. |
| **D1** Whisper .bin connection reset | #633 #623 #609 #608 | 🟡 Partially Fixed | Commit `6ef301f` ("atomic downloads"). Downloads stream to `.part` + atomic rename, with `validate_model_file()` size checks and a single re-download on validation failure. **But no retry-with-backoff for transient connection resets, and no HTTP Range/resume.** |
| **D2** Whisper .bin DNS / peer disconnect | #603 #602 | 🟡 Partially Fixed | 30s connect timeout added (fails fast), but no retry on DNS failure. |
| **D3** Parakeet ONNX timeout/TLS | #632 #606 #584 | 🟡 Partially Fixed | Same atomic/validation improvements; no retry or resume for TLS handshake failures. |
| **D4** Parent dir missing (os error 2) | #605 | ✅ Fixed | `fs::create_dir_all(parent).ok()` is called before every download (line 1224). |
| **D5** Generic "Failed to GET url" | #626 #624 | 🟡 Partially Fixed | Better error wrapping, but no retry. |
| **D6** Silero VAD download | #590 | ✅ Fixed | Dedicated 120s timeout-bounded download path (lines 578-596). (Already closed.) |
| **D7** Diarization DNS failure | #577 | 🟡 Partially Fixed | Same downloader path; no retry for DNS. |
| **E1** Parakeet protobuf parse fail (corrupt file) | #628 #627 | ✅ Fixed | Validation + auto-re-download + atomic writes prevent truncated files from being cached. (No SHA256 checksums yet, but size/zip-integrity checks catch the reported cases.) |
| **E2** Parakeet ORT broadcast axis error | #567 | 🟡 Partially Mitigated | 30-second segment chunking (`MAX_SEGMENT_SECONDS = 30.0` in `parakeet.rs:49`) prevents the specific error triggered by long audio, but ORT is still pinned to `=2.0.0-rc.12` (a release candidate) with no opset pinning. Workaround, not root-cause fix. |
| **F1** ffmpeg sidecar not found on macOS | #635 | 🔴 Still Present | `audio_preprocess.rs:198-228` still has the sidecar→system-ffmpeg fallback, but no macOS-specific sidecar path fix. If the bundled sidecar isn't found *and* no system ffmpeg is installed, it still fails. |
| **G1** Negative/malformed SRT timecodes | #610 | 🔴 Still Present | `srt-utils.ts:4-11` `formatTimecode` has no `Math.max(0, …)` clamping — negative durations still produce `-112:-7:-40,-860`. |
| **G2** CRLF vs LF parsing | #595 | 🔴 Still Present | `parseSrt` (90-119) splits on `\n` only with no `\r\n`/`\r` normalization; `\r` stays attached and breaks blank-line detection. |
| **G3** Numbers glued to preceding word | #593 | 🟡 Partially Fixed | `formatting.rs:693-702` `join_tokens` respects `b.leading_space`, but if the model doesn't set that flag for numeric tokens, no space is inserted. Infrastructure present, edge case not fully covered. |
| **H1** UI cut off, can't scroll | #597 | 🟡 Partially Fixed | End-of-process speaker list (`subtitle-viewer-panel.tsx:291`) and add-to-timeline dialog (`:414`) now wrap in `<ScrollArea max-h-[400px]>`. Onboarding tour tooltip (`onboarding-tour.tsx`) still uses fixed `w-80` with no max-height/overflow — may still clip on small screens. |
| **I1** GPU not working standalone (Parakeet) | #613 | ⚪ Cannot Determine | Feature flags (`mac-aarch`/`windows`/`linux`) exist in `Cargo.toml:79-84` and ORT execution-provider selection exists, but whether the *standalone distribution build* was compiled with the right flag can only be verified at build/release time. Worth checking the release CI config. |
| **J1** macOS native crash at final stage | #615 | ⚪ Cannot Determine | Completion path (`ProgressContext.tsx:184-199`, `transcription_api.rs:388-467`) looks normal. Needs the actual crash report to localize. |
| **J2** Windows v3.2.1 DLL ordinal | #637 | ⚪ N/A | Reported against v3.2.1 (very old). User should upgrade. Not actionable against current code. |
| **J3** Duplicate Resolve Scripts menu entries | #576 | 🔴 Likely Still Present | `windows/custom_installer.nsi` has no cleanup logic for old v2 script entries before installing v3. Needs installer testing to confirm. |
| **K1** Premiere Pro 2026 UXP migration | #571 | 🔴 Not Started | `cep.config.ts` still uses legacy CEP manifest v6.0 with host range `[0.0,99.9]`. No UXP manifest. Large architectural effort, not a bugfix. |
| **K2** AE output module not WAV | #569 | ✅ Fixed (closed) | Already closed. |
| **L · #585** FunASR/SenseVoice local engines (closed) | #585 | ✅ Done | Commits `422898e`, `df7fd61`. `sense-voice` model in `models.json:213-222`, engine in `engines/sense_voice.rs`, wired into router (`engines/mod.rs:106-116`). |
| **L · #596** Keyboard shortcuts to move words between lines | #596 | 🔴 Not Implemented | No keyboard handlers in `subtitle-list.tsx`. |
| **L · #570** VibeVoice support | #570 | 🔴 Not Implemented | No model entry or engine variant. |
| **L · #568** Batch transcription | #568 | 🔴 Not Implemented | CLI/UI handle single files only. |
| **M1** Subs start at 2:20, singing skipped, multi-speaker missed | #579 | ⚪ Needs Triage | VAD `min_silence_duration` was adjusted to 500ms (may affect singing detection), but the "2:20 offset" symptom is distinct and unexplained. Should be split into separate issues. |

### Work packages (grouped by area for agent handoff)

Each package is self-contained — a single agent can own it without needing context from the others. Items are ordered by impact within each package. Status codes refer to the table above.

#### WP1 — DaVinci Resolve integration (Lua + bridge + placement)
*Owns: A1, A3, A4, A5, B2, B3, B4, B5, C1, C2, C3, J3. Primary files: `autosubs_core.lua`, `resolve_bridge.rs`, `AutoSubs.lua`, `autosubs-macro.setting`, `windows/custom_installer.nsi`.*

- 🔴 **A1** (6 reports, highest priority) — nil-guard `exportStart`/`exportEnd` at `autosubs_core.lua:750` before concatenation. Also resolves **A4** timeouts (the nil-crash leaves the Lua connection open).
- 🔴 **B2/B3** (3 reports) — extend the template fallback chain in `get_template()` (lines 964-992) to fall back to `ANIMATED_CAPTION` ("AutoSubs Caption") when the user-configured name ("Default Template", "Text+", etc.) is missing.
- 🔴 **B5** (1 report, hard crash) — nil-guard `subtitle["start"]`/`subtitle["end"]` in `build_clip_list` (lines 1100-1103) before `to_frames()`.
- 🔴 **C2** (1 report) — save the user's render settings before `ExportAudio` overwrites them (lines 753-757) and restore after `AddSubtitles` (line 1240).
- 🔴 **C3** (1 report) — save/restore timeline In/Out markers around the export+placement flow (currently `get_marker_range()` at 620-634 only reads them).
- 🟡 **A5** (4 reports) — verify whether `jobInfo["TargetDir"]`/`OutputFilename` path construction at `autosubs_core.lua:772` needs wide-char handling on Windows; the TS-side retry (`validateExportedAudioFile`) already addresses the race.
- 🟡 **A3** (1 report) — make the "Resolve offline" distinction user-facing in `resolve_bridge.rs:56` (debug log exists at 53-56, but error string is still generic).
- 🟡 **B4** (2 reports) — `pcall` + clear error already added (1292-1301); investigate the underlying root cause of `AppendToTimeline` returning empty (locked track / invalid template clip).
- 🟡 **C1** (1 report) — verify at runtime whether the macro text binding refreshes on playback; the hardcoded placeholder `"Subtitle Example Text"` at `autosubs-macro.setting:1577` is a suspect. Commits `981154a`/`2232c1d`/`7ee73c9` already reworked word-timing.
- 🔴 **J3** (1 report) — add cleanup logic to `windows/custom_installer.nsi` to remove old v2 Resolve Scripts menu entries before installing v3.

#### WP2 — Model downloader robustness
*Owns: D1, D2, D3, D5, D7, E2. Primary files: `model_manager.rs`, `transcription-engine/Cargo.toml`, `diarize/Cargo.toml`.*

- 🔴 **D1/D2/D3/D5/D7** (~13 reports, highest leverage) — add retry-with-exponential-backoff for transient network errors (connection reset, DNS failure, TLS handshake, peer disconnect) and HTTP `Range` header support for resuming interrupted downloads. The atomic-write + validation + single-redownload work (commit `6ef301f`) is already in place but only helps once a download *completes*; it does not recover mid-stream failures.
- 🟡 **E2** (1 report) — ORT is pinned to `=2.0.0-rc.12` (a release candidate) with no opset pinning. The 30s segment chunking in `parakeet.rs:49` mitigates the broadcast-axis error but is a workaround. Consider pinning to a stable ORT release and/or explicit opset version for Parakeet.
- Optional hardening: add SHA256 checksums to `models.json` and verify post-download (currently size/zip-integrity only — catches E1's corrupt-file cases but not subtle corruption).

#### WP3 — SRT / subtitle format
*Owns: G1, G2, G3. Primary files: `AutoSubs-App/src/utils/srt-utils.ts`, `transcription-engine/src/formatting.rs`.*

- 🔴 **G1** (1 report, trivial) — clamp negative durations in `formatTimecode` (`srt-utils.ts:4-11`) with `Math.max(0, …)` on each component.
- 🔴 **G2** (1 report, trivial) — normalize line endings in `parseSrt` (`srt-utils.ts:90-119`) before the regex: `srtData.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`.
- 🟡 **G3** (1 report) — `join_tokens` (`formatting.rs:693-702`) respects `b.leading_space` but doesn't force a space before numeric tokens when the flag is unset. Add a numeric-token heuristic or always insert a space when `insert_space` is true.

#### WP4 — Audio preprocessing (macOS)
*Owns: F1. Primary files: `AutoSubs-App/src-tauri/src/audio_preprocess.rs`.*

- 🔴 **F1** (1 report) — macOS sidecar path resolution is broken in v3.6.2; the system-ffmpeg fallback also fails when none is installed. Either fix the bundled sidecar path lookup on macOS or improve the error message to instruct users to install ffmpeg (e.g. via Homebrew).

#### WP5 — UI / UX
*Owns: H1. Primary files: `AutoSubs-App/src/components/dialogs/onboarding-tour.tsx`.*

- 🟡 **H1** (1 report) — two separate overflow spots. **(a) FIXED:** the speakers list in `add-to-timeline-dialog.tsx` used a bare `<ScrollArea>` with no height constraint, so it grew unbounded and could overflow the dialog; added `max-h-[400px]` (matching the pattern in `subtitle-viewer-panel.tsx`). **(b) Open:** the onboarding tour tooltip (`onboarding-tour.tsx:31`) still uses a fixed `w-80` with no max-height/overflow and may clip on small screens. Add a max-height + `overflow: auto` to the tooltip container.

#### WP6 — Feature requests (larger scope)
*Owns: #596, #570, #568. Not bug fixes — schedule separately.*

- 🔴 **#596** — keyboard shortcuts to move words between lines (no handlers in `subtitle-list.tsx`).
- 🔴 **#570** — VibeVoice support. Note: VibeVoice (Microsoft) is a *different* model from SenseVoice (Alibaba, already integrated under #585). No `vibevoice` string exists in the repo; this would be a new engine integration.
- 🔴 **#568** — batch transcription for multiple files (CLI/UI currently single-file only).

#### WP7 — Adobe UXP migration (large effort, not a bugfix)
*Owns: K1. Primary files: `Adobe-Extension/cep.config.ts`, `Adobe-Extension/`.*

- 🔴 **K1** — Premiere Pro 2026 dropped CEP support in favor of UXP. `cep.config.ts` still uses legacy CEP manifest v6.0. This is an architectural migration, not a quick fix — schedule as a standalone project.

### Already fixed in unreleased code (will close on next release)

A2, B1, B6, B7, D4, D6, E1, K2, #585 (SenseVoice).

### Needs runtime/build verification (not codeable without more info)

- **A5** (wide-char path) — verify on a Windows machine with non-ASCII user paths.
- **C1** (macro playback refresh) — verify in Resolve 21 that subs don't revert to placeholder on playback.
- **I1** (standalone GPU build flag) — check the release CI config to confirm the standalone build is compiled with `mac-aarch`/`windows`/`linux` features.
- **J1** (macOS native crash) — needs the actual crash report from the user to localize.
- **M1** (Debian 13.1 multi-symptom) — needs user triage to split into separate issues (2:20 offset, singing skipped, multi-speaker missed).

---

## A. DaVinci Resolve Bridge / Lua Server

### A1. "Server handler failed" — `autosubs_core.lua:729: attempt to concatenate local 'exportEnd' (a nil value)`
**Issues:** #638, #625, #622, #607, #591, #586

All six reports share the identical Lua traceback at line 729 of `autosubs_core.lua`, where `exportEnd` is `nil` and gets concatenated into a string. Reported on both macOS and Windows, v3.6.1 and v3.6.2. #638 gives the clearest repro: audio placed beyond `01:00:00:00` on the timeline fails — tracks 1 & 2 fail, track 3 succeeds — strongly suggesting the export-end timecode lookup returns `nil` for clips whose start/end crosses an hour boundary or when no In/Out is set on the clip.

**Likely root cause:** `exportEnd` is fetched from a Resolve API call that returns `nil` under certain timeline configurations (e.g. no In/Out marks, clip beyond 1hr, or a Resolve API version mismatch). The Lua code concatenates without a nil-guard.

---

### A2. "Server handler failed" — `autosubs_core.lua:701: attempt to call method 'GetMarkInOut' (a nil value)`
**Issues:** #580

Distinct from A1. The `GetMarkInOut` method is missing on the timeline object, indicating a Resolve API version that no longer exposes `GetMarkInOut` (or it's being called on the wrong object type). Reported on v3.6.2.

**Likely root cause:** Resolve version compatibility — `GetMarkInOut` may have been renamed/removed, or the method is being called on a non-timeline object.

---

### A3. "Server handler failed" — generic / Resolve not running
**Issues:** #583

No Lua traceback; logs only show `resolve_bridge: could not connect to Resolve ... target machine actively refused it (os error 10061)`. This is the expected "Resolve is closed" path surfacing as a user-facing error.

**Likely root cause:** Error message UX — the bridge should distinguish "Resolve isn't running" from a genuine handler failure.

---

### A4. "resolve request failed: ... 127.0.0.1:56002/ ... operation timed out"
**Issues:** #614, #589

Both report the HTTP request to the Resolve Lua server (port 56002) timing out. #589 explicitly ties it to Resolve 21. Distinct from A3 (refused) — here the server accepts the connection but never responds, suggesting the Lua server is alive but the handler hangs.

**Likely root cause:** Lua server reachable but handler blocked/hung — possibly the same nil-concatenation crash in A1 happening mid-request, leaving the connection open without a response.

---

### A5. "Resolve reported an audio export path, but the file does not exist"
**Issues:** #621, #616, #604, #582, #639

All Windows, v3.6.1/v3.6.2, Resolve 21. Resolve claims it exported audio to `...AppData\Local\com.autosubs\Audio\autosubs-exported-audio-*.wav`, but the file isn't there when AutoSubs checks.

**Root cause (confirmed):** `GetExportProgress()` in `autosubs_core.lua` treated `project:IsRenderingInProgress() == false` as unconditional success and returned the (never-written) `audioInfo.path`. Resolve's render job can stop (`IsRenderingInProgress` → false) without actually succeeding — e.g. a failed/cancelled job from a bad output path, full disk, or missing encoder — and the API gives no exception for this, only a job status. The code never checked `project:GetRenderJobStatus(pid)` for the real `JobStatus`/`Error`, so a failed render was reported to the frontend as a completed export with a bogus path.

**Fix applied:** `GetExportProgress()` now calls `project:GetRenderJobStatus(pid)` once rendering stops and only reports `completed = true` when `JobStatus == "Complete"`; otherwise it returns `{ error = true, message = "Audio export failed in Resolve", detail = <JobStatus/Error> }`. `ResolveContext.tsx` now throws a `ResolveApiError` (carrying the detail) instead of a generic `Error`, so the existing export-failure error dialog surfaces the real Resolve-reported reason. This doesn't rule out a residual wide-character path issue for non-ASCII export dirs, but it fixes the "silent render failure reported as success" case, which matches most of these reports (plain ASCII paths).

---

### A6. "Failed to start audio export"
**Issues:** #631 (closed), #594 (closed)

Both closed already; included for completeness. Likely the same family as A5 / the Resolve export handshake.

---

## B. Subtitle Template / Placement in Resolve

### B1. "Template not found — Could not find subtitle template 'AutoSubs Caption' in media pool"
**Issues:** #620, #612, #601, #588, #575

Five reports, all v3.6.1/v3.6.2, mixed macOS/Windows. The Fusion macro template `AutoSubs Caption` isn't present in the media pool when placement runs. This is the most common single error class in the window.

**Likely root cause:** Template isn't being imported into the media pool automatically, or it's getting removed on project reload. Possibly tied to the v3.6.x installer not seeding the template, or a Resolve 21 change in how media pool templates persist.

---

### B2. "Template not found — 'Default Template'"
**Issues:** #587, #578

Same error class as B1 but the missing template is named `Default Template` rather than `AutoSubs Caption`. Suggests users (or a previous AutoSubs version) configured a custom template name that no longer exists.

**Likely root cause:** Stale user setting pointing at a template name that doesn't exist in the current project; fallback to `AutoSubs Caption` isn't happening.

---

### B3. "Template not found — 'Text+'"
**Issues:** #600

Single report, template name `Text+`. Same root class as B1/B2 but specifically the built-in Fusion `Text+` template — likely a user-selected template that isn't in the media pool.

---

### B4. "Failed to add subtitles to timeline — Resolve did not return any timeline items from AppendToTimeline"
**Issues:** #574, #573

Both macOS, v3.5.3/v3.6.1. `AppendToTimeline` returns empty, so AutoSubs can't confirm placement. Distinct from the template-not-found errors — here the append call runs but yields nothing.

**Likely root cause:** Resolve's `AppendToTimeline` silently failing (possibly because the template clip is invalid, tying back to B1), or a timeline state issue (locked track, wrong track selected).

---

### B5. "Failed to place all N subtitles — autosubs_core.lua:1170: attempt to compare number with nil"
**Issues:** #572

Windows, v3.6.1. Distinct Lua error at line 1170 — a numeric comparison where one side is `nil`. Likely a missing timecode/duration field on a placed clip.

**Likely root cause:** A subtitle segment has a `nil` duration/end-time that flows into the placement loop; needs a nil-guard.

---

### B6. "Failed to place all subtitles — template clips had no Fusion composition (GetFusionCompCount returned nil)"
**Issues:** #636

Windows, v3.6.2. The placed template clips have no Fusion comp, so the caption macro can't be applied. Related to B1/B4 but fails later in the pipeline — the template *was* found but its Fusion comp is missing.

**Likely root cause:** Template clip in media pool is a non-Fusion clip, or Resolve version doesn't expose `GetFusionCompCount` as expected.

---

### B7. "Failed to add subtitles — Transcript has no segments"
**Issues:** #592

Windows, v3.5.3, Hebrew audio with offset 254.183s. Transcription returned an empty segment list. Likely a transcription-side issue (audio too short after offset, or language-detection failure) rather than a Resolve placement bug, but reported under the "Failed to add subtitles" surface error.

**Likely root cause:** Whisper produced no segments for the offset window; the empty transcript should be caught earlier with a clearer message.

---

## C. Subtitle Content / Playback Quality in Resolve

### C1. Subtitles switch to "Example Subtitle" halfway through timeline on playback
**Issues:** #617

macOS, v3.6.2, Resolve 21. Subs look correct in AutoSubs and when clicked individually in Resolve, but on playback they revert to the macro's placeholder text. Strongly suggests the Fusion macro's `StyledTextFollower` / text binding isn't refreshing until the clip is touched.

**Likely root cause:** Fusion text node not re-evaluating on playback; needs a forced refresh or a different binding approach for the caption text.

---

### C2. Render filename and folder reset after adding subtitles to timeline
**Issues:** #619

After placement, Resolve's Render tab format/filename/target folder get overwritten to point at AutoSubs' internal folder. User requests the original render settings be restored post-placement.

**Likely root cause:** AutoSubs' placement flow modifies render settings (or creates a new render job) and doesn't restore the user's prior state.

---

### C3. In/Out markers removed after generating subtitles
**Issues:** #618

Timeline In/Out marks disappear after the AutoSubs workflow runs. Likely the export/placement step clears marks.

**Likely root cause:** The Lua export or placement routine calls `ClearMarkInOut` (or equivalent) and doesn't restore.

---

## D. Model Download Failures (Network)

### D1. Whisper.cpp `.bin` download — "existing connection forcibly closed by remote host (os error 10054)"
**Issues:** #633, #623, #609, #608 (closed)

All Windows, all downloading a `ggml-*.bin` from `ggerganov/whisper.cpp` via Hugging Face. The connection is reset mid-download. #608 was closed (presumably as a transient network issue), but three more reports in the same window indicate this is recurring.

**Likely root cause:** HF CDN resetting large downloads on flaky connections; no resume/retry logic in the downloader. A retry-with-range strategy would likely fix most of these.

---

### D2. Whisper.cpp `.bin` download — other network errors
**Issues:** #603 ("No such host is known" os error 11001), #602 ("Peer disconnected")

Same downloader, different failure modes (DNS resolution, peer disconnect). Same root class as D1 — unreliable download without retry/resume.

---

### D3. Parakeet ONNX `encoder-model.int8.onnx` download — connection forcibly closed / timeout
**Issues:** #632, #606, #584

Same pattern as D1 but for the Parakeet model from `istupakov/parakeet-tdt-0.6b-v3-onnx`. Reports in Russian, English, and German locales — the localized error strings all map to the same connection-reset/timeout. #584's German message ("Der Client und der Server können keine Daten austauschen") is a TLS handshake failure.

**Likely root cause:** Same as D1 — large ONNX download over flaky/TLS-strict networks with no resume.

---

### D4. Parakeet ONNX download — "The system cannot find the file specified (os error 2)"
**Issues:** #605

Different from D3 — the download target/parent path doesn't exist rather than the connection dropping. Possibly a half-cleaned model cache directory.

**Likely root cause:** Model cache dir missing or partially deleted; downloader doesn't recreate parent dirs before writing.

---

### D5. "Failed to GET url" (generic)
**Issues:** #626, #624

Generic download failure surfaced as "Failed to GET url" without the more specific connection-reset message. #626 was using `moonshine-tiny-zh` from a local `.mp4` path. Same downloader root cause as D1/D3, just a less informative error wrapper.

---

### D6. Silero VAD model download failure
**Issues:** #590 (closed)

Closed already; same downloader family.

---

### D7. Diarization `segmentation-community-1.onnx` download — "No such host is known (os error 11001)"
**Issues:** #577

DNS failure downloading the diarization segmentation model from `altunenes/speaker-diarization-community-1-onnx`. Same downloader root class as D1–D5.

---

**Common root cause for D1–D7:** The model downloader lacks robust retry/resume, parent-dir creation, and clear error messages. A single fix (resumable downloads with retries + better error surfacing) would address the entire D cluster — this is the single highest-impact fix in the window (≈17 issues).

---

## E. Model Load / Inference Failures

### E1. Parakeet model load — "Protobuf parsing failed"
**Issues:** #628, #627

Same user, same minute, same Windows machine — the downloaded `encoder-model.int8.onnx` is corrupt on disk (protobuf parse failure on load). This is the *downstream symptom* of D1/D3/D4: a download that was reported as "complete" but produced a truncated/corrupt file.

**Likely root cause:** No integrity check (checksum/size verification) after download; a partially-downloaded file is cached and then fails to load. Fix the downloader (cluster D) and verify checksums post-download.

---

### E2. Parakeet inference — "Non-zero status code ... Add node ... broadcast axis 1252 by 6252"
**Issues:** #567

ONNX Runtime broadcast error inside the Parakeet model. Distinct from E1 — the model loads but inference fails on a specific op. Could be an ORT version mismatch or a model variant incompatibility.

**Likely root cause:** ONNX Runtime version / opset mismatch with the Parakeet model variant; needs an ORT upgrade or model-version pin.

---

## F. Audio Preprocessing

### F1. "Failed to normalize audio: No such file or directory (os error 2)" — ffmpeg sidecar unavailable on macOS
**Issues:** #635

macOS, v3.6.2. Logs show `ffmpeg sidecar execution failed: Io(NotFound)` then `falling back to system ffmpeg`, then failure. The bundled ffmpeg sidecar isn't being found on macOS, and the system-ffmpeg fallback also fails (likely no system ffmpeg installed).

**Likely root cause:** macOS sidecar path resolution broken in v3.6.2, and the system-ffmpeg fallback path is also failing. Distinct from the Windows download issues — this is a packaging/sidecar-bundling regression.

---

## G. SRT / Subtitle Format

### G1. Exported SRT contains negative/malformed timecodes (e.g. `-112:-7:-40,-860`)
**Issues:** #610

macOS, Premiere Pro path. SRT export produces negative and absurdly large timecode components. Strongly suggests a signed/underflow bug in the timecode formatter.

**Likely root cause:** Timecode formatting treats a negative or zero duration as signed and prints the sign on each component; needs clamping/abs handling.

---

### G2. SRT parsing — CRLF vs LF line endings
**Issues:** #595

Valid `.srt` files with CRLF (or mixed) line endings are mis-parsed on import. Parser likely splits on `\n` only and leaves `\r` attached, breaking the blank-line separator detection.

**Likely root cause:** SRT importer not normalizing line endings before parsing.

---

### G3. Inconsistent number formatting — raw numbers joined to preceding word with no space
**Issues:** #593

Numbers transcribed correctly by the model get glued to the previous word after post-processing. Issue doesn't occur when the model formats numbers with commas. Suggests the punctuation/tokenization post-processor strips a space when rejoining tokens that are pure digits.

**Likely root cause:** Token rejoin logic doesn't insert a space before numeric tokens in some code path.

---

## H. UI / UX

### H1. UI cut off and cannot scroll
**Issues:** #597

Three specific locations: onboarding step 5/6, speaker-edit popup, and end-of-process speaker list. Resizing the window doesn't help. Likely missing `overflow: auto` / fixed-height containers without scroll.

**Likely root cause:** Several dialogs/popups use fixed heights without scroll containers; needs an audit of popup/list containers for overflow handling.

---

## I. GPU / Acceleration

### I1. GPU acceleration not working in standalone mode (Parakeet)
**Issues:** #613

GPU toggle enabled, Parakeet selected, but acceleration doesn't engage in standalone (non-Resolve) mode. Possibly the standalone build wasn't compiled with the platform acceleration feature flag (per AGENTS.md §2, macOS needs `mac-aarch`, Windows needs `windows`).

**Likely root cause:** Standalone distribution built without the GPU feature flag, or the flag is set but ORT execution provider selection falls back to CPU silently.

---

## J. Crashes / Platform-Specific

### J1. "Always crashing at last stage" — macOS native crash
**Issues:** #615

macOS, v3.6.2. App crashes at the final stage of a simple 3-min / 4-subtitle job. Native crash report (not a Rust error). Could be a whisper-rs/ONNX native panic on completion, or a UI-thread crash when transitioning to the "done" state.

**Likely root cause:** Native crash in the finalization path — needs the crash report inspected to localize.

---

### J2. "Ordinal number 2 could not be located in the dynamic link library" (Windows, v3.2.1)
**Issues:** #637

Windows, but reported against **v3.2.1** (very old). A DLL entry point is missing — classic symptom of a bundled native DLL (likely whisper-rs/ONNX) being loaded against a newer system runtime that doesn't export that ordinal.

**Likely root cause:** Stale install of v3.2.1 with an incompatible system DLL; user should upgrade to v3.6.2. Likely not actionable against current code.

---

### J3. V3.6.1 doesn't appear / scripts menu has two entries / V2 now flashes black
**Issues:** #576

Install/upgrade mess: v3.6.1 install left two AutoSubs entries in Resolve's Scripts menu, neither works; uninstalling/reinstalling v2 didn't clean up. Distinct from the Lua handler bugs — this is an installer/cleanup problem.

**Likely root cause:** Installer doesn't remove the old v2 script entry before installing v3, and v3's script registration isn't displacing it.

---

## K. Adobe Integration

### K1. Premiere Pro 2026 compatibility — CEP extension not loading (UXP migration)
**Issues:** #571

Adobe's 2026 shift to UXP breaks the legacy CEP extension. AutoSubs' `com.autosubs.adobe` CEP folder is no longer recognized. This is a known industry-wide break for all CEP-based extensions.

**Likely root cause:** Adobe host architecture change — requires migrating the extension to a UXP manifest. Large effort; not a bug fix.

---

### K2. After Effects — "Output module is not WAV ... Configure an output-module template named 'WAV'"
**Issues:** #569 (closed)

AE export produced an `.mp4` instead of `.wav` because the AE project's output module isn't set to WAV. Closed — likely addressed with a clearer error message or docs.

---

## L. Feature Requests (no grouping — distinct asks)

| Issue | Title |
| --- | --- |
| #596 | Keyboard shortcuts to move words between lines |
| #585 (closed) | Add FunASR/SenseVoice as local transcription engines |
| #570 | Support VibeVoice |
| #568 | Support batch transcription for multiple audio/video files |

---

## M. Vague / Needs Triage

### M1. "always debut subtitles at 2mn20 ; don't do singings ; doesn't do all voices"
**Issues:** #579

Debian 13.1, standalone mode. Multiple complaints in one report: subs start at 2:20, singing skipped, multi-speaker missed, gaps in transcription. Could be a VAD/silence-threshold misconfiguration, or the 2:20 offset hinting at the same offset-handling bug seen in #592 (cluster B7). Needs triage to split into separate issues.

---

## Summary — Highest-Impact Clusters

| Rank | Cluster | Issue count | One-fix leverage |
| --- | --- | --- | --- |
| 1 | **D — Model download failures** | 17 | Resumable downloads + retry + checksum verification |
| 2 | **B1 — 'AutoSubs Caption' template not found** | 5 | Auto-import template into media pool / fallback logic |
| 3 | **A1 — `exportEnd` nil concatenation (Lua:729)** | 6 | Nil-guard in `autosubs_core.lua:729` |
| 4 | **A5 — Audio export path missing on Windows** | 4 | Verify wide-char export path + post-export existence check |
| 5 | **E1 — Corrupt Parakeet model (protobuf)** | 2 | Fixed by D's checksum verification |

The download cluster (D) alone accounts for ~25% of all reports in the window and would be partially fixed by a single downloader overhaul; E1 is a direct downstream symptom of the same fix.
