> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# GraphView

class GraphView

Parent class: FuScrollView

# Methods

GraphView.DeleteGuides([start][, end])

Deletes guides between start and end.

→ Parameters:
start (number) – start
end (number) – end

GraphView.GetClipboard()

Retrieves the tool(s) on the clipboard, as tables and as ASCII text..

→ Returns: clipboard
→ Return type: table

GraphView.GetGuides([start][, end])

Returns a table of snapguide times &amp; names.

→ Parameters:
start (number) – start
end (number) – end

→ Returns: guides
→ Return type: table

GraphView.GoNextKeyTime()

Jumps to next key frame of the active spline.

GraphView.GoPrevKeyTime()

Jumps to previous key frame of the active spline.

GraphView.Paste(desttime, spline1[, spline2...][, points])
Paste points to given splines at given time from the Clipboard.

→ Parameters:
- desttime (number) – desttime
- spline1 (object) – spline1
- spline2... (object) – spline2...
- points (table) – points

→ Returns: success
→ Return type: boolean

GraphView.SetGuides([guides][, rem_prev])
Sets snapguide.

→ Parameters:
- guides (table) – guides
- rem_prev (boolean) – rem_prev

GraphView.ZoomFit()
Changes scale to fit all displayed splines within the view.

GraphView.ZoomIn()
Increases the scale (zoom) of the view.

GraphView.ZoomOut()
Decreases the scale (zoom) of the view.

GraphView.ZoomRectangle()
Note: This method is overloaded and has alternative parameters. See other definitions.
Fill the view with the specified rectangle.

GraphView.ZoomRectangle(x1, y1, x2, y2)
Note: This method is overloaded and has alternative parameters. See other definitions.
Fill the view with the specified rectangle.

→ Parameters:
- x1 (number) – x1
- y1 (number) – y1
- x2 (number) – x2
- y2 (number) – y2
