---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
--
-- Resolve 21.1 sandboxes this scripting state: io, ffi, package, require and
-- os.execute are all unavailable. Everything the modules need is provided by
-- bootstrap.lua, which we run via loadfile.

-- Path to the script to launch
local resources_folder = nil
local app_executable = nil

-- On Windows the installer (hooks.nsi) generates AutoSubs.lua with the path baked in,
-- so this file is only ever run on macOS and Linux.
local is_macos = bmd.direxists("/Applications")
if is_macos then
    app_executable = "/Applications/AutoSubs.app"
    resources_folder = app_executable .. "/Contents/Resources/resources"
else
    app_executable = "/usr/bin/autosubs"
    resources_folder = "/usr/lib/autosubs/resources"
end

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
    print("[AutoSubs] The AutoSubs app does not appear to be installed at the expected location.")
    if is_macos then
        print("[AutoSubs] Looked for the app at: " .. app_executable)
        print("[AutoSubs] If you have an older copy of AutoSubs installed elsewhere (e.g. /Applications/AutoSubs/AutoSubs.app),")
        print("[AutoSubs] delete it, then re-run the AutoSubs installer so the app lives at /Applications/AutoSubs.app.")
    else
        print("[AutoSubs] Please re-run the AutoSubs installer, then restart DaVinci Resolve.")
    end
    error("AutoSubs resources not found - please reinstall AutoSubs (see messages above).")
end

-- Launch AutoSubs via the bootstrap (sets up module loading and the bridge).
-- mode = "manual": this is the restart path — the startup scriptlib normally
-- keeps a resident bridge running; running this script asks it to stop and
-- takes over with a fresh one.
local boot = assert(loadfile(bootstrap_path))()
boot(resources_folder, app_executable, false, { mode = "manual" })
