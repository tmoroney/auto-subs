# AutoSubs Animation System

App-specific documentation for how the AutoSubs caption macro implements animations. This is
**not** general Fusion knowledge — for reusable technique (keyframe handles, easing,
BezierSpline format, macro control publishing) see the `davinci-resolve-fusion` skill's
`references/animation.md` and `references/macro-authoring.md`. This file documents how
AutoSubs wires those techniques together inside `autosubs-macro.setting`.

## Architecture

All animation logic lives in the macro's `CustomData` as Lua long-bracket strings (`[[ ... ]]`)
executed at runtime via `loadstring`. There are three parts.

### `Animations` table

Named strings, one `ApplyX` and one `ResetX` per animation. Each function receives a single
`ctx` table:

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

### `AnimationRegistry`

An ordered list of descriptors. `SetAnimations` loops over this and never hardcodes
individual animation names:

```lua
{ controlKey = "PopInEnabled", usesFade = true, applyKey = "ApplyPopIn", resetKey = "ResetPopIn" }
```

- `controlKey` — the `UserControl` checkbox that enables this animation.
- `usesFade` — if `true`, fade is applied as a base layer when this animation is enabled,
  even if `FadeEnabled` is off.
- `applyKey` / `resetKey` — keys into the `Animations` table.

### `SetAnimations` (orchestrator)

On each call it resets all registered animations, checks which are enabled and whether fade
is needed, applies fade once (or flat opacity), then applies each enabled animation. It does
not change when new animations are added — that is the point of the registry pattern.

## Coordinate space and timing

All animation keyframes operate in a **normalized 0–100 range**. A `KeyStretcherMod` maps
this onto actual timeline frames:

- `StretchStart` = the actual frame where the animation-in finishes.
- `StretchEnd` = the actual frame where the animation-out begins.

Standard timing pattern:

```lua
local frames = math.max(animLength * 30, 5)  -- animLength is a 0–1 slider
local animInEnd   = frames                    -- e.g. 15 at 0.5
local animOutStart = 100 - frames             -- e.g. 85 at 0.5

-- Typical 4-keyframe shape:
-- [0]            = start value (animated state)
-- [animInEnd]    = normal value (animation complete)
-- [animOutStart] = normal value (hold)
-- [100]          = end value (animated state)
```

## Animation recipes

### Fade (Opacity)

```lua
follower.Size = nil
follower:SetInput("Size", 0.08)
follower.Opacity1 = stretcher1.Result
follower.Opacity2 = stretcher1.Result
follower.Opacity3 = stretcher1.Result

spline1:SetKeyFrames({
    [0]            = { 0 },
    [animInEnd]    = { 1, LH = { -animInEnd, 0 } },  -- gradual ease-in
    [animOutStart] = { 1 },
    [100]          = { 0 },
}, true)

stretcher1:SetInput("StretchStart", animInEnd)
stretcher1:SetInput("StretchEnd", animOutStart)
```

### PopIn (Size)

```lua
follower.Opacity1 = nil
follower:SetInput("Opacity1", 1)
follower.Size = stretcher1.Result

spline1:SetKeyFrames({
    [0]            = { 0 },
    [popInEnd]     = { 0.08 },   -- 0.08 is the default text size
    [animOutStart] = { 0.08 },
    [100]          = { 0 },
}, true)
```

### SlideUp (Y Offset + Fade)

Combines a vertical slide with an opacity fade, using XYPath modifiers on the follower's
Offset properties.

```lua
follower.Size = nil
follower:SetInput("Size", 0.08)
follower.Opacity1 = stretcher1.Result
follower.Opacity2 = stretcher1.Result
follower.Opacity3 = stretcher1.Result

spline1:SetKeyFrames({
    [0]            = { 0 },
    [slideInEnd]   = { 1, LH = { -slideInEnd, 0 } },
    [slideOutStart]= { 1 },
    [100]          = { 0 },
}, true)

local yKeyframes = {
    [0]            = { -0.6 },                          -- start below
    [slideInEnd]   = { 0, LH = { -slideInEnd, 0 } },    -- ease into position
    [slideOutStart]= { 0 },
    [100]          = { -0.6 },                          -- slide back down
}

for i = 1, 3 do
    local offsetProp = "Offset" .. i
    follower:AddModifier(offsetProp, "XYPath")
    local xyPath = follower[offsetProp]:GetConnectedOutput():GetTool()
    if xyPath then
        xyPath:AddModifier("Y", "BezierSpline")
        local ySpline = xyPath.Y:GetConnectedOutput():GetTool()
        if ySpline then
            ySpline:DeleteKeyFrames(0)
            ySpline:SetKeyFrames(yKeyframes)
        end
    end
end
```

Cleaning up XYPath modifiers when switching away from SlideUp:

```lua
for i = 1, 3 do
    local offsetProp = "Offset" .. i
    local offsetInput = follower[offsetProp]
    if offsetInput then
        local output = offsetInput:GetConnectedOutput()
        if output then
            local xyPath = output:GetTool()
            if xyPath and xyPath.Name:match("XYPath") then
                follower[offsetProp] = nil  -- disconnect removes the modifier
            end
        end
    end
end
```

## Order / timing spline (spline2)

The second spline controls character reveal order via the follower's `Order` input through
`stretcher2`, using step keyframes:

```lua
spline2:SetKeyFrames({
    [animOutStart - 1] = { 6, Flags = { StepIn = true } },  -- 6 = high delay value
    [animOutStart]     = { 0, Flags = { StepIn = true } },  -- 0 = no delay (all visible)
}, true)
stretcher2:SetInput("StretchEnd", animOutStart)
```

## Adding a new animation

Every animation needs its own enable/disable toggle, so adding one touches both the logic
and the node graph:

1. Add `ApplyX` and `ResetX` strings to the `Animations` table in `CustomData`.
2. Add a descriptor entry to `AnimationRegistry`.
3. Add the control key to `InputKeys` in `CustomData` (so presets capture its value).
4. Add a `UserControl` checkbox in the `UserControls = ordered()` block (around line 986),
   following the `SlideUpEnabled` pattern:

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

Steps 1–2 are pure text edits in `autosubs-macro.setting`. Steps 3–4 require opening the
macro in the Fusion page.

## AutoSubs-specific defaults and pitfalls

- **`0.08` is the default Size** — when disconnecting Size from animation, reset to `0.08`.
- **Opacity default is `1`** — when disconnecting Opacity, reset to `1`.
- **Shading elements are numbered 1–8** — `Opacity1/Opacity2/Opacity3` map to shading
  elements; animate every element that is Enabled.
- **Always reset previous animation state** before applying a new one (the orchestrator
  does this by resetting all registered animations first).
- **XYPath modifiers persist** — SlideUp adds them to `Offset1/2/3`; other animations must
  remove them or they interfere.
