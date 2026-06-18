> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# GLImageViewer

class GLImageViewer
Parent class: GLViewer

# Methods

GLImageViewer.DragRoI()
Lets the user drag out an RoI rectangle.

GLImageViewer.enableLUT([enable])
Enables or disables the current View LUT.

→ Parameters:
enable (boolean) – enable

GLImageViewer.enableRoI([enable])
Enables or disables the current View RoI.

→ Parameters:
enable (boolean) – enable

GLImageViewer.ExportTo3DLUT()
Exports the current LUTs to a 3D LUT file.
→ Returns: success
→ Return type: boolean

GLImageViewer.IsLUTEnabled()
Returns true if the current View LUT is enabled.
→ Returns: enabled
→ Return type: boolean

GLImageViewer.LoadLUTFile([pathname])
Loads a LUT file, setting or LUT plugin ID into the View LUT.
→ Parameters:
pathname (string) – pathname
→ Returns: success
→ Return type: boolean

GLImageViewer.LockRoI([enable])
Locks or unlocks the View RoL.
→ Parameters:
enable (boolean) – enable

GLImageViewer.SaveLUTFile([pathname])
Saves current LUTs into a .viewlut file.
→ Parameters:
pathname (string) – pathname
→ Returns: success
→ Return type: boolean

GLImageViewer.SetRoI()
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the current View RoI region.

GLImageViewer.SetRoI(rect)
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the current View RoI region.
→ Parameters:
rect (table) – rect

GLImageViewer.SetRoI(auto)
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the current View RoI region.

→ Parameters:
auto (boolean) – auto

GLImageViewer.ShowDoD([enable])
Enables or disables drawing the current View DoD rectangle.

→ Parameters:
enable (boolean) – enable

GLImageViewer.ShowLUTEditor()
Pops up the Editor window for the current View LUT.

GLImageViewer.ShowRoI([enable])
Enables or disables drawing the current View RoI rectangle.

→ Parameters:
enable (boolean) – enable
