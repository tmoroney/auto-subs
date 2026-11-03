---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
--
-- Resolve sandboxes this scripting state: io, ffi, package, require and
-- os.execute are unavailable, and since 21.1.2 so are loadfile and dofile. This
-- script therefore carries bootstrap.lua and every module as strings.
--
-- This file is a TEMPLATE. scripts/gen-resolve-linux.js inlines the modules at
-- build time into resources/AutoSubs.bundled.lua, and the AutoSubs app writes
-- the installed copy into the user's Resolve Scripts folder on startup
-- (resolve_scripts.rs), baking the real install paths into the [[...]]
-- placeholders below. That way an app update refreshes the launcher without a
-- reinstall.

local resources_folder = [[__AUTOSUBS_RESOURCES_FOLDER__]]
local app_executable = [[__AUTOSUBS_APP_EXECUTABLE__]]
-- The build replaces this bare expression with a table of module sources. Left
-- as it is, it reads as a nil global and the modules come from the resources
-- folder, which needs a Resolve that still has loadfile.
local module_bundle = __AUTOSUBS_MODULE_BUNDLE__

-- For local development, use the "AutoSubs (Dev)" script instead of this file. Running
-- `npm run setup-resolve` generates a self-contained dev launcher that points
-- Resolve directly at your repo checkout and starts the server in dev mode.

local boot_chunk
if module_bundle then
    boot_chunk = assert(load(module_bundle.bootstrap, "=bootstrap"))
else
    -- Verify the AutoSubs resources actually exist before attempting to load
    -- them. This guards against stale/duplicate installs (e.g. an old app left
    -- in a different location) which otherwise produce a cryptic LuaJIT
    -- "module 'autosubs_core' not found" stack trace listing many paths.
    local bootstrap_path = resources_folder .. "/modules/bootstrap.lua"
    if not bmd.fileexists(bootstrap_path) or type(loadfile) ~= "function" then
        print("[AutoSubs] ERROR: Could not load the AutoSubs app resources.")
        print("[AutoSubs] Looked for them at: " .. resources_folder)
        print("[AutoSubs] Please re-run the AutoSubs installer, then restart DaVinci Resolve.")
        error("AutoSubs resources not found - please reinstall AutoSubs (see messages above).")
    end
    boot_chunk = assert(loadfile(bootstrap_path))
end

-- Launch AutoSubs via the bootstrap (sets up module loading and the bridge).
-- mode = "manual": asks any running bridge to stop and takes over with a fresh
-- one. This script is the only way the bridge starts: the 3.10.0 startup
-- scriptlib ran it via fusion:Execute, which held Fusion's script executor for
-- the whole session (see docs/resident-bridge-fusion-regression.md). A loop it
-- left running exits on this takeover, which frees the executor again.
-- mailbox_dir: the app substitutes an ANSI-safe [[path]] here on Windows so the
-- Lua side never rebuilds it from LOCALAPPDATA — that env lookup is mangled
-- when a profile name isn't representable in the system's ANSI code page. Left
-- unsubstituted it reads as a nil global and bootstrap falls back to the env
-- path (fine on macOS/Linux, where env strings are UTF-8).
-- open_app: ask the app's "Open from Resolve" watcher to open AutoSubs. Only
-- this production launcher sets it, so the Dev script never opens the
-- installed app.
local boot = boot_chunk()
boot(resources_folder, app_executable, false,
    { mode = "manual", mailbox_dir = __AUTOSUBS_MAILBOX_DIR__, open_app = true, modules = module_bundle })
