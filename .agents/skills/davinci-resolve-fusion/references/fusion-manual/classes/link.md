> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## Link

class Link
Parent class: LockableObject
Represents the parent class of Input and Outputs.

## Members

Link.ID
ID of this Link (read-only).
→ Getting:
id = Link.ID – (string)

Link.Name
Friendly name of this Link (read-only).
→ Getting:
name = Link.Name – (string)

## Methods

Link.GetData([name])
Get custom persistent data.

See Composition:GetData().
→ Parameters:
name (string) – name
→ Returns: value
→ Return type: (number|string|boolean|table)

Link.GetTool()
Returns the Tool object that owns this Link.
→ Returns: tool
→ Return type: Tool

Link.SetData(name, value)
Set custom persistent data.

See Composition:SetData().
→ Parameters:
name (string) – name
value ((number|string|boolean|table)) – value
