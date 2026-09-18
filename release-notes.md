Blackmagic tightened the Lua sandbox in DaVinci Resolve 21.1, which broke the server-based integration AutoSubs used to communicate with Resolve. This release is a full rewrite of the Resolve integration so it works again on the latest Resolve versions, including the free edition.

One trade-off: the AutoSubs script inside Resolve can no longer launch the app for you. The upside is you never need to touch the script at all — the connection is already running in the background, so you just open AutoSubs.

## What's New
- Added automatic Resolve integration: the bridge now starts with DaVinci Resolve itself, so subtitles can be sent without launching a script first.
- Added support for DaVinci Resolve 21.1 (including the free edition), which removed the APIs the previous integration relied on.

## Improvements
- Improved Resolve script updates: the app and installers now keep integration scripts current automatically across app updates.
- Improved connection reliability so restarts and reconnects can't leave duplicate or stuck bridge instances.

## Bug Fixes
- Fixed Resolve scripts failing to load on Windows due to invalid generated paths.
- Fixed rare cases where the Resolve connection could stop responding after restarts.
- Fixed the macOS installer skipping per-user Resolve and Adobe setup in some environments.
