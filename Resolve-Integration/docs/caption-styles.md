# Caption styles

AutoSubs can put two different kinds of caption on a Resolve timeline, and most
of the integration's complexity comes from supporting both.

| | AutoSubs Caption (bundled Fusion macro) | Resolve Text+ / Fusion title |
|---|---|---|
| Word by word highlight | Yes | No |
| In and out animation | Yes | No |
| Where the look is edited | Fusion, saved back as an AutoSubs preset | Resolve, as part of the template |
| Per speaker colour | Yes, merged into the preset | Yes, on the Text+ style slots |
| `BatchApplyStyle` restyles existing clips | Whole style | Speaker colour only |
| Comes from | `caption-bin.drb`, imported on demand | The project's own media pool |

## One place owns the difference

Everything that differs between the two lives in
[`modules/caption_style.lua`](../AutoSubs-App/src-tauri/resources/modules/caption_style.lua):
which kind a comp holds, how text and word timings go in, how preset values are
read and written, and how a speaker's colour is applied. Placing subtitles
(`AddSubtitles`), restyling existing clips (`BatchApplyStyle`) and rendering a
thumbnail (`GeneratePreview`) each call into it rather than carrying their own
copy of the branch, which is how the three had previously drifted apart.

On the app side the matching pieces are
[`src/lib/caption-style.ts`](../AutoSubs-App/src/lib/caption-style.ts) (which
style is selected, and what to send for it) and
[`src/components/captions/`](../AutoSubs-App/src/components/captions) (the
picker, the gallery and the Fusion editing round trip).

## Presets

A preset is a flat map of the macro's `InputKeys` values plus a name, stored by
the app in `autosubs-presets.json`. The app never interprets those values: it
reads them from the macro and writes them back through the macro's own
`GetInputValues` / `SetInputValues` helpers.

`SetInputValues` only applies keys the installed macro declares in `InputKeys`,
so a preset made for a different version of the macro degrades instead of
erroring. A preset from an older macro sets the keys it has and leaves the rest
at their defaults; one from a newer macro has its extra keys ignored. That is
the whole compatibility story, and it is why there is no preset versioning.

## Editing a style

Editing happens in Fusion, where the macro's inspector lives and the animation
actually plays. AutoSubs holds one caption clip open on a temporary track for
the whole session and keeps only the library concerns (name, description,
thumbnail). Three endpoints, one per user action:

| Endpoint | Does |
|---|---|
| `OpenPresetEdit` | Adds the temp track, appends the clip, seeds it, opens Fusion |
| `SavePresetEdit` | Reads the values, renders the thumbnail, closes the session |
| `CancelPresetEdit` | Closes the session, changes nothing |

The temporary track is named `AutoSubs Preview` and is found by that name at
teardown, never by a remembered track index, which would go stale as soon as the
user added or removed a track mid session. Teardown also refuses to touch a
timeline that is not the one the clip was added to, and a track stranded by a
crash or a hot reload is swept when the next session opens.

`SavePresetEdit` closes the session first, then renders the thumbnail from a
fresh throwaway clip. The thumbnail is *not* a Fusion render: on Resolve 21.1
`Composition:Render` from a script state crashes Resolve and the isolated-helper
routes (`RunScript`, `comp:Execute`, `fusion:Execute`) never run while a request
is being handled. `extract_frame` instead parks the playhead on the clip, hides
the other video tracks, and calls `Project:ExportCurrentFrameAsStill`, Resolve's
own viewer still export, then restores the tracks and the playhead.

## Fusion Macro (`autosubs-macro.setting`)

The macro is a Fusion template stored as a `.setting` file. It renders animated captions with per-word highlighting using Text+, StyledTextFollower, KeyStretcherMod, BezierSpline, and XYPath tools.

Lua functions embedded in the macro's `CustomData` field handle preset get/set (`GetInputValues`, `SetInputValues`), animation logic (`SetAnimations`), word-timing highlight updates (`UpdateHighlight`), and text wrap (`UpdateWrap`).

### Text wrap (Resolve 20+)

The Style tab exposes **Wrap to Text Box** and **Box Width**. These map onto native Text+ Layout inputs (`LayoutType`, `Wrap`, `LayoutWidth`) because the macro hides the Layout tab. Wrap is off by default so existing captions keep a single line. Requires DaVinci Resolve 20 or later; on older versions the controls are harmless no-ops.

### Recommended Development Extension

For editing `.setting` files, the **[Fusion Setting Highlighter](https://github.com/tmoroney/fusion-setting-highlighter)** extension is highly recommended. It provides syntax highlighting for Fusion `.setting` files with full embedded Lua support inside script blocks.

**Installation:**

macOS / Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/tmoroney/fusion-setting-highlighter/master/scripts/install.sh | sh
```

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/tmoroney/fusion-setting-highlighter/master/scripts/install.ps1 | iex
```

### Editing the Macro

You need a Fusion text clip on the timeline to open in the Fusion page. The easiest starting point is the "AutoSubs Caption" clip in the **AutoSubs** bin in your media pool:

1. If the bin isn't in your media pool, drag `AutoSubs-App/src-tauri/resources/caption-bin.drb` into the media pool to import it.
2. Drag the **AutoSubs Caption** clip from the bin onto the timeline.
3. Double-click the clip to open it in the Fusion page.
4. Delete the existing macro node.
5. Drag `autosubs-macro.setting` into the Fusion page — it appears as a node and is ready to edit.

<details>
<summary><strong>Animation Architecture</strong></summary>

All animation logic lives in `CustomData` inside `autosubs-macro.setting` as Lua long-bracket strings (`[[ ... ]]`) that are executed at runtime via `loadstring`. There are three parts:

**`Animations` table** — named strings, one `ApplyX` and one `ResetX` per animation. Each function receives a single `ctx` table:

```lua
ctx = {
    follower      -- StyledTextFollower tool
    animStretcher -- AnimationKeyframeStretcher tool
    animSpline    -- BezierSpline connected to the stretcher
    animInEnd     -- frame where the in-animation ends (0–100 range)
    animOutStart  -- frame where the out-animation starts (0–100 range)
    mode          -- 0 = in only, 1 = out only, 2 = both
    level         -- 0 = line, 1 = word
}
```

**`AnimationRegistry`** — an ordered list of descriptors. `SetAnimations` loops over this; it never hardcodes individual animation names.

```lua
{ controlKey = "PopInEnabled", usesFade = true, applyKey = "ApplyPopIn", resetKey = "ResetPopIn" }
```

- `controlKey` — the `UserControl` checkbox that enables this animation
- `usesFade` — if `true`, fade is automatically applied as a base layer when this animation is enabled (even if `FadeEnabled` is off)
- `applyKey` / `resetKey` — keys into the `Animations` table

**`SetAnimations`** — the orchestrator. On each call it: resets all registered animations, checks which are enabled and whether fade is needed, applies fade once (or flat opacity), then applies each enabled animation. It does not need to change when new animations are added.

</details>

> Full detail on the `ctx` table, the `AnimationRegistry`/`SetAnimations` pattern, the per-animation recipes (Fade, PopIn, SlideUp), and the order/timing spline is in [`docs/animation-system.md`](docs/animation-system.md).

### Adding a New Animation

Every animation needs its own enable/disable toggle, so adding one always involves both the logic and the Fusion node graph:

1. Add `ApplyX` and `ResetX` strings to the `Animations` table in `CustomData`.
2. Add a descriptor entry to `AnimationRegistry`.
3. Add the control key to `InputKeys` in `CustomData` (so presets capture its value).
4. Add a `UserControl` checkbox entry in the `UserControls = ordered()` block (around line 986), following the same pattern as `SlideUpEnabled`:

```lua
BounceEnabled = {
    LINKS_Name = "Bounce",
    LINKID_DataType = "Number",
    INPID_InputControl = "CheckboxControl",
    INP_Integer = true,
    INP_Default = 0,
    INP_Passive = true,
    INP_External = false,
    CBC_TriState = false,
},
```

Steps 1–2 are pure text edits in `autosubs-macro.setting`. Steps 3–4 require opening the macro in the Fusion page.
