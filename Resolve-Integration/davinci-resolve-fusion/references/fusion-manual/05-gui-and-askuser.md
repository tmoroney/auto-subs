> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Graphical User Interfaces

Although scripts can run in the background and output text to the Console often a graphical user interface is required. This way the logic of a script can be changed based on options set by the user. There are two options. For more complex user interfaces, Lua ships with the iup GUI library. Please refer to the documentation of the library, as its usage is beyond the scope of this document:

http://webserver2.tecgraf.puc-rio.br/iup/

The other option is a build-in dialog called AskUser.

# Ask User

A simple way to build and evaluate a dialog is called: comp:AskUser(name, {table of inputs}).

Each input is a table structured as follows :

```txt
{Input Name, Input Type, Options ...}
```

# Input Name (string, required)

This name is the index value for the controls value as set by the user (i.e., dialog.Control or dialog["Control Name"]). It is also the label shown next to the control in the dialog, unless the Name option is also provided for the control.

# Input Type (string, required)

A string value describing the type of control to display. Valid strings are FileBrowse, PathBrowse, Position, Slider, Screw, Checkbox, Dropdown, and Text. Each Input type has its own properties and optional values.

# Options (misc)

Different control types accept different options that determine how that control appears and behaves in the dialog.

All script execution stops until the user responds to the dialog by selecting OK or Cancel.

The returned table contains the responses from the user, or nil if the user canceled the dialog.

&gt; Note
&gt; This function can only be called interactively, command line scripts cannot use this function.

For example, if you wanted to display a dialog that requested a path from a user, you might use the following script:

```lua
ret = composition:AskUser("A Sample Dialog", { {"Select a Directory", "PathBrowse"} } )
dump(ret)
```

Several of the Options are common to several controls. For example, the name option can be used with any type of control, and the DisplayedPrecision option can be used with any control that displays and returns numeric values. The commonly used options for controls are:

→ Name (string)
This option can be used to specify a more reasonable name for this inputs index in the returned table than the one used as a label for the control.

→ Default (string)
The default value displayed when the control is first shown.

→ Min (integer)
Sets the minimum value allowed by the slider or screw control.

→ Max (numeric)
Sets the maximum value allowed by the slider or screw control.

→ DisplayedPrecision (numeric)
Use this option to set how much precision is used for numeric controls like sliders, screws and position controls. A value of 2 would allow two decimal places of precision - i.e., 2.10 instead of 2.105

→ Integer (boolean)
If true the slider or screw control will only allow integer (non decimal) values, otherwise the slider will provide full precision. Defaults to false if not specified.

# Control Types

The following table indicate types of control.

|  Text | Displays the Fusion textedit control, which is used to enter large amounts of text into a control. | Linear (integer) A number specifying how many lines of text to display in the control. Wrap (boolean) A true or false value that determines whether the text entered into the control will wrap to the next line when it reaches the end of the line. ReadOnly (boolean) If this option is set to true, the control will not allow any editing of the text within the control. Used for displaying non-editable information. FontName (string) The name of a truetype font to use when displaying text in this control. FontSize (numeric) A number specifying the font size used to display the text in this control.  |
| --- | --- | --- |
|  FileBrowse PathBrowse ClipBrowse | The FileBrowse input allows you to browse to select a file on disk, while the PathBrowse input allows you to select a directory. ClipBrowse is used to get sequences with their appropriate filters. | Save (boolean) Set this option to true if the dialog is used to select a path or file which does not yet exist (i.e. when selecting a filae to save to)  |
|  Slider | Displays a standard Fusion slider control. Labels can be set for the high and low ends of the slider using the following options. | LowName (string) The text label used for the low (left) end of the slider. HighName (string) The text label used for the high (right) end of the slider.  |
|  Checkbox | Displays a standard Fusion checkbox control. You can display several of these controls, next to each other using the NumAcross option | Default (numeric) The default state of the checkbox, use 0 to leave the checkbox deselected, or 1 to enabled the checkbox. Defaults to 0 if not specified. NumAcross (numeric) If the NumAcross value is set, the dialog will reserve space to display two or more checkboxes next to each other. The NumAcross value must be set for all checkboxes to be displayed on the same row. See examples below for more information.  |

|  Position | Displays a pair of edit boxes used to enter X & Y coordinates for a center control or other position value. The default value of this control is a table with two values, one for the X value and one for the Y. The control returns a table of values. | Default (table {x,y}) A table with two numeric entries specifying the value for the x and y coordinates.  |
| --- | --- | --- |
|  Screw | Displays the standard Fusion thumbnail or screw control. This control is almost identical to a slider in almost all respects except that its range is infinite, and so it is well suited for angle controls and other values without practical limits. |   |
|  Dropdown | Displays the standard Fusion drop down menu for selecting from a list of options. This control exposes and option call Options, which takes a table containing the values for the drop down menu. Note that the index for the Options table starts at 0, not 1 like is common in most FusionScript tables. So, if you wish to set a default for the first entry in a list, you would use Default=0, for the second Default=1, and so on | Default (num) A number specifying the index of the options table (below) to use as a default value for the drop down box when it is created. Default (table {string, string, string...}) A table of strings describing the values displayed by the drop down box.  |
|  Multibutton | Displays a Multibutton, where each option is drawn as a button. The same options are used like in a Dropdown. | Default (num) A number specifying the index of the options table (below) to use as a default value for the drop down box when it is created. Options (table {string, string, string...}) A table of strings describing the values displayed as buttons.  |

This example shows a dialog that contains most of the various control types:

```batch
composition_path = composition:GetAttrs().COMPS_FileName
```

msg = "This dialog is only an example. It does not actually do anything,"..

"so you should not expect to see a useful result from running this script."

```txt
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

Note

In Python, make sure to create a dictionary with proper indices starting with 1 as explained in the Chapter about Python. For Example:

```javascript
dialog = {1: {1: "dlgDir", "Name": "Select a Directory", 2: "PathBrowse"}, 2: {1: "dlgDir", "Name": "A Check Box", 2: "Checkbox", "Default": 1}} ret = composition.AskUser("A simple dialog", dialog)
```

![img-13.jpeg](img-13.jpeg)

Scripting Reference
