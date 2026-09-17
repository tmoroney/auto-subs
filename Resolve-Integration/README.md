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
- **Rust Backend (`resolve_bridge.rs`)**: writes mailbox requests and polls `Fusion.prefs` for the response
- **Lua Server (`autosubs_core.lua`)**: file-mailbox loop running inside Resolve (Workspace > Scripts)
- **Fusion Macro (`autoSubs-macro.setting`)**: Fusion template for animated captions with per-word highlighting

### Why the File Mailbox?

Resolve 21.1 (free edition) sandboxes the Lua state that runs Workspace > Scripts scripts: `io`, `ffi`, `package`, `require`, `os.execute` and `bmd.readdir` are all nil, so the old `ljsocket` HTTP server on port 56002 can no longer exist. The bridge is now a file mailbox, the only transport:

- **Rust → Lua**: `resolve_bridge.rs` atomically writes `request.lua` (a `return {...}` chunk with an id and a JSON body) into a shared mailbox dir (`<data_local_dir>/com.autosubs/resolve-bridge`). The Lua loop picks it up with `loadfile`.
- **Lua → Rust**: the Lua side calls `fusion:SetPrefs("Global.AutoSubsBridge.Ack"/".Response", ...)` then `fusion:SavePrefs()`, which flushes `Fusion.prefs` to disk; Rust polls that file. Responses are `<id>:<base64 json>` so Rust never has to parse Fusion's Lua string escaping.

The Lua side must not use `io`, `ffi`, `package`, `require`, `os.execute` or `bmd.readdir` anywhere — modules are loaded through `AutoSubs_require` (see `modules/bootstrap.lua`).

### Resident server & zero-click startup

Resolve runs any `*.scriptlib` in the root of `Fusion/Scripts/` at startup; `AutoSubs.scriptlib` hands the bootstrap to `fusion:Execute()`, which runs the bridge loop asynchronously in another scripting state. The bridge is therefore **resident**: it starts with Resolve and the app never starts or stops it.

Two in-memory prefs keys coordinate launches (never `SavePrefs`'d): the loop writes `Global.AutoSubsBridge.Heartbeat` once a second, and a launch checks `bridge_alive()` before starting. The scriptlib launches with `mode = "startup"` (no-op if a loop is already alive); the Utility/Dev scripts launch with `mode = "manual"` (takeover: set `Stop`, wait up to 4 s for the old loop to exit and clear it, then start fresh) — so running Workspace → Scripts → AutoSubs is the "restart the bridge" path.

## Communication Flow

```text
React Frontend
  → invoke('resolve_bridge', { payload, timeoutSecs })
  → Rust resolve_bridge.rs
  → write request.lua into the mailbox dir
  → Lua server (autosubs_core.lua) loadfiles it
  → Resolve/Fusion API
  → Lua writes Ack + Response to Fusion.prefs → Rust polls → body → Frontend JSON.parse()
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
| `modules/bootstrap.lua` | Platform detection, `AutoSubs_require` module shim, base64 |
| `modules/font_fallback.lua` | Font fallback for non-Latin scripts |
| `modules/timecode.lua` | Pure-Lua timecode <-> frame conversion |

### Debugging

- **Lua**: Use `print()` — output appears in Resolve's Console (**Script → Console**)
- **Bridge**: Check Rust backend logs for `resolve_bridge` requests; the mailbox dir is `<data_local_dir>/com.autosubs/resolve-bridge` and responses land in `Fusion.prefs` under `Global.AutoSubsBridge.*`
- **Fusion**: Inspect tool inputs in the Fusion inspector or check node connections in the Flow view

### Common Issues

| Symptom | Fix |
|---|---|
| Server not responding | Confirm Resolve is running and the dev script was launched; delete a stale `request.lua` from the mailbox dir if one lingers |
| Macro not found | Verify `autosubs-macro.setting` is in the correct location and re-import if needed |
| Animation not working | Check KeyStretcherMod connection, verify animation length > 0 and the animation is enabled |

## Lua Server (`autosubs_core.lua`)

### Server Startup

Both scripts are thin **launchers** — they `loadfile` `modules/bootstrap.lua` and call it, which sets up module loading (`AutoSubs_require`) and calls `AutoSubs:Init()`. All real logic lives in `autosubs_core.lua`; there is almost never a reason to edit the launchers.

- **Production** (`AutoSubs.lua`): Verifies that `bootstrap.lua` exists at the expected location, then runs it with `mode = "manual"` (restarts the resident bridge).
- **Development** (`AutoSubs (Dev).lua`): Same pattern, but points at your repo checkout with `dev_mode = true`. Lua edits take effect on next script run.
- **Startup** (`AutoSubs.scriptlib`, installed to the Scripts root, not Utility): runs once when Resolve starts; launches the bridge with `mode = "startup"` via `fusion:Execute`.

### How the Launchers Are Generated

`AutoSubs.lua` is generated during installation — do not hand-edit it:

- **Windows**: The NSIS installer (`src-tauri/windows/hooks.nsi`) generates `AutoSubs.lua` at install time with the chosen installation path baked in as a Lua long-bracket string.
- **macOS / Linux**: The `AutoSubs.lua` checked in to the repo is used directly; paths are pre-defined (`/Applications/AutoSubs.app` on macOS, `/usr/bin/autosubs` on Linux).

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

- Windows paths from `os.getenv` are ANSI-codepage bytes, which is what `loadfile`/file APIs expect — do not convert them
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

