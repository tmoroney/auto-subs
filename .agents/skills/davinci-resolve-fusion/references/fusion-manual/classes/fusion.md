> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Fusion

class Fusion

Parent class: Object

Handle to the application.

Fusion Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  FUSIONS_FileName | string | The path to the Fusion.exe file.  |
|  FUSIONS_Version | string | The version of FUSION that we are connected to, in either string (FUSION_Version) or numeric (FUSIONI_VersionHi, FUSIONI_VersionLo) format.  |
|  FUSIONI_SerialHi | integer | The serial number of the Fusion license that we are connected to.  |
|  FUSIONI_SerialLo  |   |   |
|  FUSIONS_MachineType | string | The type (OS and CPU) of machine.  |
|  FUSIONI_NumProcessors | integer | The number of processors present in the machine running Fusion.  |
|  FUSIONB_IsManager | boolean | Indicates if this Fusion is currently a render master.  |
|  FUSIONI_MemoryLoad | integer | The current Memory load percentage of the machine, from 0 to 100.  |
|  FUSIONI_PhysicalRAMTotalMB | integer | The total amount of physical RAM, in MB.  |
|  FUSIONI_PhysicalRAMFreeMB | integer | The amount of physical RAM free, in MB.  |
|  FUSIONI_VirtualRAMTotalMB | integer | The total amount of virtual RAM, in MB.  |
|  FUSIONI_VirtualRAMUsedMB | integer | The total amount of virtual RAM in use, in MB.  |
|  FUSIONB_IsPost | boolean | Indicates if this Fusion is a Post license.  |
|  FUSIONB_IsDemo | boolean | Indicates if this Fusion is a Demo license.  |
|  FUSIONB_IsRenderNode | boolean | Indicates if this Fusion is a Render Node license.  |
|  FUSIONH_CurrentComp | handle | Returns a handle to the current composition that has the focus in Fusion.  |
|  FUSIONI_VersionHi | integer |   |
|  FUSIONI_VersionLo  |   |   |

→ Python usage:

```python
# Get basic connection to fusion.
fu = bmd.scriptapp("Fusion")
```

→ Lua usage:

```python
-- Get basic connection to fusion.
fu = fu or Fusion()
```

## Members

Fusion.Bins

Bins (read-only).

→ Getting:

bins = Fusion.Bins - (Bins)

Fusion.Build

Returns the build number of the current Fusion instance.

→ Getting:

build = Fusion.Build - (number)

Fusion.CacheManager

The Global Cache Manager (read-only).

→ Getting:

cm = Fusion.CacheManager - (CacheManager)

Fusion.CurrentComp

Represents the currently active composition (read-only).

→ Getting:

comp = Fusion.CurrentComp - (Composition)

Fusion.FileLogging()

Are Fusion logs enabled.

Returns true if Fusion was started with a /log filepath argument.

Fusion.FontManager

The Global Font Manager (read-only).

→ Getting:

fm = Fusion.FontManager - (FontList)

Fusion.HotkeyManager
The Global Hotkey Manager (read-only).
→ Getting:
hkm = Fusion.HotkeyManager – (HotkeyManager)

Fusion.MenuManager
The Global Menu Manager (read-only).
→ Getting:
mm = Fusion.MenuManager – (MenuManager)

Fusion.QueueManager
The global render manager for this instance of Fusion (read-only).
→ Getting:
qm = Fusion.QueueManager – (QueueManager)

Fusion.RenderManager
The global render manager for this instance of Fusion (read-only).
→ Getting:
qm = Fusion.RenderManager – (QueueManager)

Fusion.Version
Returns the version of the current Fusion instance.
→ Getting:
ver = Fusion.Version – (number)

# Methods

Fusion.AllowNetwork()
AllowNetwork

Fusion.ClearFileLog()
Clears the log if started with the /log argument.

Fusion.CreateFloatingView()
Creates a new FloatView.

Fusion.CreateMail()
Returns an object handle that can be manipulated with other mail related functions.
Within Fusion there are a number of scripts that can be used to send information to people through email. This could be utilized to notify a user when their render is complete, or if any errors have occurred with a render.

→ Python usage:

```python
mail = fusion.CreateMail()
mail.AddRecipients("vfx@studio.com, myself@studio.com")
mail.SetSubject("Render Completed")
mail.SetBody("The job completed.")
ok,ermsg = mail.SendTable().values()
print(ok)
print(ermsg)
```

→ Lua usage:

```python
mail = fusion.CreateMail()
mail.AddRecipients("vfx@studio.com, myself@studio.com")
mail.SetSubject("Render Completed")
mail.SetBody("The job completed.")
ok,ermsg = mail:Send()
print(ok)
print(ermsg)
```

→ Returns: mail
→ Return type: MailMessage

Fusion.DumpCgObjects(filename)
Writes the state of all current Cg shaders to the given file.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Fusion.DumpGLObjects(filename)

Writes the state of all current OpenGL objects to the given file.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Fusion.DumpGraphicsHardwareInfo(filename)

Writes the information of the graphics hardware to the given file.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Fusion.DumpOpenCLDeviceInfo(filename)

Writes the information of the OpenCL device to the given file.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

Fusion.execute()

Executes a script string for the fusion instance.

See Composition:Execute().

Fusion.FindReg(id[, type])

Finds a registry object by name.

An optional type restricts the search. Some valid type constants include

→ CT_Tool
→ CT_Filter
→ CT_FilterSource
→ CT_ParticleTool
→ CT_ImageFormat

Returns nil / None if no match is found.

→ Python usage:

```python
from pprint import pprint
reg = fusion.FindReg("Loader")
pprint(reg.GetAttrs())
Lua usage:
```

→ Lua usage:

```python
reg = fusion:FindReg("Loader")
dump(reg:GetAttrs())
```

→ Parameters:

id (string) – id
type (number) – type

→ Returns: reg
→ Return type: Registry

Fusion.GetAppInfo()

Returns a table containing information about the current application's name, executable, version, and build number.

Fusion.GetArgs()

Get command line arguments.
Returns Fusion's command line arguments as a table.

→ Returns: args
→ Return type: table

Fusion.GetCPULoad()

Retrieves the current CPU load of the system.
Returns the current CPU load as a percentage between 0 and 100.

Fusion.GetClipboard()

Retrieves the tool(s) on the clipboard, as tables and as ASCII text.
Returns a string or table of the current contents of the clipboard, or nil if empty.

→ Returns: cliptbl
→ Return type: table

Fusion.GetCompList()
Retrieves a table of all compositions currently present.
→ Returns: complist
→ Return type: table

Fusion.GetCurrentComp()
Returns the currently active composition.
→ Returns: comp
→ Return type: Composition

Fusion.GetData([name])
Get custom persistent data.
See Composition:GetData().

→ Parameters:
name (string) – name
→ Returns: value
→ Return type: (number|string|boolean|table)

Fusion.GetEnv(name)
Retrieve the value of an environment variable.
Returns the value of an environment variable on the machine running Fusion. This function is identical to the global os.getenv() function, except that it runs in the context of the Fusion instance, so if the Fusion instance points to a remote copy of Fusion the environment variable will come from the remote machine.

→ Parameters:
name (string) – name
→ Returns: value
→ Return type: string

Fusion.GetGlobalPathMap([built_ins][, defaults])
Returns a table of all global path maps.

→ Parameters:
built_ins (boolean) – built_ins
defaults (boolean) – defaults
→ Returns: map
→ Return type: table

Fusion.GetMainWindow()

Get the window handle for fusion.

Fusion.GetPrefs([prefname][, exclude-defaults])

Retrieve a table of preferences.

This function is useful for getting the full table of global preferences, or a subtable, or a specific value.

If the argument is omitted all preferences will be returned.

Returns a table of preferences, or a specific preference value.

→ Python usage:

```python
from pprint import pprint
pprint(fusion.GetPrefs("Global.Paths.Map"))
print(fusion.GetPrefs("Global.Controls.GrabDistance"))
```

→ Lua usage:

```python
dump(fusion:GetPrefs("Global.Paths.Map"))
print(fusion:GetPrefs("Global.Controls.GrabDistance"))
```

→ Parameters:

```txt
prefname (string) - prefname
exclude-defaults (boolean) - exclude-defaults
```

→ Returns: prefs
→ Return type: table

Fusion.GetPreviewList()

Retrieves a table of global previews.

This function returns a list of preview objects currently available to the Fusion object. The Composition:GetPreviewList function is similar, but it will not return floating views, like this function does.

→ Returns: previewlist
→ Return type: table

Fusion.GetRegAttrs(id[, type])

Retrieve information about a registry ID.

The GetRegAttrs() function will return a table with the attributes of a specific individual registry entry in Fusion. The only argument is the ID, a unique numeric identifier possessed

by each entry in the registry. The ID identifiers for each registry item can be obtained from fusion:GetRegList(), fusion:FindRegID(), and tool:GetID() functions.

Registry attributes are strictly read only, and cannot be modified in any way.

→ Python usage:

```python
from pprint import pprint

# Dump RegAttrs for the Active tool,
# or prints message if nothing is Active.

pprint(comp.ActiveTool and
fusion.GetRegAttrs(comp.ActiveTool.ID) or
"Please set an ActiveTool first.")
```

→ Lua usage:

```txt
-- Dump RegAttrs for the Active tool,
-- or prints message if nothing is Active.
dump(comp.ActiveTool and
fusion:GetRegAttrs(comp.ActiveTool.ID) or
"Please set an ActiveTool first.")
```

→ Parameters:

id (string) – id

type (number) – type

→ Returns: attrs
→ Return type: table

Fusion.GetRegList(typemask)

Retrieve a list of all registry objects known to the system.

The Fusion registry stores information about the configuration and capabilities of a particular installation of Fusion. Details like which file formats are supported, and which tools are installed are found in the registry. Note that this is NOT the same thing as the operating system registry, the registry accessed by this function is unique to Fusion.

The only argument accepted by GetRegAttrs is a mask constant, which is used to filter the registry for specific registry types. The constants represent a particular type of registry entry, for example CT_Any will return all entries in the registry, while CT_Source will only return entries describing tools from the source category of tools (Loader, Plasma, Text...). A complete list of valid constants can be found here.

Returns a table, which contains a list of the Numeric ID values for each registry entry. The numeric ID is constant from machine to machine, e.g. the numeric ID for the QuickTime format would be 1297371438, regardless of the installation or version of Fusion.

These ID's are used as arguments to the GetRegAttrs() function, which provides access to the actual values stored in the specific registry setting.

typemask a predefined constant that determines the type of registry entry returned by the function.

Some valid Mask constants:

- CT_Tool all tools
- CT_Mask mask tools only
- CT_SourceTool creator tools (images/3D/particles) all of which don't require an input image
- CT_ParticleTool Particle tools
- CT_Modifier Modifiers
- CT_ImageFormat ImageFormats
- CT_View Different sections of the interface
- CT_GLViewer All kinds of viewers
- CT_PreviewControl PreviewControls in the viewer
- CT_InputControl Input controls
- CT_BinItem Bin items

→ Python usage:

```python
from pprint import pprint

# this example will print out all of the

# image formats supported by this copy

# of Fusion
```

```python
reg = fusion.GetRegList(comp.CT_ImageFormat)
reg["Attrs"] = {}
for i in range(1, len(reg)):
reg["Attrs"][i] = fusion.GetRegAttrs(reg[i].ID)
name = reg["Attrs"][i]["REGS_MediaFormat_FormatName"]
if name == None:
name = reg["Attrs"][i]["REGS_Name"]
if reg["Attrs"][i]["REGB_MediaFormat_CanSave"] == True:
print(name)
else:
print(name + " (Cannot Save)")
```

→ Lua usage:

```lua
-- this example will print out all of the
-- image formats supported by this copy
-- of Fusion

reg = fusion:GetRegList(CT_ImageFormat)
reg.Attrs = {}

for i = 1, #reg do
reg.Attrs[i] = fusion:GetRegAttrs(reg[i].ID)
name = reg.Attrs[i].REGS_MediaFormat_FormatName

if name == nil then
name = reg.Attrs[i].REGS_Name
end
```

```lua
--dump(reg.Attrs[i])
if reg.Attrs[i].REGB_MediaFormat_CanSave == true then
print(name)
else
print(name .. " (Cannot Save)")
end
end
```

→ Parameters:
typemask (number) – typemask

→ Returns: realist
→ Return type: table

Fusion.GetRegSummary(typemask[, hidden])

Retrieve a list of basic info for all registry objects known to the system.

This function is useful for getting the full table of global preferences, or a subtable, or a specific value.

Returns a table containing a summary of the Name, ID, ClassType, and OplconString of every item in the registry. Useful for returning a lightweight version of the information presented by Fusion:GetRegList.

→ Parameters:
typemask (number) – typemask
hidden (boolean) – hidden

→ Returns: regattrs
→ Return type: table

Fusion.LoadComp(filename[, quiet][, autoclose][, hidden])

Note: This method is overloaded and has alternative parameters. See other definitions.

Loads an existing composition.

auto-close a true or false value to determine if the composition will close automatically when the script exits. Defaults to false.

hidden if this value is true, the comp will be created invisibly, and no UI will be available to the user. Defaults to false.

Returns a handle to the opened composition.

→ Parameters:
- filename (string) – filename
- quiet (boolean) – quiet
- autoclose (boolean) – autoclose
- hidden (boolean) – hidden

→ Returns: comp
→ Return type: Composition

Fusion.LoadComp(filename, options)

Note: This method is overloaded and has alternative parameters. See other definitions.

Loads an existing composition.

auto-close a true or false value to determine if the composition will close automatically when the script exits. Defaults to false.

hidden if this value is true, the comp will be created invisibly, and no UI will be available to the user. Defaults to false.

Returns a handle to the opened composition.

→ Parameters:
- filename (string) – filename
- options (table) – options

→ Returns: comp
→ Return type: Composition

Fusion.LoadComp(savedcomp, options)

Note: This method is overloaded and has alternative parameters. See other definitions.

Loads an existing composition.

auto-close a true or false value to determine if the composition will close automatically when the script exits. Defaults to false.

hidden if this value is true, the comp will be created invisibly, and no UI will be available to the user. Defaults to false.

Returns a handle to the opened composition.

→ Parameters:
- savedcomp (MemBlock) – savedcomp
- options (table) – options

→ Returns: comp
→ Return type: Composition

Fusion.LoadPrefs([filename][, mastername])

Reloads all current global preferences.

Reloads all global preferences from the specified file and (optionally) an overriding master prefs file.

→ Parameters:
- filename (string) – filename
- mastername (string) – mastername

→ Returns: success
→ Return type: boolean

Fusion.LoadRecentComp(index[, quiet][, autoclose][, hidden])

Loads an composition from the recent file list.

index the most recent composition is 1. The index is the same as in the Recent Files menu.

auto-close a true or false value to determine if the composition will close automatically when the script exits. Defaults to false.

hidden if this value is true, the comp will be created invisibly, and no UI will be available to the user. Defaults to false.

→ Parameters:
- index (integer) – index
- quiet (boolean) – quiet
- autoclose (boolean) – autoclose
- hidden (boolean) – hidden

→ Returns: comp
→ Return type: Composition

Fusion.MapPath(path)

Expands path mappings in a path string.

See Comp:MapPath().

→ Python usage:
```
print(comp.MapPath("Fusion:"))
```

→ Lua usage:
```
print(MapPath("Fusion:"))
```

→ Parameters:
path (string) – path

→ Returns: mapped
→ Return type: string

Fusion.MapPathSegments(path)
Expands all path mappings in a multipath.
See Comp:MapPathSegments().

→ Parameters:
path (string) – path

→ Returns: mapped
→ Return type: table

Fusion.NewComp([quiet][, autoclose][, hidden])
Creates a new composition.
auto-close a true or false value to determine if the composition will close automatically when the script exits. Defaults to false.
hidden if this value is true, the comp will be created invisibly, and no UI will be available to the user. Defaults to false.

→ Parameters:
quiet (boolean) – quiet
autoclose (boolean) – autoclose
hidden (boolean) – hidden

→ Returns: comp
→ Return type: Composition

Fusion.OpenFile(filename, mode)
Open a file.
filename specifies the full path and name of the file to open
mode specifies the mode(s) of file access required, from a combination of the following constants:
FILE_MODE_READ Read access FILE_MODE_WRITE Write access FILE_MODE_UNBUFFERED Unbuffered access FILE_MODE_SHARED Shared access
Returns a file object or nil if the open fails.

→ Lua usage:

```txt
fusion:OpenFile([[c:\fusion.log]], FILE_MODE_READ)
```

```txt
line = f:ReadLine()
```

```txt
while line do
```

```txt
print(line)
```

```txt
line = f:ReadLine()
```

end

→ Parameters:

```txt
filename (string) - filename
```

```txt
mode (number) - mode
```

→ Returns: file
→ Return type: File

Fusion.OpenLibrary()
OpenLibrary

Fusion.QueueComp(filename[, start][, end][, group])

Note: This method is overloaded and has alternative parameters. See other definitions.

Queue a composition to be rendered locally.

The QueueComp function submits a composition from disk to the render manager. If the render start and end are not provided then the render manager will render the range saved with the composition. Otherwise these arguments will override the saved range.

Returns true if it succeeds in adding the composition to the Queue, and false if it fails.

filename a string describing the full path to the composition which is to be queued.

start a number which describes the first frame in the render range.

end a number which describes the last frame in the render range.

group specifies the slave group to use for this job.

Table form

Specifies the slave group to use for this job. The following keys are valid:

FileName The Comp to queue QueuedBy Who queued this comp Groups Slave groups to render on Start Render Start End Render End FrameRange Frame range string, used in place of start/end above RenderStep Render Step ProxyScale Proxy Scale to render at TimeOut Frame timeout

→ Python usage:

```txt
# QueueComp with additional options
fusion.QueueComp({
"FileName": "c:\example.comp",
"QueuedBy": "Bob Lloblaw",
"Start": 1,
"End": 25,
"Step": 5,
"ProxyScale": 2
})
# Specify a non-sequential frame range
fusion.QueueComp({
"FileName": "c:\example.comp",
"FrameRange": "1..10,20,30,40..50"
})
```

→ Lua usage:

```txt
-- QueueComp with additional options
fusion:QueueComp({
FileName = [[c:\example.comp]],
QueuedBy = "Bob Lloblaw",
Start = 1,
End = 25,
Step = 5,
ProxyScale = 2
})
```

```txt
-- Specify a non-sequential frame range
fusion:QueueComp({
FileName=[[c:\example.comp]],
FrameRange = "1..10,20,30,40..50"
})
```

→ Parameters:
- `lename (string)` – filename
- `start (number)` – start
- `end (number)` – end
- `group (string)` – group

→ Returns: job
→ Return type: RenderJob

## Fusion.QueueComp(args)

Note: This method is overloaded and has alternative parameters. See other definitions.

Queue a composition to be rendered locally.

The QueueComp function submits a composition from disk to the render manager. If the render start and end are not provided then the render manager will render the range saved with the composition. Otherwise these arguments will override the saved range.

Returns true if it succeeds in adding the composition to the Queue, and false if it fails.

filename a string describing the full path to the composition which is to be queued.

start a number which describes the first frame in the render range.

end a number which describes the last frame in the render range.

group specifies the slave group to use for this job.

## Table form

Specifies the slave group to use for this job. The following keys are valid:

FileName The Comp to queue QueuedBy Who queued this comp Groups Slave groups to render on Start Render Start End Render End FrameRange Frame range string, used in place of start/end above RenderStep Render Step ProxyScale Proxy Scale to render at TimeOut Frame timeout

→ Python usage:

```txt
# QueueComp with additional options
fusion.QueueComp({
"FileName": "c:\example.comp",
"QueuedBy": "Bob Lloblaw",
"Start": 1,
"End": 25,
"Step": 5,
"ProxyScale": 2
})
# Specify a non-sequential frame range
fusion.QueueComp({
"FileName": "c:\example.comp",
"FrameRange": "1..10,20,30,40..50"
})
```

→ Lua usage:

```txt
-- QueueComp with additional options
fusion:QueueComp({
FileName = [[c:\example.comp]],
QueuedBy = "Bob Lloblaw",
Start = 1,
End = 25,
Step = 5,
ProxyScale = 2
})
```

```txt
-- Specify a non-sequential frame range
fusion:QueueComp({
FileName=[[c:\example.comp]],
FrameRange = "1..10,20,30,40..50"
})
```

→ Parameters:
args (table) – args

→ Returns: job
→ Return type: RenderJob

Fusion.Quit(exitcode)
Quit Fusion.

The Quit command will cause the copy of Fusion referenced by the Fusion instance object to exit. The Fusion instance object will then be set to nil.

→ Parameters:
exitcode (number) – exitcode

Fusion.ReverseMapPath(mapped)
Collapses a path into best-matching path map.
See Composition:ReverseMapPath().

→ Parameters:
mapped (string) – mapped

→ Returns: path
→ Return type: string

Fusion.RunScript(filename)
Run a script within the Fusion's script context.
See Composition:RunScript().

→ Parameters:
filename (string) – filename

Fusion.SavePrefs([filename])
Saves all current global preferences.

→ Python usage:
```python
fusion.SetPrefs("Comp.AutoSave.Enabled", True)
fusion.SavePrefs()

```
→ Lua usage:
```python
fusion:SetPrefs("Comp.AutoSave.Enabled", true)
fusion.SavePrefs()
```

→ Parameters:
```txt
filename (string) – filename
```

Fusion.SetBatch()
SetBatch

Fusion.SetClipboard()
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the clipboard to contain the tool(s) specified by a table or as ASCII text.
Sets the system clipboard to contain the ASCII for tool(s) specified by a table or sets the clipboard to the text specified.

→ Returns: success
→ Return type: boolean

Fusion.SetClipboard()
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the clipboard to contain the tool(s) specified by a table or as ASCII text.
Sets the system clipboard to contain the ASCII for tool(s) specified by a table or sets the clipboard to the text specified.

→ Returns: success
→ Return type: boolean

Fusion.SetData(name, value)
Set custom persistent data.
See Composition:SetData().

→ Parameters:
```txt
name (string) – name
value ([number|string|boolean|table]) – value
```

Fusion.SetPrefs(prefname, val)

Note: This method is overloaded and has alternative parameters. See other definitions.

Set preferences from a table of attributes.

The SetPrefs function can be used to specify the values of virtually all preferences in Fusion. It can take a table of values, identified by name, or a single name and value.

The table provided as an argument should have the format [prefs_name] = value. Subtables are allowed.

→ Python usage:

```txt
fusion.SetPrefs({
"Global.Network.Mail.OnJobFailure": True,
"Global.Network.Mail.Recipients": "admin@studio.com"
})
fusion.SetPrefs("Global.Controls.AutoClose", False)
```

→ Lua usage:

```txt
fusion:SetPrefs({
["Global.Network.Mail.OnJobFailure"] = true,
["Global.Network.Mail.Recipients"] = "admin@studio.com"
})
fusion:SetPrefs("Global.Controls.AutoClose", false)
```

→ Parameters:

```txt
prefname (string) – prefname
val (value) – val
```

Fusion.SetPrefs(prefs)

Note: This method is overloaded and has alternative parameters. See other definitions.

Set preferences from a table of attributes.

The SetPrefs function can be used to specify the values of virtually all preferences in Fusion. Its can take a table of values, identified by name, or a single name and value.

The table provided as an argument should have the format [prefs_name] = value. Subtables are allowed.

→ Python usage:

```txt
fusion.SetPrefs({
"Global.Network.Mail.OnJobFailure": True,
"Global.Network.Mail.Recipients": "admin@studio.com"
})
fusion.SetPrefs("Global.Controls.AutoClose", False)
```

→ Lua usage:

```txt
fusion:SetPrefs({
["Global.Network.Mail.OnJobFailure"] = true,
["Global.Network.Mail.Recipients"] = "admin@studio.com"
})
fusion:SetPrefs("Global.Controls.AutoClose", false)
```

→ Parameters:

```txt
prefs (table) - prefs
```

Fusion.ShowAbout()

Display the About dialog.

Fusion.ShowPrefs([pageid][, showall][, comp])

Display the Preferences dialog.

→ Parameters:

```txt
pageid (string) - pageid
showall (boolean) - showall
comp (Composition) - comp
```

Fusion.ShowWindow(mode)

Show or Hide main window.

This function will show or hide the main window of Fusion. Note that you can only reshow the window after hiding it if you are using the command prompt to control Fusion.

→ Parameters:
mode (number) – mode

Fusion.Test()
Test

Fusion.ToggleBins()
Shows or hides the Bins window.

The ShowPrefs function will display the Preferences dialog. Optional arguments can be used to specify which page or panel of the preferences will be opened.

prefname name of the specific page (or panel) of the preferences to show. The name should be chosen from one of the following:

→ PrefsGeneral
→ Prefs3D
→ PrefsBinSecurity
→ PrefsBinServers
→ PrefsBins
→ PrefsDefaults
→ PrefsFlow
→ PrefsFrameFormat
→ PrefsEDLImport
→ PrefsLayout
→ PrefsLoader
→ PrefsMemory
→ PrefsNetwork
→ PrefsOpenCL
→ PrefsPathMap
→ PrefsPreview
→ PrefsQuickTime
→ PrefsScript
→ PrefsSplineViews
→ PrefsSplines
→ PrefsTimeline
→ PrefsTweaks
→ PrefsUI
→ PrefsDeckLink
→ PrefsView

→ Python usage:

```python
# Open Preferences at the view page
fu.ShowPrefs("PrefsView")
```

```python
# Print possible preframe for the current Fusion version
for v in fu.GetRegList(comp.CT_Prefs).values():
print(v.GetAttrs()["REGS_ID"])
```

→ Lua usage:

```txt
-- Open Preferences at the view page
fu:ShowPrefs("PrefsView")
```

```txt
-- Print possible preframe for the current Fusion version
for i,v in ipairs(fu:GetRegList(CT_Prefs)) do
print(v:GetAttrs().REGS_ID)
end
```

Fusion.ToggleRenderManager()

Shows or hides the Render Manager.

Fusion.ToggleUtility(id)

Shows or hides a Utility plugin.

→ Parameters:

id (string) – id
