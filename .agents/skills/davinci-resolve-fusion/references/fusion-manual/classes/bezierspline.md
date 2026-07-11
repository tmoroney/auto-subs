> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## BezierSpline

class BezierSpline

Parent class: Spline

Modifier that represents animation on a number value input.

Keyframes are interpolated with a bezier spline.

To animate Points use a Path instead.

→ Python usage:

```python
comp.Merge1.Blend= comp.BezierSpline()
comp.Merge1.Blend[1] = 1
comp.Merge1.Blend[50] = 0
```

→ Lua usage:

```txt
Merge1.Blend = BezierSpline()
Merge1.Blend[1] = 1 -- Add keyframe at frame 1
Merge1.Blend[50] = 0 -- Add keyframe at frame 50
```

## Methods

BezierSpline.AdjustKeyFrames (start, end, x, y, operation[, pivotx][, pivoty])

Set, Offset or Scale a range of key frames.

start, end Time range of keypoints to adjust (inclusive)

x, y Time and Value offsets/factors

operation Can be "set", "offset" or "scale" (case sensitive)

pivotx, pivoty optional values to scale around. Default is zero.

→ Parameters:

start (number) – start

end (number) – end

x (number) – x

y (number) – y

operation (string) – operation

pivotx (number) – pivotx
pivoty (number) – pivoty

BezierSpline.DeleteKeyFrames(start[, end])
Delete key frames.

→ Parameters:
start (number) – start
end (number) – end

BezierSpline.GetKeyFrames()

Get a table of keyframes.

While Operator:GetKeyFrames() returns a table of the tool's valid extent, and Input:GetKeyFrames() returns a table of the keyframe times for any animation, when GetKeyFrames() is called from a BezierSpline modifier, it will return a table fully describing the spline's curvature.

The data returned consists of a table of subtables, one for each keyframe and with a key value of the keyframe's time. The subtables contain an entry for the keyframe's value, and optionally, subtables for the left and/or right handles, keyed by "LH" and "RH". The handle subtables contain two entries, for the handle's X &amp; Y position.

Returns a table containing information about a spline control's animation keyframes.

An example table for a spline with three keyframes follows:

```txt
{
[0.0] = { 2.0, RH = { 12.666667, 2.0 } },
[38.0] = { 3.86, LH = { 25.333333, 3.666667 }, RH = { 46.0, 4.0 } },
[62.0] = { 2.5, LH = { 54.0, 2.5 } }
}
```

→ Python usage:

```python
from pprint import pprint
# gets the spline output that is connected to the Blend input
splineout = comp.Merge1.Blend.GetConnectedOutput()
# then uses GetTool() to get the Bezier Spline modifier itself, and
```

```python
if splineout:
spline = splineout.GetTool()
```

```python
# then uses GetKeyFrames() to get a table of a spline data.
splinedata = spline.GetKeyFrames()
pprint(splinedata)
```

→ Lua usage:

```txt
-- gets the spline output that is connected to the Blend input
splineout = Merge1.Blend:GetConnectedOutput()
```

```txt
-- then uses GetTool() to get the Bezier Spline modifier itself, and
if splineout then
spline = splineout:GetTool()
```

```txt
-- then uses GetKeyFrames() to get a table of a spline data.
splinedata = spline:GetKeyFrames()
dump(splinedata)
end
```

→ Returns: keyframes
→ Return type: table

BezierSpline.SetKeyFrames(keyframes[, replace])

Set a table of keyframes.

This function allows you to set a spline's keyframes as well as its curvature. The table should consist of a table of subtables, one for each keyframe, each with a key value of the keyframe's time. The subtables should contain an entry for the keyframe's value, and may optionally contain subtables for the left and/or right handles, keyed by "LH" and "RH". The handle subtables should contain two entries, for the handle's X &amp; Y position.

An example table for a spline with three keyframes follows:

```txt
{
[0.0] = { 2.0, RH = { 12.666667, 2.0 } },
[38.0] = { 3.86, LH = { 25.333333, 3.666667 }, RH = { 46.0, 4.0 } },
[62.0] = { 2.5, LH = { 54.0, 2.5 } }
}
```

→ Parameters:
keyframes (table) – keyframes
replace (boolean) – replace
