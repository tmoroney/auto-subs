> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# PlainInput

class PlainInput
Parent class: Link
Represents an Input.

PlainInput Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  INPS_Name | string | The full name of this input.  |
|  INPS_ID | string | The script ID of this input.  |
|  INPS_DataType | string | The type of Parameter (e.g. Number, Point, Text, Image) this input accepts.  |
|  INPS_StatusText | string | The text shown on the status bar on mouse hover.  |
|  INPB_External | boolean | Whether this input can be animated or connected to a tool or modifier.  |
|  INPB_Active | boolean | This input's value is used in rendering.  |
|  INPB_Required | boolean | The tool's result requires a valid Parameter from this input.  |
|  INPB_Connected | boolean | The input is connected to another tool's Output.  |
|  INPI_Priority | integer | Used to determine the order in which the tool's inputs are fetched.  |
|  INPID_InputControl | string | The ID of the type of tool window control used by the input.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  INPID_PreviewControl | string | The ID of the type of display view control used by the input.  |
|  INPB_Disabled | boolean | The input will not accept new values.  |
|  INPB_DoNotifyChanged | boolean | The tool is notified of changes to the value of the input.  |
|  INPB_Integer | boolean | The input rounds all numbers to the nearest integer.  |
|  INPI_NumSlots | integer | The number of values from different times that this input can fetch at once.  |
|  INPB_ForceNotify | boolean | The tool is notified whenever a new parameter arrives, even if it is the same value.  |
|  INPB_InitialNotify | boolean | The tool is notified at creation time of the initial value of the input.  |
|  INPB_Passive | boolean | The value of this input will not affect the rendered result, and does not create an Undo event if changed.  |
|  INPB_InteractivePassive | boolean | The value of this input will not affect the rendered result, but it can be Undone if changed.  |
|  INPN_MinAllowed | number | Minimum allowed value - any numbers lower than this value are clipped.  |
|  INPN_MaxAllowed | number | Maximum allowed value - any numbers higher than this value are clipped.  |
|  INPN_MinScale | number | The lowest value that the input's control will normally display.  |
|  INPN_MaxScale | number | The highest value that the input's control will normally display.  |
|  INPI_IC_ControlPage | integer | Determines which tab of a tool's control window that the input's control is displayed on.  |
|  INPI_IC_ControlGroup | integer | When multiple inputs share a single compound window control, they must all have the same Control Group value.  |
|  INPI_IC_ControlID | integer | When multiple inputs share a single compound window control, they must all have different Control ID values.  |

# Methods

PlainInput.ConnectTo()

Note: This method is overloaded and has alternative parameters. See other definitions.

Connect the Input to an Output.

Note that ConnectTo is not needed to connect inputs and outputs. Setting an input equal to an output behaves the same.

out is equal to an output of some sort that will be connected to the input that the function is run on. Will disconnect the input from any outputs if connected to a nil value.

→ Python usage:

```python
mybg = comp.Background()
myblur = comp.Blur()

# Connect
myblur.Input.ConnectTo(mybg.Output)
# Disconnect
myblur.Input.ConnectTo()

# Now the same with the = operator
# Connect
myblur.Input = mybg.Output
# Disconnect
myblur.Input = None
```

→ Lua usage:

```python
mybg = Background()
myblur = Blur()

-- Connect
myblur.Input:ConnectTo(mybg.Output)
-- Disconnect
myblur.Input:ConnectTo()
```

-- Now the same with the = operator
-- Connect
myblur.Input = mybg.Output
-- Disconnect
myblur.Input = nil

→ Returns: success
→ Return type: boolean

PlainInput.ConnectTo(out)

Note: This method is overloaded and has alternative parameters. See other definitions.

Connect the Input to an Output.

Note that ConnectTo is not needed to connect inputs and outputs. Setting an input equal to an output behaves the same.

out is equal to an output of some sort that will be connected to the input that the function is run on. Will disconnect the input from any outputs if connected to a nil value.

→ Python usage:

```python
mybg = comp.Background()
myblur = comp.Blur()

# Connect
myblur.Input.ConnectTo(mybg.Output)
# Disconnect
myblur.Input.ConnectTo()

# Now the same with the = operator
# Connect
myblur.Input = mybg.Output
# Disconnect
myblur.Input = None
```

→ Lua usage:

```txt
mybg = Background()
myblur = Blur()

-- Connect
myblur.Input:ConnectTo(mybg.Output)
-- Disconnect
myblur.Input:ConnectTo()

-- Now the same with the = operator
-- Connect
myblur.Input = mybg.Output
-- Disconnect
myblur.Input = nil
```

→ Parameters:

out (Output) – out

→ Returns: success
→ Return type: boolean

PlainInput.GetConnectedOutput()

Returns the output that this input is connected to.

Note by design an Input can only be connected to a single Output, while an Output might be branched and connected to multiple Inputs.

→ Returns: out
→ Return type: Output

PlainInput.GetExpression()

Returns the expression string shown within the Input's Expression field, if any, or nil if not.

Simple expressions can be very useful for automating the relationship between controls, especially in macros and commonly-used comps.

PlainInput.GetKeyFrames()

Return a table of all keyframe times for this input. If a tool control is not animated with a spline this function will return nil.

The GetKeyFrames() function is used to determine what frames of an input have been keyframed on a spline. It returns a table that shows at what frames the user has defined key frames for the input.

→ Returns: keyframes
→ Return type: table

PlainInput.HideViewControls(hide)

Hides or shows the view controls for this input.

Use this function to hide or expose a view control in the display view.

hide if set or true then hide the controls else show them.

→ Python usage:

```txt
# Hide Center position transform controls
comp.Transform1.Center.HideViewControls()
```

```txt
# Show Center position transform controls
comp.Transform1.Center.HideViewControls(False)
```

→ Lua usage:

```txt
-- Hide Center position transform controls
Transform1.Center:HideViewControls()
```

```txt
-- Show Center position transform controls
Transform1.Center:HideViewControls(false)
```

→ Parameters:

hide (boolean) – hide

PlainInput.HideWindowControls(hide)

Hides or shows the window controls for this input.

Use this function to hide or expose a window control in the tool properties window. For instance, this could be used to hide all gamma controls on Brightness / Contrasts to prevent user manipulation.

hide if set or true then hide the controls else show them.

→ Python usage:

```txt
# Hide Center from properties
comp.Transform1.Center.HideWindowControls()
# Show Center in properties
comp.Transform1.Center.HideWindowControls(False)
```

→ Lua usage:

```txt
-- Hide Center from properties
Transform1.Center:HideWindowControls()
-- Show Center in properties
Transform1.Center:HideWindowControls(false)
```

→ Parameters:

hide (boolean) – hide

PlainInput.SetExpression()

This function reveals the expression field for the Input, and sets it to the given string.

Simple expressions can be very useful for automating the relationship between controls, especially in macros and commonly-used comps.

→ Python usage:

```txt
# Make Lift and Gamma relate to Gain
comp.BrightnessContrast1.Lift.SetExpression("Gain * 0.7")
comp.BrightnessContrast1.Gamma.SetExpression("Gain * 0.4")
```

→ Lua usage:

```txt
-- Make Lift and Gamma relate to Gain
BrightnessContrast1.Lift:SetExpression("Gain * 0.7")
BrightnessContrast1.Gamma:SetExpression("Gain * 0.4")
```

PlainInput.ViewControlsVisible()
Returns the visible state of the view controls for this input.
→ Returns: hidden
→ Return type: boolean

PlainInput.WindowControlsVisible()
Returns the visible state of the window controls for this input.
→ Returns: hidden
→ Return type: boolean
