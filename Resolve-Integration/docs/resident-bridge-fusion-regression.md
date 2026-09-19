# Resident bridge loop breaks Fusion (3.10.0 regression) — investigation & fix plan

Status: **resolved by Fix 1** (scriptlib abandoned). Fixes 2 and 3 were not
pursued. See §0 for the outcome; the rest is kept as the investigation record.

## 0. Outcome (2026-09-19)

**Maintainer A/B on macOS, Resolve 21.1, build of `main` (which includes the
`0982f96` probe/ack change):**

* With the current `AutoSubs.scriptlib` installed: Fusion kept glitching. A
  Fusion text box **deselected itself every few seconds while typing**, and the
  macro's custom controls were still dead. So `0982f96` alone does not fix the
  regression. The `fusion:Execute` launch is the problem.
* Scriptlib deleted, Resolve restarted, bridge started from Workspace >
  Scripts > AutoSubs: **everything works**, with the bridge running and the app
  connected. This confirms the assumption behind Fix 1: the same loop in the
  Scripts-menu state does not disturb Fusion.

**Decision:** abandon the startup scriptlib for good. Zero-click startup would
need Fix 2 (`fusion:RunScript`) or Fix 3 (a trampoline). Both still run through
`fusion:`/executor machinery, and a regression here is too costly to justify.

**Implemented (Fix 1 + Fix 5):**

* `resolve_scripts.rs` no longer writes the scriptlib. It deletes
  `Fusion/Scripts/AutoSubs.scriptlib` at app start (and via
  `--install-resolve-scripts` from the NSIS hook) before any fallible step.
* macOS `postinstall` `rm -f`s it. deb/rpm no longer ship
  `/opt/resolve/Fusion/Scripts/AutoSubs.scriptlib`, so the package upgrade
  removes it. Their `linux/postinst.sh` also deletes each user's
  `~/.local/share/DaVinciResolve/Fusion/Scripts/AutoSubs.scriptlib` (written
  by the 3.10.0 app), so Resolve can't run a stale copy before the new app
  has been opened. `gen-resolve-linux.js` generates only the launcher.
* Templates `AutoSubs.scriptlib` and `AutoSubs (Dev).scriptlib` deleted.
  `setup-resolve-dev.js` removes stale dev/prod scriptlibs instead of
  generating one.
* The `mode = "startup"` branch was removed from `bootstrap.lua`. The manual
  takeover still stops a loop a 3.10.0 scriptlib left running, so running
  Utility > AutoSubs frees the executor without restarting Resolve.
* Copy: `RESOLVE_OFFLINE_MESSAGE`, the `titlebar.resolve.tooltip.openResolve`
  string in all 8 locales, `release-notes.md`, `AGENTS.md`, `README.md`,
  `caption-styles.md`, `docs/arch-linux.md`.

**Not done:** Fix 4 (fewer prefs reads, slower disconnected polling). It is
optional now that the loop no longer runs in the executor state; revisit only
if Scripts-menu users report Fusion hiccups. Report #2 (colour-drag crash) has
not been re-tested against this build.

Unused gating tests for Fixes 2/3 were written but not run (external
scripting is disabled on free Resolve 21.1, so `fuscript` cannot drive them).
They are not in the repo.

Affected release: AutoSubs **v3.10.0** (first release with the resident Resolve
bridge). Resolve **21.1** (free edition). Not affected: v3.9.0.

---

## 1. Symptoms reported

| # | Report | Reporter environment |
|---|--------|----------------------|
| 1 | Fusion page "completely breaks": mouse interaction with sliders, the Inspector and Text+ stops working. Downgrading to 3.9.0 fixes it. | Windows, 3.10.0 |
| 2 | Dragging a Background node's colour toward white in Fusion glitches and **crashes Resolve**. Only with the AutoSubs Resolve script installed; removing the files fixes it but the app reinstalls them on every launch. The effect persists after the AutoSubs window is closed; only quitting Resolve stops it. | Resolve 21.1, 3.10.0, RTX 5060 |
| 3 | (Maintainer) None of the **custom controls** on the AutoSubs caption macro respond any more. Only Font, Size and Center still work. | macOS, main branch |

## 2. What changed in 3.10.0

3.9.0 ran an `ljsocket` HTTP server that the user started by hand from
Workspace > Scripts. It ran only while the app was open, in the Scripts-menu
scripting state, and made **no `fusion:` API calls while idle**.

3.10.0 replaced it with a **resident file-mailbox bridge** (see
`Resolve-Integration/README.md`, "Resident bridge"):

* `AutoSubs.scriptlib` is installed into the root of the user's
  `Fusion/Scripts/` folder. Resolve runs every root scriptlib at startup. Ours
  hands the bootstrap to **`fusion:Execute()`**, which runs the bridge loop in
  Fusion's shared script executor for the lifetime of the Resolve process:

  `AutoSubs-App/src-tauri/resources/AutoSubs.scriptlib` lines 27–30:
  ```lua
  (fusion or fu):Execute(string.format(
      'local boot = assert(loadfile(%q))(); boot(%q, %q, false, { mode = "startup" })',
      bootstrap_path, resources_folder, app_executable))
  ```
* The loop (`StartServer()` in
  `AutoSubs-App/src-tauri/resources/modules/autosubs_core.lua`) is an infinite
  `while not quitServer do ... bmd.wait(0.05) end`.
* In the 3.10.0 tag, the idle loop made ~20 `fusion:GetPrefs` calls per second
  **plus one `fusion:SetPrefs("Global.AutoSubsBridge.Heartbeat", ...)` every
  second** (`git show v3.10.0:AutoSubs-App/src-tauri/resources/modules/autosubs_core.lua`,
  the `last_heartbeat` block inside `StartServer`).
* `resolve_scripts.rs` (`AutoSubs-App/src-tauri/src/resolve_scripts.rs`)
  rewrites `Utility/AutoSubs.lua` and `AutoSubs.scriptlib` into the user's
  Scripts folder on every app start (release builds), which is why the
  reporter in #2 saw the files "come back".

The manual launcher (`AutoSubs-App/src-tauri/resources/AutoSubs.lua`, run via
Workspace > Scripts > Utility > AutoSubs) still runs the same `StartServer()`
loop **inline in the Scripts-menu state**, exactly like 3.9.0 did
(`bootstrap.lua` `boot(...)` with `mode = "manual"`, which tail-calls
`AutoSubs:Init` → `StartServer`).

## 3. Root causes

There are two distinct mechanisms. Both come from the resident loop; neither is
in the macro or in the app's Rust side.

### 3a. CONFIRMED — the `fusion:Execute`'d loop monopolises Fusion's script executor

**Evidence.** Deleting `Fusion/Scripts/AutoSubs.scriptlib` and restarting
Resolve immediately restored every custom control on the macro (symptom #3).

**Why the symptom looks like "only Font/Size/Center work".** Every custom
control on the macro is a *script*, not a plain input:

* buttons use `BTNCS_Execute` (e.g. `UpdateAnimationButton`,
  `Resolve-Integration/autosubs-macro.setting` ~line 1237),
* combos/checkboxes use `INPS_ExecuteOnChange` (e.g. `Animation Level`,
  ~line 1136–1153),

and all of them do `loadstring(tool:GetData(...))()(comp, tool)`. Font, Size
and Center are the only controls that are direct `SourceOp = "Template"`
links with no script, so they are the only ones unaffected.

Fusion runs control scripts, `comp:Execute`, `fusion:Execute` and (evidently)
Console input through one serialised script executor. A script started with
`fusion:Execute` that never returns therefore blocks every later script for
the rest of the session. `bmd.wait()` does **not** yield the executor. The
codebase had already observed a narrower form of this
(`Resolve-Integration/docs/caption-styles.md` lines 65–66: "`RunScript`,
`comp:Execute`, `fusion:Execute` never run while a request is in flight", the
reason preset thumbnails moved to `ExportCurrentFrameAsStill`); the truth is
that they never run while the *resident loop exists at all*.

This almost certainly also contributes to report #1 (Text+ and Inspector
controls that run scripts on change appear dead), and it is unaffected by
anything on `main` — a build of `main` today still blocks macro controls.

The Scripts-menu state (manual launcher / 3.9.0) does not have this problem:
it ran for years as a resident loop while the app was open without control
reports. So the fix is about *where the loop runs*, not the loop itself.

### 3b. LIKELY — once-a-second `SetPrefs` fires `FusionApp::PrefsChanged`, disrupting the Inspector and crashing colour drags

Every bound `fusion:` call is marshaled through Resolve's UI event queue, and a
`SetPrefs` is delivered to Fusion as a `PrefsChanged` notification (already
established from the quit-time crash stack fixed in commit `0982f96`,
"Resolve crashes in FusionApp::PrefsChanged during ExitInstance"). In 3.10.0
the idle loop emitted that notification **once a second, forever, even with
the app closed**, plus ~20 `GetPrefs` round trips per second.

This fits report #1 (a drag in progress is reset each second) and report #2
(a `PrefsChanged` landing mid colour-picker drag crashes; "stays on after I
close AutoSubs" is the resident loop; "reinstalls every time" is
`resolve_scripts.rs`).

**Confidence: high but not confirmed.** Confirming evidence would be the
Resolve crash log for #2 showing `FusionApp::PrefsChanged` (or another prefs
frame) beneath the colour-control frames, or simply retesting #1/#2 against a
build of `main`.

**State on `main`.** Commit `0982f96` ("replace heartbeat with probe/ack")
already removed all continuous writes: the idle loop now writes nothing and
reads three keys (`Stop`, `Probe`, `Owner`) every 500 ms
(`autosubs_core.lua` `StartServer`, the `pref_tick >= 10` block, ~lines
2506–2522). Remaining prefs writes happen only per request: `bridge_ack` and
`bridge_respond` each do `SetPrefs` + `SavePrefs` (~lines 2407–2420) and
`bridge_claim` does a `SetPrefs`. The app polls `GetTimelineInfo` every 60 s
when connected and **every 5 s when no timeline is detected**
(`AutoSubs-App/src/contexts/ResolveContext.tsx` ~lines 137–150), so with the
app open a `PrefsChanged` + disk `SavePrefs` still occurs every 5–60 s.

## 4. Suggested fixes, in order

Do them in this order. Fix 1 is the mandatory hotfix; 2 and 3 are the durable
solutions (pick the first that passes its gating test); 4 and 5 are hardening.

### Fix 1 (hotfix, ship as 3.10.1): stop installing the scriptlib and remove installed copies

Guaranteed to work — it is exactly 3.9.0 behaviour plus the mailbox transport,
and the manual launcher already performs the full takeover handshake.

1. `AutoSubs-App/src-tauri/src/resolve_scripts.rs`: stop writing
   `AutoSubs.scriptlib` (and `AutoSubs (Dev).scriptlib` in dev tooling).
   **Add a step that deletes an existing `AutoSubs.scriptlib` from the user's
   Scripts root** — every 3.10.0 user has one, and it must go on upgrade or the
   blocking loop survives the update. The AGENTS.md note says installers also
   drop these files: check NSIS (`AutoSubs.exe --install-resolve-scripts`
   reuses the Rust path, so fixing Rust covers it), the macOS pkg postinstall
   (sed-substitutes templates — remove the scriptlib from it), and the deb/rpm
   copies generated by `scripts/gen-resolve-linux.js`.
2. Update copy: `RESOLVE_OFFLINE_MESSAGE` in
   `AutoSubs-App/src-tauri/src/resolve_bridge.rs` (~line 35) currently says
   "the bridge starts automatically"; the i18n strings for the Resolve
   disconnected state (all 8 locales, see AGENTS.md §6) and
   `Resolve-Integration/README.md` / `AGENTS.md` §1 "Zero-click startup" need
   to say the user runs Workspace > Scripts > AutoSubs once per Resolve
   session.
3. Ship together with `0982f96` (already on `main`), which fixes the
   `PrefsChanged` storm for anyone who still has a stale scriptlib for a
   session.
4. Release note: users who had 3.10.0 must **restart Resolve** after
   updating; the old resident loop lives until Resolve quits.

Verification: fresh Resolve start with the app installed → no
`AutoSubs.scriptlib` in `Fusion/Scripts/`; macro custom controls work; running
Utility > AutoSubs starts the bridge and the app connects; controls keep
working with the bridge running (this last point is the assumption that the
Scripts-menu state does not block the executor — verify it explicitly, it has
only been inferred from 3.9.0's history).

### Fix 2 (restore zero-click): launch from the scriptlib with `fusion:RunScript` instead of `fusion:Execute`

The Fusion manual documents `Fusion:RunScript(filename)` as the file-based
analogue of the Scripts menu (`.agents/skills/davinci-resolve-fusion/references/fusion-manual/classes/fusion.md`
~line 848 and `02-scripting-languages.md` ~line 229). If, on Resolve 21.1, it
still exists on the `fusion` object and runs the file in a Scripts-menu-style
thread, the scriptlib can simply do
`fusion:RunScript(<Scripts>/Utility/AutoSubs.lua)` (or a copy of it launched
with `mode = "startup"` so it no-ops when a loop is already alive).

**Gating test (Resolve Console, Fusion page):**
```lua
print(fusion.RunScript)          -- must not be nil
fusion:RunScript("/path/to/test.lua")  -- test.lua: while true do bmd.wait(0.05) end
```
Then click a macro custom control (e.g. "Update Animation"). If it runs while
test.lua is looping, `RunScript` is a separate thread and this fix is viable.
Note `Composition:RunScript` is known to be nil on 21.1, so expect this may
fail.

Keep the `bridge_alive` / `Owner` / `Stop` handshake from `bootstrap.lua`
unchanged; only the launch primitive changes.

### Fix 3 (restore zero-click, fallback): replace the infinite loop with a self-rescheduling "trampoline"

If `RunScript` is unavailable, keep `fusion:Execute` but never hold the
executor: the executed chunk performs **one** poll tick (check `Stop`/`Owner`/
`Probe`, and if `request.lua` exists, handle that one request), then calls
`fusion:Execute(<itself>)` and returns. Control scripts queued in between run
before the next tick.

**Gating tests (Console):**
```lua
fusion:Execute("X = (X or 0) + 1; print(X)")
fusion:Execute("X = (X or 0) + 1; print(X)")
```
* Prints `1`, `2` → globals persist across `Execute` calls; the module cache
  (`AutoSubs_loaded`, `AUTOSUBS_LAST_REQUEST_ID`, `AUTOSUBS_OWNER`) survives
  and the tick chunk can be `AutoSubs:Tick()`.
* Prints `1`, `1` → each `Execute` is a fresh state; the tick chunk must be a
  tiny self-contained stub that only `loadfile`s `bootstrap.lua` +
  `autosubs_core.lua` when `bmd.fileexists(REQUEST_FILE)` is true, and
  handshake state must live in prefs rather than globals.

Second test: `fusion:Execute("bmd.wait(0.25); fusion:Execute([[print('tick')]])")`
followed immediately by clicking a macro button — the button script must run
between the two chunks.

Design notes:
* Tick cadence ~250 ms (`bmd.wait(0.25)` inside the chunk is acceptable: the
  executor is blocked only for that long, and the button scripts then run).
  Mailbox latency stays well under the 2 s `ACK_TIMEOUT` in
  `resolve_bridge.rs`.
* Long handlers (AddSubtitles, ExportAudio) still block controls for their
  duration — acceptable and identical to today.
* `ReloadServer` / `Exit` handlers currently signal via the `control` table
  returned to `StartServer`; they become "don't reschedule".
* The takeover in `bootstrap.lua` (`mode = "manual"`) waits for `Stop` to be
  cleared by the exiting loop; the trampoline's final tick must clear it the
  same way (the block after the `while` loop in `StartServer`, ~lines 2623–2634).

### Fix 4 (hardening): reduce remaining prefs traffic

Independent of 1–3. In `StartServer` (or the tick), collapse the three idle
reads into one `fusion:GetPrefs("Global.AutoSubsBridge")` table read and
relax the cadence to ~1 s (takeover latency of 1 s is fine; the manual
launcher already waits up to 4 s). Consider raising the disconnected poll
cadence in `ResolveContext.tsx` (5 s → 15–30 s) so an idle app does not cause
a `SavePrefs`/`PrefsChanged` every 5 s while the user works in Fusion with no
timeline open.

### Fix 5 (documentation): correct the recorded assumptions

* `AGENTS.md` §1 and §3, `Resolve-Integration/README.md`, and
  `Resolve-Integration/docs/caption-styles.md` lines 65–66 should state that a
  script started via `fusion:Execute` holds Fusion's shared script executor
  until it returns (control scripts, `comp:Execute`, Console included), and
  that `bmd.wait` does not yield it. The current "only while inside a request"
  wording is wrong.
* Add the rule: **never run a long-lived loop via `fusion:Execute`.**

## 5. Test checklist for whichever fix lands

1. Fresh Resolve start (app installed, app closed): macro custom controls
   (Update Animation, Animation Level combo, Highlight toggles) respond.
2. Same with the bridge running and the app connected: controls still respond;
   app shows "Connected"; a Send works.
3. Fusion page, Background node, drag colour toward white for 30 s with the
   bridge running — no crash (report #2).
4. Inspector slider drags are smooth with the bridge running (report #1).
5. Quit Resolve with the bridge running — no crash (the `0982f96` scenario).
6. Upgrade path from 3.10.0: after installing the new build and restarting
   Resolve, `Fusion/Scripts/AutoSubs.scriptlib` is gone (Fix 1) or replaced
   by the non-blocking launcher (Fix 2/3).
7. Windows and macOS both — report #1 is Windows-only so far.

## 6. Key files

| Purpose | Path |
|---------|------|
| Startup launcher (the offending `fusion:Execute`) | `AutoSubs-App/src-tauri/resources/AutoSubs.scriptlib` |
| Manual launcher (Scripts-menu state, known good) | `AutoSubs-App/src-tauri/resources/AutoSubs.lua` |
| Handshake, module loader, `boot()` | `AutoSubs-App/src-tauri/resources/modules/bootstrap.lua` |
| Bridge loop `StartServer`, `bridge_ack/claim/respond` | `AutoSubs-App/src-tauri/resources/modules/autosubs_core.lua` (~2400–2700) |
| Installs/refreshes the scripts at app start | `AutoSubs-App/src-tauri/src/resolve_scripts.rs` |
| Rust side of the mailbox, offline message | `AutoSubs-App/src-tauri/src/resolve_bridge.rs` |
| App polling cadence | `AutoSubs-App/src/contexts/ResolveContext.tsx` |
| Macro whose controls are scripts | `Resolve-Integration/autosubs-macro.setting` |
| Heartbeat → probe/ack fix already on main | commit `0982f96` |
