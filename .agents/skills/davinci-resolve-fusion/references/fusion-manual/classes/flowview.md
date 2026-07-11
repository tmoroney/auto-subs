> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## FlowView

### class FlowView

Parent class: FuView

The FlowView represents the flow with all the tools.

Positions of tools, their selection state and the views zoom level are controlled with this object.

→ Python usage:
```python
# Get the current FlowView
flow = composition.CurrentFrame.FlowView
```

→ Lua usage:
```python
-- Get the current FlowView
flow = composition.CurrentFrame.FlowView
```

## Methods

### FlowView.FlushSetPosQueue()

Moves all tools queued for positioning with QueueSetPos.

### FlowView.FrameAll()

Rescale and reposition the FlowView to contain all tools.

### FlowView.GetPos()

Returns the position of a tool.

This function returns two numeric values containing the X and Y co-ordinates of the tool. In Python use GetPosTable instead.

→ Python usage:

```python
flow = comp.CurrentFrame.FlowView
x, y = flow.GetPosTable(comp.Background1).values()
```

→ Lua usage:

```python
flow = comp.CurrentFrame.FlowView
x, y = flow:GetPos(tool)
```

→ Returns: x
→ Return type: number

FlowView.GetPosTable(tool)

Returns the position of a tool as a table.

Use this in Python to get the X and Y value.

→ Python usage:

```python
flow = comp.CurrentFrame.FlowView
x, y = flow.GetPosTable(comp.Background1).values()
```

→ Lua usage:

```python
flow = comp.CurrentFrame.FlowView
x, y = flow:GetPos(tool)
```

→ Parameters:

tool (object) – tool

→ Returns: pos
→ Return type: table

FlowView.GetScale()

Returns the current scale of the contents.

This function returns a numeric value indicating the current scale of the FlowView. 1 means 100%, while 0.1 means 10% of the default scale.

→ Returns: scale
→ Return type: number

FlowView.QueueSetPos(tool, x, y)

Queues the moving of a tool to a new position.

All queued moves will be evaluated once FlushSetPosQueue() has been called.

→ Parameters:

tool (object) – tool

x (number) – x

y (number) – y

FlowView.Select(tool[, select])

Selects or deselects a tool.

This function will add or remove the tool specified in it's first argument from the current tool selection set. The second argument should be set to false to remove the tool from the selection, or to true to add it.

tool should contain the tool that will be selected or deselected in the FlowView.

select setting this to false will deselect the tool specified in the first argument. Otherwise the default value of true is used, which selects the tool.

If called with no arguments, the function will clear all tools from the current selection.

→ Parameters:

tool (object) – tool

select (boolean) – select

FlowView.SetPos(tool, x, y)

Moves a tool to a new position.

→ Python usage:

```python
# Align all selected tools to x co-ordinate of the ActiveTool
flow = comp.CurrentFrame.FlowView
x, y = flow.GetPosTable(comp.ActiveTool)
for t in comp.GetToolList(True).values():
cur_x, cur_y = flow.GetPosTable(t)
flow.SetPos(t, x, cur_y)
```

→ Lua usage:

```txt
-- Align all selected tools to x co-ordinate of the ActiveTool
local flow = comp.CurrentFrame.FlowView
local x, y = flow:GetPos(comp.ActiveTool)
```

```python
for i, t in pairs(comp:GetToolList(true)) do
cur_x, cur_y = flow:GetPos(t)
flow:SetPos(t, x, cur_y)
end
```

→ Parameters:
```
tool (object) - tool
x (number) - x
y (number) - y
```

FlowView.SetScale(scale)
Change the scale of the contents.
This function rescales the FlowView to the amount specified. A value of 1 for the scale argument would set the FlowView to 100%, while a value of 0.1 would set it to 10% of the default scale.

→ Parameters:
```
scale (number) - scale
```
