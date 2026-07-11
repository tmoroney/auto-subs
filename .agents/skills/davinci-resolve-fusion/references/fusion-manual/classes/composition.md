> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## Composition

```txt

class Composition
Parent class: Object
Represents an composition.
```

The Composition object's methods and members are directly available in the console and in comp scripts written in Lua. This means that you can simply type `==CurrentTime` or call AddTool("Blur") without the need to prefix the command with comp. Python scripts have to use the full name.

Composition Attributes
|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  COMPN_CurrentTime | number | This is the current time that the composition is at. This is the time that the user will see, and any modifications that do not specify a time will set a keyframe at this time.  |
|  COMPB_HiQ | boolean | Indicates if the composition is currently in 'HiQ' mode or not.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  COMPB_Proxy | boolean | Indicates if the composition is currently in 'Proxy' mode or not.  |
|  COMPB_Rendering | integer | Indicates if the composition is currently rendering.  |
|  COMPN_RenderStart | number | The render start time of the composition. A render with no start specified will begin from this time.  |
|  COMPN_RenderEnd | number | The render end time of the composition. A render with no end specified will render this frame last.  |
|  COMPN_GlobalStart | number | The global start time of the comp. This is the start of time at which the composition is valid. Anything before this cannot be rendered or evaluated.  |
|  COMPN_GlobalEnd | number | The global end time of the composition. This is the end of time at which the comp is valid. Anything after this cannot be rendered or evaluated.  |
|  COMPN_LastFrameRendered | number | The most recent frame that has been successfully completed during a render.  |
|  COMPN_LastFrameTime | number | The amount of time taken to render the most recently completed frame, in seconds.  |
|  COMPN_AverageFrameTime | number | The average amount of time taken to render each frame to this point of the render, in seconds.  |
|  COMPN_TimeRemaining | number | An estimation of how much more time will be needed to complete this render, in seconds.  |
|  COMPS_FileName | string | The full path and name of the composition file.  |
|  COMPS_Name | string | The name of the composition.  |
|  COMPI_RenderFlags | integer | The flags specified for the current render.  |
|  COMPI_RenderStep | integer | The step value being used for the current render.  |
|  COMPB_Locked | boolean | This indicates if the composition is currently locked.  |

# Members

Composition.ActiveTool

Represents the currently active tool on this comp (read-only).

→ Getting:

tool = Composition.ActiveTool - (Tool)

Composition.AutoPos

Enable autoupdating of XPos/YPos when adding tools.

→ Getting:

val = Composition.AutoPos - (boolean)

→ Setting:

Composition.AutoPos = val - (boolean)

Composition.CurrentFrame

Represents the currently active frame for this composition (read-only).

Do not confuse with CurrentTime.

→ Getting:

frame = Composition.CurrentFrame - (FuFrame)

Composition.CurrentTime

The current time position for this composition.

→ Getting:

val = Composition.CurrentTime - (number)

→ Setting:

Composition.CurrentTime = val - (number)

Composition.UpdateMode()

Represents the Some/All/None mode.

Composition.XPos

The X coordinate on the flow of the next added tool.

→ Getting:

val = Composition.XPos - (number)

→ Setting:

Composition.XPos = val - (number)

Composition.YPos
The Y coordinate on the flow of the next added tool.

→ Getting:
val = Composition.YPos – (number)

→ Setting:
Composition.YPos = val – (number)

## Methods

Composition.AbortRender()
Stops any current rendering.

Composition.AbortRenderUI()
Asks the user before aborting the render.

Composition.AddTool(id[, defsettings[, xpos[, ypos])
Adds a tool type at a specified position.
id the RegID of the tool to add.
defsettings specifies whether user-modified default settings should be applied for the new tool (true) or not (false, default).
xpos the X position of the tool in the flow view.
ypos the Y position of the tool in the flow view.

You can use the number -32768 (the smallest negative value of a 16-bit integer) for both x and y position. This will cause Fusion to add the tool as if you had clicked on one of the toolbar icons. The tool will be positioned next to the currently selected one and a connection will automatically be made if possible. If no tool is selected then the last clicked position on the flow will be used. The same behaviour can be achieved with the comp:AddToolAction method.

Returns a tool handle that can be used to control the newly added tool.

→ Python usage:
```python
bg = comp.AddTool("Background", 1, 1)
mg = comp.AddTool("Merge", -32768, -32768)
```

→ Lua usage:
```python
bg = comp:AddTool("Background", 1, 1)
mg = comp:AddTool("Merge", -32768, -32768)
```

→ Parameters:
id (string) – id
defsettings (boolean) – defsettings
xpos (number) – xpos
ypos (number) – ypos

→ Returns: tool
→ Return type: Tool

Composition.AddToolAction(id[, xpos][, ypos])

Adds a tool to the comp.

If no positions are given it will cause Fusion to add the tool as if you had clicked on one of the toolbar icons. The tool will be positioned next to the currently selected one and a connection will automatically be made if possible. If no tool is selected then the last clicked position on the flow will be used.

→ Parameters:
id (string) – id
xpos (number) – xpos
ypos (number) – ypos

→ Returns: tool
→ Return type: Tool

Composition.AskRenderSettings()

Show the Render Settings dialog.

Composition.AskUser(title, controls)

Present a custom dialog to the user, and return selected values.

The AskUser function displays a dialog to the user, requesting input using a variety of common fusion controls such as sliders, menus and textboxes. All script execution stops until the user responds to the dialog by selecting OK or Cancel. This function can only be called interactively, command line scripts cannot use this function.

The second argument of this function recieves a table of inputs describing which controls to display. Each entry in the table is another table describing the control and its options. For example, if you wanted to display a dialog that requested a path from a user, you might use the following script.

Returns a table containing the responses from the user, or nil if the user cancels the dialog.

Input Name (string, required)

This name is the index value for the controls value as set by the user (i.e. dialog.Control or dialog["Control Name"]). It is also the label shown next to the control in the dialog, unless the Name option is also provided for the control.

## Input Type (string, required)

A string value describing the type of control to display. Valid strings are FileBrowse, PathBrowse, Position, Slider, Screw, Checkbox, Dropdown, and Text. Each Input type has its own properties and optional values, which are described below.

## Options (misc)

Different control types accept different options that determine how that control appears and behaves in the dialog.

## AskUser Inputs

|  Input Type | Description | Options  |
| --- | --- | --- |
|   | Several of the Options are common to several controls. For example, the name option can be used with any type of control, and the DisplayedPrecision option can be used with any control that displays and returns numeric values. | Name (string)
This option can be used to specify a more reasonable name for this inputs index in the returned table than the one used as a label for the control.
Default (various)
The default value displayed when the control is first shown.
Min (integer)
Sets the minimum value allowed by the slider or screw control.
Max (numeric)
Sets the maximum value allowed by the slider or screw control.
DisplayedPrecision (numeric)
Use this option to set how much precision is used for numeric controls like sliders, screws and position controls. A value of 2 would allow two decimal places of precision - i.e. 2.10 instead of 2.105
Integer (boolean)
If true the slider or screw control will only allow integer (non decimal) values, otherwise the slider will provide full precision. Defaults to false if not specified.  |
|  FileBrowse
PathBrowse
ClipBrowse | The FileBrowse input allows you to browse to select a file on disk, while the PathBrowse input allows you to select a directory. | Save (boolean)
Set this option to true if the dialog is used to select a path or file which does not yet exist (i.e. when selecting a file to save to)  |

|  Input Type | Description | Options  |
| --- | --- | --- |
|  Screw | Displays the standard Fusion thumbwheel or screw control. This control is identical to a slider in almost all respects except that its range is infinite, and so it is well suited for angle controls and other values without practical limits. |   |
|  Text | Displays the Fusion textedit control, which is used to enter large amounts of Text into a control. | Lines (integer)
A number specifying how many lines of text to display in the control.

Wrap (boolean)
A true or false value that determines whether the text entered into this control will wrap to the next line when it reaches the end of the line.

ReadOnly (boolean)
If this option is set to true the control will not allow any editing of the text within the control. Use for displaying non-editable information.

FontName (string)
The name of a true type font to use when displaying text in this control.

FontSize (numeric)
A number specifying the font size used to display the text in this control.  |
|  Slider | Displays a standard Fusion slider control. Labels can be set for the high and low ends of the slider using the following options. | LowName (string)
The text label used for the low (left) end of the slider.

HighName (string)
The text label used for the high (right) end of the slider.  |

|  Input Type | Description | Options  |
| --- | --- | --- |
|  Checkbox | Displays a Fusion standard checkbox control. You can display several of these controls next to each other using the NumAcross option. | Default (numeric)
The default state for the checkbox, use 0 to leave the checkbox deselected, or 1 to enable the checkbox. Defaults to 0 if not specified.

NumAcross (numeric)
If the NumAcross value is set the dialog will reserve space to display two or more checkboxes next to each other. The NumAcross value must be set for all checkboxes to be displayed on the same row. See examples below for more information.  |
|  Position | Displays a pair of edit boxes used to enter X & Y co-ordinates for a center control or other positional value. The default value for this control is a table with two values, one for the X value and one for the Y value. This control returns a table of values. | Default (table {x,y})
A table with two numeric entries specifying the value for the x and y co-ordinates.  |
|  Dropdown Multibutton | Displays the standard Fusion drop down menu for selecting from a list of options. This control exposes an option called Options which takes a table containing the values for the drop down menu. Note that the index for the Options table starts at 0, not 1 like is common in most tables. So if you wish to set a default for the first entry in a list, you would use Default = 0, for the second Default = 1, and so on. | Default (num)
A number specifying the index of the options table (below) to use as a default value for the drop down box when it is created.
Options (table {string, string, string,...})
A table of strings describing the values displayed by the drop down box.  |

→ Python usage:

```python
# In Python make sure to create a dictionary with proper indices starting with 1
dialog = {1: {1: "dlgDir", "Name": "Select a Directory", 2: "PathBrowse"}, 2: {1: "dlgCheck", "Name": "A Check Box", 2: "Checkbox", "Default": 1}}
ret = composition.AskUser("A sample dialog", dialog)
```

→ Lua usage:

```txt
composition_path = composition:GetAttrs().COMPS_FileName
msg = "This dialog is only an example. It does not actually do anything, ".. so you should not expect to see a useful result from running this script."
d = {}
d[1] = {"File", Name = "Select A Source File", "FileBrowse", Default = composition_path}
d[2] = {"Path", Name = "New Destination", "PathBrowse"}
d[3] = {"Copies", Name = "Number of Copies", "Slider", Default = 1.0, Integer = true, Min = 1, Max = 5}
d[4] = {"Angle", Name = "Angle", "Screw", Default = 180, Min = 0, Max = 360}
d[5] = {"Menu", Name = "Select One", "Dropdown", Options = {"Good", "Better", "Best"}, Default = 1}
d[6] = {"Center", Name = "Center", "Position", Default = {0.5, 0.5}}
d[7] = {"Invert", Name = "Invert", "Checkbox", NumAcross = 2}
d[8] = {"Save", Name = "Save Settings", "Checkbox", NumAcross = 2, Default = 1}
d[9] = {"Msg", Name = "Warning", "Text", ReadOnly = true, Lines = 5, Wrap = true, Default = msg}
dialog = composition:AskUser("A Sample Dialog", d)
if dialog == nil then
print("You cancelled the dialog!")
else
dump(dialog)
end
```

→ Parameters:
title (string) – title
controls (table) – controls

→ Returns: results
→ Return type: table

Composition.ChooseTool(path)
Displays a dialog with a list of selectable tools.
Returns the RegID of the selected tool or nil if the dialog was canceled.

→ Parameters:
path (string) – path

→ Returns: ID
→ Return type: string

Composition.ClearUndo()
Clears the undo/redo history for the composition.

Composition.Close()
The Close function is used to close a composition. The Fusion Composition object that calls the function will then be set to nil.
If the comp is in locked mode, then the Close function will not attempt to save the comp, whether the comp has been modified or not since its last save. If modifications have been made that should be kept, call the Save() function first.
If the comp is unlocked, it will ask if the comp should be saved before closing.
Returns true if the composition was successfully closed, nil if the composition failed to close.

Composition.Copy()
Note: This method is overloaded and has alternative parameters. See other definitions.
Copy tools to the Clipboard.
Accepts no parameters (currently selected tools), a tool or a list of tools.
Returns true if successful, else false.

→ Returns: success
→ Return type: boolean

Composition.Copy(tool)
Note: This method is overloaded and has alternative parameters. See other definitions.
Copy tools to the Clipboard.
Accepts no parameters (currently selected tools), a tool or a list of tools.

Returns true if successful, else false.

→ Parameters:
tool (Tool) – tool

→ Returns: success
→ Return type: boolean

Composition.Copy(toollist)

Note: This method is overloaded and has alternative parameters. See other definitions.
Copy tools to the Clipboard.
Accepts no parameters (currently selected tools), a tool or a list of tools.
Returns true if successful, else false.

→ Parameters:
toollist (table) – toollist

→ Returns: success
→ Return type: boolean

Composition.CopySettings()

Note: This method is overloaded and has alternative parameters. See other definitions.
Copy a tools to a settings table.
Accepts no parameters (currently selected tools), a tool or a list of tools.
Returns the toollist as settings table.

→ Returns: settings
→ Return type: table

Composition.CopySettings(tool)

Note: This method is overloaded and has alternative parameters. See other definitions.
Copy a tools to a settings table.
Accepts no parameters (currently selected tools), a tool or a list of tools.
Returns the toollist as settings table.

→ Parameters:
tool (Tool) – tool

→ Returns: settings
→ Return type: table

Composition.CopySettings(toollist)

Note: This method is overloaded and has alternative parameters. See other definitions.
Copy a tools to a settings table.

Accepts no parameters (currently selected tools), a tool or a list of tools.

Returns the toolkit as settings table.

→ Parameters:
toollist (table) – toolkit

→ Returns: settings
→ Return type: table

Composition.DisableSelectedTools()

Pass-through the selected tools.

Composition.EndUndo(keep)

The StartUndo() function is always paired with an EndUndo() function. Any changes made to the composition by the lines of script between StartUndo() and EndUndo() are stored as a single Undo event.

Changes captured in the undo event can be undone from the GUI using CTRL-Z, or the Edit menu. They can also be undone from script, by calling the Undo function. keep determines whether the captured undo event is to kept or discarded. Specifying 'true' results in the undo event being added to the undo stack, and appearing in the appropriate menu. Specifying 'false' will result in no undo event being created. This should be used sparingly, as the user (or script) will have no way to undo the preceding commands.

If the script exits before the EndUndo() is called Fusion will automatically close the undo event.

→ Python usage:

```txt
composition.StartUndo("Add some tools")
bg1 = comp.Background()
pl1 = comp.Plasma()
mg1 = comp.Merge({ "Background": bg1, "Foreground": pl1 })
composition.EndUndo(True)
```

→ Lua usage:

```txt
composition:StartUndo("Add some tools")
bg1 = Background{}
pl1 = Plasma{}
mg1 = Merge{ Background = bg1, Foreground = pl1 }
composition:EndUndo(true)
```

→ Parameters:
keep (boolean) – keep

Composition.Execute()

Executes a script string for the composition. To execute a script in the context of fusion use fusion:Execute( ... ) instead.

By default Lua is used as interpreter. To use python prepend the following prefix:
!Py: default Python version. !Py2: Python version 2. !Py3: Python version 3.

→ Python usage:
```python
comp-Execute("print('Hello from Lua!')")
comp-Execute("!Py: print('Hello from default Python!')")
comp-Execute("!Py2: print 'Hello from Python 2!'")
comp-Execute("!Py3: print ('Hello from Python 3!')")
```

→ Lua usage:
```python
comp:Execute("print('Hello from Lua!')")
comp:Execute("!Py: print('Hello from default Python!')")
comp:Execute("!Py2: print 'Hello from Python 2!'")
comp:Execute("!Py3: print ('Hello from Python 3!')")
```

Composition.FindTool(name)

Finds first tool by name.

→ Parameters:
name (string) – name

→ Returns: tool

→ Return type: Tool

Composition.FindToolByID(id[, prev])

Finds first tool of a given type.

Returns only the first found tool.

To find the next tool use the prev parameter to supply the previous tool.

→ Python usage:

```python
# Create three Blur tools
blur1 = comp.Blur()
blur2 = comp.Blur()
blur3 = comp.Blur()

print (comp.FindToolByID("Blur").Name)
# Prints: Blur1
print (comp.FindToolByID("Blur", blur1).Name)
# Prints: Blur2
print (comp.FindToolByID("Blur", blur2).Name)
# Prints: Blur3
```

→ Lua usage:

```txt
-- Create three Blur tools
blur1 = Blur
blur2 = Blur
blur3 = Blur

print (comp:FindToolByID("Blur").Name)
-- Prints: Blur1
print (comp:FindToolByID("Blur", blur1).Name)
-- Prints: Blur2
print (comp:FindToolByID("Blur", blur2).Name)
-- Prints: Blur3
```

→ Parameters:

id (string) – id

prev (Tool) – prev

→ Returns: tool
→ Return type: Tool

Composition.GetCompPathMap([built_ins][, defaults])

Returns a table of all Composition path maps.

build_ins If set build-in (read-only) PathMaps will be returned.

defaults If set the default PathMaps will be returned, else excluded.

→ Python usage:

```txt
# Returns custom PathMaps
==comp.GetCompPathMap(False, False)
# Show all, same as true, true
==comp.GetCompPathMap()
```

→ Lua usage:

```txt
-- Returns custom PathMaps
==comp:GetCompPathMap(false, false)
-- Show all, same as true, true
==comp:GetCompPathMap()
```

→ Parameters:

built_ins (boolean) – built_ins

defaults (boolean) – defaults

→ Returns: map
→ Return type: table

Composition.GetConsoleHistory()

This function is useful for getting all information displayed in the console between two points. Could be used to search for warnings or errors generated by previous scripts.

Returns a table with the history of the console between two points. If endSeq is omitted, the startSeq the console sequence number that the script will start reading from.

endSeq the console sequence number that the script will stop reading at.

script gets all history starting from the variable passed into startSeq. If both values are omitted, returns a general table about the history of the console (number of lines, etc.) If no parameters are given the total number of lines will be returned in the Total key.

→ Lua usage:

```txt
-- Get the total number of console lines
dump(composition:GetConsoleHistory().Total)

-- Get the console history lines 1 and 2
dump(composition:GetConsoleHistory(1, 2))
```

Composition.GetData([name])

Get custom persistent data.

name name of the data. This name can be in "table.subtable" format, to allow persistent data to be stored within subtables.

Persistent data is a very useful way to store names, dates, filenames, notes, flags, or anything else, in such a way that they are permanently associated with this instance of the object, and are stored along with the object using SetData(), and can be retrieved at any time with GetData().

The method of storage varies by object: SetData() called on the Fusion app itself will save its data in the Fusion.pref file, and will be available whenever that copy of Fusion is running. Calling SetData() on any object associated with a Composition will cause the data to be saved in the .comp file, or in any settings files that may be saved directly from that object. Some ephemeral objects that are not associated with any composition and are not otherwise saved in any way, may not have their data permanently stored at all, and the data will only persist as long as the object itself does.

Returns a value that has been fetched from the object's persistent data. It can be of almost any type.

→ Python usage:

```python
from datetime import datetime
tool = comp.ActiveTool
tool.SetData("Modified.Author", fusion.GetEnv("USERNAME"))
tool.SetData("Modified.Date", str(datetime.now()))
author = tool.GetData("Modified.Author")
dt = tool.GetData("Modified.Date")
print("Last modified by {0} on {1}".format(author, dt))
```

→ Lua usage:

```lua
tool = tool or comp.ActiveTool
tool:SetData("Modified.Author", fusion:GetEnv("USERNAME"))
tool:SetData("Modified.Date", os.date())
```

```txt
author = tool:GetData("Modified.Author")
dt = tool:GetData("Modified.Date")
```

```txt
print("Last modified by" ..author.. " on " ..dt)
```

→ Parameters:

name (string) – name

→ Returns: value

→ Return type: (number|string|boolean|table)

Composition.GetFrameList()

Retrieves a table of the comp's ChildFrames.

ChildFrames are the windowed workspace of Fusion. This function allows the user to access each of the available ChildFrame window objects, and their views.

→ Python usage:

```txt
windowlist = composition.GetFrameList()
tool = comp.ActiveTool
for window in windowlist.values():
window.ViewOn(tool, 1)
```

→ Lua usage:

```txt
windowlist = composition.GetFrameList()
```

```txt
tool = comp.ActiveTool
for i, window in pairs(windowlist) do
window.ViewOn(tool, 1)
end
```

Composition.GetNextKeyTime([time][, tool])
Returns the keyframe time of the next keyframe.
It can be used to either check for a keyframe among all tools in the composition, or for a specified tool only.
time The source time for the search.
tool If set keyframes only for the tool will be returned.

→ Parameters:
time (number) – time
tool (Tool) – tool

→ Returns: time
→ Return type: number

Composition.GetPrefs([preframe][, exclude-defaults])
Retrieves a table of comp-specific preferences, or a single value.
prefname The name of the specific preference to be retrieved. Use dots to indicate subtables. If no prefname or nil is specified, a table of all the preferences is returned.
exclude-defaults Do not include preferences with defaults if true
This function is useful for getting the full table of preferences for a Composition, or a subtable, or a specific value.

→ Python usage:
```python
from pprint import pprint
# ALL preferences
pprint(comp.GetPrefs())
# A sepcific preference
pprint(comp.GetPrefs("Comp.AutoSave.Enabled"))
# ALL but default preferences
pprint(comp.GetPrefs(None, False))
```

→ Lua usage:

```c
-- ALL preferences
dump(comp:GetPrefs())
-- A sepcific preference
dump(comp:GetPrefs("Comp.AutoSave.Enabled"))
-- ALL but default preferences
dump(comp:GetPrefs(nil, false))
```

→ Parameters:

```txt
prefname (string) - prefname
exclude-defaults (boolean) - exclude-defaults
```

→ Returns: prefs
→ Return type: table

Composition.GetPrevKeyTime([time][, tool])

Returns the keyframe time of the previous keyframe.

It can be used to either check for a keyframe among all tools in the composition, or for a specified tool only.

time The source time for the search.

tool If set keyframes only for the tool will be returned.

→ Parameters:

```txt
time (number) - time
tool (Tool) - tool
```

→ Returns: time
→ Return type: number

Composition.GetPreviewList([include_globals])

Retrieves a table of previews.

The GetPreviewList function is used to determine what views are available for a flow or for Fusion. The object itself is a View object that can then be passed on to the various functions that affect views in Fusion.

Returns a table of all available views for a composition. For floating views use the fusion:GetPreviewList function instead.

→ Parameters:
include_globals (boolean) – include_globals

→ Returns: previews
→ Return type: table

Composition.GetToolList([selected][, regid])

Returns a table of all tools or selected tools.

selected If the selected argument is set to true then GetToolList returns a list of handles to the selected tools in the composition. If no tools are selected then the table returned is nil. If the selected argument is false, or empty then a table with handles to all tools in the composition are returned.

regid This string value will limit the return of the GetToolList function to tools of a specific type (this type is related to the TOOLS_RegID attribute).

→ Python usage:
```python
from pprint import pprint
# outputs the name of every tool in the composition

pprint(composition.GetToolList())

# Get all selected tools

pprint(composition.GetToolList(True))

# Get all loaders

pprint(comp.GetToolList(False, "Loader"))
```
→ Lua usage:
```python
-- outputs the name of every tool in the composition
dump(composition:GetToolList())
-- Get all selected tools
dump(composition:GetToolList(true))
-- Get all loaders
dump(comp:GetToolList(false, "Loader"))
```

→ Parameters:
- selected (boolean) – selected
- regid (string) – regid

→ Returns: tools
→ Return type: table

Composition.GetViewList()
Returns all the view in the composition.

Composition.Heartbeat()
Heartbeat

Composition.IsLocked()
Returns true if popups and updates are disabled.
Use this function to see whether a composition is locked or not.
Returns a boolean with the locked status of the comp.

→ Returns: locked
→ Return type: boolean

Composition.IsPlaying()
Returns true if the comp is being played.

→ Returns: playing
→ Return type: boolean

Composition.IsRendering()
Returns true if the comp is busy rendering.
It will return true if it is playing, rendering, or just rendering a tool after trying to view it.
This is equal to the state of COMPB_Rendering composition attribute.

→ Returns: rendering
→ Return type: boolean

Composition.Lock()
Lock the composition from updating.
The Lock() function sets a composition to non-interactive ("batch", or locked) mode. This makes Fusion suppress any dialog boxes which may appear, and additionally prevents any re-rendering in response to changes to the controls. A locked composition can be unlocked with the Unlock() function, which returns the composition to interactive mode.
It is often useful to surround a script with Lock() and Unlock(), especially when adding tools or modifying a composition. Doing this ensures Fusion won't pop up a dialog to ask for user input, e.g. when adding a Loader, and can also speed up the operation of the script since no time will be spent rendering until the comp is unlocked.

→ Python usage:

```python
comp.Lock()
# Will not open the file dialog, since the composition is locked
my_loader = comp.Loader()
comp.Unlock()
```

→ Lua usage:

```python
comp:Lock()
-- Will not open the file dialog, since the composition is locked
my_loader = Loader()
comp:Unlock()
```

Composition. Loop(enable)

Note: This method is overloaded and has alternative parameters. See other definitions.

Enables looping interactive playback.

This function is used to turn on the loop control in the playback controls of the composition.

→ Parameters:

enable (boolean) – enable

Composition. Loop(mode)

Note: This method is overloaded and has alternative parameters. See other definitions.

Enables looping interactive playback.

This function is used to turn on the loop control in the playback controls of the composition.

→ Parameters:

mode (string) – mode

Composition. MapPath(path)

Expands path mappings in a path string.

Retruns a file or directory path with all path maps expanded into their literal path equivalents.

There are a number of default and user-specified path maps within Fusion that are intended to provide convenient ways to access common locations, or for flexibility in scripting. These can be any string, but often end in a colon, e.g. Fusion:, Comp:. They are expanded into a literal path as specified by the Path Maps preferences page.

However, many Fusion functions (and all Lua functions) require strictly literal paths. MapPath() can be used to easily convert any path map into a fully-expanded literal path. If there is no path map at the beginning of the path, MapPath() will just return the unchanged path.

In addition to expanding all global path maps like Fusion:MapPath(), Composition:MapPath() will also expand any path maps listed in the composition's Path Map preferences, and the following built-in defaults.

For multiple directories use MapPathSegments().

→ Python usage:
```python
print(composition.MapPath("Comp:footage\\file0000.tga"))
```

→ Lua usage:
```python
print(composition:MapPath("Comp:footage\\file0000.tga"))
```

→ Parameters:
```python
path (string) - path
```

→ Returns: mapped
→ Return type: string

Composition.MapPathSegments(path)

Expands all path mappings in a multipath.

MapPathSegments is similar to MapPath but works with strings that contain multiple directories. The return value is a table with all expanded paths while MapPath only expands the first segment and discards the rest.

→ Python usage:
```python
from pprint import pprint

pprint(comp.MapPathSegments("AllDocs:Settings;Fusion:Settings"))
```

```txt
# Returns
# {1.0: 'C:\Users\Public\Documents\Blackmagic Design\Fusion\Settings',
# 2.0: 'C:\Program Files\Blackmagic Design\Fusion 8\Settings'}
```

```txt
→ Lua usage:
dump(comp:MapPathSegments("AllDocs:Settings;Fusion:Settings"))
```

```txt
-- Returns table: 0x03800440
-- 1 = C:\Users\Public\Documents\Blackmagic Design\Fusion\Settings
-- 2 = C:\Program Files\Blackmagic Design\Fusion 8\Settings
```

```txt
→ Parameters:
path (string) – path
→ Returns: mapped
→ Return type: table
Composition.NetRenderAbort()
NetRenderAbort
Composition.NetRenderEnd
Composition.NetRenderStart
Composition.NetRenderTime
Composition.Paste([settings])
Pastes a tool from the Clipboard or a settings table.
settings if not supplied the Clipboard will be used.
→ Parameters:
settings (table) – settings
→ Returns: success
→ Return type: boolean
```

Composition.Play([reverse])
Starts interactive playback.
This function is used to turn on the play control in the playback controls of the composition.
reverse Play in reverse direction.

→ Parameters:
reverse (boolean) – reverse

Composition.Print()
Print in the context of the composition.
Useful to print to a console of a different composition.

→ Python usage:
new_comp = fu.NewComp()
new_comp.Print("Hello World")

→ Lua usage:
new_comp = fu:NewComp()
new_comp:Print("Hello World")

Composition.Redo(count)
Redo one or more changes to the composition.
The Redo function reverses the last undo event in Fusion.
Note that the value of count can be negative, in which case Redo will behave as an Undo, acting exactly as the Undo() function does.
count specifies how many redo events to trigger.

→ Parameters:
count (number) – count

Composition.Render([wait][, start][, end][, proxy][, hiq][, motionblur])
Note: This method is overloaded and has alternative parameters. See other definitions.
Start a render.
The Render function starts rendering the current composition. There are two forms for calling this function, one where the arguments are passed directly, and a second form where all the arguments are passed in a table. The table format is useful for declaring non-contiguous render ranges, such as the following one.

Returns true if the composition rendered successfully, nil if it failed to start or complete the render.

## Arguments

- wait_for_render: a true or false value indicating whether the script should wait for the render to complete, or continue processing once the render has begun.
- renderstart: the frame to start rendering at.
- renderend: the frame to stop rendering at.
- step: render 1 out of x frames. For example, a value of 2 here would render every second frame.
- proxy: scale all frames down by this factor, for faster rendering.
- hiQ: do high-quality rendering (defaults to true, if not specified).
- mblur: calculate motion-blur when rendering (defaults to true, if not specified).

## Table form

The table entries should be one or more of the following:

- Start: First frame to render. Default: Comp's render end setting.
- End: Final frame to render (inclusive). Default: Comp's render end setting.
- HiQ: Render in HiQ. Default true.
- RenderAll: Render all tools, even if not required by a saver. Default false.
- MotionBlur: Do motion blur in render, where specified in tools. Default true.

## SizeType

Resizes the output:

- 1: Custom (only used by PreviewSavers during a preview render)
- 0: Use prefs setting
- 1: Full Size (default)
- 2: Half Size
- 3: Third Size
- 4: Quarter Size

- Width: Width of result when doing a Custom preview (defaults to pref).
- Height: Height of result when doing a Custom preview (defaults to pref).
- KeepAspect: Maintains the frame aspect when doing a Custom preview. Defaults to Preview prefs setting.
- StepRender: Render only 1 out of every X frames ("shoot on X frames") or render every frame, default false.

Steps If step rendering, how many to step. Default 5.

Use Network Enables rendering with the network. Default false.

Groups Use these network slave groups to render on (when net rendering). Default "all".

Flags Number specifying render flags, usually 0 (the default). Most flags are specified by other means, but a value of 262144 is used for preview renders.

Tool Handle to a tool to specifically render. If this is specified only sections of the comp up to this tool will be rendered. eg you could specify comp.Saver1 to only render up to Saver1, ignoring any tools (including savers) after it. default nil.

FrameRange Describes which frames to render. (eg "1..100,150..180"), defaults to "Start".. "End" (above).

Wait Whether the script command will wait for the render to complete, or return immediately, default false.

→ Python usage:

```txt
# Render explicit render range, wait for the render.
composition.Render(True, 1, 100, 1) # wait, specify the render range
# Renders a non-contiguous frame range, and returns once the render has completed.
comp.Render({ "FrameRange": "1..10,20,30,40..50", "Wait": True })
# Render up to the Saver1 tool, but nothing further downstream.
comp.Render({"Tool": comp.Saver1})
```

→ Lua usage:

```txt
-- Render explicit render range, wait for the render.
composition:Render(true, 1, 100, 1) -- wait, specify the render range
-- Renders a non-contiguous frame range, and returns once the render has completed.
comp:Render({ FrameRange = "1..10,20,30,40..50", Wait = true })
-- Render up to the Saver1 tool, but nothing further downstream.
comp:Render({Tool = comp.Saver1})
```

→ Parameters:
- wait (boolean) – wait
- start (number) – start
- end (number) – end
- proxy (number) – proxy
- hiq (boolean) – hiq
- motionblur (boolean) – motionblur

→ Returns: success
→ Return type: boolean

## Composition.Render(settings)

**Note**: This method is overloaded and has alternative parameters. See other definitions.

Start a render.

The Render function starts rendering the current composition. There are two forms for calling this function, one where the arguments are passed directly, and a second form where all the arguments are passed in a table. The table format is useful for declaring non-contiguous render ranges, such as the following one.

Returns true if the composition rendered successfully, nil if it failed to start or complete the render.

## Arguments

- **wait_for_render** a true or false value indicating whether the script should wait for the render to complete, or continue processing once the render has begun.
- **renderstart** the frame to start rendering at.
- **renderend** the frame to stop rendering at.
- **step** render 1 out of x frames. For example, a value of 2 here would render every second frame.
- **proxy** scale all frames down by this factor, for faster rendering.
- **hiQ** do high-quality rendering (defaults to true, if not specified).
- **mblur** calculate motion-blur when rendering (defaults to true, if not specified)

## Table form

The table entries should be one or more of the following:

- **Start** First frame to render. Default: Comp's render end setting.
- **End** Final frame to render (inclusive). Default: Comp's render end setting.
- **HiQ** Render in HiQ. Default true.

RenderAll Render all tools, even if not required by a saver. Default false.

MotionBlur Do motion blur in render, where specified in tools. Default true.

SizeType Resizes the output:

-1 Custom (only used by PreviewSavers during a preview render)
0 Use prefs setting
1 Full Size (default)
2 Half Size
3 Third Size
4 Quarter Size

Width Width of result when doing a Custom preview (defaults to pref).

Height Height of result when doing a Custom preview (defaults to pref).

KeepAspect Maintains the frame aspect when doing a Custom preview. Defaults to Preview prefs setting.

StepRender Render only 1 out of every X frames ("shoot on X frames") or render every frame, default false.

Steps If step rendering, how many to step. Default 5.

UseNetwork Enables rendering with the network. Default false.

Groups Use these network slave groups to render on (when net rendering). Default "all".

Flags Number specifying render flags, usually 0 (the default). Most flags are specified by other means, but a value of 262144 is used for preview renders.

Tool Handle to a tool to specifically render. If this is specified only sections of the comp up to this tool will be rendered. eg you could specify comp.Saver1 to only render up to Saver1, ignoring any tools (including savers) after it. default nil.

FrameRange Describes which frames to render. (eg "1..100,150..180"), defaults to "Start"..End" (above).

Wait Whether the script command will wait for the render to complete, or return immediately, default false

→ Python usage:

```txt
# Render explicit render range, wait for the render.
composition.Render(True, 1, 100, 1) # wait, specify the render range
```

```txt
# Renders a non-contiguous frame range, and returns once the render has completed.
comp.Render({ "FrameRange": "1..10,20,30,40..50", "Wait": True })
# Render up to the Saver1 tool, but nothing further downstream.
comp.Render({"Tool": comp.Saver1})
```

→ Lua usage:

```txt
-- Render explicit render range, wait for the render.
composition:Render(true, 1, 100, 1) -- wait, specify the render range
```

```txt
-- Renders a non-contiguous frame range, and returns once the render has completed.
comp:Render({ FrameRange = "1..10,20,30,40..50", Wait = true })
```

```txt
-- Render up to the Saver1 tool, but nothing further downstream.
comp:Render({Tool = comp.Saver1})
```

→ Parameters:

settings (table) – settings

→ Returns: success
→ Return type: boolean

Composition.ReverseMapPath(mapped)

Collapses a path into best-matching path map.

Whereas MapPath() is used to expand any Fusion path maps within a pathname to get an ordinary literal path, ReverseMapPath() will perform the opposite process, and re-insert those path maps.

This is often useful if the path is to be stored for later usage (within a comp or script, for example). It allows the path to be used with the same meaning for another system or situation, where the literal location of the path may be different.

In addition to handling all the global path maps like Fusion:ReverseMapPath(), Composition:ReverseMapPath() also handles any path maps listed in the composition's Path Maps preferences page, as well as the built-in Comp: path map (see MapPath()).

Returns a path with the Fusion path map handles re-inserted wherever possible.

→ Parameters:
mapped (string) – mapped

→ Returns: path
→ Return type: string

Composition.RunScript(filename)

Run a script within the composition's script context.

Use this function to run a script in the composition environment. This is similar to launching a script from the comp's Scripts menu.

The script will be started with 'fusion' and 'composition' variables set to the Fusion and currently active Composition objects. The filename given may be fully specified, or may be relative to the comp's Scripts: path.

Fusion supports .py .py2 and .py3 extensions to differentiate python script versions.

→ Parameters:
filename (string) – filename

Composition.Save(filename)

Save the composition

This function causes the composition to be saved to disk. The compname argument must specify a path relative to the filesystem of the Fusion which is saving the composition. In other words - if system 'a' is using the Save() function to instruct a Fusion on system 'b' to save a composition, the path provided must be valid from the perspective of system 'b'.

filename is the complete path and name of the composition to be saved.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Composition.SaveAs()

Prompt user with a Save As dialog box to save the composition.

Composition.SaveCopyAs()

Prompt user with a Save As dialog box to save the composition as copy.

Composition.SetActiveTool(tool)

Set the currently active tool.

This function will set the currently active tool to one specified by script. It can be read with ActiveTool.

To deselect all tools, omit the parameter or use nil.

Note that ActiveTool also means the tool is selected, while selected tools are not automatically Active. Only one tool can be Active at a time. To select tools use FlowView:Select().

→ Parameters:
tool (Tool) – tool

Composition.SetData(name, value)

Set custom persistent data.

name name of the data. This name can be in "table.subtable" format, to allow persistent data to be stored within subtables.

value to be recorded in the object's persistent data. It can be of almost any type.

Persistent data is a very useful way to store names, dates, filenames, notes, flags, or anything else, in such a way that they are permanently associated with this instance of the object, and are stored along with the object using SetData(), and can be retrieved at any time with GetData().

The method of storage varies by object: SetData() called on the Fusion app itself will save its data in the Fusion.pref file, and will be available whenever that copy of Fusion is running. Calling SetData() on any object associated with a Composition will cause the data to be saved in the .comp file, or in any settings files that may be saved directly from that object. Some ephemeral objects that are not associated with any composition and are not otherwise saved in any way, may not have their data permanently stored at all, and the data will only persist as long as the object itself does.

→ Python usage:
```python
from pprint import pprint
from datetime import datetime
tool = comp.ActiveTool
tool.SetData("Modified.Author", fusion.GetEnv("USERNAME"))
tool.SetData("Modified.Date", str(datetime.now()))
pprint(tool.GetData("Modified"))
```

→ Lua usage:
```txt
tool:SetData("Modified.Author", fusion:GetEnv("USERNAME"))
tool:SetData("Modified.Date", os.date())
dump(tool.GetData("Modified"))
```

→ Parameters:
name (string) – name
value ((number|string|boolean|table)) – value

Composition.SetPrefs(prefname, val)

Note: This method is overloaded and has alternative parameters. See other definitions.

Set preferences from a table of attributes.

The SetPrefs function can be used to specify the values of virtually all preferences in Fusion. Its can take a table of values, identified by name, or a single name and value.

The table provided as an argument should have the format [prefs_name] = value. Subtables are allowed.

It is possible to set a preference that does not exist. For example, setting fusion:SetPrefs ((Comp.FrameFormat.Stuff = "Bob")) will create a new preference which will be thereafter preserved in the Fusion preferences file.

Returns false if any of the arguments provided to it are invalid, and true otherwise. Note that the function will still return true if an attempt is made to set a preference to an invalid value. For example, attempting to setting the FPS to "Bob" will fail, but the function will still return true.

→ Python usage:
```python
comp.SetPrefs({ "Comp.Transport.FrameStep":5, "Comp.FrameFormat.AspectX":2 })
comp.SetPrefs("Comp.Interactive.BackgroundRender", True)
```

→ Lua usage:
```python
comp:SetPrefs({ ["Comp.Unsorted.GlobalStart"]=0, ["Comp.Unsorted.GlobalEnd"]=100 })
comp:SetPref("Comp.Interactive.BackgroundRender", true)
```

→ Parameters:
prefname (string) – prefname
val (value) – val

Composition.SetPrefs(prefs)

Note: This method is overloaded and has alternative parameters. See other definitions.

Set preferences from a table of attributes.

The SetPrefs function can be used to specify the values of virtually all preferences in Fusion. Its can take a table of values, identified by name, or a single name and value.

The table provided as an argument should have the format [prefs_name] = value. Subtables are allowed.

It is possible to set a preference that does not exist. For example, setting fusion: SetPrefs((Comp.FrameFormat.Stuff = "Bob")) will create a new preference which will be thereafter preserved in the Fusion preferences file.

Returns false if any of the arguments provided to it are invalid, and true otherwise.

Note that the function will still return true if an attempt is made to set a preference to an invalid value. For example, attempting to setting the FPS to "Bob" will fail, but the function will still return true.

→ Python usage:

```python
comp.SetPrefs({ "Comp.Transport.FrameStep":5, "Comp.FrameFormatAspectX":2 })
comp.SetPrefs("Comp.Interactive.BackgroundRender", True)
```

→ Lua usage:

```python
comp:SetPrefs({ ["Comp.Unsorted.GlobalStart"]=0, ["Comp.Unsorted.GlobalEnd"]=100 })
comp:SetPref("Comp.Interactive.BackgroundRender", true)
```

→ Parameters:

prefs (table) – prefs

Composition.StartUndo(name)

Start an undo event.

The StartUndo() function is always paired with an EndUndo() function. Any changes made to the composition by the lines of script between StartUndo() and EndUndo() are stored as a single Undo event.

Changes captured in the undo event can be undone from the GUI using CTRL-Z, or the Edit menu. They can also be undone from script, by calling the Undo function.

Should be used sparingly, as the user (or script) will have no way to undo the preceding commands.

name specifies the name displayed in the Edit/Undo menu of the Fusion GUI a string containing the complete path and name of the composition to be saved.

Actual changes must be made to the composition (forcing a "dirty" event) before the undo will be added to the stack.

→ Python usage:

```python
composition.StartUndo("Add some tools")
bg1 = comp.Background()
pl1 = comp.Plasma()
mg1 = comp.Merge({ "Background": bg1, "Foreground": pl1 })
composition.EndUndo(True)
```

→ Lua usage:

```python
composition:StartUndo("Add some tools")
bg1 = Background{}
pl1 = Plasma{}
mg1 = Merge{ Background = bg1, Foreground = pl1 }
composition:EndUndo(true)
```

→ Parameters:

name (string) – name

Composition.Stop()
Stops interactive playback.

Use this function in the same way that you would use the Stop button in the composition's playback controls.

Composition.Undo(count)
Undo one or more changes to the composition.

The Undo function triggers an undo event in Fusion. The count argument determines how many undo events are triggered.

Note that the value of count can be negative, in which case Undo will behave as a Redo, acting exactly as the Redo() function does.

count specifies how many undo events to trigger.

→ Parameters:

count (number) – count

Composition.Unlock()

Unlock the composition.

The Unlock() function returns a composition to interactive mode. This allows Fusion to show dialog boxes to the user, and allows re-rendering in response to changes to the controls. Calling Unlock() will have no effect unless the composition has been locked with the Lock() function first.

It is often useful to surround a script with Lock() and Unlock(), especially when adding tools or modifying a composition. Doing this ensures Fusion won't pop up a dialog to ask for user input, e.g. when adding a Loader, and can also speed up the operation of the script since no time will be spent rendering until the comp is unlocked.

→ Python usage:

```txt
comp.Lock()
# Will not open the file dialog, since the composition is locked
my_loader = comp.Loader()
comp.Unlock()
```

→ Lua usage:

```txt
comp:Lock()
-- Will not open the file dialog, since the composition is locked
my_loader = Loader()
comp:Unlock()
```

Composition.UpdateViews()

UpdateViews
