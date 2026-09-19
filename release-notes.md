This update fixes a serious problem in 3.10.0 where AutoSubs interfered with DaVinci Resolve's Fusion page: custom caption controls stopped responding and text fields lost focus while typing.

The cause was the new automatic start, which ran the AutoSubs connection inside Fusion's own script engine for the whole Resolve session. It has been removed. Start the connection the way you did before 3.10.0: open DaVinci Resolve and run **Workspace → Scripts → AutoSubs** once per session. It then stays connected in the background, even if you close and reopen AutoSubs.

**If you used 3.10.0, restart DaVinci Resolve once after updating.** Alternatively, running Workspace → Scripts → AutoSubs replaces the old connection straight away.

## Bug Fixes
- Fixed caption template controls (animation, highlight and other custom options) not responding on the Fusion page.
- Fixed Fusion text fields deselecting while typing.
- The AutoSubs startup script from 3.10.0 is now removed automatically on update.
