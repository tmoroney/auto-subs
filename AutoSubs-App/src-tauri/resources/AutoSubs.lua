---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
--
-- Resolve 21.1 sandboxes this scripting state: io, ffi, package, require and
-- os.execute are all unavailable. Everything the modules need is provided by
-- bootstrap.lua, which we run via loadfile.
--
-- This file is a TEMPLATE. The AutoSubs app itself writes the installed copy
-- into the user's Resolve Scripts folder on startup (resolve_scripts.rs),
-- baking the real install paths into the [[...]] placeholders below. That way
-- an app update refreshes the launcher without a reinstall.

local resources_folder = [[__AUTOSUBS_RESOURCES_FOLDER__]]
local app_executable = [[__AUTOSUBS_APP_EXECUTABLE__]]

-- For local development, use the "AutoSubs (Dev)" script instead of this file. Running
-- `npm run setup-resolve` generates a self-contained dev launcher that points
-- Resolve directly at your repo checkout and starts the server in dev mode.

-- Verify the AutoSubs resources actually exist before attempting to load them.
-- This guards against stale/duplicate installs (e.g. an old app left in a
-- different location) which otherwise produce a cryptic LuaJIT
-- "module 'autosubs_core' not found" stack trace listing many paths.
local bootstrap_path = resources_folder .. "/modules/bootstrap.lua"
if not bmd.fileexists(bootstrap_path) then
    print("[AutoSubs] ERROR: Could not find the AutoSubs app resources.")
    print("[AutoSubs] Looked for them at: " .. resources_folder)
    print("[AutoSubs] Please re-run the AutoSubs installer, then restart DaVinci Resolve.")
    error("AutoSubs resources not found - please reinstall AutoSubs (see messages above).")
end

-- Launch AutoSubs via the bootstrap (sets up module loading and the bridge).
-- mode = "manual": asks any running bridge to stop and takes over with a fresh
-- one. This script is the only way the bridge starts: the 3.10.0 startup
-- scriptlib ran it via fusion:Execute, which held Fusion's script executor for
-- the whole session (see docs/resident-bridge-fusion-regression.md). A loop it
-- left running exits on this takeover, which frees the executor again.
-- mailbox_dir is baked in so the Lua side never has to rebuild the path from
-- LOCALAPPDATA — that env lookup is mangled when a Windows profile name isn't
-- representable in the system's ANSI code page.
local boot = assert(loadfile(bootstrap_path))()
boot(resources_folder, app_executable, false,
    { mode = "manual", mailbox_dir = [[__AUTOSUBS_MAILBOX_DIR__]] })
