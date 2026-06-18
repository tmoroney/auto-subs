> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# TimeRegion

class TimeRegion
Parent class: List

# Members

TimeRegion.End

→ Getting:
val = TimeRegion.End – (number)

TimeRegion.Start

→ Getting:
val = TimeRegion.Start – (number)

# Methods

TimeRegion.FromFrameString(frames)
Reads a string description.

→ Parameters:
frames (string) – frames

TimeRegion.FromTable(frames)
Reads a table of (start, end) pairs.

→ Parameters:
frames (table) – frames

TimeRegion.ToFrameString()
Returns a string description.

→ Returns: frames
→ Return type: string

TimeRegion.ToTable()
Returns a table of (start, end) pairs.

→ Returns: frames
→ Return type: table
