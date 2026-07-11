> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Operator

class Operator
Parent class: Object
Base class for all Tools, Modifiers etc.

Operator Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  TOOLS_Name | string | The full name of this tool  |
|  TOOLS_Name | string | The full name of this tool  |
|  TOOLB_Visible | integer | Indicates if this tool is visible on the flow, or a non-visible tool, such as a modifier.  |
|  TOOLB_Locked | boolean | Indicates if this tool is locked.  |
|  TOOLB_PassThrough | boolean | Indicates if this tool is set to pass-through.  |
|  TOOLB_HoldOutput | boolean | Indicates if this tool is set to hold its output (not update).  |
|  TOOLB_CtrlWZoom | integer | Indicates if this tool's control window is open or closed.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  TOOLB_NameSet | boolean | Indicates if this tool's name has been set (by the user) or is the default name.  |
|  TOOLB_CacheToDisk | integer | Indicates if this tool is set to cache itself to disk.  |
|  TOOLS_RegID | string | The RegID of this tool.  |
|  TOOLH_GroupParent | group userdata | The associated group object  |
|  TOOLNT_EnabledRegion_Start | number | The point (frame) at which this tool is enabled, and will start to take effect.  |
|  TOOLNT_EnabledRegion_End | number | The point (frame) at which this tool is disabled, and will cease to have an effect..  |
|  TOOLNT_Region_Start | number | The point at which this tool can start providing results.  |
|  TOOLNT_Region_End | composition userdata | The point at which this tool stops providing results.  |
|  TOOLN_LastFrameTime | number | The amount of time (in seconds) taken to process the most recently rendered frame by this tool.  |
|  TOOLI_Number_o_Inputs | number | Useful for determining the number of inputs a tool has (implemented for 3D merges).  |
|  TOOLI_ImageWidth | integer | For image-based tools, these represent the format of the image most recently processed by this tool.  |
|  TOOLI_ImageHeight | integer |   |
|  TOOLI_ImageField | integer |   |
|  TOOLI_ImageDepth | integer |   |
|  TOOLN_ImageAspectX | number |   |
|  TOOLN_ImageAspectY | number |   |
|  TOOLST_Clip_Name | string | For clip-based tools (Loader and Saver), one or more entries for these may be present in tables to define information on the clip(s) currently selected into this tool. Note that these attributes actually return a table of values of the type indicated in parenthesis. Each index in the table represents a clip in the clip list.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  TOOLIT_Clip_Width | integer |   |
|  TOOLIT_Clip_Height | integer |   |
|  TOOLIT_Clip_StartFrame | integer |   |
|  TOOLIT_Clip_Length | integer |   |
|  TOOLBT_Clip_IsMultiFrame | boolean |   |
|  TOOLST_Clip_FormatName | string |   |
|  TOOLST_Clip_FormatID | string |   |
|  TOOLNT_Clip_Start | number |   |
|  TOOLNT_Clip_End | number |   |
|  TOOLBT_Clip_Reverse | boolean |   |
|  TOOLBT_Clip_Saving | boolean |   |
|  TOOLBT_Clip_Loop | boolean |   |
|  TOOLIT_Clip_TrimIn | integer |   |
|  TOOLIT_Clip_TrimOut | integer |   |
|  TOOLIT_Clip_ExtendFirst | integer |   |
|  TOOLIT_Clip_ExtendLast | integer |   |
|  TOOLIT_Clip_ImportMode | integer |   |
|  TOOLIT_Clip_PullOffset | integer |   |
|  TOOLIT_Clip_InitialFrame | integer |   |
|  TOOLIT_Clip_AspectMode | integer |   |
|  TOOLIT_Clip_TimeCode | integer |   |
|  TOOLST_Clip_KeyCode | string |   |
|  TOOLST_AltClip_Name | string |   |
|  TOOLIT_AltClip_Width | integer |   |
|  TOOLIT_AltClip_Height | integer |   |
|  TOOLIT_AltClip_StartFrame | integer |   |
|  TOOLIT_AltClip_Length | integer |   |
|  TOOLBT_AltClip_IsMultiFrame | boolean |   |
|  TOOLST_AltClip_FormatName | string |   |
|  TOOLST_AltClip_FormatID | string |   |

# Members

Operator.Composition
The composition that this tool belongs to (read-only).
→ Getting:
comp = Operator.Composition - (Composition)

Operator.FillColor
→ Getting:
color = Operator.FillColor - (table)
→ Setting:
Operator.FillColor = color - (table)

Operator.ID
Registry ID of this tool (read-only).
→ Getting:
id = Operator.ID - (string)

Operator.Name
Friendly name of this tool (read-only).
→ Getting:
name = Operator.Name - (string)

Operator.ParentTool
The parent tool of this tool (read-only).
That is a group parent if the tool is inside a group or macro.
→ Getting:
parent = Operator.ParentTool - (Tool)

Operator.TextColor
Color of a tool's icon text in the Flow view.
→ Getting:
color = Operator.TextColor - (table)
→ Setting:
Operator.TextColor = color - (table)

Operator.TileColor
Color of a tool's icon in the Flow view.
→ Getting:
color = Operator.TileColor - (table)

→ Setting:
Operator.TileColor = color – (table)

Operator.UserControls
Table of user-control definitions.

→ Getting:
controls = Operator.UserControls – (table)

→ Setting:
Operator.UserControls = controls – (table)

## Methods

Operator.AddModifier(input, modifier)
Creates a modifier and connects it to an input.
This provides an easy way to animate the controls of a tool.
input ID of the tool's Input to be connected to.
modifier ID of the modifier to be created.
Returns a boolean value indicating success.

→ Python usage:
```python
myBlur = comp.Blur()
if myBlur.AddModifier("Blend", "BezierSpline"):
myBlur.Blend[0] = 1.0
myBlur.Blend[100] = 0.0
```

→ Lua usage:
```python
myBlur = Blur()
if myBlur:AddModifier("Blend", "BezierSpline") then
myBlur.Blend[0] = 1.0
myBlur.Blend[100] = 0.0
end
```

→ Parameters:
input (string) – input
modifier (string) – modifier

→ Returns: success
→ Return type: boolean

Operator.ConnectInput(input, target)
Connect or disconnect an Input.

The input can be connected to an Output or an Operator,
or to nil, which disconnects the input.

If the target given is an Operator, the Input will be
connected to that Operator's main Output.

input the ID of an Input to connect
target an Output or Operator object to connect the input to, or nil to disconnect

→ Python usage:
```python
# Find a Loader, and connect it to Merge1Foreground
ldr = comp.FindToolByID("Loader")
if ldr and comp.Merge1:
comp.Merge1.ConnectInput("Foreground", ldr)
```

→ Lua usage:
```txt
-- Find a Loader, and connect it to Merge1Foreground
ldr = comp:FindToolByID("Loader")
if ldr and Merge1 then
print(comp.ActiveTool)
Merge1:ConnectInput("Foreground", ldr)
end
```

→ Parameters:
input (string) – input
target ((ToolOutput|nil)) – target

→ Returns: success
→ Return type: boolean

Operator.Delete()
Delete this tool.
Removes the tool from the composition. This also releases the handle to the
Fusion Tool object, setting it to nil.

Operator.FindMainInput(index)
Returns the tool's main (visible) input.
index integer value of 1 or greater.

→ Python usage:
```python
# Loop through all main inputs.
i = 1
while True:
inp = tool.FindMainInput(i)
if inp is None:
break
# Got input
print(inp.GetAttrs()["INPS_Name"])
i += 1
```

→ Lua usage:
```txt
-- Loop through all main inputs.
tool = comp.ActiveTool
i = 1
while true do
inp = (tool:FindMainInput(i))
```

```txt
if inp == nil then
break
end
-- Got input
print (inp:GetAttrs().INPS_Name)
i = i + 1
end
```

→ Parameters:
index (number) – index

→ Returns: inp

→ Return type: Input

Operator.FindMainOutput(index)

Returns the tool's main (visible) output.
index integer value of 1 or greater.

→ Python usage:
```python
# Loop through all main outputs.
i = 1
while True:
outp = tool.FindMainOutput(i)
if outp is None:
break
# Got output
print(outp.GetAttrs()["OUTS_Name"])
i += 1
```

→ Lua usage:

```txt
-- Loop through all main outputs.
tool = comp.ActiveTool
i = 1
while true do
outp = (tool:FindMainOutput(i))
if outp == nil then
break
end
-- Got output
print (outp:GetAttrs().OUTS_Name)
i = i + 1
end
```

→ Parameters:
index (number) – index

→ Returns: out

→ Return type: Output

Operator.GetChildrenList([selected][, regid])

Returns a list of all children tools, or selected children tools.

This function is useful for finding members of Macro or Group tools.

selected Pass true to get only selected child tools.

regid pass a Registry ID string to get only child tools of that type.

Returns a table of tool objects.

→ Python usage:

```python
# List all tools in a group or macro
for t in comp.ActiveTool.GetChildrenList().values():
print(t.Name)
```

→ Lua usage:

```python
-- List all tools in a group or macro
for i,t in pairs(comp.ActiveTool:GetChildrenList()) do
print(t.Name)
end
```

→ Parameters:

```txt
selected (boolean) - selected
regid (string) - regid
```

→ Returns: tools
→ Return type: table

Operator.GetControlPageNames()

Returns a table of control page names, indexed by page number.

→ Returns: names
→ Return type: table

Operator.GetCurrentSettings()

Returns the index of the tool's current settings slot.

A tool has 6 different collections/slots of settings. By default, it uses slot 1.

Returns a numerical index of 1 or greater.

→ Returns: index
→ Return type: number

Operator.GetData([name])

Get custom persistent data.

See Composition:GetData().

→ Parameters:

```txt
name (string) - name
```

→ Returns: value
→ Return type: (number|string|boolean|table)

Operator.GetInput(id[, time])

Fetches the value of an input at a given time.

The time argument may be omitted, if the input is not animated.

A similar result may be obtained by simply indexing the input with the desired time.

id the ID of the input to be queried.

time the keyframe time to be queried.

Returns a number, string or other Parameter object, depending on the DataType of the queried Input.

→ Python usage:

```python
# these lines: the same thing
print(tool:GetInput("Blend", 30.0))
print(tool.Blend[30])
```

→ Lua usage:

```txt
-- these lines do the same thing
print(tool:GetInput("Blend", 30.0)
print(tool.Blend[30.0])
```

→ Parameters:

id (string) – id

time (number) – time

→ Returns: value
→ Return type: (number|string|Parameter)

Operator.GetInputList([type])

Return a table of all inputs on this tool.

type can be used to filter the results to return only a specific datatype. Valid values include "Image", "Number", "Point", "Gradient" and "Text".

Returns a table containing handles all the Inputs available for the tool.

→ Python usage:

```python
# this Tool script prints out the name
# of every control on the selected tool
tool = comp.ActiveTool
x = tool.GetInputList().values()
for inp in x:
print(inp.GetAttrs()["INPS_Name"])
```

→ Lua usage:

```txt
-- this Tool script prints out the name
-- of every control on the selected tool
tool = tool or comp.ActiveTool
x = tool:GetInputList()
for i, inp in pairs(x) do
print(inp:GetAttrs().INPS_Name]
end
```

→ Parameters:

type (string) – type

→ Returns: inputs

→ Return type: table

Operator.GetKeyFrames()

Return a table of all keyframe times for this tool.

Returns a table containing a list of keyframe times, in order, for the tool only. Any animation splines or modifiers attached to the tool's inputs are not considered.

→ Returns: keyframes

→ Return type: table

Operator.GetOutputList([type])

Return a table of all outputs on this tool.

type can be used to filter the results to return only a specific datatype. Valid values include "Image", "Number", "Point", "Gradient" and "Text".

Returns a table containing handles all the Outputs available for the tool.

→ Python usage:

```python
# this Tool script prints out the name
# of every output on the selected tool
tool = comp.ActiveTool
x = tool.GetOutputList().values()
for outp in x:
print(outp.GetAttrs()["OUTS_Name"])
```

→ Lua usage:

```txt
-- this Tool script prints out the name
-- of every output on the selected tool
tool = tool or comp.ActiveTool
x = tool:GetOutputList()
for i,out in pairs(x) do
print(out:GetAttrs().OUTS_Name]
end
```

→ Parameters:
type (string) – type

→ Returns: outputs
→ Return type: table

Operator.LoadSettings(filename)

Note: This method is overloaded and has alternative parameters. See other definitions.

Load the tools's settings from a file or table.

Used to load .setting files or tables into a tool. This is potentially useful for any number of applications, such as loading curve data into fusion or to synch updates to tools over project management systems.

→ Python usage:
```txt
settingtable = bmd.readfile("fusion:\\settings\\ccv_project1.setting")
comp.ColorCurve1.LoadSettings(settingtable)
# Same as
comp.ColorCurve1.LoadSettings("fusion:\\settings\\ccv_project1.setting")
```

→ Lua usage:
```txt
settingtable = bmd.readfile("fusion:\\settings\\ccv_project1.setting")
ColorCurve1:LoadSettings(settingtable)
-- Same as
ColorCurve1:LoadSettings("fusion:\\settings\\ccv_project1.setting")
```

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Operator.LoadSettings(settings)

Note: This method is overloaded and has alternative parameters. See other definitions.

Load the tools's settings from a file or table.

Used to load .setting files or tables into a tool. This is potentially useful for any number of applications, such as loading curve data into fusion or to synch updates to tools over project management systems.

→ Python usage:

```txt
settingtable = bmd.readfile("fusion:\\settings\\ccv_project1.setting")
comp.ColorCurve1.LoadSettings(settingtable)
# Same as
comp.ColorCurve1.LoadSettings("fusion:\\settings\\ccv_project1.setting")
```

→ Lua usage:

```txt
settingtable = rbmd.readfile("fusion:\\settings\\ccv_project1.setting")
ColorCurve1:LoadSettings(settingtable)
-- Same as
ColorCurve1:LoadSettings("fusion:\\settings\\ccv_project1.setting")
```

→ Parameters:

settings (table) – settings

→ Returns: success
→ Return type: boolean

Operator.Refresh()

Refreshes the tool, showing updated user controls.

Calling Refresh will invalidate the handle to the tool. A new handle is returned and can be stored.

Returns a new handle to the refreshed tool.

Operator.SaveSettings(filename)

Note: This method is overloaded and has alternative parameters. See other definitions.

Save the tool's current settings to a file or table.

If a path is given, the tool's settings will be saved to that file, and a boolean is returned to indicate success.

If no path is given, SaveSettings() will return a table of the tool's settings instead.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Operator.SaveSettings(customdata)

Note: This method is overloaded and has alternative parameters. See other definitions.

Save the tool's current settings to a file or table.

If a path is given, the tool's settings will be saved to that file, and a boolean is returned to indicate success.

If no path is given, SaveSettings() will return a table of the tool's settings instead.

→ Parameters:
customdata (boolean) – customdata

→ Returns: settings
→ Return type: table

Operator.SetCurrentSettings()

Sets the tool's current settings slot.

If the slot is not empty, the function will change all the tool's Inputs to the settings stored in that slot.

A tool has 6 different collections ("slots") of settings. By default, it uses slot 1. Changing the current settings slot may change any or all of the tool's Inputs to new values, or new animations, stored in the new slot (if any).

All of the tool's previous settings are stored in the old slot, before changing to a new slot.

index numerical index of 1 or greater.

→ Python usage:

```python
import time

tool = comp.ActiveTool
slot = tool.GetCurrentSettings()
```

```python
# change to new slot, and turn off the effect
tool.SetCurrentSettings(slot + 1)
tool.Blend[comp.CurrentTime] = 0.0
print(tool.Name + ". Before...")
# wait(a few seconds)
time.sleep(3)
# change back to the old slot, and turn the effect back on
tool.SetCurrentSettings(slot)
tool.Blend[comp.CurrentTime] = 1.0
print(tool.Name + ". After!")
```

→ Lua usage:

```txt
local clock = os.clock
function sleep(n) -- seconds
local t0 = clock()
while clock() - t0 &lt;= n do end
end
tool = tool or comp.ActiveTool
slot = tool:GetCurrentSettings()
-- change to new slot, and turn off the effect
tool:SetCurrentSettings(slot + 1)
tool.Blend[comp.CurrentTime] = 0.0
print(tool.Name .. ": Before...")
```

-- wait(a few seconds)
sleep(3)

-- change back to the old slot, and turn the effect back on
tool:SetCurrentSettings(slot)
tool.Blend[comp.CurrentTime] = 1.0
print(tool.Name .. ": After!")

→ Returns: index
→ Return type: number

Operator.SetData(name, value)
Set custom persistent data.
See Composition:SetData().

→ Parameters:
name (string) – name
value ((number|string|boolean|table)) – value

Operator.SetInput(id, value, time)
Sets the value of an input at a given time.
The time argument may be omitted, if the input is not animated.
A similar result may be obtained by simply indexing the input with the desired time, and assigning to that.

→ Parameters:
id (string) – id
value ((number|string|Parameter)) – value
time (number) – time

Operator.ShowControlPage(name)
Makes the specified control page visible.
Valid ControlPageNames for the tool can be queried with GetControlPageNames().

→ Parameters:
name (string) – name
