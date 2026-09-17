-- AutoSubs bootstrap: runs inside Resolve's sandboxed Lua state.
--
-- Resolve 21.1 (free edition) removed io, ffi, package, require, os.execute
-- and bmd.readdir from the state that runs Workspace > Scripts scripts. This
-- file therefore provides everything the modules need without those globals:
--   * platform detection (no ffi)
--   * a `require` replacement (AutoSubs_require) built on loadfile
--   * a base64 encoder for the Fusion.prefs response channel
--   * the mailbox path the file-bridge shares with the desktop app
--
-- The chunk returns the boot function; entry scripts run it as:
--   local boot = assert(loadfile(bootstrap_path))()
--   boot(resources_folder, app_executable, dev_mode)
--
---@diagnostic disable: undefined-global

local function detect_platform()
    local jit_global = rawget(_G, "jit")
    if jit_global and jit_global.os then
        local os_name = jit_global.os
        if os_name == "Windows" or os_name == "OSX" then
            return os_name
        end
        return "Linux"
    end
    if os.getenv("WINDIR") ~= nil then
        return "Windows"
    end
    if bmd.direxists("/Applications") then
        return "OSX"
    end
    return "Linux"
end

local function mailbox_dir(platform)
    if platform == "Windows" then
        return (os.getenv("LOCALAPPDATA") or "") .. "\\com.autosubs\\resolve-bridge"
    elseif platform == "OSX" then
        return os.getenv("HOME") .. "/Library/Application Support/com.autosubs/resolve-bridge"
    else
        return (os.getenv("XDG_DATA_HOME") or (os.getenv("HOME") .. "/.local/share"))
            .. "/com.autosubs/resolve-bridge"
    end
end

-- Standard-alphabet base64 with '=' padding, pure Lua (no bit ops needed).
local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function base64_encode(data)
    return ((data:gsub(".", function(x)
        local r, b = "", x:byte()
        for i = 8, 1, -1 do
            r = r .. (b % 2 ^ i - b % 2 ^ (i - 1) >= 1 and "1" or "0")
        end
        return r
    end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
        if #x < 6 then
            return ""
        end
        local c = 0
        for i = 1, 6 do
            c = c + (x:sub(i, i) == "1" and 2 ^ (6 - i) or 0)
        end
        return B64_CHARS:sub(c + 1, c + 1)
    end) .. ({ "", "==", "=" })[#data % 3 + 1])
end

-- Resident-bridge handshake. The startup scriptlib and the Utility/Dev
-- scripts can both launch the bridge; these prefs keys (in-memory only, no
-- SavePrefs) coordinate so only one loop ever runs:
--   Heartbeat: unix seconds, written once per second by the running loop.
--   Stop: set to a timestamp by a manual launch to ask a running loop to
--         exit; the loop clears it to "" when it does.
local function fusion_object()
    return rawget(_G, "fusion") or rawget(_G, "fu")
end

local function bridge_alive(fu)
    if not fu or type(fu.GetPrefs) ~= "function" then
        return false
    end
    local ok, hb = pcall(fu.GetPrefs, fu, "Global.AutoSubsBridge.Heartbeat")
    hb = ok and tonumber(hb) or nil
    return hb ~= nil and os.time() - hb <= 3
end

local function boot(resources_folder, app_executable, dev_mode, opts)
    local platform = detect_platform()
    _G.AUTOSUBS_PLATFORM = platform
    _G.AUTOSUBS_SEP = (platform == "Windows") and "\\" or "/"
    _G.AUTOSUBS_MAILBOX = mailbox_dir(platform)
    _G.AutoSubs_base64 = base64_encode

    -- Launch-mode coordination (see the handshake comment above).
    local mode = (opts and opts.mode) or "manual"
    local fu = fusion_object()
    if mode == "startup" then
        if bridge_alive(fu) then
            return -- a resident bridge is already running
        end
        -- Claim the bridge immediately: narrows the race between two startup
        -- scriptlibs both probing liveness.
        if fu and type(fu.SetPrefs) == "function" then
            pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Heartbeat", tostring(os.time()))
        end
    elseif mode == "manual" then
        -- Takeover: ask the running loop to exit, then start fresh.
        if bridge_alive(fu) and fu and type(fu.SetPrefs) == "function" then
            pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Stop", tostring(os.time()))
            local deadline = os.time() + 4
            while os.time() < deadline do
                bmd.wait(0.1)
                local stop = fu:GetPrefs("Global.AutoSubsBridge.Stop")
                if stop == "" or stop == nil then
                    break
                end
            end
            -- Dead loop with a fresh-looking heartbeat: clear Stop ourselves
            -- and proceed.
            if fu:GetPrefs("Global.AutoSubsBridge.Stop") ~= "" then
                pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Stop", "")
            end
        end
    end

    -- A Stop value can be persisted to disk by a SavePrefs that fires while it
    -- is set, and Resolve reloads prefs at startup; never let a stale one kill
    -- the loop we are about to start.
    if fu and type(fu.SetPrefs) == "function" then
        pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Stop", "")
    end

    local modules_path = resources_folder .. _G.AUTOSUBS_SEP .. "modules"

    -- Module loader mirroring `require`: caches results in AutoSubs_loaded
    -- (`true` for modules that return nothing), errors with the full path
    -- tried so a missing module is diagnosable.
    _G.AutoSubs_loaded = _G.AutoSubs_loaded or {}
    function _G.AutoSubs_require(name)
        local loaded = _G.AutoSubs_loaded
        if loaded[name] ~= nil then
            return loaded[name]
        end
        local path = modules_path .. _G.AUTOSUBS_SEP .. name .. ".lua"
        local chunk, load_err = loadfile(path)
        if not chunk then
            error("AutoSubs module '" .. name .. "' not found at: " .. path
                .. (load_err and (" (" .. tostring(load_err) .. ")") or ""), 2)
        end
        local result = chunk()
        if result == nil then
            result = true
        end
        loaded[name] = result
        return result
    end

    local AutoSubs = _G.AutoSubs_require("autosubs_core")
    AutoSubs:Init(app_executable, resources_folder, dev_mode)
end

return boot
