# Fusion Animation Techniques

General, reusable techniques for animating Fusion tools and macros from Lua/Python or by
editing `.setting` files. Nothing here is app-specific. For the underlying API, see
`fusion-manual/00-index.md` (e.g. `classes/bezierspline.md`) and, for the Resolve API,
`resolve-api.txt`.

## TextPlus + StyledTextFollower: control precedence

When a tool uses a `TextPlus` with a `StyledTextFollower` modifier:

- **Font and Style** are TextPlus-only inputs. The Follower does not have them, so they
  must point at the template TextPlus tool via `SourceOp = "Template"`.
- **Follower styling inputs (shading elements, size, opacity, transforms) only take effect
  when they are animated** (have keyframes or a modifier connected). If a Follower input
  has no animation, the corresponding TextPlus value is used instead.
- Therefore you **cannot expose Follower controls as static overrides** and expect them to
  work. To make a Follower control behave as a user-adjustable style setting, either:
  1. give the Follower input keyframes/a modifier, or
  2. create UserControls that set both the Template and Follower values, or
  3. sync values with script logic (`INPS_ExecuteOnChange` / `BTNCS_Execute`).
- When splitting "Text" and "Style" onto separate ControlPages, remember that moving a
  control does nothing unless the underlying Follower input is animated.

## Critical: SetKeyFrames handle coordinates are RELATIVE

**The #1 gotcha.** In `SetKeyFrames()` (Lua), the `LH` (left handle) and `RH` (right
handle) values are **offsets relative to the keyframe's own position**, not absolute
coordinates. In `.setting` files, handle positions are stored as **absolute** coordinates.

Goal: a keyframe at frame 15 with value 0, left handle pulled back to frame 0.

In a `.setting` file (absolute):

```
[15] = { 0, LH = { 0, 0 }, RH = { 38.39, 0 } }
```

In `SetKeyFrames()` Lua (relative offsets):

```lua
[slideInEnd] = { 0, LH = { -slideInEnd, 0 } }
-- slideInEnd = 15 -> absolute (15 + (-15), 0 + 0) = (0, 0)  ✓
```

What goes wrong if you pass absolute values to `SetKeyFrames`:

```lua
[15]  = { 0, LH = { 0, 0 } }    -- WRONG: becomes absolute (15, 0), handle stuck on keyframe
[100] = { 0, LH = { 85, 0 } }   -- WRONG: becomes absolute (185, 0), handle flies off the chart
```

Conversion formula:

```
LH_relative_x = LH_absolute_x - keyframe_time
LH_relative_y = LH_absolute_y - keyframe_value
RH_relative_x = RH_absolute_x - keyframe_time
RH_relative_y = RH_absolute_y - keyframe_value
```

Handle rules:

- `LH` x offset must be **≤ 0** (left of, or on, the keyframe).
- `RH` x offset must be **≥ 0** (right of, or on, the keyframe).
- If you specify only `LH`, `RH` uses Resolve's default (about 1/3 of the distance to the
  next keyframe).
- If a keyframe needs no custom easing, omit `LH`/`RH` entirely for default linear handles.

## BezierSpline keyframe format

In `SetKeyFrames()` (Lua API):

```lua
spline:SetKeyFrames({
    [frame] = { value },                                    -- simple keyframe
    [frame] = { value, LH = { dx, dy }, RH = { dx, dy } },  -- handles (RELATIVE)
    [frame] = { value, Flags = { Linear = true } },         -- linear interpolation
    [frame] = { value, Flags = { StepIn = true } },         -- step / hold
    [frame] = { value, LH = { dx, dy } },                   -- only left handle
}, true)  -- second arg `true` replaces ALL existing keyframes
```

In `.setting` files (serialized, absolute handles):

```
KeyFrames = {
    [0]   = { 0, RH = { 5, 0.333 }, Flags = { Linear = true } },
    [15]  = { 1, LH = { 0, 1 }, RH = { 34.6, 1 } },
    [85]  = { 1, LH = { 61.67, 1 }, RH = { 90, 0.667 } },
    [100] = { 0, LH = { 95, 0.333 }, Flags = { Linear = true } }
}
```

Default handle positions (when none specified) sit at **1/3 of the distance** to the
adjacent keyframe:

- RH of keyframe `a` going to `b`: absolute `{ a + (b-a)/3, ... }`
- LH of keyframe `b` coming from `a`: absolute `{ b - (b-a)/3, ... }`

## Easing patterns

**Gradual deceleration (ease-out).** Pull the left handle of the destination keyframe back
to the source keyframe's time. The animation covers most of the distance quickly, then
settles in.

```lua
local animEnd = 15
spline:SetKeyFrames({
    [0]       = { startValue },
    [animEnd] = { endValue, LH = { -animEnd, 0 } },  -- handle at frame 0
}, true)
```

**Linear (no easing).** Omit handles, or use the Linear flag:

```lua
[frame] = { value, Flags = { Linear = true } }
```

**Step / hold.** Value jumps instantly at the keyframe:

```lua
[frame] = { value, Flags = { StepIn = true } }
```

## Connecting and disconnecting animated properties

```lua
-- Connect a property to a modifier/stretcher output
tool.Opacity1 = stretcher.Result
tool:AddModifier("Size", "BezierSpline")        -- add a new modifier

-- Disconnect and set a static value
tool.Opacity1 = nil
tool:SetInput("Opacity1", 1)

-- Get the tool connected to an input
local connected = tool.Opacity1:GetConnectedOutput():GetTool()

-- Build a modifier chain (KeyStretcher -> BezierSpline)
tool:AddModifier("Size", "KeyStretcherMod")
local stretcher = tool.Size:GetConnectedOutput():GetTool()
stretcher:AddModifier("Keyframes", "BezierSpline")
local spline = stretcher.Keyframes:GetConnectedOutput():GetTool()
spline:SetKeyFrames({ --[[ ... ]] }, true)
```

### Adding/removing XYPath modifiers for position animation

```lua
-- Add an XYPath on an Offset input, then a BezierSpline on its Y
tool:AddModifier("Offset1", "XYPath")
local xyPath = tool.Offset1:GetConnectedOutput():GetTool()
xyPath:AddModifier("Y", "BezierSpline")
local ySpline = xyPath.Y:GetConnectedOutput():GetTool()
ySpline:DeleteKeyFrames(0)        -- remove the default keyframe first
ySpline:SetKeyFrames(yKeyframes)

-- Remove an XYPath later: disconnecting the input removes the modifier
local out = tool.Offset1:GetConnectedOutput()
if out and out:GetTool().Name:match("XYPath") then
    tool.Offset1 = nil
end
```

## Common animation pitfalls

1. **Handles are relative in `SetKeyFrames`, absolute in `.setting` files** — see top.
2. **Always reset previous animation state** — when switching animations, disconnect old
   modifiers and restore static values before connecting new ones.
3. **Modifiers persist.** An XYPath added for a slide stays until removed; other animations
   must clean it up or it interferes.
4. **`SetKeyFrames(..., true)` replaces all keyframes.** Without the `true`, new keyframes
   merge into the existing ones.
5. **`DeleteKeyFrames(0)` before `SetKeyFrames` on a fresh BezierSpline** — a newly added
   modifier (e.g. on `XYPath.Y`) ships with a default keyframe at frame 0; clear it first.
