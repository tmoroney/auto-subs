> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# Preview

class Preview
Parent class: PlainInput

# Methods

Preview.Close()
Closes the current clip.

Preview.Create(tool[, filename])
Renders a new preview clip.

→ Parameters:
tool (Tool) – tool
filename (string) – filename

→ Returns: success
→ Return type: boolean

Preview.DisplayImage(img)
Displays an Image object.

→ Parameters:
img (Image) – img
→ Returns: success
→ Return type: boolean

## Preview.IsPlaying()
Indicates if the preview is currently playing.
→ Returns: playing
→ Return type: boolean

## Preview.Open(filename)
Opens a filename for seeking and playback.
→ Parameters:
filename (string) – filename
→ Returns: success
→ Return type: boolean

## Preview.Play([reverse])
Plays the current clip.
→ Parameters:
reverse (boolean) – reverse

## Preview.Seek(frame)
Seeks to specified frame.
→ Parameters:
frame (number) – frame

## Preview.Stop()
Stops playback.

## Preview.ViewOn(tool)
Attaches a Preview to a Tool to display its output.
→ Parameters:
tool (Tool) – tool
→ Returns: success
→ Return type: boolean
