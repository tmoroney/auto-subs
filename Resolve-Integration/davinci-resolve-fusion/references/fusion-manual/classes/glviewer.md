> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## GLViewer

### class GLViewer

Parent class: Object

Parent class for 2D and 3D viewers.

2D image viewers are instances of the GLImageViewer subclass and have additional methods to set and show the DoD, RoI or LUT.

Please note that most Set-methods need to be followed by a Redraw() call.

→ Python usage:

```txt
# Reach the Left GLViewer
left = comp.GetPreviewList()["Left"][View"]
left_viewer = left.CurrentViewer
if left_viewer != None:
left_viewer.SetChannel(0)
left_viewer.Redraw()
```

→ Lua usage:

```sql
-- Reach the Left GLViewer
left = comp:GetPreviewList().Left.View
left_viewer = left.CurrentViewer
if left_viewer == nil then
left_viewer:SetChannel(0)
left_viewer:Redraw()
end
```

## Methods

GLViewer.AreControlsShown()

Returns true if controls are being displayed on the view.

→ Returns: enabled
→ Return type: boolean

GLViewer.AreGuidesShown()
Returns true if image guides are being displayed on the view.
→ Returns: enabled
→ Return type: boolean

GLViewer.GetAlphaOverlayColor()
Return which alpha overlay is being used.
→ Returns: color
→ Return type: number

GLViewer.GetAspectCorrection()
Returns true if the viewer is correcting the aspect of images.
→ Returns: enabled
→ Return type: boolean

GLViewer.GetChannel()
Return which channel is shown.
→ Returns: channel
→ Return type: number

GLViewer.GetPos()
Get the position of the viewer.
In Python use GetPosTable.
→ Returns: x
→ Return type: number

GLViewer.GetPosTable()
Get the position of the viewer as a table.
→ Returns: pos
→ Return type: table

GLViewer.GetRot()
Get the rotation angles of the view.
In Python use GetRotTable.
→ Returns: x
→ Return type: number

GLViewer.GetRotTable()
Get the rotation angles of the view as a table.
→ Returns: rot
→ Return type: table

GLViewer.GetScale()
Get the scale (zoom) of the view.
→ Returns: scale
→ Return type: number

GLViewer.LoadFile(filename)
Load and display the contents of a file.
→ Parameters:
filename (string) – filename

GLViewer.Redraw()
Refreshes the viewer.

GLViewer.ResetView()
Resets the display to default position etc.

GLViewer.SaveFile(filename)
Save the currently displayed parameter.
→ Parameters:
filename (string) – filename

GLViewer.SetAlphaOverlayColor(color)
Select which alpha overlay to use.
→ Parameters:
color (number) – color

GLViewer.SetAspectCorrection(enable)
Enables or disables aspect correction.
→ Parameters:
enable (boolean) – enable

GLViewer.SetChannel(channel, toggle)
Select which channel to show.
→ Parameters:
channel (number) – channel
toggle (boolean) – toggle

GLViewer.SetPos(x, y[, z])
Set the position of the viewer.

→ Parameters:
x (number) – x
y (number) – y
z (number) – z

→ Returns: success
→ Return type: boolean

GLViewer.SetRot(x, y, z)
Set the rotation of the view.

→ Parameters:
x (number) – x
y (number) – y
z (number) – z

GLViewer.SetScale(scale)
Set the scale (zoom) of the view.

→ Parameters:
scale (number) – scale

GLViewer.ShowControls(enable)
Shows or hides controls on the view.

→ Parameters:
enable (boolean) – enable

GLViewer.ShowGuides(enable)
Shows or hides guides on the view.

→ Parameters:
enable (boolean) – enable
