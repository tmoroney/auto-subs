> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# GLView

class GLView
Parent class: FuView

→ Python usage:

```python
# Reach Left GLView of Fusion instance
left = comp.GetPreviewList()["Left"][View"]
left.SetBuffer(0)
```

→ Lua usage:

```txt
-- Reach Left GLView of Fusion instance
left = comp:GetPreviewList().Left.View
left:SetBuffer(0)
```

## Members

GLView.CurrentViewer

Returns the current viewer.

→ Getting:

```txt
viewer = GLView.CurrentViewer – (GLViewer)
```

## Methods

GLView.DisableCurrentTools()

Pass-through the currently selected tools.

GLView.DisableSelectedTools()

Pass-through the selected tools.

GLViewEnableLUT(enable)

Enables or disables the current Monitor LUT.

→ Parameters:

```txt
enable (boolean) – enable
```

GLViewEnableStereo(enable)

Enables or disables 3D stereo display.

→ Parameters:

```txt
enable (boolean) – enable
```

GLView.GetBuffer()
Returns which buffer is shown.
→ Returns: buffer
→ Return type: number

GLView.GetLocked()
Returns true if the display is locked.
→ Returns: enabled
→ Return type: boolean

GLView.GetPos()
Returns the position of the display.
In Python use GetPosTable.
→ Returns: x
→ Return type: number

GLView.GetPosTable()
Returns the position of the display as a table.
→ Returns: pos
→ Return type: table

GLView.GetPrefs()
Retrieve a table of preferences for this view.
→ Returns: prefs
→ Return type: table

GLView.GetPreview([buffer])
Returns the buffer's Preview.
→ Parameters:
buffer (number) – buffer

GLView.GetRot()
Returns the x,y,z rotation of the display in degrees.
In Python use GetRotTable.
→ Returns: x
→ Return type: number

GLView.GetRotTable()
Returns the x,y,z rotation of the display in degrees as a table.
→ Returns: rot
→ Return type: table

GLView.GetScale()
Returns the scale of the display.
→ Returns: scale
→ Return type: number

GLView.GetSplit()
Get the split position of the view.
In Python use GetSplitTable.
→ Returns: x
→ Return type: number

GLView.GetSplitTable()
Get the split position of the view as a table.
→ Returns: split
→ Return type: table

GLView.GetStereoMethod()
Returns the method and options being used for stereo display.
→ Returns: method
→ Return type: string

GLView.GetStereoSource()
Returns the source being used for stereo display.
→ Returns: ABsource
→ Return type: boolean

GLView.GetViewerList()
Returns a list of available viewers.
→ Returns: viewers
→ Return type: table

GLView.IsLUTEnabled()
Returns true if the current Monitor LUT is enabled.
→ Returns: enabled
→ Return type: boolean

GLView.IsStereoEnabled()
Indicates if stereo display is currently enabled.
→ Returns: enabled
→ Return type: boolean

GLView.IsStereoSwapped()
Indicates if the left &amp; right stereo eyes are currently swapped.
→ Returns: enable
→ Return type: boolean

GLView.LoadLUTFile(pathname)
Loads a LUT file, setting or LUT plugin ID into the Monitor LUT.
→ Parameters:
pathname (string) – pathname
→ Returns: success
→ Return type: boolean

GLView.LoadPrefs()
Note: This method is overloaded and has alternative parameters. See other definitions.
Saves the current view prefs to a named configuration.

GLView.LoadPrefs(configname)
Note: This method is overloaded and has alternative parameters. See other definitions.
Saves the current view prefs to a named configuration.
→ Parameters:
configname (string) – configname

GLView.ResetView()
Resets the display to default position etc.

GLView.SavePrefs()
Note: This method is overloaded and has alternative parameters. See other definitions.
Saves the current view prefs to a named configuration.

GLView.SavePrefs(configname)
Note: This method is overloaded and has alternative parameters. See other definitions.
Saves the current view prefs to a named configuration.
→ Parameters:
configname (string) – configname

## GLView.SetBuffer(buffer)

Show a particular buffer.

The SetBuffer function is used to display a specific one of the three possible view options for the A/B subviews in a view in Fusion. As stated above, $0 =$ the buffer view that the function is being run on, $1 =$ the buffer view that the function is not being run on, $2 = \mathrm{A} / \mathrm{B}$ view. So if the preview window that the function was being run on was the Left B view, the function would set the display viewer to B if the integer value was 0.

buffer buffer integer that the view will be set to. Buffer $0 =$ The Buffer view that is the currently selected on, $1 =$ The buffer view that is not the current one, $2 = \mathrm{A} / \mathrm{B}$.

→ Python usage:

```python
# Set the buffer to A/B with a 45 degree split at the center
left = comp.GetPreviewList()["Left"][View"]
left.SetBuffer(2)
left.SetSplit(0.5, 0.5, 45)
```

→ Lua usage:

```txt
-- Set the buffer to A/B with a 45 degree split at the center
left = comp:GetPreviewList().Left.View
left:SetBuffer(2)
left.SetSplit(.5, .5, 45)
```

→ Parameters:

```txt
buffer (number) - buffer
```

## GLView.SetLocked(enable)

→ Parameters:

```txt
enable (boolean) - enable
```

## GLView.SetPos(x, y[, z])

Set the position of the display.

Sets the position of the display relative to the center (0, 0). In a 3D GLView the view position can be set in 3D space.

- X coordinate in pixels (2D) or unity (3D)
- Y coordinate in pixels (2D) or unity (3D)
- Z coordinate in unity (3D only)

→ Parameters:
x (number) – x
y (number) – y
z (number) – z

→ Returns: success
→ Return type: boolean

GLView.SetRot(x, y, z)
Set the x, y, z rotation of the display in degrees.

→ Parameters:
x (number) – x
y (number) – y
z (number) – z

GLView.SetScale(scale)
Set the scale of the display.
The SetScale function is used to set the scale of a view.
scale the percentage, expressed as a numerical value, that the image in the view will be scaled by. Percentages are translated to numerical values (50% = .5, 200% = 2.0) with 0 being the view’s “Fit” option.

→ Python usage:
```python
# Fit the Left view
left = comp.GetPreviewList()["Left"][View"]
left.SetScale(0)
```

→ Lua usage:
```python
-- Fit the Left view
left = comp:GetPreviewList().Left.View
left:SetScale(0)
```

→ Parameters:
scale (number) – scale

GLView.SetSplit(x, y, angle)
Set the split position of the view.
Sets the A/B view split based on the x, y, coordinates and the angle.

x the coordinate along the x axis of the A/B Split view's center.
y the coordinate along the y axis of the A/B Split view's center.
angle the angle of the A/B Split view line.

→ Python usage:

```python
# Set the buffer to A/B with a 45 degree split at the center
left = comp.GetPreviewList()["Left"]["View"]
left.SetBuffer(2)
left.SetSplit(.5, .5, 45)
```

→ Lua usage:

```txt
-- Set the buffer to A/B with a 45 degree split at the center
left = comp:GetPreviewList().Left.View
left:SetBuffer(2)
left:SetSplit(.5, .5, 45)
```

→ Parameters:

x (number) - x
y (number) - y
angle (number) - angle

GLView.SetStereoMethod(method[, option1][, option2])
Sets the method for stereo display.

→ Parameters:

method (string) - method
option1 - option1
option2 - option2

GLView.SetStereoSource(ABSource, stacked[, stackmethod])
Sets the source for the left &amp; right stereo images.

→ Parameters:

ABsource (boolean) - ABsource
stacked (boolean) - stacked
stackmethod (string) - stackmethod

GLView.ShowLUTEditor()
Pops up the Editor window for the current Monitor LUT.

GLView.ShowQuadView(enable)
Splits the view into four subviews.
→ Parameters:
enable (boolean) – enable

GLView.ShowSubView(enable)
Enables the inset SubView display.
→ Parameters:
enable (boolean) – enable

GLView.ShowingQuadView()
Returns true if the view is split into four.
→ Returns: enabled
→ Return type: boolean

GLView.ShowingSubView()
→ Returns true if the inset SubView is currently being displayed.
→ Returns: enabled
→ Return type: boolean

GLView.SwapStereo()
Note: This method is overloaded and has alternative parameters. See other definitions.
Swaps left &amp; right stereo eye views.

GLView.SwapStereo(enable)
Note: This method is overloaded and has alternative parameters. See other definitions.
Swaps left &amp; right stereo eye views.
→ Parameters:
enable (boolean) – enable

GLView.SwapSubView()
Swaps the SubView with the Main View.
→ Returns: enabled
→ Return type: boolean
