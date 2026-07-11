> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## ImageCacheManager

class ImageCacheManager
Parent class: Object

## Methods

ImageCacheManager.FreeSpace()
FreeSpace

ImageCacheManager.GetSize()
GetSize

## ImageCacheManager.IsRoom()

This is useful to see how much room there currently is in the cache manager by checking to see if a certain number of bytes will fit without needing to purge/flush.

bytes The number of bytes to check.

Returns a boolean indicating whether or not there is room in the cache manager for the number of bytes passed as an argument.

## ImageCacheManager.Purge()

This function allows the cache to be purged exactly as if doing so interactively in Fusion.
