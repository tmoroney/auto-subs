This update fixes a serious problem in 3.10.0 where AutoSubs interfered with DaVinci Resolve's Fusion page: custom caption controls stopped responding and text fields lost focus while typing.

The cause was the new automatic start, which ran the AutoSubs connection inside Fusion's own script engine for the whole Resolve session. It has been removed. Start the connection the way you did before 3.10.0: open DaVinci Resolve and run **Workspace → Scripts → AutoSubs** once per session. It then stays connected in the background, even if you close and reopen AutoSubs.

**If you used 3.10.0, restart DaVinci Resolve once after updating.** Alternatively, running Workspace → Scripts → AutoSubs replaces the old connection straight away.

## Bug Fixes
- Fixed scripted Fusion controls and text fields freezing for the whole Resolve session — the 3.10.0 startup script ran the AutoSubs bridge inside Fusion's script executor; the bridge now only runs from Workspace > Scripts > AutoSubs. (If Resolve was open during the update, restart it.)
- Fixed Resolve crashing on quit while the AutoSubs bridge was running.
- Fixed the caption template dropdown hanging on "Loading templates..." and the app briefly showing "Disconnected" on projects with large media pools.
- Fixed caption preset thumbnails crashing Resolve 21.1 on save — they now render via timeline frame export instead.
- Fixed caption preview failures leaving the playhead moved and silently stuck tracks — failures are now reported and the playhead is restored.
- Fixed the Linux Resolve setup script failing on standard installs, and added Arch Linux setup documentation.
