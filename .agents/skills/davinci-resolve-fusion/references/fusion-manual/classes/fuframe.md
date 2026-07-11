> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# FuFrame

class FuFrame
Parent class: Object

## Members

FuFrame.Composition
Represents this frame window's Composition (read-only).
→ Setting:
FuFrame.Composition = comp – (Composition)

FuFrame.ConsoleView
Represents this frame window's console (read-only).
→ Setting:
FuFrame.ConsoleView = view – (FuView)

FuFrame.CurrentView
Represents the currently active view for this frame window (read-only).
→ Setting:
FuFrame.CurrentView = view – (FuView)

FuFrame.FlowView
Represents this frame window's Flow view (read-only).
→ Setting:
FuFrame.FlowView = view – (FuView)

FuFrame.InfoView
Represents this frame window's Info view (read-only).
→ Setting:
FuFrame.InfoView = view – (FuView)

FuFrame.LeftView
Represents this frame window's left display view (read-only).
→ Setting:
FuFrame.LeftView = view – (GLView)

FuFrame.ModifierView
Represents this frame window's Modifier controls view (read-only).
→ Setting:
FuFrame.ModifierView = view – (FuView)

FuFrame.RightView
Represents this frame window's right display view (read-only).
→ Setting:
FuFrame.RightView = view – (GLView)

FuFrame.SplineView
Represents this frame window's spline editor view (read-only).
→ Setting:
FuFrame.SplineView = view – (FuView)

FuFrame.TimeRulerView
Represents this frame window's time ruler (read-only).
→ Setting:
FuFrame.TimeRulerView = view – (FuView)

FuFrame.TimelineView
Represents this frame window's Timeline view (read-only).
→ Setting:
FuFrame.TimelineView = view – (FuView)

FuFrame.ToolView
Represents this frame window's Tool controls view (read-only).
→ Setting:
FuFrame.ToolView = view – (FuView)

FuFrame.TransportView
Represents this frame window's transport controls view (read-only).
→ Setting:
FuFrame.TransportView = view – (FuView)

Methods

FuFrame.GetPreviewList([include_globals])
Retrieves a table of previews.
→ Parameters:
include_globals (boolean) – include_globals
→ Returns: previews
→ Return type: table

FuFrame.GetViewList()
Returns the list of views within this frame.
→ Returns: views
→ Return type: table

FuFrame.SwitchView(id)
Displays a given view within this frame.
→ Parameters:
id (string) – id

FuFrame.ViewOn([tool][, view])
Displays a tool on a numbered view.

→ Python usage:
comp.CurrentFrame.ViewOn(tool, 1)

→ Lua usage:
comp.CurrentFrame.ViewOn(tool, 1)

→ Parameters:
tool (Tool) – tool
view (number) – view
