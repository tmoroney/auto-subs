**Resolve users: this fixes a serious 3.10.0 bug** where AutoSubs froze the Fusion page — caption controls stopped responding and text fields lost focus. The automatic start that caused it is gone.

To connect, run **Workspace → Scripts → AutoSubs** once per session, like before 3.10.0. Note the script can no longer open the AutoSubs app for you — Resolve's free edition removed that ability — so launch AutoSubs yourself first. **If you used 3.10.0, restart Resolve once after updating.**

## Bug Fixes
- Fixed scripted Fusion controls and text fields freezing for the whole Resolve session.
- Fixed Resolve crashing on quit while the AutoSubs bridge was running.
- Fixed the caption template dropdown hanging on "Loading templates..." and the app briefly showing "Disconnected" on projects with large media pools.
- Fixed caption preset thumbnails crashing Resolve 21.1 on save — they now render via timeline frame export instead.
- Fixed caption preview failures leaving the playhead moved and silently stuck tracks — failures are now reported and the playhead is restored.
- Fixed the Linux Resolve setup script failing on standard installs, and added Arch Linux setup documentation.
