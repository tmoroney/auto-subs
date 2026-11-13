# AutoSubs × Resolve Integration — Restructured Plan

**Goal:** keep AutoSubs' animated, speaker-styled Text+ captions in Resolve, while shrinking how much the app depends on Resolve's scripting API and on a long-running Lua loop. When the API is unavailable, fall back to a documented file format, not a dead product.

**Status (2026-10-24):** the file-format spike is done (results in §6). Its main finding sets the shape of this plan:

> **No file format both carries animated Fusion titles and lands in the current timeline.** Animated captions on the open timeline require the scripting API. The open question is no longer *whether* to keep a Lua component, but *how small and how short-lived* it can be.

---

## 1. What the bridge does today (the parity bar)

Handlers in [`autosubs_core.lua`](../AutoSubs-App/src-tauri/resources/modules/autosubs_core.lua), served by a resident loop that the user starts once per Resolve session:

| Area | Handlers | Mechanism |
|---|---|---|
| Timeline info | `GetTimelineInfo`, `GetTemplates`, `GetVersion` | Live API reads: project, current timeline, track names, media-pool templates |
| Audio | `ExportAudio`, `GetExportProgress`, `CancelExport` | Resolve render job, which **renders the mix** (track FX, gain, Voice Isolation) |
| Write-back | `AddSubtitles`, `CheckTrackConflicts` | `AppendToTimeline` of caption clips, per-speaker styling, conflict modes, transcript IDs via `SetData` |
| Styling | `BatchApplyStyle`, `GeneratePreview`, `OpenPresetEdit` / `SavePresetEdit` / `CancelPresetEdit` | Fusion comp edits, `ExportCurrentFrameAsStill` thumbnails, preset round trip through the Fusion inspector |
| Navigation | `JumpToTime` | `SetCurrentTimecode` |
| Plumbing | `Ping`, `ReloadServer`, `Exit` | Loop control |

The cost of the resident loop, from [AGENTS.md](../AGENTS.md):
- Ownership tokens, takeover, `Stop`, and request `Claim`s.
- The `Probe`/`ProbeAck` liveness check.
- The teardown crash we hit when queued prefs writes landed during shutdown.
- The 3.10.0 Fusion-executor regression.

All of that exists only because the loop *stays running*.

---

## 2. Two architectures for Resolve

### Option A: keep the resident bridge, but make it smaller

The current model, with the handler surface trimmed to automation sugar. Rust owns the data semantics, and Lua only calls the API.

- **Pros:** same UX as today (start once per session, then everything is driven from the app). Live features keep working: track picker refresh, playhead sync, previews, the preset round trip.
- **Cons:** keeps all the loop machinery and its failure modes listed in §1. It's exposed to every sandbox change Blackmagic makes to the Scripts-menu state.

### Option B: no server. Read the project database, and write through a one-shot script

No resident loop. The app reads Resolve's state directly from disk. Resolve is touched only when the user runs a single, short-lived **"AutoSubs: Run"** script from Workspace → Scripts.

- **Input, read from `Project.db`:** the local project library is SQLite. It's at `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Resolve Project Library/Resolve Projects/Users/<user>/Projects/<project>/Project.db` on macOS (verified on this machine).
  - It holds the same `Sm2*` structures we decoded from `.drt`: `Sm2Timeline`, `Sm2Sequence`, `Sm2TiTrack` (incl. `UserDefinedName`), `Sm2TiItem` (`Start`, `Duration`, `In`, `MediaRef`, `PrettyType`, `CompositionTable`), `Sm2MpMedia` and `Sm2TiCompositionTable`.
  - That covers the track picker, clip-to-media mapping for ffmpeg audio extraction, and the conflict check, with no export step and no API.
- **Audio:** ffmpeg reads the source media directly, per clip, with timestamps offset to timeline time. Same as the FCPXML path in §4.
- **Output:**
  1. The user clicks **Add to timeline** in the app. The app writes a job to the existing mailbox (`request.lua`) and tells the user to run *AutoSubs: Run*.
  2. That script loads the job, does the one action (`AppendToTimeline` plus caption styling, reusing [`caption_style.lua`](../AutoSubs-App/src-tauri/resources/modules/caption_style.lua)), acks/responds through `SetPrefs`/`SavePrefs` as today, then **exits**.
  - One menu item can run whatever the app has queued: add subtitles, apply a style batch, save a preset edit, or render audio when the user wants the Resolve mix.
- **What disappears:** the resident loop, ownership/takeover/`Stop`, `Claim`, the liveness probe and the shutdown-race crash class. Nothing AutoSubs-owned runs in Resolve while the user isn't acting.
- **What gets worse:**
  - **One menu click per write**, instead of once per session.
  - **No live round trips:** `JumpToTime`, on-demand `GeneratePreview` thumbnails, and the interactive `OpenPresetEdit` → `SavePresetEdit` flow all become "queue, then run the script" (preset editing becomes two runs).
  - **Undocumented database:** reading `Project.db` is version-fragile. It needs a schema guard and a fallback.

**Fallback if `Project.db` reading fails** (schema change, network/Postgres library, stale data): the same one-shot script can *also* do the reads, i.e. timeline info and an audio render, and return them through `SetPrefs`. So B degrades into "a one-shot script for everything", which still has no resident loop.

### Recommendation

Pursue **B**, gated on the `Project.db` spikes below, and keep **A** as the working path until B proves out. Most of B is a *subtraction* from today's code: the handlers and `caption_style.lua` stay, and the loop, ownership and claim code goes.

### Spikes for B (need a real Resolve install)

1. **Freshness:** after an edit, without a manual save, how soon does `Project.db` reflect it? Does Live Save matter? This decides whether the track picker can trust the database.
2. **Which project and timeline are current:** can the database (or `Project.db`'s siblings, `User.db` / `ProjectMetadataCache/Metadata.db`) tell us the open project and current timeline? If not, the one-shot script reports it.
3. **Safe reading:** copy-then-read while Resolve has the file open. Check the journal mode and locking. Never write.
4. **Media and timing decode:** `Sm2TiItem.Start`/`Duration`/`In` + `MediaRef` → `Sm2MpMedia` path. Check frame rates, start timecode, and retimed clips (`MediaTimemapBA`).
5. **Schema stability:** compare Project.db from Resolve 20.x and 21.x (the `.drt` schema moved 15 → 17 between 20.0.1 and 21.1).
6. **Keyboard shortcut:** can a Workspace → Scripts entry be bound to a key in Resolve's keyboard customisation? That would turn the per-write menu click into one keypress.
7. **Hand-off UX:** how the app tells the user "run AutoSubs: Run now", and confirms the job landed via the existing ack.

---

## 3. When the API isn't available at all

These are fallbacks, not the main path:

- **Static captions on a subtitle track, using SRT with speaker colours.** Each cue is wrapped in `<font color>` in its speaker's colour, one cue per subtitle. Verified in free Resolve: it imports as per-subtitle styling and survives track-style changes. **No word timing**: the one-cue-per-word highlight works, but it multiplies the subtitle count and lags long timelines.
- **Not planned: generated `.drt` for animated captions.** `.drt` does carry animated Fusion titles intact (§6), but it always imports as a *new* timeline, so the user has to copy/paste or nest-and-decompose. Generating it also depends on undocumented binary fields. Keep the findings; build only if API loss becomes real.

---

## 4. Other editors (unchanged by the spike)

The same input/output core serves editors without a bespoke bridge:

- **Input:** FCPXML / FCP 7 XML timeline export → track picker + clip-to-media mapping → ffmpeg per-clip audio extraction, with timestamps in timeline time. Per-clip transcription also stops captions from spanning cuts.
- **Output:** SRT (with speaker colours where the host honours `<font>`). FCPXML `caption` elements for Final Cut Pro.
- **Premiere:** Final Cut Pro XML export in; SRT/caption import out. The Adobe CEP bridge stays as a convenience layer.

Known losses on the ffmpeg path: Resolve's mix (track FX, gain, Voice Isolation); retimed/speed-ramped clips (warn; `atempo` for constant speed only); the timeline being a snapshot (offer "reload").

---

## 5. Rollout

1. **P0: SRT with speaker colours.** A real export option, plus docs for the Resolve flow (File → Import → Subtitle). Done as part of the spike.
2. **P1: `Project.db` spikes (§2).** Read-only prototype in Rust: list timelines and tracks, map clips to media, decode positions. Go/no-go for Option B.
3. **P2: One-shot script.** Split the handlers out of the resident loop into an *AutoSubs: Run* entry script that processes the queued job and exits. It reuses the mailbox, ack and response path and `caption_style.lua`. Ship it alongside the resident bridge first.
4. **P3: Database-driven input + ffmpeg audio.** Track picker and audio from `Project.db`. The one-shot script provides the reads when the database can't be read.
5. **P4: Retire the resident loop** once B covers the parity table in §1. Delete the ownership, takeover, claim and probe code.
6. **P5: FCPXML input for other editors (§4).** Independent of P1–P4.

---

## 6. Appendix: spike results (free Resolve 21.1, 2026-10-24)

### Subtitle tracks

| Test | Result |
|---|---|
| Speaker concept on subtitle tracks | **None.** Per-subtitle styling exists. |
| SRT `<font color>` on part of a cue | Survives import. One cue per word gives a correct word highlight, but N cues per subtitle lags the timeline. |
| SRT `<font color>` on a whole cue (speaker colour) | **Works**, and survives track-style changes. |
| Timed styling inside one subtitle | Not possible; style is static for the cue's duration. |
| TTML with per-word timed `<span>`s | Breaks: only the first word of each subtitle shows. |
| TTML per-`<p>` speaker styles | Colour ignored; region (bottom placement) and font family applied. |
| WebVTT karaoke timestamps + `<v Speaker>` | Imports identically to plain SRT. |

### Getting animated Fusion titles onto a timeline by file

| Format | Animated captions survive | Lands in current timeline |
|---|---|---|
| FCPXML 1.14 | No: export errors ("not associated with valid or supported source media") and writes `<gap>`s | No |
| FCP 7 XML | No: clipitem named after the template, backed by a `Slug` file, no Fusion data | No |
| AAF | No | Only via API: `Timeline:ImportIntoTimeline` (AAF only) |
| `.drt` | **Yes**, unchanged in a fresh project | No: always a new timeline (`MediaPool:ImportTimelineFromFile`) |

### `.drt` internals (for reference)

`Timeline 1.drt` (DbAppVer 21.1.0.0017, DbPrjVer 17) is a zip of XML: `project.xml`, `SeqContainer/<uuid>.xml`, `MediaPool/Master/MpFolder.xml`.

- Each caption is an `Sm2TiVideoClip` (`PrettyType` "Fusion Title"), with `<Start>`/`<Duration>` in frames (86400 = 01:00:00:00 at 24 fps).
- The clip is self-contained: the media pool holds only the timeline item, not the caption template.
- The comp is in `CompositionTable/Sm2TiCompositionTable/CompositionBA`. It's hex of `[u32 BE size][zlib]`, which unpacks as:
  - a map with UTF-16BE keys (`count`, `0_name`, `0_mediaIdList`, `0_data`);
  - in `0_data`, the Fusion comp header text `Composition { …, Compressed = true, }`, then `\0`, `[u32 LE size]`, and zlib of the tools table;
  - the tools table, which is plain `.setting` syntax: the AutoSubs `MacroOperator` with baked keyframes and `CustomData.AutoSubs` tags.
- The clip's `FieldsBlob` is protobuf-like and repeats the start frame as a varint (e.g. `a801 80a305` = 86400).
- If ever generated: substitute into a reference `.drt` (clone the clip, fresh UUIDs, set Start/Duration + FieldsBlob varint, re-encode the comp) and bake the word keyframes the macro's `ExecuteOnChange` builds today.

### Related API calls worth remembering

- `Timeline:ImportIntoTimeline(path, opts)`: AAF into the current timeline (useless for Fusion titles, since AAF drops them).
- `TimelineItem:ImportFusionComp(path)`: load a `.comp` onto an existing item. The one-shot script could apply AutoSubs-generated comps with the keyframes already baked, instead of relying on the macro's `ExecuteOnChange`.
