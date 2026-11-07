# AutoSubs DaVinci Resolve-Integration

This document describes how AutoSubs integrates with DaVinci Resolve: architecture, communication protocol, Lua server, Fusion macro, and development workflow.

## Quick Navigation

**What do you want to do?**

- **Set up development environment** → [Development Workflow](#development-workflow)
- **Change Resolve integration logic** → [Lua Server](#lua-server-autosubs_corelua)
- **Modify the animated caption** → [Caption styles](docs/caption-styles.md)
- **Understand the architecture** → [Architecture](#architecture)

## Architecture

```mermaid
flowchart TD
    ReactFE[React Frontend] <-->|Tauri IPC| RustBE[Rust Backend]
    RustBE <-->|Tauri command| resolve_bridge[resolve_bridge.rs]
    resolve_bridge <-->|File mailbox| LuaServer[Lua Server in Resolve]
    LuaServer <-->|Resolve API| Resolve[DaVinci Resolve]
    LuaServer <-->|Fusion API| Fusion[Fusion Page]
    Fusion <-->|Macro| Macro[autosubs-macro.setting]
```

- **React Frontend**: UI for timeline selection, export settings, subtitle preview
- **Rust Backend (`resolve_bridge.rs`)**: writes mailbox requests and polls the mailbox and `Fusion.prefs` for the response
- **Lua Server (`autosubs_core.lua`)**: file-mailbox loop running inside Resolve (Workspace > Scripts)
- **Fusion Macro (`autoSubs-macro.setting`)**: Fusion template for animated captions with per-word highlighting

### Why the File Mailbox?

Resolve 21.1 (free edition) sandboxes the Lua state that runs Workspace > Scripts scripts: `io`, `ffi`, `package`, `require`, `os.execute` and `bmd.readdir` are all nil, so the old `ljsocket` HTTP server on port 56002 can no longer exist. Resolve 21.1.2 also removed `loadfile`, `dofile`, `bmd.readfile`, `fu:SavePrefs` and `fu:LoadPrefs`. The bridge is a file mailbox in a shared dir (`<data_local_dir>/com.autosubs/resolve-bridge`), the only transport:

- **Rust → Lua**: `resolve_bridge.rs` atomically writes `request.lua` (a `return {...}` chunk with an id and a JSON body). The Lua loop picks it up with `AutoSubs_loadfile`: `loadfile` where it exists, otherwise `fu:OpenFile` + `ReadLine` + `load`. `ReadLine` cuts a line at 65535 bytes, so a long body is split over several lines as a `table.concat` of strings. The chunk stays valid for `loadfile`, so one format serves every Resolve version.
- **Lua → Rust**: an ack and a response (`<id>:<base64 json>`, so Rust never has to parse Lua string escaping). Without `SavePrefs` (21.1.2) they go to `ack.txt` and `response.txt` in the mailbox via `fu:OpenFile` + `WriteLine`. With `SavePrefs` (older versions) the Lua side calls `fusion:SetPrefs("Global.AutoSubsBridge.Ack"/".Response", ...)` then `fusion:SavePrefs()`, which flushes `Fusion.prefs` to disk. Rust polls both.

The Lua side must not use `io`, `ffi`, `package`, `require`, `loadfile`, `dofile`, `os.execute` or `bmd.readdir` directly anywhere — modules are loaded through `AutoSubs_require` and files through `AutoSubs_loadfile` (see `modules/bootstrap.lua`).

#### What 21.1.2 leaves for file access

Measured with [`diagnostics/sandbox_probe.lua`](diagnostics/sandbox_probe.lua) on Linux, and again on macOS 15 (Apple Silicon) with Resolve 21.2 free, which gives the same results apart from the `GetSubFolderList` row; the `fu:SetData` flush was not measured there. Re-run the probe when a Resolve update breaks the bridge.

| Call | Result on 21.1.2 |
|---|---|
| `fu:OpenFile(path, 1)` + `file:ReadLine()` | Reads text, line ending included, max 65535 bytes per line, nil at the end. `FILE_MODE_READ` is nil, the value is 1 |
| `file:Read(n)` | Returns a `MemBlock`, not a string. `bmd.writestring(block)` renders it as hex text |
| `fu:OpenFile(path, 2)` + `file:WriteLine(text)` | Writes text plus a line break, 1 MiB in one call works. `FILE_MODE_WRITE` is nil, the value is 2 |
| `file:Write(text)` | Silently writes nothing. `Write` only takes a `MemBlock` |
| `fu:SetData(key, value)` | Writes `Fusion.prefs` to disk at once as a side effect, so the launcher uses it where `SavePrefs` is gone. A big value lands in the file too |
| `fu:RunScript(path)` | Works, starts within 50 ms from a Scripts-menu loop, in a separate Lua state without a shared `_G`. Parses `.py` files as Lua |
| `fu:LoadComp(path, true, true, true)` | Reads a comp hidden. `comp:Save` and `comp:SaveCopyAs` are nil |
| `MediaStorage:GetSubFolderList(path)` | Empty for anything outside the registered Media Storage volumes. On macOS the boot volume is one of them (`/Volumes/Macintosh HD`), so any path under the home folder lists, as `/Volumes/Macintosh HD/Users/...` |

Never touch `fu.UIManager`, not even to test whether it exists: on the free edition that lookup alone opens the "You have reached a limitation" upgrade dialog.

### Resident server

The user starts the bridge once per Resolve session from Workspace → Scripts → AutoSubs. From then on it is **resident**: it keeps running after the app closes (so reopening the app reconnects immediately) and the app never starts or stops it.

3.10.0 tried a zero-click start: an `AutoSubs.scriptlib` in the Scripts root handed the bootstrap to `fusion:Execute()` at Resolve launch. That was removed in 3.10.1, and the app now deletes any installed copy. A loop started with `fusion:Execute` holds Fusion's shared script executor until it returns (macro control scripts, `comp:Execute` and the Console all queue behind it, and `bmd.wait` does not yield it), so every scripted macro control stopped responding and Fusion text fields dropped focus for the whole session. **Never run a long-lived loop via `fusion:Execute`.** Details: [docs/resident-bridge-fusion-regression.md](docs/resident-bridge-fusion-regression.md).

In-memory prefs keys coordinate launches (never `SavePrefs`'d). A launch checks `bridge_alive()` before starting: a fresh `Global.AutoSubsBridge.Heartbeat` (written once a second by pre-probe loops, and once at claim time) means alive, otherwise the launch writes a unique `Global.AutoSubsBridge.Probe` token and waits ~1.5 s for the loop to echo it into `Global.AutoSubsBridge.ProbeAck` (the loop polls prefs ~2x/sec). The idle loop deliberately writes **no** prefs: every bound `fusion:` call is marshaled through Resolve's UI event queue, and a queued prefs event landing during Resolve's shutdown teardown crashed the app in `FusionApp::PrefsChanged` — minimal traffic is the mitigation. The winner claims `Global.AutoSubsBridge.Owner` with a unique token (last-writer-wins after a settle window), and a running loop that sees a foreign `Owner` exits. The Utility/Dev scripts launch with `mode = "manual"` (takeover: set `Stop` to the current timestamp, wait up to 4 s for the old loop to exit and clear it, then start fresh) — so running Workspace → Scripts → AutoSubs is the "restart the bridge" path. A loop exits when `Stop` differs from the value it read at startup, so a takeover aimed at a loop busy in a Resolve call still lands when it resumes, and never kills the replacement. Each mailbox request is claimed via `Global.AutoSubsBridge.Claim` before handling, so two briefly-coexisting loops can't run the same request twice.

## Communication Flow

```text
React Frontend
  → invoke('resolve_bridge', { payload, timeoutSecs })
  → Rust resolve_bridge.rs
  → write request.lua into the mailbox dir
  → Lua server (autosubs_core.lua) reads it with AutoSubs_loadfile
  → Resolve/Fusion API
  → Lua writes ack + response (mailbox files, or Fusion.prefs before 21.1.2)
  → Rust polls both → body → Frontend JSON.parse()
```

On failure the Lua server returns:
```json
{ "error": "Short user-facing message", "detail": "Raw error", "func": "Failed function name" }
```

The frontend `throwIfError` helper in `resolve-api.ts` checks for this and throws a `ResolveApiError`.

## Development Workflow

### Setup

```bash
# In AutoSubs-App/
npm install
npm run setup-resolve   # generates AutoSubs (Dev).lua in Resolve's Scripts folder
npm run dev             # starts the app in dev mode
```

### Using the Dev Launcher

1. Open DaVinci Resolve
2. Go to **Workspace → Scripts → AutoSubs (Dev)**
3. The Lua server starts (no app window)
4. Edit files in `src-tauri/resources/modules/` and re-run the script to pick up changes
5. Re-run `npm run setup-resolve` if you move the repository

### Key Lua Files

| File | Purpose |
|---|---|
| `modules/autosubs_core.lua` | Main server and Resolve API functions |
| `modules/caption_style.lua` | Everything that differs between the two caption kinds |
| `modules/bootstrap.lua` | Platform detection, `AutoSubs_require` module shim, `AutoSubs_loadfile`, base64 |
| `modules/font_fallback.lua` | Font fallback for non-Latin scripts |
| `modules/timecode.lua` | Pure-Lua timecode <-> frame conversion |

### Debugging

- **Lua**: Use `print()` — output appears in Resolve's Console (**Script → Console**)
- **Bridge**: Check Rust backend logs for `resolve_bridge` requests; the mailbox dir is `<data_local_dir>/com.autosubs/resolve-bridge`. Replies land in `ack.txt` and `response.txt` there, or in `Fusion.prefs` under `Global.AutoSubsBridge.*` before 21.1.2
- **Sandbox**: `Resolve-Integration/diagnostics/sandbox_probe.lua` reports what the current Resolve version still allows. Run `sh sandbox_probe_setup.sh` next to it with Resolve closed, then start **AutoSubs Sandbox Probe** from Workspace → Scripts. On macOS with 21.2 the Console can stay empty, and Resolve may crash a few seconds after the probe ends (SIGSEGV in `Fusion::loadstringval`, in a separate script thread; the bridge never uses the calls involved). Start Resolve from a terminal with stdout redirected (`"/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/MacOS/Resolve" > probe.log 2>&1`) to keep the output either way
- **Fusion**: Inspect tool inputs in the Fusion inspector or check node connections in the Flow view

### Common Issues

| Symptom | Fix |
|---|---|
| Server not responding | Confirm Resolve is running and the dev script was launched; delete a stale `request.lua` from the mailbox dir if one lingers |
| Macro not found | Verify `autosubs-macro.setting` is in the correct location and re-import if needed |
| Animation not working | Check KeyStretcherMod connection, verify animation length > 0 and the animation is enabled |

## Lua Server (`autosubs_core.lua`)

### Server Startup

Both scripts are thin **launchers** — they run `modules/bootstrap.lua`, which sets up module loading (`AutoSubs_require`) and calls `AutoSubs:Init()`. All real logic lives in `autosubs_core.lua`; there is almost never a reason to edit the launchers.

- **Production** (`AutoSubs.lua`): Carries `bootstrap.lua` and every module as strings and runs them with `load`, with `mode = "manual"` (restarts the resident bridge). It needs no file access to start.
- **Development** (`AutoSubs (Dev).lua`): Reads `bootstrap.lua` from your repo checkout (`loadfile`, or `fu:OpenFile` on 21.1.2) with `dev_mode = true`. Lua edits take effect on next script run.

### How the Launchers Are Generated

`AutoSubs.lua` is generated — do not hand-edit the installed copy:

- **Template**: `src-tauri/resources/AutoSubs.lua` contains `[[__AUTOSUBS_RESOURCES_FOLDER__]]` / `[[__AUTOSUBS_APP_EXECUTABLE__]]` placeholders, plus two bare expressions: `__AUTOSUBS_MAILBOX_DIR__`, which the app substitutes with a `[[...]]` path (ANSI-safe on Windows so file APIs see the mailbox), and `__AUTOSUBS_MODULE_BUNDLE__`, which the build substitutes with the modules. Unsubstituted they read as nil globals: bootstrap then derives the mailbox from the environment, and the launcher falls back to the resources folder, which needs a Resolve with `loadfile`.
- **Bundle**: `npm run build:tauri-prep` runs `scripts/gen-resolve-linux.js`, which writes `src-tauri/resources/AutoSubs.bundled.lua` (gitignored): the template with every file in `modules/` inlined as a long string (`scripts/resolve-bundle.js`). Modules stay separate chunks, so Lua's per-function limits on locals and upvalues still apply to each module alone. All installers below start from this one file.
- **App startup**: release builds run `resolve_scripts.rs`, which substitutes the real paths and writes `Utility/AutoSubs.lua` into the user's Resolve Scripts folder, but only when the content differs, and deletes a 3.10.0 `AutoSubs.scriptlib` from the Scripts root. This means a Tauri app update refreshes the launcher without a reinstall. Dev builds skip it entirely so the dev launcher wins.
- **Installers** also drop the launcher before the app first runs: the NSIS hook runs `AutoSubs.exe --install-resolve-scripts` (the same Rust path, but pre-seeding the Scripts tree), the macOS pkg postinstall sed-substitutes the bundled file, and deb/rpm ship copies generated by `scripts/gen-resolve-linux.js` into `/opt/resolve/Fusion/Scripts/`.
- **Hot reload**: `ReloadServer` drops the bundle and reads the updated modules from the resources folder through `AutoSubs_loadfile`. If that fails the running code restarts from the bundle.
- **Windows**: Lua's `loadfile` reads narrow `fopen` paths, so the baked bytes are ANSI code page (falling back to the 8.3 short path, then UTF-8) rather than UTF-8. How `fu:OpenFile` treats these bytes has not been measured on Windows; if the reply file can't be written, the Lua side falls back to `Fusion.prefs`.

`AutoSubs (Dev).lua` follows the same pattern: `npm run setup-resolve` reads the template from `src-tauri/resources/AutoSubs (Dev).lua` and writes a generated copy — with your repo's absolute path baked in — to Resolve's Scripts folder.

### Exposed Functions

**Every function must be defined in two places:**

1. **`src/api/resolve-api.ts`** — TypeScript wrapper that calls `callResolve({ func: 'FunctionName', ...params })` and handles errors
2. **`modules/autosubs_core.lua`** — Lua handler that runs inside Resolve and does the actual work

Adding a function in only one place will silently do nothing (the call reaches the Lua server but finds no matching handler, or the frontend has no way to invoke it).

A typical pair looks like:

```ts
// resolve-api.ts
export async function jumpToTime(seconds: number) {
  return callResolve({ func: 'JumpToTime', seconds });
}
```

```lua
-- autosubs_core.lua, in the `handlers` table
JumpToTime = function(req)
    JumpToTime(req.seconds)
    return { message = "Jumped to time" }
end,
```

Handlers take the decoded request table rather than positional arguments, so a
field renamed on the TypeScript side arrives as `nil` instead of silently
shifting every argument after it. The return value is encoded as the response
body; a handler that stops or reloads the server returns a control table
(`{ quit = true }`) as its second result.

| Function | Description |
|---|---|
| `ExportAudio` | Exports timeline audio. Non-blocking — poll with `GetExportProgress`. |
| `GetExportProgress` | Returns export progress `{ active, progress, status }`. |
| `CancelExport` | Cancels the current audio export. |
| `GetTimelineInfo` | Returns current timeline metadata (frame rate, duration, tracks). |
| `GetTemplates` | Lists Fusion templates available in the media pool. |
| `CheckTrackConflicts` | Checks if subtitles would conflict with existing clips on a track. |
| `AddSubtitles` | Adds subtitle clips to the timeline using the Fusion macro. |
| `GeneratePreview` | Renders a single preview frame of a subtitle clip. |
| `BatchApplyStyle` | Restyles caption clips already on the timeline. |
| `OpenPresetEdit` | Opens a caption in Fusion for editing and keeps it open. |
| `SavePresetEdit` | Reads the open caption's values, renders its thumbnail, closes. |
| `CancelPresetEdit` | Closes the edit session without reading anything. |
| `JumpToTime` | Moves the playhead to a given time in seconds. |

For parameters and return shapes, the Lua handlers in `autosubs_core.lua` are the authoritative reference.


## Caption styles and the Fusion macro

The two kinds of caption, the preset format, and how a style is edited are
documented separately:

- [`docs/caption-styles.md`](docs/caption-styles.md) - the two caption kinds, the preset format, the macro, and the editing round trip
- [`docs/animation-system.md`](docs/animation-system.md) - how the macro implements its animations
- [`docs/maintainer-template-release.md`](docs/maintainer-template-release.md) - regenerating `caption-bin.drb` for a release

## Platform-Specific Notes

### Windows

- Windows paths from `os.getenv` are ANSI-codepage bytes, which is what `loadfile` expects — do not convert them
- App: `%LOCALAPPDATA%\AutoSubs\AutoSubs.exe`
- Resources: `%LOCALAPPDATA%\AutoSubs\resources`
- Scripts: `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\`

### macOS

- App: `/Applications/AutoSubs.app`
- Resources: `/Applications/AutoSubs.app/Contents/Resources/resources`
- Scripts: `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/`

### Linux

- App: `/usr/bin/autosubs`
- Resources: `/usr/lib/autosubs/resources`
- Scripts: `/opt/resolve/Fusion/Scripts/Utility/` or `$HOME/.local/share/DaVinciResolve/Fusion/Scripts/Utility/`

## API Reference

App-specific docs live here; all general Resolve/Fusion reference lives in the skill (single source of truth):

- `docs/caption-styles.md` — the two caption kinds, the preset format, and the editing round trip (app-specific)
- `docs/animation-system.md` — how the AutoSubs macro implements its animations (app-specific)
- `docs/maintainer-template-release.md` — regenerating `caption-bin.drb` (maintainers)
- `davinci-resolve-fusion/` — the general Resolve/Fusion skill (distributed separately; also the reference for this project):
    - `references/resolve-api.txt` — Resolve scripting API (re-sync with `davinci-resolve-fusion/scripts/update-resolve-api.sh`)
    - `references/fusion-manual/00-index.md` — Fusion manual, split one-file-per-class for easy searching
    - `references/animation.md`, `references/macro-authoring.md`, `references/fusion-templates.md` — general guides
    - `examples/` — runnable Resolve API examples

Blackmagic's documentation is limited and sometimes outdated. `autosubs_core.lua` is the most reliable reference for working Resolve API usage.

