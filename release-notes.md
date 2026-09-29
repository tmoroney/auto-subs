## What's New
- Added word-timing refinement for Whisper: caption timings now snap to actual speech boundaries, reducing drift and overhang on word-level captions.
- Added a Speech Detection toggle so you can turn off silence skipping when words are missed on band-limited audio like phone calls.

## Improvements
- Reorganized transcription options into Density and Advanced sections, and simplified the settings dialog.
- Improved the app's look and feel on macOS: smoother window zoom, faster sidebar resizing, and window colors that follow your app theme.
- Changed the default caption style to Chalkboard Bold.
- Improved reliability of the downloaded models list, which could appear empty until you ran a transcription.

## Bug Fixes
- Fixed subtitles failing to reach the timeline in Resolve when the target video track was occupied, the most common Send failure on Resolve 21.
- Fixed audio extraction failing on non-English installs of Resolve.
- Fixed the Resolve connection dropping on Windows when the user folder name contains non-English characters.
- Fixed the app crashing when transcribing long stretches of uninterrupted speech.
- Fixed translation aborting when a single line failed; failed lines now keep their original text, and a clear error appears only if translation fails entirely.
- Fixed imported SRT files with Windows line endings collapsing into a single caption.
- Fixed words occasionally being dropped or collapsed when caption timings were refined.
