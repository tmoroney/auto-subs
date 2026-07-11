> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Scripting Languages

Fusion has two scripting Languages to choose from: Lua and Python. Both access the same API through FusionScript so it is up to you which language to choose.

Scripting differs from other APIs available in Fusion. Namely Fuses, Lua scripted plugins that also may contain OpenCL kernels for GPU based evaluation. Fuses allow creation of tools and filters, a feature that was originally only possible through the C++ SDK.

Scripting through FusionScript leaves us with two options:

# Lua

The Lua programming language is known for its efficiency, speed, and small memory footprint. Therefore it has been used widely in science and video games.

Fusion ships with Lua 5.1, with some additional libraries build in:

→ IUP - for Graphical user interfaces (compare the chapter Graphical User Interfaces)
→ bmd.scriptlib - A library with common Fusion related helper functions

Lua is a first class citizen in Fusion as it ships with the install. All preferences and compositions are stored in a Lua table. Fuses are written in Lua and Simple Expressions also consist of a subset of Lua. Additionally, Fusion uses the LuaJIT (JustInTime) flavour of Lua, which outperforms CPython. While in regular scripts this may not matter, it is one reason why Fuses can only be written in Lua.

For a complete reference of the language, see the Lua documentation at: http://www.lua.org/manual/5.1/

Here is the difference of Lua and Python in a nutshell:

→ Member properties are accessed with a dot. Methods are invoked with a colon:

For example:

```python
print(comp.ActiveTool)
print(comp.GetToolList(true))
```

→ Boolean types are lowercase in Lua (true, false)
→ functions, loops and conditions etc. are closed with an end statement.
→ Lua only knows one collection type called tuple. It can be used like a Python tuple, list, or dictionary.
→ Fusion has a function buildin called dump() which can be seen as an extension to print(). It formats the output of tables to be more readable. In the console you may also start the line with == as short from for dump, e.g., ==comp:GetAttrs()

# Libraries

One of Lua's benefits is its light weight; Lua does not come with a big standard library. Instead, libraries and Lua files can be added. Since the FusionScript Lua interpreter is a custom version of Lua not all native Lua libraries are guaranteed to work with fusion.

# Python

## Introduction to Python

Python has been adopted quickly for its efficient syntax and language features. Particularly in the Visual Effects industry, Python resembles a standard for scripting. Most post-production applications today make use of Python, which is especially beneficial if your goal is to streamline the production with scripting. Beyond VFX literally thousands of libraries offer Python bindings, making it possible to access a broad range of tools with a common language.

In order to work in FusionScript the official C-based implementation of Python, sometimes referred to as CPython, needs to be installed on your system as shown below.

## Choice of Version

Python comes as Python version 2 or version 3. The latter was introduced to resolve core issues of Python, for the cost of backwards compatibility in syntax and features. Compare:

https://wiki.python.org/moin/Python2orPython3

In Fusion, you have the choice to either use Python 2.7 or 3.3. Depending on your task, either use 2.7 (widest range of applications supported) or 3.3 if your pipeline depends on it.

At the time of writing, the recommended VFX reference platform suggests the latest Python 2.7 version, so many facilities may depend on this version.

## Documentation

Official documentation of python can be found here:

https://docs.python.org/2.7/

https://docs.python.org/3.3/

# Installation

## Windows

You need to have the latest Python 2.7 or Python 3.3 installed on your system in order to be usable with Fusion. To match Fusion it needs to be the 64 bit compile.

https://www.python.org/downloads/windows/

During installation, the install option needs to be set to "Install for all users" as shown below:

![img-4.jpeg](img-4.jpeg)

This way the Python library is installed so that Fusion is able to pick it up during startup. Continue with the setup below.

## Mac OS X

You need to have the latest Python 2.7 or Python 3.3 installed on your system in order to be usable with Fusion. To match Fusion it needs to be the 64 bit compile.

https://www.python.org/downloads/release/python-2710/

![img-5.jpeg](img-5.jpeg)

# Setup

After the installation of Python, Fusion needs to be restarted.

As you could have both versions of Python installed, you need to specify the preferred version in your preferences.

Set the default Version for .py Files and default console at:

→ File Preferences...→ Global and Default Settings→ Script→ Default Python Version

![img-6.jpeg](img-6.jpeg)

# Note

If you need to make sure that your script is run with either Python 2 or Python 3, you can set the file extension of the script to either .py2 or .py3, respectively.

Note this is a non-standard behavior and will only work within Fusion.

# Libraries

In contrast to Lua, Python comes with a complete standard library. As a quick overview, here is a list of important modules.

→ os (os &amp; file system access)
→ shutil (file system access)
→ glob (file system matching &amp; listing)
→ os.path (os independent path handling)
→ sys (system access)

For a complete list refer to:

https://docs.python.org/2/library/

https://docs.python.org/3.3/library/

Additionally, you can install external libraries either manually or by the eco system accessible through pip or easyinstall. Some libraries that are useful with Fusion are:

→ slpp (Lua data parser for python)
https://github.com/SirAnthony/slpp
This library makes it easy to parse Lua tables, which most of the data in Fusion consists of.
→ Pillow (Python Imaging Library Fork)
Image manipulation framework
→ Numpy
Mathematical framework

# Differences with FusionScript

As already noted Fuses cannot be written in Python.

Also EventScripts, callback scripts for certain events are also only possible with Lua.

Since historically FusionScript was Lua only, some methods that return multiple statements have a special Table() suffix variant to return the proper table for use in Python.

As the Lua collection is a tuple, you will need to pass a dictionary to the API in many cases, even when it seems to be treated like a list.

So each Value needs to have a key in the order of the entry.

For example a list like:

$$
l = \left[ \begin{array}{l} "a", "b", "c" \end{array} \right]
$$

needs to map to a dictionary

$$
d = \{1: "a", 2: "b", 3: "c" \}
$$

Please note that Lua uses 1 as the first index key of its tuples, not 0. Python dictionaries do not have a particular order. Only the key indicates their order in this case.

Similarly, all Lua tuples result in dictionaries in Python that need to be parsed into Lists. If order does not matter, it can be simply done by:

$$
l = d.\text{values}()
$$

If order is important their values need to be sorted by their keys before conversion to a list. This can be achieved with a list comprehension:

$$
l = [item[1] \text{ for item in sorted}(d.items())]
$$

## Choice of Scripting Language

The following list compiles reasons for the use of one or the other language.

### Pro Lua:

→ Batteries included - No setup needed
→ Therefore shared scripts will guarantee to work in Fusion without setup
→ More features in Fusion
→ Easier to parse Fusion Tables
→ Lighter and faster
→ Fusion is shipping with many scripts in Lua that can act as examples

### Pro Python:

→ Utilization of other Python scripts/apps in the pipeline
→ Most major VFX apps use Python
→ Allows external scripting for cross-app communication (Studio only)

→ Strong standard library
→ Higher usage &amp; more third party libraries, scripts, and bindings
→ Comes pre-installed in Linux &amp; OSX

The recommendation should always be to stick with the one you know. It makes no sense to learn a completely new language in most cases if you are already familiar with either Lua or Python, especially when scripts and libraries exist that you can rely on.

If you are just starting with scripting, you should stick to Lua if all you care for is Fusion, and you want to make it possible for other artists to utilize your scripts without prior setup. Also the knowledge gained in scripting will be beneficial for writing custom Fuses.

If you are using other VFX applications that eventually also support Python this might be the better choice for Fusion as well. The choice can also depend on the standard libraries or a particular third party library. Research your required environment before making a choice will save you time in the long run.

Regardless Fusion with its FusionScript API will respect your choice.

## Cross-Language Evaluation

Sometimes it is necessary or useful to call in from one language to the other to access certain features, e.g., you might want to access the Lua function dump from within Python.

With the console set to Py2 execute:

```python
composition.execute("dump(comp:GetAttrs())")
```

To execute the string as Python from within Lua use:

```lua
composition:Execute("!Py: print(comp.GetAttrs())")
```

To target a specific Python version use !Py2: or !Py3:

You may also want to run complete Lua or Python scripts. Use:

```lua
composition:RunScript(filePath)
```

Use either .lua, .py, .py2 or .py3 as file extension for the corresponding interpreter. Similar to the script menu, .py will execute in the Python interpreter that is installed and set in the preferences. As RunScript is also available in Python you may run .lua scripts from within Python.

Note

The shown scripts are executed in the context of the currently open composition. Hence, all the evaluation methods are members of the composition object.

composition:Execute(command)

composition:RunScript(filePath)

If you want to execute the scripts in the context of the application, use fusion instead.

fusion:Execute(command)

fusion:RunScript(filePath)

Please note that it is not possible to pass return objects from one language to the other.
