## What's New
- Added optional MMS forced alignment to refine word-level timestamps after transcription.

## Improvements
- Improved settings dialog readability with a scroll-down hint and better forced-alignment placement.
- Improved transcription performance by skipping forced alignment for models that already output native word timestamps.
- Improved forced alignment coverage for low-resource scripts and numeric words.
- Added the MMS aligner to the cached models list for easier cache management.

## Bug Fixes
- Fixed Resolve audio export incorrectly reporting failure when DaVinci Resolve is set to a non-English locale.
- Improved forced alignment accuracy by trimming padded audio frames.
