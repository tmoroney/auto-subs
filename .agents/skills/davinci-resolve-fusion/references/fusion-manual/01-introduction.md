> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# About this Document

This document is divided into two sections: The Scripting Guide and the Scripting Reference. The first section, the Scripting Guide, explains the scripting application programming interface (API) of Fusion called FusionScript. It can be accessed via Lua or the Python programming language. FusionScript can be utilized to automate repetitive or complex tasks, customize the application behavior, extend Fusion's functionality, or exchange data with third-party applications.

This guide contains information on how to get started, the differences of scripting languages, how the API is laid out to represent the application model, and how to deal with it in practice.

The second section, the Scripting Reference, assumes you have an understanding of the scripting concepts and the fundamentals of scripting from the first section. The Scripting Reference describes the common API, its objects, members, arguments and usage.

In order to write custom tools or extend Fusion's core functionality, refer to the C++ SDK or Fuse documentation. For regular customization and Macros, read the corresponding chapter in the Fusion User Guide.

# Target Audience

This document is intended for developers, technical directors, and users knowledgeable in programming. It was by no means written to teach programming concepts and does not act as a reference for programming languages. Please refer to the documentation of the respective language as advised in the chapter "Scripting Languages." However, when possible practical examples will be given and complete tutorials show the most common applications of FusionScript.

# Requirements

In order to follow this guide, you will need to have a copy of Blackmagic Design Fusion 8 installed.

A few features only available in Fusion 8 Studio are highlighted, while every other sample will work with the regular version of Fusion 8. In order to utilize Python, the C-based version of Python needs to be installed as explained in detail in the chapter Scripting Languages.

The source code of both scripting languages needs to be stored as plain text, which can be written in any non-formatting text processor like Notepad or TextEdit. It is recommended to make use of a dedicated code editor to benefit from syntax highlighting and language-specific features.

SCRIPTING GUIDE AND REFERENCE

# Conventions

Important notes will be featured in text boxes like this:

Note

Read the Introduction chapters before continuing with the guide.

Code is introduced in boxes with a monospaced font like this:

print("Hello World from Fusion!") -- Writes text to the console

Regular text may refer to code statements inline, which is also represented by a monospaced font, e.g., the statement 'print' in this sentence:

The statement print writes text to the console.

Most examples shown in the guide are only excerpts of the full source code and may not be able to work on their own. This helps to make the guide more readable. However, all passages marked as Tutorial will contain full source code.

Most code examples are shown in Lua. Inline statements show the Lua implementation of the particular statement; as with Lua, it is easier to identify properties and methods. In order to not mix up Lua tuples with Python tuples, the generic term collection is used to describe tuples, list, dictionaries, etc.

The code here is written for teaching purposes. Sometimes things that could be refactored into separate methods are written explicitly or in a non-optimized way. Please do not hesitate to add your own talent to the code after the fundamental concepts of the API are known.

For consistency reasons naming convention follows roughly the naming of the API (cameCase) for both Lua and Python. Feel free to adapt to PEP8 or your own convention instead.

![img-1.jpeg](img-1.jpeg)

Scripting Guide

# Content

Introduction 9
Quick Start Tutorial 10
Scripting Languages 14
Lua 14
Python 15
Scripting and Debugging 22
Console 22
Types of Scripts 23
Interactive Scripts 23
External Scripts 24
Events &amp; Callbacks 25
InTool Scripts 28
Simple Expressions 29
Fuses 29
Fusion's Object Model 30
Overview 30
Common Object Dependencies 30
Attributes 39
Object Data 40
Metadata 42
Graphical User Interfaces 43

# Introduction

What is scripting? Scripting is interpreting the specific programming language—in theory—line by line or in the form of compiled bytecode as opposed to executing precompiled machine code directly. Without going too deep into implementation details, it can be concluded that due to its nature, a complex application like Fusion can act as host and provide access to its functionality through a dedicated scripting API. The scripting environment wraps the underlying API and is less likely to crash the whole application if third-party code is defective. Code can be changed on the fly without restarting the host application. Additionally, a garbage collector does most of the memory management in common scripting environments. All this results in slower evaluation compared to native compiled code, but the performance is still beyond what can be done by a user with the regular graphical user interface. The JustInTime (JIT) flavor of Lua that is utilized in Fusion is especially known to perform almost as fast as native code in many cases.

Ultimately, scripting allows for any programmer to mix the language features and libraries of the scripting language with the functionality of the host application. This allows an integration of third-party data or applications.

Let's examine practical uses of scripting within Fusion by example. Scripting in production may help with:

→ Automation: For example, read all media files from a given folder, for each of these, load them into a composition, add a watermark, scale them, and render them to a specific location.
→ Repetitive tasks: For example find all savers in a composition and set their state to pass-through.
→ Maintaining conventions: For example making sure the paths of the savers always point at a specific location on the server, and follow a specific naming convention.
→ Tasks prone to human error: For example, verify that certain settings are set before sending a composition to rendering.
→ Extending core features in the application: For example, importing animation data from a third-party application.
→ Behavior that needs customization for specific pipeline: For example, override what happens when certain events occur. It may enforce certain tools to show up when a specific tool was created.
→ Communication with a third-party application: For example, not only exchange data but also share events. When a specific pipeline tool triggers to create a shot, create the corresponding composition.

These are just examples of common applications. Some scripts may require an interface in order to adapt its behavior to a particular need. This may be a configuration file or information derived from the applications state (maybe the current selected tool in the composition). But in many cases, a

graphical user interface with a custom dialog that shows all the possible options for the behavior is needed. The latter will be examined in detail in the Graphical User Interfaces chapter.

In Fusion, the scripting API called FusionScript gives access to the most required functionality from the application. In order to fully utilize FusionScript, a basic understanding of how Fusion works is needed. Once this model is known, it will be easier to travel through the Scripting Reference in order to find a needed functionality.

With FusionScript, almost any aspect of Fusion can be accessed and controlled, whether it be the composition and its tools, rendering, metadata, settings, and attributes or the interface.

As FusionScript is only an abstract API, it allows access via different scripting languages—most notably the Lua Programming Language, which is embedded in Fusion or, if installed separately, the Python Programming Language. Although these languages and their features differ greatly, the FusionScript access from both languages is very similar as it accesses the same API. Differences and limitations are explained in the following chapter.

## Quick Start Tutorial

Without further ado, let's jump right into a working example.

As proposed earlier, we will create a Lua script that will pass through all but the currently selected Saver. If no Saver is selected, then basically all Savers will be passed through. This is very handy when you have a huge composition but need to prerender only a specific saver.

## First Steps

To start, we need to create a new script by accessing the Menu at Script-&gt;Edit-&gt;New ...

![img-2.jpeg](img-2.jpeg)

In the FileDialog, store the script under the name Disable Unselected Savers.lua under the Script folder.

In composition scripts, the filename is used as label to execute the script from the menu. A meaningful name should be chosen.

By default, Fusion will open the default application if nothing else was set in the preferences. You can manually edit the script by invoking Script-&gt;Edit-&gt;Disable Unselected Savers.

In the text processor, write the following line:

```python
print("Hello World from Fusion!")
```

Save the script and execute it with Script-&gt;Disable Unselected Savers.

&gt; **Note**
&gt; Please note that you edit the script with the Script-&gt;Edit-&gt; submenu but execute it directly under Script-&gt;Name of your script.
&gt;
&gt; All scripts in the composition script folder will be listed here, including sub folders.

Switch to the Console tab in the interface. If everything was set up correctly, the console will show the following text:

![img-3.jpeg](img-3.jpeg)

All standard output like print will be piped to the console.

## The Real Script

Breaking down our intended script in steps the following functionality needs to be implemented:

1. Get and store the current selected tool, if it is a Saver.
2. Iterate through all Savers in the composition.
3. Set these to PassedThrough if they do not match our initial selection.

In Scripts that are executed directly within Fusion two variables are accessible by default: `fusion` and `composition`. In order to save typing, you can also use the short form `fu` and `comp`.

As their names indicate with `fusion`, you gain access to the applications properties and methods, while `composition` represents anything in the composition.

As all the tasks in this particular script concern the Composition, all required methods are to be found in this object or its members. First of all:

```python
comp:GetToolList(bool selected, string type = nil)
```

Returns all tools in the composition, or only the selected ones if the argument is set to true. The type argument is optional. It can be used to filter only specific types of tools.

The tool itself is in fact an object of type Tool or Operator. As you can see, Fusion's application model follows the object-oriented programming concept, which will be examined in detail in the following chapters.

A tool has various properties and methods. But what we are looking for is an Attribute.

Note

Most of the objects in the Scripting API have a base class called Object. Objects may have common properties, one of them being the storage of Attributes. Attributes represent a serializable state of the tool beyond its actual Inputs.

The common attribute to read and write the PassThrough state of a tool is a boolean called TOOLB_PassThrough.

Since in this case we will only be setting it, all we need is:

```txt
tools:SetAttrs( { TOOLB_PassThrough = True } )
```

Note that we pass in a tuple, hence the curly brackets, as we could pass in multiple attributes to be set at once.

With these two commands, we can accomplish all the tasks needed for this script.

Source File: 01 Disable Unselected Savers
```lua
comp:Lock()
local selectedSavers = comp:GetToolList(true, "Saver")
local allSavers = comp:GetToolList(false, "Saver")
for i, currentSaver in pairs(allSavers) do
local isSelected = false
for j, currentSelectedSaver in pairs(selectedSavers) do
if(currentSaver == currentSelectedSaver) then
```

```txt
isSelected = true
end
end

if isSelected == false then
currentSaver:SetAttrs( { TOOLB_PassThrough = true } )
end
end
comp:Unlock()
```

The first and last statement have not been introduced yet.

```txt
comp:Lock()
comp:Unlock()
```

Whenever the composition needs to change its objects or data, you should Lock the composition, and Unlock it at the end. This guarantees to prevent race conditions, unnecessary redraws but also suppresses Dialogs, e.g., when a Loader or Saver is added to the Flow.

The following two lines simply return a tuple of all selected Saver and all Savers respectively.

```txt
selectedSavers = comp:GetToolList(true, "Saver")
allSavers = comp:GetToolList(false, "Saver")
```

The first loop iterates over all Savers.

The next iteration over each selected Saver compares all the selected Savers with the current Saver of the iteration. Since all the selected Savers are also within the collection of all Savers, we can tell for sure if the current Saver has been selected or not.

If it has not been selected, then we set the current Saver to PassThrough, which is equivalent to setting the tool to PassThrough in the FlowView.

At the end, we Unlock the composition as mentioned before.

Save the script. Switch to Fusion, create a bunch of Savers. Select few of them and run the script. All but the selected Savers should be set to PassThrough now.
