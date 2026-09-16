## What's New
- Added the Orukeet transcription model, now the recommended choice with accuracy and speed ratings.
- Added Omni-ASR CTC models for less common languages, with guidance in the language picker.
- Added GigaAM v3 for Russian and GigaAM Multilingual for Central Asian languages.
- Added a full Russian UI translation.
- Added caption preset previews so you can see a style before applying it.
- Added batch restyling to update existing captions already on the Resolve timeline.
- Added a text-wrap option for animated captions.
- Redesigned the processing screen with live progress and parallel model downloads.
- Moved caption styling into the subtitle viewer with a slide-up output panel.

## Improvements
- Improved the preset gallery with thumbnails, name overlays, and your presets listed first.
- Improved the model picker with clearer descriptions and badges.
- Improved speech detection so words are no longer split at chunk boundaries.
- Faster caption application in Resolve during bulk updates.
- Window size is now remembered between launches.
- Resolve caption styling is now edited directly in Fusion for both bundled and custom templates.

## Bug Fixes
- Fixed transcription hangs on long audio files.
- Fixed model downloads failing to resume or cancel correctly.
- Fixed caption word timing, markers, and highlight drift in Resolve.
- Fixed fractional frame rounding when adding captions to the timeline.
- Fixed preview rendering crashes on Resolve 21.
- Fixed stale caption preview clips after switching timelines.
- Fixed Whisper crashes on Intel Macs.
- Fixed ONNX models defaulting to DirectML on Windows with proper CPU fallback.
- Fixed Premiere captions landing at the wrong timeline offset.
- Fixed translation no-ops when source and target languages match.
- Fixed negative timecodes in SRT exports.
- Fixed unwanted autocorrect and autocapitalization on text fields.
