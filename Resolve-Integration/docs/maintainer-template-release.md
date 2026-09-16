# Maintainer: releasing a new caption template

> **For maintainers only.** Do not include `caption-bin.drb` in a contributor
> PR: the binary is opaque in code review, and the app has to be codesigned
> before shipping.

When the macro changes, the caption bin must be regenerated before release. This is handled by the maintainer, not contributors, since the binary is opaque in code review and the app must be codesigned before shipping.

Run `npm run setup-resolve` from `AutoSubs-App/`, then in Resolve open **Workspace → Scripts → AutoSubs - Update Caption Template** with any project and timeline open. The script imports (or finds) the AutoSubs bin, appends the caption template to a temporary video track, replaces its `AutoSubs` tool with the current `autosubs-macro.setting`, and waits. Drag that clip from the temporary track into the new **AutoSubs** bin and the script versions it, exports `caption-bin.drb`, updates `modules/caption_template_version.lua`, and cleans up.

The clip name (**"AutoSubs Caption"**, optionally suffixed with a date) comes from `caption_style.DISPLAY_NAME` in `modules/caption_style.lua`, so let the script do the naming.

#### Two Resolve/Fusion quirks the script has to work around

Both fail *silently*, and both previously caused the script to export a bin still containing the **previous** macro:

1. **`mediaPool:AppendToTimeline()` does not report a blocked append.** If anything already occupies the target slot on the target track, nothing is added but the call still returns a truthy `timelineItem`. Every method on that handle returns *no value at all* (not even `nil`), so `tostring(item:GetName())` raises "value expected" rather than printing `nil`. The script therefore appends onto a freshly added track and validates the handle with `GetFusionCompCount() == 1` before continuing.

2. **`comp:Paste()` only works on the Fusion-API comp, never the Resolve-API one.** A comp from `timelineItem:GetFusionCompByIndex()` reliably round-trips `SetData`/`GetData` and reports its tools, but `Paste()` on it returns `false` and adds nothing. Only `fu:GetCurrentComp()` can paste — and "current" is whatever comp was last active, which appending does not change. A long session also accumulates hundreds of open comps (`#fu:GetCompList()` can reach the high hundreds), so the current comp is effectively arbitrary.

   The script bridges the two: it stamps a one-off token onto the Resolve-API comp, calls `LoadFusionCompByName()` plus `OpenPage("fusion")` to make that comp active, and refuses to paste unless `fu:GetCurrentComp()` reports the same token back. After pasting it stamps the template version and re-reads it through the Resolve API to confirm the edit landed on the timeline clip.

Because the clip you drag is a manual choice, the script also re-checks that version stamp on the dragged clip before overwriting `caption-bin.drb`. If the stamp is missing it aborts rather than shipping a stale template.
