# Processing UI Redesign — Plan

Status: phases 0–5 implemented; pending an end-to-end run on real media
Branch: `devin/phase-based-pipeline`

Follow-up to PR #708. That PR parallelised the pipeline (good) but replaced granular
progress steps with 5 high-level phases plus per-phase animations (bad). This plan
reverts the UI direction while keeping the parallelised backend.

---

## 1. Goal

Make processing feel shorter and more comprehensible by showing the user what the
machine is *learning about their specific file*, not by decorating a progress bar.

Guiding principle, in priority order:

1. **Never animate anything that is not driven by real data from the user's file.**
   Fake visualisation is worse than a plain progress bar, because it quietly teaches
   the user that the UI is theatre.
2. **Pacing real content is fine; inventing content is not.** Revealing a real
   segment word-by-word is legitimate. Rendering the string `"word"` eight times is not.
3. **Animation belongs on the content surface (right panel), not the status surface
   (left panel).** The mistake in #708 was animating the status surface, which has no
   real content, so it had to fabricate some.
4. **The animation must never outlive or fall behind the work.** Any reveal queue
   speeds up under backlog and fast-forwards to the end when the stage completes.

## 2. What is wrong today (diagnosis)

- **Triple redundancy.** `processing-steps-list.tsx` renders `ActivePhaseVisualizer`
  for the current step *and* the full step list including that same step. "Analysing
  audio · 76%" appears as a card, a row, and a sub-label. Two identical progress bars.
- **Fake animations.** In `active-phase-visualizer.tsx`:
  - `WaveBars` calls `Math.random()` in render → re-randomises every React render.
    Not reacting to audio, not even to time.
  - `SpeakerBlocks` = 5 hardcoded blocks, 3 hardcoded colours, random widths. Zero
    connection to diarization output.
  - `WordTokens` renders the literal string `"word"` 8× with `animate-bounce`.
  - `FormattingCheck` is a spinner and 4 pulsing bars.
- **Phase names describe our pipeline, not the user's file.** "Analysing audio",
  "Refine", "Finish" are engineering stages.
- **Stale right panel.** During processing the right panel shows a previous,
  unrelated transcript. Actively confusing.
- **Decrypt effect is a perf hazard.** `segment-preview.tsx` runs a `requestAnimationFrame`
  loop calling `setDisplayEntries` every frame, rebuilding every character of every
  decrypting segment. Also unreadable and inaccessible.

## 3. Layout

Constraints: `MIN_TRANSCRIPTION_PANEL_WIDTH = 370`, `MIN_SUBTITLE_PANEL_WIDTH = 280`
(`src/App.tsx`). The app is designed to sit narrow, overlaid on a host editor.

**Rejected:** a horizontal timeline / film-strip of the audio duration. In a 370px
column a 10-minute file gives each subtitle ~4px. Do not revisit.

**Chosen:** the right panel's vertical transcript list *is already* the timeline —
ordered by time, with a timestamp gutter, growing downward. Don't build a timeline
widget; make that list the live artifact that visibly matures.

- **Left (≥370px): vertical stepper.** Granular steps, one active, completed steps
  collapse to a single check line. Status surface. Spinner + check + progress bar only,
  no bespoke animation per step.
- **Right (≥280px): the draft transcript.** Content surface. Every visible change
  happens here.

## 4. Steps in the stepper

Restore granular steps. All i18n keys already exist in
`src/i18n/locales/en/translation.json` under `progressSteps` — **no new translations
needed**:

| Key | Label |
| --- | --- |
| `prepare.export` | Exporting audio from timeline |
| `prepare.normalize` | Normalising audio |
| `prepare.asr` / `.vad` / `.diarize` / `.aligner` | Downloading … model |
| `analyze.vad` | Finding speech regions |
| `analyze.diarize` | Identifying speakers |
| `analyze.loading` | Loading model into memory |
| `transcribe` | Speech to text |
| `refine` | Aligning word timings |
| `finish` | Formatting subtitles |

`ProgressType` (5 variants) stays as-is in Rust. The granularity comes from the
`label` field, which the backend already emits. `ProgressContext` currently collapses
labels into the phase title — that is the bug.

Where possible, replace static labels with what was actually found, e.g. after
diarization: "Found 3 speakers". Data density over motion.

## 5. Draft state in the right panel

Problem: preview segments are unformatted (possibly much longer than the user's
configured line length) and may be untranslated. Must not look like a broken result.

Three layers:

1. **Header state.** Title reads `Draft transcript` + soft pulsing dot while
   processing, becomes `Subtitles` on completion. Subhead: "Improving as each step
   completes."
2. **Unset styling.** Draft segments: `text-muted-foreground`, dimmed timestamp, no
   card border. Finished: full contrast, solid border. Users infer "faint = still
   working" within seconds. Editing and search disabled while draft.
3. **Formatting reveal.** Originally planned as a visible per-card split. That is not
   possible — formatting is a global re-segmentation (§11), so there is no parent→child
   relationship to animate. Instead the final list swaps in under the blur-scroll (§8).
   The draft-vs-final contrast is still communicated, just by the header state and the
   muted→Settle transition rather than by a split.

## 6. Animation vocabulary

Four primitives only. `motion` v12 and `tailwindcss-animate` are already dependencies.

| Primitive | Definition | Used for |
| --- | --- | --- |
| **Rise** | opacity 0→1, translateY 4px→0, 150ms | New segment card arriving |
| **Shimmer** | translucent band travelling across a whole card once, ~400ms, decorative, carries no data | Segment being translated / reformatted |
| **Settle** | muted→full contrast + border fade-in, 200ms | Draft → final |
| **Roll** | `tabular-nums` digit change | Timestamps, speaker count, percentages |

Plus one informational effect, distinct from the above:

**Playhead** (alignment) — a karaoke-style highlight moving through a segment
**word by word**:

- behind the playhead: full contrast, no background (trail of resolved text)
- at the playhead: highlighted pill (`bg-primary/15`, rounded)
- ahead: `text-muted-foreground`

Word-level, not character-level (the model produces no character timings). The
information is in the *unevenness* — lingering on drawn-out words, ripping through
fast ones. A constant-speed playhead communicates nothing.

Optional v2: fill the highlight across the current word as its duration elapses, via
`background-image: linear-gradient(to right, var(--hl) 50%, transparent 50%)` +
`background-size: 200% 100%`, animating `background-position`. Ship the simple
version first.

"Sweep" is a banned term — it was ambiguous between Shimmer and Playhead.

### Feel, not motion design

The quality comes from three constraints, not from choreography:

1. **One easing curve everywhere:** `cubic-bezier(0.32, 0.72, 0, 1)`.
2. **Short durations:** 150–250ms.
3. **Stagger:** 25ms delay per successive item. Cheapest possible way to feel
   expensive; it is one number.

Honour `prefers-reduced-motion` throughout.

## 7. Shared reveal queue

One mechanism, two consumers. Hook: `useRevealQueue`, parameterised by what a "unit"
is (a word to reveal, or a word to highlight).

Requirements:

- **Backlog-aware pacing.** Units land in a queue as backend events arrive. The
  consumer adjusts its rate to keep the queue near-empty: backlog grows → speed up,
  empty → ease off.
- **Fast-forward on completion.** When the stage finishes, jump immediately to the
  end. Never let the animation outlive the work.
- **Instant-mode fallback.** If backlog exceeds ~2 segments, drop the per-word reveal
  and just Rise the whole card in. A preview 8 seconds behind the progress bar is
  worse than no animation at all.

### Alignment timing specifically

Forced alignment runs ~4× faster than realtime, so a realtime playhead would fall
hopelessly behind. **The playhead carries ratios, not absolute time.** Scale all word
durations by a common factor so the playhead traverses a segment in the wall-clock
time that segment actually took to align. Relative proportions — which is where all
the information lives — survive uniform compression intact.

Do not hardcode 4×; derive the per-segment budget from a rolling average of recent
segments' actual alignment wall-clock time (`Refine` progress events already fire
per segment: `completed * 100 / eligible` in `align_segments`).

Two details at compression:

- **Floor per-word dwell at ~40ms** (~2.5 frames). Below that a highlight is
  imperceptible. If budget ÷ word count < floor, degrade that segment to a single
  fast uniform pass.
- **Cap inter-word gaps at ~60ms.** A 1s pause at 4× is still 250ms of nothing
  highlighted, which reads as a stall. Preserve word durations, squash gaps.

## 8. Scroll policy

Rule: **whole-document changes are shown locally; sequential per-item work is followed.**

- **Translation / formatting** (whole-document): do **not** scroll. Stay where the
  user is and run a top-to-bottom staggered Shimmer across only the segments
  *currently in the viewport* (25ms stagger, ~400ms total). Off-screen segments update
  silently. The user extrapolates from their portion.
- **Alignment** (sequential): follow the active segment. Jump *instantly* to the top
  once at the start of the pass (an instant reposition reads as a cut, not as travel,
  and is far less disorienting than a long smooth scroll), then track the active
  segment. Reuse the existing `userScrolledRef` escape hatch in
  `segment-preview.tsx` — the moment the user scrolls manually, stop following.
- **One smooth scroll, at the very end.** When everything is complete and nothing
  else is moving, return to the top. Only moment where a long scroll is welcome.
- Thin progress line along the top edge of the transcript panel fills during each
  pass, giving global context without scrolling.

### Blur-scroll (final flourish)

Fake the fast scroll. Do **not** animate `scrollTop` across a long list — it will
stutter in a Tauri webview, and a janky blur-scroll looks broken rather than magical.

Implementation: blur ~3px + fade to ~40% opacity + slight `scaleY` over ~180ms, set
`scrollTop = 0` instantly at the peak, reverse over ~180ms. Constant cost regardless
of transcript length.

This is now doing real work, not just flourish: because formatting is a global reflow
(§11) the segment list is wholesale replaced, and the blur is what makes that
replacement acceptable instead of jarring. It also covers the scroll-anchoring jitter.

## 9. Rejected ideas (do not revisit)

- **Horizontal timeline / film-strip.** No horizontal space. §3.
- **Words morphing into their timestamps, rolling, then fading back.** Four problems:
  (a) `the` is 3 chars, `00:00:07.24` is 11 — every word ~4× wider, so the segment
  reflows, gains lines, card resizes, everything below jumps; in 280px a 10-word
  segment becomes several lines of stacked timestamps; (b) nobody can parse 10
  eleven-digit numbers at once; (c) it removes the text the playhead rhythm travels
  across, killing the thing that actually communicated timing; (d) alignment shifts
  words by tens of ms, so at `00:00:07` no digit changes — you'd need centiseconds,
  which is both nerdy and imperceptible.
  **Replacement:** one timestamp in one fixed place. As the playhead passes each word,
  the *existing gutter timestamp* updates to that word's time (monospace, zero
  reflow), then settles back to the segment start time when the pass moves on. Same
  instinct, no layout cost — and it makes the gutter meaningful during alignment,
  which answers the objection that segment boundaries barely move.
- **Rolling the segment timestamp to show alignment.** Segment start/end barely change
  during alignment; this would animate noise.
- **Character-scramble "decrypt" for translation.** Per-frame `setState` over the whole
  array, unreadable, inaccessible. Replaced by Shimmer + crossfade.
- **Word-by-word append into one growing paragraph.** Omni-ASR and Parakeet emit no
  punctuation or capitalisation, so concatenation produces an unreadable wall. Use
  separated cards; card boundaries do the job punctuation isn't doing. Keep the
  word-by-word reveal *inside* each card.
- **Reserving the right panel for a batch queue.** Batch is a separate feature;
  designing around a hypothetical gives the wrong abstraction. If added later it is a
  collapsible queue list above the transcript.
- **Per-step animations in the left stepper.** This was the #708 mistake. §1.3.

## 10. Optional persistent artifact

Per-word underline whose width is proportional to that word's duration, animating
from uniform to real proportions during alignment. Compact (a `border-bottom` on
inline text), and unlike the playhead it survives after the pass and is visible in a
screenshot. Nice-to-have.

## 11. Event contract (backend → frontend)

Build this **before** any animation work. Every animation is a consumer of one of
these events, so settling the contract first avoids writing the reducer twice.

### Final contract (implemented)

| Event | Payload | Notes |
| --- | --- | --- |
| `labeled-progress` | `{ progress, type, label }` | `type` = 5 `ProgressType` variants; `label` is already granular (§4). Sufficient for the stepper — no Rust change was needed for degrouping. |
| `segment-updated` | `{ index, segment, stage }`, `stage ∈ transcribe \| translate \| align` | Replaces `new-segment`. One event, one reducer, for every per-segment change. |
| `speakers-identified` | `{ count }` | Distinct non-`?` speaker ids from diarization. Drives the "3 speakers" stepper detail. |
| `transcription-complete` | — | unchanged |

`NewSegmentFn` gained a `SegmentStage` argument rather than adding a second parallel
callback, so there is exactly one path for segment updates. Only 3 invocation sites
existed (`whisper.rs`, `onnx/mod.rs`, the translation pipeline submit closure); the
other ~30 references just pass the fn through and were unaffected by the arity change.

Stage emission points:
- `engines/*` → `Transcribe`
- `TranslationSubmitter::submit` → `Transcribe` (untranslated text, shown immediately
  so the user is not blocked on the translation round-trip)
- `translation_pipeline::run_worker` → `Translate` (same index, replaced text)
- `align_segments` → `Align`, **only in the branch where words were actually
  refined**. The two fallback branches keep existing estimates, so emitting there
  would make the UI animate a change that did not happen.

`align_segments` now enumerates before filtering, so the original segment index
survives to address the right card.

### Formatting is a global reflow, not a per-segment split — provenance abandoned

Verified in `formatting.rs::process_segments`. It does **not** split segments
individually. It flattens *every* segment into one flat token stream, then re-groups
that stream into cues at speaker changes, pauses, sentence ends and duration caps.
So a single cue can draw words from multiple draft segments, and one draft segment can
contribute words to several cues — a many-to-many re-segmentation.

`seg_idx` exists at line 343 but is used only to compute `segment_break` and is then
discarded; `Tok` does not carry it. Emitting provenance would mean adding a `src_seg`
field to `Tok` and threading it through `merge_continuations`,
`split_no_space_tokens`, `split_into_cue_groups`, `wrap_group` and
`segment_from_lines` — a real refactor of a delicate, well-tested pipeline.

**Consequence: the "one draft card splits into three" animation is not achievable and
was based on a wrong model of what formatting does.** A global re-segmentation cannot
be rendered as a tidy split; it genuinely is a mass replacement.

**Therefore: conceal the reflow with the blur-scroll** (§8) rather than trying to
explain it. This was the original instinct and it was correct. `segments-reflowed`
with provenance is dropped from scope; the frontend simply swaps to the final list
under cover of the blur.

**Dropped from scope:** emitting VAD speech regions. That existed to feed the
horizontal strip, which is rejected (§9). "Found N speech regions" means nothing to a
non-technical user, so there is no label worth the plumbing. Speaker count is
different — that one is genuinely meaningful.

## 12. Implementation phases

### Phase 0 — Progress model (done)
- `ProgressContext.tsx`: delete the `PHASES` grouping, `PhaseState`, `subProgress`
  averaging and the "complete all previous phases" inference. Replace with a flat
  ordered list of granular steps keyed on `label`, each with its own progress and
  completion state, derived from the events already being emitted.
- This is pure frontend. It is the foundation for the stepper and must land before
  Phase 1 touches the rendering.

### Phase 0.5 — Emitters (done)
- `NewSegmentFn` extended with `SegmentStage`; `new-segment` renamed to
  `segment-updated`; `speakers-identified` added. See §11.
- Fixed: model downloads previously emitted only the generic
  `progressSteps.prepare.download`, which had no i18n key, so `resolveLabel` fell
  through to a bare percentage — while `prepare.asr` / `.vad` / `.diarize` /
  `.aligner` were defined and never emitted by anything. `ensure_hf_snapshot` and
  `ensure_hf_flat` now take a `label`, and each caller passes its specific one.

### Phase 1 — Structure (done)
- `processing-steps-list.tsx`: remove the duplicated rendering (`ActivePhaseVisualizer`
  + full list). Render a single vertical stepper off the Phase 0 step model.
- Delete `active-phase-visualizer.tsx` (`WaveBars`, `SpeakerBlocks`, `WordTokens`,
  `FormattingCheck`).
- `processing-step-item.tsx`: collapse completed steps to one line.
- Move the live transcript out of the left panel into the right panel; auto-open the
  right panel on run start.
- Right panel: `Draft transcript` header state, muted/unset styling, interaction
  disabled while draft.
- Remove the character-scramble decrypt from `segment-preview.tsx`.

### Phase 2 — Primitives (done)
- Rise / Shimmer / Settle / Roll as shared utilities. One easing token, one stagger
  constant, `prefers-reduced-motion` guard.

### Phase 3 — Reveal queue (done)
- Backlog-aware pacing, fast-forward on completion, instant-mode fallback.
- Wire segment streaming: card Rises in, words reveal at ~25ms, speaker chip.
- **Deviation:** shipped as two hooks (`use-word-reveal.ts`, `use-alignment-playhead.ts`)
  rather than one parameterised `useRevealQueue`. They share the constants in
  `lib/draft-motion.ts` but almost nothing else: the reveal is a fixed-interval
  cursor over text already in hand, the playhead is an rAF pass over a per-segment
  schedule built from real word durations. A shared abstraction would have been a
  parameter bag with two disjoint halves.

### Phase 4 — Alignment playhead (done)
- `use-alignment-playhead.ts`. Word-level highlight with compressed ratio timing,
  dwell floor and gap cap. The per-segment budget is a rolling average of the
  wall-clock interval between `align`-stage events, divided by the current backlog,
  so the pass speeds up under load instead of falling behind; past
  `INSTANT_MODE_BACKLOG` the queue is dropped to its newest entry.
- State is only committed when the highlighted word changes, so the panel
  re-renders per word (≥ `MIN_WORD_DWELL_MS`) rather than per frame. This is the
  one thing that made the old decrypt effect a perf hazard.
- Gutter timestamp tracks the current word, in the same monospace/tabular slot as
  the segment start time, so it rolls without reflow.
- Follow-the-active-segment scrolling: one instant jump to the top at the start of
  the pass, then centre the active row. Bottom-following is suppressed while
  aligning. `ownScrollTopRef` distinguishes our own scrolls from the user's, and
  any manual scroll during the pass ends following permanently.

### Phase 5 — Translation + formatting (done)
- Translation: per-segment Shimmer via `use-stage-shimmer.ts`. **Deviation from the
  plan:** no viewport-local staggered pass. Translation is emitted per segment as
  each round-trip returns, not as one whole-document event, so the stagger already
  exists in the data. Manufacturing a second, synthetic stagger on top would be
  animating our own schedule rather than the work — exactly the failure mode in §1.
  The scroll policy still holds: translation never scrolls.
- Formatting: `use-blur-swap.ts` + `blur-scroll-out` / `blur-scroll-in` in
  `App.css`. The draft panel is held for one 180ms blur-out, the swap to
  `SubtitleViewerPanel` happens at the peak, and the final list blurs back in. The
  new panel mounts already at the top, so the "scroll to top" is free and no
  `scrollTop` is animated across a long list.
- Thin progress hairline along the top edge of the draft panel (§8), fed by the
  active step's real progress.

## 13. Implementation hazards

- **Scroll anchoring.** When formatting splits segments above the viewport, content
  height changes and the view jumps. Needs `overflow-anchor: auto` or manual
  `scrollTop` compensation — otherwise the "don't move the user" policy breaks exactly
  when it matters most.
- **Card identity.** The Rust `Segment` (`crates/transcription-engine/src/types.rs`)
  has **no `id` field** — only the frontend `Subtitle` does. During the draft phase,
  keys must therefore come from the `new-segment` / `segment-updated` index. That is
  safe because indices are stable until formatting, and formatting replaces the list
  wholesale under the blur-scroll anyway.
- **Backlog on fast hardware.** A small model on a good GPU can outrun any reveal.
  Instant-mode fallback is mandatory, not optional.
