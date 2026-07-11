> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## PolylineMask

class PolylineMask

Parent class: MaskOperator

# Methods

PolylineMask.ConvertToBSpline()
Converts to b-spline polyline.

PolylineMask.ConvertToBezier()
Converts to Bezier polyline.

PolylineMask.GetBezierPolyline(time[, which])
Get a table of bezier polyline.

→ Parameters:
time (number) – time
which (string) – which

→ Returns: poly
→ Return type: table
