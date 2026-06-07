---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
local ffi = ffi

local function join_path(dir, filename)
    local sep = package.config:sub(1,1) -- returns '\\' on Windows, '/' elsewhere
    -- Remove trailing separator from dir, if any
    if dir:sub(-1) == sep then
        return dir .. filename
    else
        return dir .. sep .. filename
    end
end

-- Detect the operating system
local os_name = ffi.os
print("Operating System: " .. os_name)

-- Path to the script to launch
local resources_folder = nil
local app_executable = nil

-- On Windows the installer (hooks.nsi) generates AutoSubs.lua with the path baked in,
-- so this file is only ever run on macOS and Linux.
if os_name == "OSX" then
    app_executable = "/Applications/AutoSubs.app"
    resources_folder = app_executable .. "/Contents/Resources/resources"
else
    app_executable = "/usr/bin/autosubs"
    resources_folder = "/usr/lib/autosubs/resources"
end

-- For local development, use the "AutoSubs (Dev)" script instead of this file. Running
-- `npm run setup-resolve` generates a self-contained dev launcher that points
-- Resolve directly at your repo checkout and starts the server in dev mode.

-- Set package path for module loading
local modules_path = join_path(resources_folder, "modules")
package.path = package.path .. ";" .. join_path(modules_path, "?.lua")

-- Verify the AutoSubs resources actually exist before attempting to load them.
-- This guards against stale/duplicate installs (e.g. an old app left in a
-- different location) which otherwise produce a cryptic LuaJIT
-- "module 'autosubs_core' not found" stack trace listing many paths.
local function file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

local core_module_path = join_path(modules_path, "autosubs_core.lua")
if not file_exists(core_module_path) then
    print("[AutoSubs] ERROR: Could not find the AutoSubs app resources.")
    print("[AutoSubs] Expected to find: " .. core_module_path)
    print("[AutoSubs] The AutoSubs app does not appear to be installed at the expected location.")
    if os_name == "OSX" then
        print("[AutoSubs] Looked for the app at: " .. app_executable)
        print("[AutoSubs] If you have an older copy of AutoSubs installed elsewhere (e.g. /Applications/AutoSubs/AutoSubs.app),")
        print("[AutoSubs] delete it, then re-run the AutoSubs installer so the app lives at /Applications/AutoSubs.app.")
    else
        print("[AutoSubs] Please re-run the AutoSubs installer, then restart DaVinci Resolve.")
    end
    error("AutoSubs resources not found - please reinstall AutoSubs (see messages above).")
end

-- Launch AutoSubs
local AutoSubs = require("autosubs_core")
AutoSubs:Init(app_executable, resources_folder, false)
