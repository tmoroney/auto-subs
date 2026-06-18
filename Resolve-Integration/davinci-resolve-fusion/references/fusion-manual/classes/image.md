> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## Image

```txt

class Image
Parent class: Parameter
```

## Members

```txt
Image.DataWindow
Rectangle of valid data pixels, in a table (read-only).
→ Getting:
rect = Image.DataWindow - (table)
```

Image.Depth
Image depth indicator (not in bits) (read-only).
→ Getting:
val = Image.Depth – (number)

Image.Field
Field indicator (read-only).
→ Getting:
val = Image.Field – (number)

Image.Height
Actual image height, in pixels (read-only).
→ Getting:
val = Image.Height – (number)

Image.OriginalHeight
Unproxied image height, in pixels (read-only).
→ Getting:
val = Image.OriginalHeight – (number)

Image.OriginalWidth
Unproxied image width, in pixels (read-only).
→ Getting:
val = Image.OriginalWidth – (number)

Image.OriginalXScale
Unproxied pixel X Aspect (read-only).
→ Getting:
val = Image.OriginalXScale – (number)

Image.OriginalYScale
Unproxied pixel Y Aspect (read-only).
→ Getting:
val = Image.OriginalYScale – (number)

Image.ProxyScale
Image proxy scale multiplier (read-only).
→ Getting:
val = Image.ProxyScale – (number)

Image.Width
Actual image width, in pixels (read-only).
→ Getting:
val = Image.Width – (number)

Image.XOffset
Image X Offset (read-only).
→ Getting:
val = Image.XOffset – (number)

Image.XScale
Pixel X Aspect (read-only).
→ Getting:
val = Image.XScale – (number)

Image.YOffset
Image X Offset (read-only).
→ Getting:
val = Image.YOffset – (number)

Image.YScale
Pixel Y Aspect (read-only).
→ Getting:
val = Image.YScale – (number)
