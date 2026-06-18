> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## ChildFrame

class ChildFrame
Parent class: **FuFrame**
Represents the context of the frame window, that contains all the views.
Usually, there's just one ChildFrame object for each comp and you can retrieve it via comp.CurrentFrame.

## Methods

ChildFrame.ActivateFrame()
Activates this frame window.

ChildFrame.ActivateNextFrame()
Activates the next frame window.

ChildFrame.ActivatePrevFrame()
Activates the previous frame window.

ChildFrame.GetControlViewList()
Returns the list of views from the Controls tabs.

→ Python usage:
list = comp.CurrentFrame.GetControlViewList()

→ Lua usage:
list = comp.CurrentFrame:GetControlViewList()

→ Returns: views
→ Return type: table

ChildFrame.GetMainViewList()
Returns the list of views from the Main tabs.
→ Returns: views
→ Return type: table

ChildFrame.GetViewLayout()
Retrieves the current view layout.
→ Returns: layout
→ Return type: table

ChildFrame.SetViewLayout.layout)
Sets the current view layout from a table.
→ Parameters:
layout (table) – layout
→ Returns: success
→ Return type: boolean

ChildFrame.SwitchControlView(id)
Displays a given view from the Control tabs.
→ Parameters:
id (string) – id

ChildFrame.SwitchMainView(id)
Displays a given view from the Main tabs.
→ Parameters:
id (string) – id
