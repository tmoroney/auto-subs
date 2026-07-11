> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## BinItem

**class BinItem**
Parent class: **Object**

## Methods

**BinItem.Delete()**
Delete the BinItem.

**BinItem.GetData([name])**
Get custom persistent data.

See Composition:GetData().
→ Parameters:
name (string) – name
→ Returns: Value
→ Return type: (number|string|boolean|table)

BinItem.SetData(name, value)
Set custom persistent data.
See Composition:SetData().
→ Parameters:
name (string) – name
value ((number|string|boolean|table)) – value
