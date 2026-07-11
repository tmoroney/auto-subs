> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# FontList

```python

## FontList

class FontList
Parent class: List
```

# Methods

FontList.AddFont(fontfile)
Adds the specified font to the global font list.

→ Parameters:
```
fontfile (string) - fontfile
```

→ Returns: success
→ Return type: boolean

FontList.Clear()
Empties the global font list.

FontList.GetFontList()
Returns all font files in the global font list.
→ Returns: fonts
→ Return type: table

FontList.ScanDir([dirname])
Adds the specified dir to the global font list.
→ Parameters:
`dirname (string) – dirname`
