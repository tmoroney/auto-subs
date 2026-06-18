> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Scripting and Debugging

## Console

Fusion has a console build-in that outputs print statements in scripts. This is useful for scripts without a GUI, or as tool for simple debugging.

For example:

→ Lua

```lua
print("Hello World.")
```

→ Python

```python
print("Hello World.")
```

```python
print "Hello World." # This only works with Python 2.x
```

In all cases, the console will show "Hello World." If executed from the console, the command will be mirrored in the console preceding the interpreter: Lua&gt;, Py2&gt; or Py3&gt;

When used with a collection, print will only output the reference to the collection. To display its content in a preformatted way, use:

→ Lua

```lua
dump(comp:GetAttrs())
```

→ Tip

If used in the console, FusionScript offers a short form of dump for Lua and Python:

```python
==comp:GetAttrs() -- Same as the command above
```

The same can be achieved in Python with a module called "Data pretty printer" (pprint).

→ Python

```python
from pprint import pprint # Needs to be Loaded once
pprint(comp.GetAttrs())
```

Please note that all the collections coming from FusionScript are essentially Lua tuples. Compare to the chapter Scripting Languages.

# Types of Scripts

Fusion supports different types of scripts based on the context, e.g., you might have a script that makes changes to the composition, while another script might only act on a certain tool.

Some of these contexts supply different sets of predefined objects. Like a Tool script will expose the tool it has been applied on as variable.

For better understanding, let us examine important script-contexts:

## Interactive Scripts

Interactive scripts are all scripts within Fusion that require a user interaction to run. Most of these scripts are invoked by the user from the menu.

The contexts available are:

## Composition Script

Compositing scripts are the most common type of scripts. They are stored inside the Scripts:/ Comp folder and run from the Scripts Menu. As their name implies their intended context is the Composition. Therefore, access to the fusion and the composition object is given. Nothing stops you from implementing functionality that acts on a single selected tool within a Composition script, but you should consider using a tool script instead. The Menu understands subfolders, so when a script is placed inside a subfolder, a submenu for that folder will be created.

![img-7.jpeg](img-7.jpeg)

## Tool Script

Tool scripts act on a single tool. They are stored inside the Scripts:/Tool folder and are accessible and editable from the right-click context menu of the tool's properties. When invoked, the fusion, composition, and particular tool objects are available as variable.

## Bin Script

Bin scripts are special scripts that act on the contents of a bin. They are stored inside the Scripts:/ Bin folder and are invoked through the context menu of the bin.

For more information about bins, refer to the Fusion User Manual.

# Utility Script

Utility scripts are those that act on Fusion itself, rather than on a particular Composition. They are stored inside the Scripts:/Utility folder and can be accessed through the File &gt; Script Menu. The fusion variable is available by default.

# Script Libraries

A scriptlib is a file containing a library of functions that can be used in multiple scripts. Included with the default installation of Fusion is the bmd.scriptlib, which contains common useful functions. The scriptlib could have additions in it such as variable declarations (added to the globals table, for instance). Script Libraries are installed in the root of the scripts directory (by default Scripts: ). In that directory, anything with a .scriptlib extension will be run whenever Fusion is started. In order to execute a scriptlib when a composition is created or opened, put the scriptlib in the Scripts:/ Comp folder instead. The added benefit of the scriptlib is that you can instruct Fusion to run a set of code every time a composition is created or opened. The downside to this is that Fusion will execute the files in the scripts directory in an arbitrary order. This means that any code you write in the script libraries that is reliant upon other libraries may not work. To get around this, try inserting the functions that are needed at the top of the scriptlib.

Beyond passing functions into the global environment of the composition, the scriptlib also can be set up to perform default actions on a composition. It can also be used to create custom events set up in event suites.

# External Scripts

External scripts are run from outside of Fusion but can still access the Fusion instance.

# Commandline Scripts

In the install directory of Fusion an application called FuScript is available, which allows to run scripts directly from the command line.

The mac version is to be found inside the app bundle at Fusion.app/Contents/MacOS/fuscript.

FuScript can execute a .lua script file directly:

```
Fuscript <script></script>

For other uses of FuScript run it without any argument. A list of possible arguments will be printed to the console.

To connect FuScript to a running instance of Fusion use the following snippet:

```lua
fusion = Fusion()
fu = fusion
composition = fu.CurrentComp
comp = composition
SetActiveComp(comp)
```

From now on, the interactive shell will act like the build in shell in Fusion. By calling

SetActiveComp(comp), the global scope will accept calls to the composition. For example, the creation of tools like this:

```txt
blur = Blur()
```

This command will create a blur tool on the FlowView of the current open composition.

To run python version 2 or 3 you can specify the language like this:

```txt
FuScript <script></script>

Possible events are:
→ OnOpen() -- Triggers every time a file is opened
→ OnSave() -- Triggers every time a comp is saved
→ OnSaveAs() -- Whenever save as is called
→ OnStartRender() -- Whenever a render starts
→ OnEndRender() -- Whenever a render ends
→ OnFrameRendered() -- Whenever a frame is rendered
→ OnTimeChange() -- Whenever the time changes
→ OnActivateTool() -- Whenever a tool is made active

For example: Create a file called PrintSaverPathsOnRender.scriptlib in the Scripts:/Comp folder. Enter the following content:

```txt
globals.ev = AddEventSuite("Composition")
function ev:OnStartRender(event)
local toollist=comp:GetToolList("Saver")
for i, tool in pairs(toollist) do
print(tool:GetInput("Clip"))
end
self:Default(event)
end
```

Now start a render with a composition that has at least one Saver with a valid path defined. The console will print all the paths of the Savers. Although this sample does not add much value, it could easily be modified to check and manipulate the paths.

Note
Always use self:Default(event) to call the base implementation of the event.
This will allow you to create multiple events with different scriptlibs.

Removing an event suite is accomplished by running the RemoveEventSuite(suite) function. In the example scenario, the syntax would be:

RemoveEventSuite(ev)

## Button Callbacks

Button callbacks are invoked when custom Button Controls within a tool are clicked.

Internally, the Attribute called BTNCS_Execute needs to be set. The easiest way to accomplish this is by using the UserControls ToolScript. When adding a Button control, a field labeled Execute can be used to call Lua commands.

![img-8.jpeg](img-8.jpeg)

The generated button control will end up in the composition as:

```java
UserControls = ordered() {
PrintHello = {
LINKID_DataType = "Number",
INP_Default = 0,
BTNCS_Execute = "print(\"Hello\")",
LINKS_Name = "Print Hello",
INPID_InputControl = "ButtonControl",
},
}
```

When clicked "Hello" will be printed in the console.

## Hotkey Script

Hotkey scripts are scripts that can be attached to keyboard shortcuts in a particular context.

By default they are stored in a file called Fusion.hotkeys in the Profile: folder.

## InTool Scripts

InTool scripts are special scripts that run on the tool during evaluation of each frame, at the start of the render or at the end. They are defined directly within the tool and have read access to a limited set of data through the input's name—self, composition or comp, and fusion or fu. The limitation is supposed to prevent infinite loops, race conditions, and performance problems.

For example, you cannot call or change Inputs. If you want change Inputs based on a logic, use modifiers, expressions, or simple expressions. Also note that changing most of the Inputs in a tool will trigger a re-rendering and therefore the InTool Frame Render Script is evaluated again.

![img-9.jpeg](img-9.jpeg)

## Simple Expressions

Simple Expressions are a limited subset of the scripting environment directly within each Input of a tool. They can be used as replacements for the expression modifier, to directly connect and change incoming Inputs based on calculations.

## Fuses

Fuses are Lua scripted plugins that act as regular Tool. They may be multithreaded and contain OpenCL kernels to process on the GPU. Refer to the dedicated Fuses documentation and reference.
