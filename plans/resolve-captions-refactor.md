# Resolve caption workflow: simplify, consolidate, explain

> **Status:** proposal, nothing implemented yet.
>
> **Goal:** one vocabulary for captions across UI, TypeScript and Lua; one piece of state for "what style am I sending"; a style editor that does not require a round trip through Fusion; and a screen that tells the user what the two kinds of caption actually are.

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

### 1.4 Editing a style means leaving the app

`CreatePresetFlow` is a four phase state machine: `launching` → `editing` → `capturing` → `naming`. Phase `editing` means: AutoSubs has added a video track to your timeline, appended a five second caption clip, opened the Fusion page, and is now waiting while you alt-tab to Resolve, find the inspector, change a value, and come back to press "Capture settings". Then it tears the track down and renders a thumbnail offscreen by doing the whole append / render / delete dance again (`autosubs_core.lua:2326-2380`).

That is the correct escape hatch for deep customisation. It is the wrong default for "make the text bigger" or "change the highlight to yellow". Especially since the preset itself is nothing but a flat map of 33 known keys (`autosubs-macro.setting:18-52`), and the built in presets in `built-in-presets.ts` are literally hand written key/value tables.

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
9. Export `AUTOSUBS_CAPTION_TEMPLATE` from `lib/caption-style.ts` and delete the duplicate constant in the component. Long term the name should come from the Lua server via `GetVersion` (which already returns `captionTemplateVersion`) rather than being hard coded on both sides.
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
    │   Animated, word by word.   │ │   A title from your project.│
    │   Styled here.              │ │   Styled in Resolve.        │
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
19. Adobe: the section is currently hidden entirely for Premiere and After Effects. Replace with one explicit line saying caption styles are DaVinci Resolve only, so it does not look like a bug.

### Phase 3: style presets without leaving the app

The macro's `InputKeys` list is fixed and known (`autosubs-macro.setting:18-52`), and presets are already flat maps of those keys. That makes an in-app form straightforward.

20. Add `lib/caption-preset-schema.ts`: a declarative description of the 33 keys, grouped and typed:
    - **Text**: `Font`, `Style`, `TextSize`, `TextPosition`, `WrapEnabled`, `WrapBoxWidth`
    - **Colour**: `FillEnabled` + `FillColor{Red,Green,Blue}`, `OutlineEnabled` + `OutlineThickness` + `OutlineColor{...}`, `ShadowEnabled` + `ShadowColor{...}`
    - **Highlight**: `HighlightEnabled`, `HighlightStyle`, `HighlightColor{...}`, `HighlightExtendHorizontal`, `HighlightExtendVertical`, `HighlightRound`
    - **Animation**: `FadeEnabled`, `PopInEnabled`, `SlideUpEnabled`, `AnimationLength`, `AnimationLevel`, `AnimationMode`

    Each entry carries a control type (font picker, slider with range, colour picker over the RGB triple, toggle, select), a label key and a default. The schema drives the form, the JSON validation in `parseImportedPreset`, and eventually the macro side key filtering.
21. Add `preset-editor.tsx`: a form over that schema, opened by Edit or New in the gallery. No Resolve round trip, so it works with Resolve closed, which also makes it usable in the standalone app.
22. Preview while editing: debounce (about 400 ms) and call the existing `GeneratePreview` with the in-progress settings when Resolve is connected. If it is not connected, render an approximation in the browser with the same font, size, colours and highlight, clearly labelled as an approximation. The existing offscreen render path already handles track add / append / render / cleanup (`autosubs_core.lua:2092-2210`); it just needs to be safe to call repeatedly, so add a server side guard that refuses to start a second preview render while one is in flight.
23. Keep the Fusion round trip as an explicit advanced action in the editor: "Fine-tune in Fusion". It reuses `StartPresetEdit` / `CapturePresetSettings` / `CancelPresetEdit` unchanged, seeded from the current form values, and merges the captured values back into the form. The existing four phase flow becomes a secondary path rather than the only path.
24. Colour handling: the macro stores three separate 0 to 1 floats per colour while the app uses hex everywhere else (`Speaker.color`, `hex_to_rgb` in Lua). Put the conversion in one place in `caption-preset-schema.ts` and use it for both the editor and `preset_with_speaker`'s counterpart on the TS side.

### Phase 4: Lua consolidation and docs

25. Add `modules/caption_style.lua`:

    ```lua
    -- kind_of(templateName) -> "autosubs" | "textplus"
    -- apply(comp, opts)  opts = { text, words, frameRate, settings, speaker }
    -- read(tool)         -> settings table (wraps GetInputValues)
    -- write(comp, tool, settings)  (wraps SetInputValues, single error policy)
    ```

    Then `apply_subtitle_text`, `BatchApplyStyle` and `GeneratePreview` each call `caption_style.apply(comp, opts)` and stop knowing about `WordTiming`, `CharacterLevelStyling1`, `StyledText` or `loadstring`. One error policy instead of three.
26. Move `is_animated_caption` / `resolve_template_name` into that module, and make the template identity explicit rather than prefix matched: `GetTemplates` already knows which media pool item is the bundled one, so it can return `{ label, value, kind }` and the frontend can stop matching on the string `"AutoSubs Caption"` too.
27. `SetInputValues` should ignore unknown keys (currently `autosubs-macro.setting:63-70` calls `tool:SetInput(key, value)` unguarded for every key in `InputKeys`), so a preset saved by a newer build degrades instead of erroring. This is a macro change, which means `caption-bin.drb` must be regenerated by a maintainer before release. It is also a prerequisite for the community preset store in `plans/preset-gallery.md`, so do it once, here.
28. Docs split of `Resolve-Integration/README.md`:
    - `README.md`: architecture, bridge, protocol, dev workflow, platform notes
    - `docs/caption-styles.md`: the two kinds, the preset format, the `InputKeys` reference table, how the app applies each kind
    - `docs/animation-system.md`: unchanged
    - `docs/maintainer-template-release.md`: the `caption-bin.drb` regeneration ritual and the two Resolve quirks it works around
29. Add a short "Caption styles" section to `AGENTS.md` pointing at `lib/caption-style.ts` and `modules/caption_style.lua` as the two places that own this, so the next change does not re-fork it.

## 4. Order, effort and risk

| Phase | Effort | Risk | Depends on |
|---|---|---|---|
| 0 naming, dead code, dispatcher | 1 session | Low, mechanical. Touches all 8 locale files | - |
| 1 single state, split panel | 1 session | Medium. Settings migration needs care | 0 |
| 2 self-explanatory UI | 1 session | Low. Mostly new copy and layout | 1 |
| 3 in-app preset editor | 1 to 2 sessions | Medium. New surface, needs Resolve for live preview testing | 1, ideally 2 |
| 4 Lua consolidation and docs | 1 session | Medium. Item 27 requires regenerating `caption-bin.drb` | Ships with or after 3 |

Phases 0 and 1 are worth doing even if nothing else happens: they remove the class of bug where the selection and the mode disagree.

**Things to be careful about**

- Settings migration: users have `captionMode` and `selectedTemplate` on disk. Ship the mapping and keep it for two releases. Do not silently reset a user to the default preset.
- `caption-bin.drb` regeneration is maintainer only and must not be in a contributor PR (per `Resolve-Integration/README.md`). Only item 27 needs it.
- i18n budget: descriptions ≤ 60 characters and titles ≤ 25 characters in every locale, not just English, and no dashes. The new explanatory copy in phase 2 is the risky part. Run the checker in `AGENTS.md` before calling it done.
- There is no test runner in `AutoSubs-App` today. The pure modules introduced here (`lib/caption-style.ts`, `lib/caption-preset-schema.ts`, the settings migration) are the first things in this codebase worth unit testing, so adding vitest alongside phase 1 would be cheap and would pay for itself on the migration alone.
- CI cannot run Resolve, so keep all Resolve-dependent logic behind the thin API wrappers and keep decision logic in the pure modules.

## 5. What the user ends up with

- One screen, three sections: Track, Speakers, Caption style.
- Two clearly labelled caption sources, each with a one line description, a real thumbnail gallery for AutoSubs styles, and a "What is the difference?" explainer that answers the question once.
- Style editing that happens in AutoSubs, with Fusion available as an explicit advanced step rather than a mandatory detour.
- No hidden mode that changes itself, no grey placeholder gallery on first run, and no template list that goes stale until restart.

## 6. Related plans

- `plans/preset-gallery.md`: the community preset store. Phase 3's schema and phase 4's item 27 are prerequisites for it, and its P0 and P1 items are already implemented.
