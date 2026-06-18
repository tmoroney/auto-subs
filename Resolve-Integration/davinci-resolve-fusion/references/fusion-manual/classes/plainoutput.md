> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# PlainOutput

class PlainOutput
Parent class: Link
Represents an Output.

PlainOutput Attributes
|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  OUTS_Name | string | The name of the Output  |
|  OUTS_ID | string | The Output's unique ID string  |
|  OUTS_DataType | string | The type of Parameter that this Output uses  |

# Methods

PlainOutput.ClearDiskCache(start, end)
Clears frames from the disk cache.
start the frame to start purging the cache at (inclusive).
end the last frame to be purged (inclusive).
→ Parameters:
start (number) – start
end (number) – end
→ Returns: success
→ Return type: boolean

PlainOutputEnableDiskCache()

Controls disk-based caching.

Enable Enables or disables the cache.

Path A valid path to cache the files at.

LockCache Locks the cache, preventing invalidation of existing cache files when upstream tools are modified. Use with extreme caution, as cache files may become out of date.

LockBranch Locks all upstream tools (defaults to false).

Delete Deletes the cache that might already exist at Path (defaults to false).

PreRender Render now to create the cache (defaults to true).

UseNetwork Use network rendering when prerendering (defaults to false).

Returns boolean if successful as well as a string to the path of the cache.

→ Python usage:
```txt
comp.BC1.OutputEnableDiskCache(True,"c:\temp\BC.0000.raw")
```

→ Lua usage:
```txt
BC1.Output:EnableDiskCache(true,"c:\temp\BC.0000.raw")
```

→ Returns: success
→ Return type: boolean

PlainOutput.GetConnectedInputs()

Returns a table of Inputs connected to this Output.

The GetConnectedInputs function is used to determine what inputs are using a given output.

Note by design an Input can only be connected to a single Output, while an Output might be branched and connected to multiple Inputs.

PlainOutput.GetDoD([time][, flags][, proxy])

Returns the Domain of Definition at the given time.

time The frame to fetch the value for (default is the current time).

reqflags Quality flags (default is final quality).

proxy Proxy level (default is no proxy).

The returned table has four integers containing the DoD of the tool's output in the order left, bottom, right, top.

→ Parameters:
- time (number) – time
- flags (number) – flags
- proxy (number) – proxy

→ Returns: dod
→ Return type: table

## PlainOutput.GetValue()

Returns the value at the given time.

Useful for retrieving the result of a chain of tools. It does this by triggering a render (if cached values are not found) of all tools upstream of the Output.

- time The frame to fetch the value for (default is the current time).
- reqflags Quality flags (default is final quality).
- proxy Proxy level (default is no proxy).

Returned value may be nil, or a variety of different types:

- Number returns a number Point returns a table with X and Y members Text returns a string Clip returns the filename string Image returns an Image object
- attrs is a table with the following entries:
- Valid table with numeric Start and End entries DataType string ID for the parameter type TimeCost time take to render this parameter

→ Returns: value
→ Return type: Parameter

## PlainOutput.ShowDiskCacheDlg()

Displays Cache-To-Disk dialog for user interaction.

Note this is a modal dialog. The script execution waits for the user to dismiss the dialog.

Return false if canceled, else true.

→ Returns: success
→ Return type: boolean
