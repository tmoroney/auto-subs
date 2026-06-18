> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Fusion's Object Model

For a better understanding of FusionScript, it is worth looking under the hood of Fusion's object model. Although FusionScript and the following overview is a great simplification of the real application, it will help us to navigate around the application within the scripting API.

## Overview

Fusion is composed of different objects with individual types. One possible object type is an Operator, also known as Tool. Each Operator might have a couple of Links, being Input or Output objects, that may be represented in GUI inside the properties view. The reference to the Composition is also a special object type, as is Fusion itself. Even FileTypes, which represent file formats that can be read by a Loader, are objects.

Most objects contain a set of Attributes that represent the state of the object and it capabilities. Additionally they may contain Data, a special form of metadata.

Each object must be registered in an internal registry with its particular type and function. This way information about every object or tool can be read from the registry before an instance has been created.

While we do can access most of the information from the registry, FusionScript deals most of the time with the instances in the Application, Composition, Tool, Inputs etc.

## Common Object Dependencies

This chapter pictures the common object dependencies in Fusion. This means that the users experiences the relations of objects similar to these dependencies, while the underlying implementation and exposed object hierarchy may look different.

This is only an excerpt of the most common objects a user is likely to use and may help to picture the interaction with Fusion from a user's point of view:

## Fusion

→ Composition (collection)
→ Tool (collection)
→ Inputs (collection)

Some being MainInputs = Input connections on the FlowView

→ Type: Sets and gets type
Text
Number
Image
Data3D

→ Outputs (collection)

Some being MainOutputs = Output connections on the FlowView

→ Type: Sets and gets type

Text

Number

Image

Data3D

other

While this view is highly simplified and neglects many aspects and features of the interface—like LUT, Viewers etc.—it is at the core the data that a user deals with most of the time.

## Fusion Instance

The starting point for all access is a Fusion object. A Fusion object represents a running Fusion instance. It can create, open, and close compositions, stores application wide settings and preferences or persistent metadata. Fusion is able to open and manage multiple compositions from one Fusion instance. The graphical user interface represents these with a Tab-Layout. In scripting all currently loaded compositions are accessible with fu:GetCompList(). The currently active Composition can be accessed via fu.CurrentComp or fu:GetCurrentComp(). To load a composition use fu:LoadComp(path, locked) or create an empty composition using fu:NewComp(locked, auto-close, hidden). You can also quit the Fusion instance by using fu:Quit(). If you are running the script from within Fusion it still will be executed. In reality the script is not bound to the Fusion instance. Instead a FuScript application is spawned that evaluates the scripts and communicates to the running Fusion instance. If your script exits, eventually the FuScript instance will also be stopped. This obviously also applies if running scripts from an external scripting environment as explained in the earlier chapter.

## Composition Instance

A Composition may also store settings, attributes, and persistent metadata. While the Fusion instance holds Global Settings, each composition may have an individual set of settings. This behaviour is mimicked in the preferences dialog, where either global settings for each new composition, or individual settings of currently opened compositions can be changed. Most of the time the composition settings should be accessed to include the overrides for the current composition. This includes the PathMapping, which is used to identify paths from Fusion's relative path system.

The composition can be Saved and Closed, create Undos, Undo actions, and Redo them and Clear Undos altogether. Also, playback and rendering can be invoked from a composition.

Please note that you can comp:Lock() a composition, which prevents re-rendering due to changes and dialog pop-ups until the composition is unlocked again with comp:Unlock(). Use locking whenever possible if you manipulate the composition. You can query the lock state of a composition via comp:IsLocked().

Tools on the composition can be queried. A composition can get and set the currently active tool via comp.ActiveTool and comp:SetActiveTool(tool). All tools within the composition are queried with comp:GetToolList() while only the selected tools are queried with comp:GetToolList(true).

Note

Fusion tools can have three selection states: unselected, selected and active &amp; selected.

While the selected tools are the ones drag-selected (indicated by a blue color), the active tool is the last clicked tool (indicated by a yellow color). Still, an active tool is also automatically selected.

This behaviors enables a finer selection, e.g., when you want to copy one tool's settings to other tools, you can drag select all the target tools and then activate the source tool by clicking on it.

![img-10.jpeg](img-10.jpeg)

Selection of tools is part of the FlowView and can be triggered like this:

```txt
flow = comp.CurrentFrame.FlowView
flow:Select(Blur1, true) -- Adds blur1 to the selection
flow:Select(Blur2, false) -- Removes blur2 from the selection
flow:Select() -- Deselects all
```

Both composition and fusion have GetPrefs() and SetPrefs(), which store the preferences of Fusion and the local copy of the composition. If you cannot find a particular setting in there, take a look inside the Attributes as described later on.

# Tool Instances

Tools are uniquely named operators of a particular type. Internally a tool is a subset of an Operator that is visible on the flow. It can be a Creator or Filter, 3D Tool, etc. Another example of Operator is a Modifier. It is a like a Tool but deals with Number or Text data instead of Image data. Still you can connect it to Inputs and other Modifiers.

For simplicity, we will talk about Tools most of the time while the techniques may also apply to different Operator types.

Read access to the name and its type is given with tool.Name and tool.ID. For read and write access of the name, use the attribute called TOOLS_Name. Note that the attribute TOOLB_NameSet indicates if the name was manually changed. If not, some tools will show additional information on the tile next to its name. For example, the loader will show the clip's filename.

Other important attributes are its PassThrough-State with TOOLB_PassThrough and Lock-State with TOOLB_Locked.

Similar to the selection state the position of the tool on the FlowView is not part of the tool instance but of the flow.

```batch
flow = comp.CurrentFrame.FlowView
==flow:GetPos(Blur1) -- prints the position of Blur1
==flow:SetPos(Blur1, 5, 1) -- sets the position of Blur1 to x = 5 y = 1
```

If many tools are repositioned, the shown method will be slow. You can queue re-positioning of multiple tools and apply it in one batch like this:

```txt
-- Repositions all tools in a column
flow = comp.CurrentFrame.FlowView
flow:QueueSetPos()
for i, tool in ipairs(comp:GetToolList()) do
flow:QueueSetPos(tool, 0, i)
end
flow:FlushSetPosQueue()
```

Tools have Inputs and Outputs that are discussed in detail next.

# MainInputs and MainOutputs

In general, tools have Inputs and Outputs. Property Inputs—being represented by controls in the properties view (e.g. the Gain slider in a ColorCorrector)—or the Inputs on the flow view that connect one tool to the other, so called MainInputs. Outputs are very similar although most of the time tools only have one MainOutput on the FlowView. An exception being the Stereo Splitter (Fusion Studio) as shown in the figure.

![img-11.jpeg](img-11.jpeg)

The distinction if an Input or Output is on the flow is made by defining them as MainInput and MainOutput during the development of the Plugin or Fuse.

Visible MainInputs can be queried by using tool:FindMainInput(i), while MainOutputs are available with tool:FindMainOutput(i). As there can be more than one MainInput or MainOutput, these methods require an argument i starting with 1.

If there is no result for the given index, the method returns nil. The following snippet shows how to query all MainInputs and MainOutputs of the active tool:

```python
tool = comp.ActiveTool

if(tool == nil) then
print (tool.Name)

local i = 1
while(true) do
out = (tool:FindMainInput(i))
if out == nil then break end
```

```lua
print(string.format("\tMainInput %d: %s", i, out.Name))
i = i + 1
end

i = 1
while(true) do
out = (tool:FindMainOutput(i))
if out == nil then break end
print(string.format("\tMainOutput %d: %s", i, out.Name))
i = i + 1
end
end
```

# Inputs and Outputs

Next to the MainInput and MainOutputs there are other Inputs and Outputs. If Inputs are not hidden they can be represented as an Input control in the properties view. Still the underlying DataType might be the same. For example a Number DataType might be accessible through a slider control, a Checkbox, a DropdownList, a Multibutton etc.

To query the underlying DataType of an Input, use inp:GetAttrs("INPS_DataType").

To query the underlying DataType of an Output use outp:GetAttrs("OUTS_DataType").

A control allows users to change the corresponding value of the underlying DataType in the properties view. An optional preview control allows to change the value directly in the Viewer.

In scripting the value on an Input can be changed directly with an assignment, by using an index that represents a specific time or by using tool:SetInput("InputName", value, [time]).

Specifying the time only makes sense the input is animated as shown later. Only simple DataTypes like integers, float, and strings are supported.

Consider the following example:

|  Merge1.Angle = 10 | -- Sets Angle to 10  |
| --- | --- |
|  Merge1.Angle[5] = 20 | -- Sets Angle to 20 on frame 5  |
|  Merge1:SetInput("Angle", 20, 5) | -- Same as above  |

To get a value of a given Input use:

|  print(Merge1.Angle) | -- Gets the Angle input handle  |
| --- | --- |
|  print(Merge1.Angle[TIME_UNDEFINED]) | -- Gets the Angle value  |
|  print(Merge1.Angle[5]) | -- Gets Angle on frame 5  |
|  Merge1:GetInput("Angle", 5) | -- Same as above  |

Please note that you cannot use Merge1.Angle to retrieve a value as this will return the Input handle.

## Querying Inputs

Like MainInputs on the Flow, Inputs can be connected to other Outputs like Published Inputs, Animated Inputs, or Modifiers. Although not represented with a FlowView, a similar connection flow is possible with all Inputs. The main difference being that MainInputs deal with Image data, Masks, Data3D, Particle Streams while regular Inputs deal with Numbers, Points, and Text etc.

All Inputs, regardless of being MainInputs or not can be listed via tool:GetInputList(). All Outputs can be listed with tool:GetOutputList(). In both cases, an optional filter of the DataType can be specified. Additionally if the name is known the Input and Output can be accessed directly as property of the tool. If you mouse hover over an Input, the status bar will show the name. E.g. to access the Gain Input of a BrightnessContrast tool use: BrightnessContrast1.Gain

## Connections

An Input can be connected to an Output via the inp:ConnectTo(output) method. It can be disconnected via inp:ConnectTo(). To get the connected output of an Input use inp:GetConnectedOutput(). Similarly you can get all connected Inputs of an Output with outp:GetConnectedOutputs(). Please note the plural form of the latter command.

Note

By design, one Output might be connected to multiple Inputs, but one Input can only have one incoming Output connection.

![img-12.jpeg](img-12.jpeg)

Please note that both Output and Input share the same parent class called Link, which allows them to access GetTool() to refer to the Tool containing the Input or Output.

Inputs can be connected directly to their underlying DataType but they can also be connected to other inputs of the same DataType, a modifier or animation. As all of this internally is implemented as connection, once the upstream Input needs to be evaluated, all of it connected downstream outputs get queried. This allows for a complex connection scheme with many cross dependencies.

Animation

To animate an Input via script, the first step is to add a BezierSpline. A Bezier Spline is an animation curve that can be viewed in the spline editor. It is a storehouse for the information contained in the animated properties of a tool. To do this for a Merge's blend property, the following code could be employed:

Merge1.Blend = BezierSpline({})

By setting the input's value at a specific time, keyframes will be created.

If the property is a Point DataType, use the Path{} function instead to add a bezier-based path.

If the desire was to then animate the blend from 1 to 0 over the period of 100 frames, one could use the following code:

Merge1.Blend[1] = 1

Merge1.Blend[100] = 0

You can request a collection of all keyframes on a BezierSpline:

local spline, splineout, splinedata

-- gets the spline output that is connected to the Blend input,

splineout = Merge1.Blend:GetConnectedOutput()

-- then uses GetTool() to get the Bezier Spline modifier itself, and

if splineout then

spline = splineout:GetTool()

-- then uses GetKeyFrames() to get a table of a spline data. This

splinedata = spline:GetKeyFrames()

-- data is then dumped.

dump(splinedata)

end

The data returned consists of a nested table, one for each keyframe and with a key value of the keyframe's time. The subtables contain an entry for the keyframe's value, and optionally, subtables for the left and/or right handles, called "LH" and "RH." The handle subtables contain two entries, for the handle's X &amp; Y position.

To remove key frames from an animated spline, set the value to nil.

Merge1.Blend[composition.CurrentTime] = nil

In the above case, the key frame was removed from the comp's current frame. However, if that key frame was the only point on an animation spline, the point would not be deleted, as splines must have at least one point at all times.

The animation can be deleted completely, reverting the Input to a static value.

Instead of specifying the time set the whole Input to nil.

Merge1.Blend = nil

## Attributes

Attributes store information about the capabilities of a certain type, as well as some common flags that contribute to the object's state.

For example, in the case of a Tool the attributes may include the typename of the object, its name in the composition, its abbreviation shown in the Toolbar, its PassThrough and selection state, etc.

Attributes have read access but it is not guaranteed that you can change all Attributes. So while it is possible to change the PassThrough-State of a tool, it makes no sense to change its type.

Each Operator Type will have a different set of Attributes depending on its type. You cannot add your own Attributes. Instead, use a mechanism like Image stream metadata or Object Data.

In order to access the Attributes, the GetAttrs() method can be used. As it is provided by the Object superclass, pretty much all objects can have Attributes. So GetAttrs() is a good place to look for functionality or data within an object.

If no argument is given, all Attributes are returned. It is also possible to supply a single tag string to narrow down the search.

==Merge1:GetAttrs() -- dump all Tool Attributes
==Merge1.Blend:GetAttrs() -- Inputs also have attributes
==Merge1:GetAttrs("TOOLB_Locked") -- Only show the Locked status

The tags consist of a Type prefix, a character for the type, an underline and the Name of the Attribute. So for example most Attributes within a Tool have a TOOL prefix, Inputs INP, Compositions COMP etc.

The type character stands for:

|  S | String  |
| --- | --- |
|  B | Boolean  |
|  N | Number (float)  |
|  I | Integer  |
|  H | Handle  |
|  NT | Number Table  |
|  IT | Integer Table  |
|  ST | String Table  |
|  BT | Boolean Table  |

In our example, TOOLB_Locked stands for a Tool Attribute of type boolean with the name "Locked."

Attributes can be changed by using SetAttrs({}). The supplied table is required to have the Tag as key and the new value as value. Multiple attributes can be changed at a time, however not all Attributes can be changed at all. The following example renames "Merge1" to "MyMerge" and locks the tool in one call:

Merge1:SetAttrs({TOOLS_Name = "MyMerge", TOOLB_Locked = true})

## Object Data

Data is a special type of Metadata that is stored within the application preferences or composition.

As opposed to Metadata that is read from an image data stream (e.g., OpenEXR) and is passed from tool to tool, the Object Data is not passed with the data stream. Instead, it is consistent for the current state of the application, composition, or tool.

This makes it a perfect candidate for reliably storing states of custom scripts with the composition.

For example, let's say a custom script with a GUI needs to store its last used path so that the user does not have to change the path each time the script is being used.

One option is to create a global variable and check if it is set on each run:

```txt
if globals.mytool_lastpath then
path = mytool_lastpath
else
path = "default/path"
end
-- ... Dialog with the path
globals.mytool_lastpath = path
```

However, once Fusion is closed the variable is gone. This strategy only makes sense for data that is not likely to change from session to session, like a cached list of currently loaded Tools.

But for our scenario, it may be wiser to store each latest path with the fusion preferences so that each new composition can reference the last used path, even when Fusion is closed and reopened.

```txt
local last_path = fusion:GetData("mytool.lastpath")
if last_path then
path = last_path
else
path = "default/path"
end
-- ... Dialog with the path
fusion:SetData("mytool.lastpath", path)
```

However, another strategy might be to store the data with the composition, so each composition can have its own path. Simply replace fusion with composition or any other context that makes sense if your case.

Please note that the dot notation is not random. Dots represent a subtable. So you can put multiple variables or even other nested tables inside of "mytool." Use this to your advantage, e.g., to define a domain wide root name that represents your studio, a sub table with the tools and their individual settings:

```txt
fusion:SetData("MyStudioInc.MyCompTool.DoMagic", true)
fusion:SetData("MyStudioInc.MyRenderSettings.RemoteNames", "clients")
```

## Where is the actual ObjectData stored?

In the case of the fusion you will find the data in the Fusion8.prefs, at Global.Script.GlobalData.

With Compositions, tools etc. the ObjectData is stored with the respective object in the Composition file. As all these are Lua-Tables, go ahead and open the .comp file with a text processor. You should find the Object data you specified.

&gt; **Note**
&gt;
&gt; A big benefit of Tool ObjectData is that it is stored directly within the Tool. It will be passed on if the tool is copied and pasted into another composition. However, a newly created tool will not have any ObjectData, so make sure to catch this default case by an EventSuite or similar.

## Metadata

ObjectData is easily confused with regular Image Metadata. However, Image Metadata can only be read with scripts, but not changed, as it is tied to the Image Stream itself. You will need Fuses or Plugins to change the Image Stream and its Metadata directly. In order to access it, you will need to evaluate the Output up to the point where the Metadata was queried.

This is not needed in the case of ObjectData, as it depends on the Object instance and not on its underlying data stream.

In a Loader with a valid input access is Metadata like this:

```txt
==Loader1.Output[comp.CurrentTime].Metadata.Filename
```

In SimpleExpression, the evaluation is not needed, as it is automatically evaluated at the current time. For example put this in a text field's Expression field:

```txt
Loader1.Output.Metadata.Filename
```
