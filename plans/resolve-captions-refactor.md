# Resolve caption workflow: simplify, consolidate, explain

> **Status:** implemented, except item 15 (pre-rendered thumbnails for the
> built-in presets), which needs a maintainer with Resolve open to render four
> PNGs. Item 28 turned out to be already done: `SetInputValues` has filtered by
> `InputKeys` since the preset-gallery work, so `caption-bin.drb` did not need
> regenerating. The sections below are kept as the record of why each change
> was made.
>
> **Goal:** one vocabulary for captions across UI, TypeScript and Lua; one piece of state for "what style am I sending"; a Fusion round trip cheap enough to stop being a detour; and a screen that tells the user what the two kinds of caption actually are.
>
> **Test every item against this:** it must remove more than it adds. An item that only adds a mechanism, however tidy, is cut. Anything phrased as "and then we could also" is a sign the item has stopped being a simplification.

## 1. What is wrong today

### 1.1 One user choice, three pieces of state

The user makes a single decision ("send my subtitles as AutoSubs animated captions, or as a Text+ title from my project"). The app stores it three times:

| Field | Where | Notes |
|---|---|---|
| `captionMode: "regular" \| "animated"` | `settings-store.ts:75` | The real discriminator |
| `selectedTemplate: { value, label }` | `settings-store.ts:71` | Only meaningful when mode is `regular` |
| `presetId: string` | `settings-store.ts:74` | Only meaningful when mode is `animated` |

Every selection site has to write two of them together and never forget:

- `output-panel.tsx:504-507` (pick template, also set mode `regular`)
- `output-panel.tsx:513-516` (pick preset, also set mode `animated`)
- `output-panel.tsx:529-532` (import preset, also set mode `animated`)
- `output-panel.tsx:342` (save preset, also set mode `animated`)

and the truth is re-derived at send time at `output-panel.tsx:405-409` and again at `:419-421`. Meanwhile `template-selection.tsx:93-98` silently flips `captionMode` back to `regular` when the animated template is not found in the media pool, so the user's selection changes behind their back with no message.

This is the root cause of most of the "janky" feeling: the selection model is implicit, so the UI has to keep guessing what is selected (`output-panel.tsx:283-287` builds the label with a branch, `template-selection.tsx:157-159` and `:186` compute "is this row selected" with a branch).

### 1.2 The two caption kinds are never explained

Today the only hints are two group headings, "Resolve Templates" and "AutoSubs Styles" (`i18n output.style.groups`), plus unused strings `addToTimeline.mode.regular` / `.animated` ("Regular Template" / "Animated Template"). Neither says what you get. The real differences:

| | AutoSubs Caption (Fusion macro) | Resolve Text+ / Fusion title |
|---|---|---|
| Word by word highlight | Yes | No |
| In and out animation (fade, pop, slide) | Yes | No |
| Styled from inside AutoSubs | Yes, via presets | No, style it in Resolve |
| Per speaker colour | Yes (Fill / Outline / Shadow) | Yes (Text+ Fill / Outline / Shadow / Background) |
| "Update timeline styles" restyles existing clips | Yes, full style | Speaker colour only (`autosubs_core.lua:1929`) |
| Thumbnail in the picker | Yes, rendered from Resolve | Never |
| Comes from | Bundled `caption-bin.drb`, auto imported | Whatever is already in your media pool |
| Works when Resolve is closed | Preset is stored locally, so listing works | Needs Resolve for the list |

A user cannot infer any of that from the current screen.

### 1.3 `output-panel.tsx` is the whole feature in one file

868 lines holding: sheet open/close animation state, lazy template loading with a hard coded 15 second timeout, conflict polling, preset create / edit / duplicate / delete / import / export glue, preview rendering, batch restyle, the primary send action, and the export popover.

- `OutputSheetProps` has ~30 fields (`output-panel.tsx:645-687`), and about 20 of them exist only to be forwarded to `CaptionTemplateSelectionContent`.
- `CaptionTemplateSelectionContentProps` has ~25 fields (`template-selection.tsx:34-60`).
- `CaptionTemplateSelectionContent` is rendered twice inside `OutputSheet`: once for the preset editor overlay with dummy values (`mode="animated"`, `onModeChange={() => {}}`, `output-panel.tsx:724-748`) and once for the normal list (`output-panel.tsx:836-855`).
- `mode` / `onModeChange` are vestigial. The component no longer renders a mode switch (the comment at `template-selection.tsx:134-135` says as much), it only uses `mode` to decide which row looks selected and to force the flip described above.

All of this data already lives in contexts and stores (`usePresets`, `useSettingsStore`, `useResolve`). The drilling is pure overhead.

### 1.4 Editing a style is buried in ceremony

`CreatePresetFlow` is a four phase state machine: `launching` → `editing` → `capturing` → `naming`. Phase `editing` means: AutoSubs has added a video track to your timeline, appended a five second caption clip, opened the Fusion page, and is now waiting while you alt-tab to Resolve, find the inspector, change a value, and come back to press "Capture settings". Then it tears the track down and renders a thumbnail offscreen by doing the whole append / render / delete dance again (`autosubs_core.lua:2326-2380`).

Editing in Fusion is right: the macro's inspector is a good UI and the viewer plays the animation, which no still image can. The problem is everything wrapped around it. Four phases, a "Capture settings" button that exists only because the session is thrown away, a full teardown and rebuild to render one thumbnail, and a naming step bolted on at the end. The round trip is not the detour; the ceremony is.

### 1.5 Built in presets ship with no thumbnails

`PresetThumbnail` renders `$APPLOCALDATA/caption-previews/<presetId>.png`, which only exists after a preset has been saved or after the user finds "Generate preview" in a per card overflow menu. On first run all four built ins are grey placeholder icons, and the one action that fixes it quietly adds a track to the user's timeline and renders a frame. This is the single most visible "unfinished" detail in the picker.

### 1.6 The animated vs regular fork is copy pasted three times in Lua

The same branch appears in:

- `apply_subtitle_text` (`autosubs_core.lua:1610-1660`)
- `BatchApplyStyle` (`autosubs_core.lua:1915-1931`)
- `GeneratePreview` (`autosubs_core.lua:2139-2196`)

Each one does: find `AutoSubs` tool vs `Template` / `TextPlus`, set `WordTiming`, set `Text` vs `StyledText`, sync `CharacterLevelStyling1`, `loadstring(tool:GetData("SetInputValues"))`, or fall back to `set_speaker_styling`. They have already drifted: a missing `SetInputValues` helper is a hard error in `BatchApplyStyle`, a per clip failure in `apply_subtitle_text`, and a `print` in `GeneratePreview`.

Related fragility in the same area:

- `is_animated_caption` (`autosubs_core.lua:315`) matches on a name prefix because the shipped clip is versioned (`AutoSubs Caption 2026-..`), and `resolve_template_name` maps the display name back. Two functions and a string prefix carry the type of the template.
- `GeneratePreview(speaker, templateName, presetSettings, exportDir, language)` is called positionally from the dispatcher with `data.exportPath` (`autosubs_core.lua:2604-2606`) while `CapturePresetSettings` sends `exportDir` and the TS wrapper sends `exportPath` (`resolve-api.ts:246-259`). Positional dispatch over a JSON body is an accident waiting to happen.
- The dispatcher is a 100 line `if data.func == ... elseif` chain (`autosubs_core.lua:2555-2640`), even though `Resolve-Integration/README.md` documents the intended shape as `handlers["Name"] = function(data)`.

### 1.7 Template list goes stale, and is stored twice

- `refreshTemplates` returns the cache forever once `templatesLoaded` is true (`ResolveContext.tsx:69-84`). Add a Text+ template in Resolve and it never appears until the app restarts. Switching project resets Lua's `defaultTemplateImportAttempted` but not the frontend cache.
- `getTimelineInfo()` always returns `templates: []` (`resolve-api.ts:130-139`) and `ResolveContext` then merges the separate array into `timelineInfo.templates` at three places. Nothing reads it. `TimelineInfo.templates` is dead weight in the type.
- The 15 second load timeout lives inside the panel component (`output-panel.tsx:213-224`), so it cannot be reused or tested.

### 1.8 Dead state and split vocabulary

- `Settings.animationType`, `Settings.highlightType`, `Settings.highlightColor` (`types.ts:172-174`, `settings-store.ts:78-80`) have no readers anywhere. Leftovers from the pre-preset design.
- i18n for one panel is split across two namespaces, `output.*` and `addToTimeline.*`, both used in the same component. `addToTimeline.mode.*` and `addToTimeline.steps.*` are orphans from the deleted dialog.
- The folder is `components/dialogs/caption-style/` but nothing in it is a dialog any more.
- `ANIMATED_CAPTION_TEMPLATE = "AutoSubs Caption"` is defined in TypeScript (`template-selection.tsx:17`) and again as `ANIMATED_CAPTION_DISPLAY_NAME` in Lua (`autosubs_core.lua:174`).
- Names in play for the same concept: "animated", "AutoSubs Caption", "macro", "preset", "AutoSubs Style", "caption template", "Fusion macro caption preset". Names for the other: "regular", "template", "Text+", "Resolve Template", "Default Template".

### 1.9 The caption template artifact lives in three places

One shipped thing, three locations: the editable macro at `Resolve-Integration/autosubs-macro.setting`, the shipped binary at `AutoSubs-App/src-tauri/resources/caption-bin.drb`, the version stamp at `AutoSubs-App/src-tauri/resources/modules/caption_template_version.lua`, and the script that syncs them at `Resolve-Integration/scripts/AutoSubs - Update Caption Template.lua`. The 307 line `Resolve-Integration/README.md` mixes architecture, protocol, macro authoring and the maintainer release ritual.

## 2. Target model

**One name for each kind, used in UI copy, TypeScript and Lua.**

- `autosubs` captions: the bundled Fusion macro. User facing name: **AutoSubs Captions**, subtitle "Animated, word by word. Styled here in AutoSubs."
- `resolve` titles: any Text+ or Fusion title in the media pool. User facing name: **Resolve Title Template**, subtitle "Use a title from your project. Styled in Resolve."

**One piece of state.**

```ts
// types.ts
export type CaptionStyle =
  | { source: "autosubs"; presetId: string }
  | { source: "resolve"; templateName: string };
```

`Settings.captionStyle` replaces `captionMode` + `selectedTemplate` + `presetId`. One setter, `setCaptionStyle(style)`. The send path becomes:

```ts
const { templateName, presetSettings } = resolveCaptionStyle(captionStyle, getPreset);
```

a single pure function in `lib/caption-style.ts`, unit testable without Resolve.

**One apply path in Lua.** A new `modules/caption_style.lua` owns everything that differs between the two kinds, and the three call sites each shrink to one call.

## 3. Work plan

Five phases. Phases 0 and 1 are refactors with no visible change and should land first; they are what make phases 2 and 3 small.

### Phase 0: naming, dead code, dispatcher

No behaviour change. Reviewable in one pass.

1. Delete `animationType`, `highlightType`, `highlightColor` from `types.ts` and `settings-store.ts`. Persisted copies are ignored by zustand's merge, so no migration is needed.
2. Delete `TimelineInfo.templates` and the three `{ ...info, templates }` merges in `ResolveContext.tsx`. Remove `templates: []` from `getTimelineInfo()` in `resolve-api.ts`.
3. Move `components/dialogs/caption-style/` to `components/captions/`, and `components/subtitles/output-panel.tsx` to `components/captions/output-panel.tsx`. Rename files to the new vocabulary:
   - `animated-preset-picker.tsx` → `preset-gallery.tsx`
   - `create-preset-flow.tsx` → `fusion-preset-editor.tsx` (it is the Fusion round trip, and phase 3 adds a sibling)
   - `template-selection.tsx` → `caption-style-section.tsx`
4. Collapse i18n into a single `captions.*` namespace across all 8 locales, dropping the orphans (`addToTimeline.steps.*`, `addToTimeline.mode.*`). Budget applies: titles ≤ 25 chars, descriptions ≤ 60 chars, in every locale, no em or en dashes. Use the checker script in `AGENTS.md`.
5. Lua: replace the `if data.func == ...` chain with `handlers[name] = function(data) ... end` and a single lookup, matching what `Resolve-Integration/README.md` already documents. Every handler takes the decoded `data` table, so `exportPath` vs `exportDir` style mismatches become impossible.
6. Lua: give `GeneratePreview`, `AddSubtitles`, `BatchApplyStyle` a single table argument instead of positional parameters. Update `resolve-api.ts` wrappers to match key for key.

### Phase 1: one selection state, no prop drilling

7. Add `CaptionStyle` to `types.ts` and `captionStyle` to `Settings`. Write a migration in `hydrateSettingsStore()`: if the persisted blob has `captionMode`, map `animated` → `{ source: "autosubs", presetId }` and `regular` → `{ source: "resolve", templateName: selectedTemplate.value }`, then drop the three old keys. Keep the migration for at least two releases.
8. Add `lib/caption-style.ts` with the pure helpers: `resolveCaptionStyle()`, `describeCaptionStyle()` (the summary bar label), `isStyleAvailable(style, templates, presets)`. No React, no Tauri, so these are the natural home for tests.
9. Export `AUTOSUBS_CAPTION_TEMPLATE` from `lib/caption-style.ts` and delete the duplicate constant in the component. Item 27 removes the need for the frontend to match on the name at all.
10. Split `output-panel.tsx` into:
    - `output-panel.tsx`: summary bar, primary action, export button. Reads `captionStyle` and `describeCaptionStyle` only.
    - `output-sheet.tsx`: the three sections (Track, Speakers, Caption style) and the scroll container.
    - `caption-style-section.tsx`: source cards plus the two lists.
    - `use-caption-presets.ts`: a hook wrapping `usePresets` with the create / duplicate / import / preview-generate glue currently inlined in `output-panel.tsx:296-370`. The gallery consumes it directly instead of receiving 10 callbacks.
    - `use-resolve-templates.ts`: lazy load, the 15 second timeout, error message selection, and the cache keyed by project (see item 12).

    Target: no component in this tree takes more than about 8 props.
11. Delete `mode` / `onModeChange` and the force-flip effect. When the selected style is unavailable, show it as unavailable in place with a one line reason and a button to pick something else, rather than silently reassigning.

### Phase 2: make the screen self-explanatory

12. Template freshness: key the template cache by `projectName` + `timelineId` in `ResolveContext`, invalidate on change, and add a small refresh button in the caption style section header. Users who add a Text+ template mid session currently have to restart the app.
13. Caption style section layout:

    ```
    Caption style
    ┌─────────────────────────────┐ ┌─────────────────────────────┐
    │ ● AutoSubs Captions         │ │ ○ Resolve Title Template    │
    │   Word by word animation,   │ │   A Text+ title already in  │
    │   saved as reusable presets.│ │   your project.             │
    └─────────────────────────────┘ └─────────────────────────────┘
    [ What is the difference? ]

    <preset gallery, or template list, depending on the selected card>
    ```

    Two radio cards make the choice explicit and mutually exclusive, and the list underneath is the detail rather than a second, competing decision. This replaces the current two headed list where the grouping is the only signal.
14. "What is the difference?" opens a popover containing the comparison table from section 1.2, in plain language, written for video editors rather than for people who know what a Fusion macro is.
15. Ship pre-rendered thumbnails for the built in presets: `src/assets/preset-previews/<presetId>.png`, 640 px wide, rendered once by a maintainer and committed. `PresetThumbnail` resolves bundled → captured → placeholder. First run then shows a real gallery instead of four grey squares.
16. Rename the overflow action "Generate preview" to something that admits what it does, for example "Re-render preview in Resolve", and disable it with a tooltip when Resolve is not connected (currently it is only wired when `selectedIntegration === "davinci"`, which reads as an unexplained missing item).
17. Show the AutoSubs card as unavailable, with the reason, when the macro template cannot be found or imported, instead of removing the whole section (`template-selection.tsx:178`).
18. "Update timeline styles": move it next to the caption style section rather than next to Send, since it acts on the style, and give it a one line explanation ("Restyle caption clips already on the timeline from this transcript"). Disable with a reason when the selected style is a Resolve template and no speaker colours are set, since in that case it can only change speaker colours (`autosubs_core.lua:1926-1931`).
19. **Gate the caption style section on the chosen integration, not on the live connection.** `selectedIntegration` is just the persisted `preferredEditorIntegration` setting (`IntegrationContext.tsx:14-15`), switched from the integration picker (`integration-status.tsx:154`). Use that:
    - Selected integration is DaVinci Resolve: the section is always shown, connected or not. Presets are stored locally, so browsing, selecting, importing and exporting all work offline. Editing a preset's look needs Resolve, because Fusion is the editor (phase 3), and the UI says so in place rather than hiding the button (item 23).
    - Selected integration is Premiere or After Effects: the section is not rendered at all. Those users never see a control they cannot use, so there is nothing to explain. Today's behaviour already hides it; the difference is that it now keys off the preference rather than off whether a timeline happens to be reachable.
    - `audioInputMode` is orthogonal and must not gate this. Someone who transcribed a local file but works in Resolve still sends captions to a timeline, so a file input user on the Resolve integration keeps the full section.

    Note the default is `davinci` for every new install (`settings-store.ts:22`), so the section is visible by default and its empty states are doing the teaching.

### Phase 3: make Fusion the caption editor, and make the round trip cheap

> **This reverses the earlier draft of this phase.** It previously proposed an in-app form mirroring the macro's controls. That was wrong for two reasons, and both are worth writing down so nobody re-proposes it.
>
> **One.** The macro's inspector is already a carefully built UI, and mirroring it means every new control has to be added twice, in Fusion and in React, forever. That tax is paid on every future feature, which is exactly the kind of drag that makes a codebase unpleasant to work in.
>
> **Two, and decisive:** the thing being edited is an *animation*. Fusion's viewer shows it playing; the app can only ever show one rendered frame. An in-app editor would be permanently worse at the one thing this macro exists to do, so it cannot be the primary surface no matter how well it is built.
>
> The conclusion is not "keep the clunky round trip". It is: Fusion is the editor, and the round trip around it should be almost invisible.

20. **Fusion is the only place a caption style is edited.** The app owns the preset *library* (browse, select, name, duplicate, import, export, apply per speaker); Fusion owns the *look*. That split matches what each is good at and removes the duplicated UI entirely. If a handful of controls ever deserve to be in the app, the macro names them then; do not build the mechanism now.
21. **Collapse the edit flow to two clicks.** With one session held open for the whole edit (item 24), the current `launching / editing / capturing / naming` ceremony is unnecessary:
    - **Edit** on a preset card: the clip is placed and the Fusion page opens on it, seeded with that preset's values. The user edits with the macro's own inspector and watches the animation play in the viewer, which is the whole point.
    - **Save** in AutoSubs: read the tool's values, render the thumbnail, close the session. **Cancel**: close the session, change nothing.

    No "Capture settings" step, because the session is live and the app can read it whenever it likes. Naming is a field on the same small panel as Save, not a third phase. That panel is the whole editing UI in AutoSubs: preset name, Save, Cancel, and a line saying the caption is open in Fusion.
22. **Unknown keys are skipped. That is the entire compatibility story.** A preset made for an older macro sets the keys it has and leaves the rest at their defaults; a preset from a newer macro has its extra keys ignored. Both fall out of item 28 for free, in a few lines of Lua at the one place that writes values. No schema, no version comparison, no migration system, no `minTemplateVersion`. `caption_template_version` already exists if something ever genuinely needs to branch, and nothing does yet.
23. **Say what needs Resolve, in place.** Editing needs a connection; everything else in the library does not. Three rules cover it:
    - Not connected: browse, select, import, export and duplicate all work. Edit is disabled with "Open DaVinci Resolve to edit this style."
    - A preset with no thumbnail shows the placeholder, plus "Re-render preview in Resolve" when connected.
    - A failed render says why, with "Try again".

    Never a dead control with no explanation, and never a quiet failure. And never a CSS or canvas lookalike of the caption: the look comes from Text+ outline geometry, the highlight box and per word timing, so an approximation would be wrong in exactly the ways users notice and would be read as a bug in the captions. Real frames or a placeholder, nothing in between.
24. **Hold one caption clip open for the whole edit; tear it down only on Save or Cancel.** This is what makes item 21 feel instant. Today `GeneratePreview` adds a video track, appends a clip, renders and deletes both on every call (`autosubs_core.lua:2109-2205`), and `extract_frame` waits two seconds for the graph to go idle before it even sets the render range (`autosubs_core.lua:2005-2018`). Reuse the `presetEditSession` machinery `StartPresetEdit` already has (`autosubs_core.lua:2252-2324`) and keep the clip on its track for the duration, so saving is read-plus-render instead of append-render-delete.

    **A long-lived session turns three latent bugs into likely ones**, all in `teardown_preset_edit_session` (`autosubs_core.lua:2235-2250`), and all part of this item:
    - It deletes by the stored `trackIndex`, captured as `GetTrackCount("video")` at creation. Add or remove a video track during the edit and that index points at one of the user's tracks. Resolve the temp track by identity at teardown, never by a remembered number.
    - It calls `project:GetCurrentTimeline()` at teardown, which may not be the timeline the clip went onto. Bind the session to a timeline id and delete nothing if they do not match.
    - The session is in-memory only, so a crash, a server restart or a hot reload strands the track. Sweep for a leftover preview track when a session starts.

    **One thing to verify early.** `CapturePresetSettings` notes that a comp open in the Fusion page keeps the viewer busy, so `extract_frame`'s idle wait never settles (`autosubs_core.lua:2352-2356`). Since the user is now editing in Fusion by design, Save must switch back to the edit page before rendering the thumbnail. If that alone is not enough, render the thumbnail from a throwaway clip the way `GeneratePreview` does today: acceptable, because it happens once per save rather than once per tweak.
25. **Three endpoints, one per user action.** Today `StartPresetEdit` bundles "create the clip" with "open Fusion", and `CapturePresetSettings` bundles "read the values" with "tear it all down and render a thumbnail", which is why the current flow needs a phase for each hidden step. Replace with `OpenPresetEdit`, `SavePresetEdit` (read, render, close) and `CancelPresetEdit` (close). The gallery's re-render action keeps using the existing `GeneratePreview`, which already does exactly that job without a session.

### Phase 4: Lua consolidation and docs

26. Add `modules/caption_style.lua`:

    ```lua
    -- kind_of(templateName) -> "autosubs" | "textplus"
    -- apply(comp, opts)  opts = { text, words, frameRate, settings, speaker }
    -- read(tool)         -> settings table (wraps GetInputValues)
    -- write(comp, tool, settings)  (wraps SetInputValues, single error policy)
    ```

    Then `apply_subtitle_text`, `BatchApplyStyle` and `GeneratePreview` each call `caption_style.apply(comp, opts)` and stop knowing about `WordTiming`, `CharacterLevelStyling1`, `StyledText` or `loadstring`. One error policy instead of three.
27. Move `is_animated_caption` / `resolve_template_name` into that module, and make the template identity explicit rather than prefix matched: `GetTemplates` already knows which media pool item is the bundled one, so it can return `{ label, value, kind }` and the frontend can stop matching on the string `"AutoSubs Caption"` too.
28. `SetInputValues` should ignore unknown keys (currently `autosubs-macro.setting:63-70` calls `tool:SetInput(key, value)` unguarded for every key in `InputKeys`), so a preset saved by a newer build degrades instead of erroring. This is a macro change, which means `caption-bin.drb` must be regenerated by a maintainer before release. It is also a prerequisite for the community preset store in `plans/preset-gallery.md`, so do it once, here.
29. Docs split of `Resolve-Integration/README.md`:
    - `README.md`: architecture, bridge, protocol, dev workflow, platform notes
    - `docs/caption-styles.md`: the two kinds, the preset format, the `InputKeys` reference table, how the app applies each kind
    - `docs/animation-system.md`: unchanged
    - `docs/maintainer-template-release.md`: the `caption-bin.drb` regeneration ritual and the two Resolve quirks it works around
30. Add a short "Caption styles" section to `AGENTS.md` pointing at `lib/caption-style.ts` and `modules/caption_style.lua` as the two places that own this, so the next change does not re-fork it.

## 4. Order, effort and risk

| Phase | Effort | Risk | Depends on |
|---|---|---|---|
| 0 naming, dead code, dispatcher | 1 session | Low, mechanical. Touches all 8 locale files | - |
| 1 single state, split panel | 1 session | Medium. Settings migration needs care | 0 |
| 2 self-explanatory UI | 1 session | Low. Mostly new copy and layout | 1 |
| 3 Fusion as the editor | Under 1 session | Low to medium. Mostly deletion; needs a live Resolve to verify the session behaviour in item 24 | 1, ideally 2 |
| 4 Lua consolidation and docs | 1 session | Medium. Item 28 requires regenerating `caption-bin.drb` | Ships with or after 3 |

Phases 0 and 1 are worth doing even if nothing else happens: they remove the class of bug where the selection and the mode disagree.

**Things to be careful about**

- Settings migration: users have `captionMode` and `selectedTemplate` on disk. Ship the mapping and keep it for two releases. Do not silently reset a user to the default preset.
- `caption-bin.drb` regeneration is maintainer only and must not be in a contributor PR (per `Resolve-Integration/README.md`). Only item 28 needs it.
- i18n budget: descriptions ≤ 60 characters and titles ≤ 25 characters in every locale, not just English, and no dashes. The new explanatory copy in phase 2 is the risky part. Run the checker in `AGENTS.md` before calling it done.
- There is no test runner in `AutoSubs-App` today. `lib/caption-style.ts` and the settings migration are the only pure logic this plan adds, and the migration is the one piece where a silent mistake costs a user their settings. Worth a handful of tests if a runner is added; not worth blocking on.
- CI cannot run Resolve, so keep all Resolve-dependent logic behind the thin API wrappers and keep decision logic in the pure modules.
- A caption clip now sits on the user's timeline for as long as the edit is open, so orphan cleanup stops being a nicety. Item 24's three fixes (resolve the track by identity, bind the session to a timeline id, sweep leftovers on server start) are part of that item, not follow ups.
- Anything that needs Resolve must fail loudly and specifically, never by going quiet. Phase 3 makes this a rule for editing and thumbnails (item 23), and phase 2 applies the same rule to the caption style cards (items 16, 17, 18, 19). One shared vocabulary for "this needs DaVinci Resolve open" across all of them, so the user learns it once.

## 5. What the user ends up with

- One screen, three sections: Track, Speakers, Caption style.
- Two clearly labelled caption sources, each with a one line description, a real thumbnail gallery for AutoSubs styles, and a "What is the difference?" explainer that answers the question once.
- Style editing that stays in Fusion, where the animation actually plays, wrapped in a two click round trip: Edit opens the caption there, Save brings the values back. No capture ceremony, no duplicated inspector, and one place to add a control when the macro grows.
- No hidden mode that changes itself, no grey placeholder gallery on first run, and no template list that goes stale until restart.

## 6. Related plans

- `plans/preset-gallery.md`: the community preset store. Phase 4's item 28 is a prerequisite for it, and its P0 and P1 items are already implemented.
