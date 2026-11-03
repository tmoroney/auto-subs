-- AutoSubs bootstrap: runs inside Resolve's sandboxed Lua state.
--
-- Resolve 21.1 (free edition) removed io, ffi, package, require, os.execute
-- and bmd.readdir from the state that runs Workspace > Scripts scripts, and
-- 21.1.2 also removed loadfile, dofile, bmd.readfile, fu:SavePrefs and
-- fu:LoadPrefs. This file therefore provides everything the modules need
-- without those globals:
--   * platform detection (no ffi)
--   * a `require` replacement (AutoSubs_require) that takes modules from the
--     launcher's bundle and falls back to files
--   * AutoSubs_loadfile, a loadfile that also works on 21.1.2 (fu:OpenFile)
--   * a base64 encoder for the bridge's response channel
--   * the mailbox path the file-bridge shares with the desktop app
--
-- The chunk returns the boot function. The installed launcher carries this file
-- as a string in its module bundle; the Dev launcher reads it from the repo:
--   local boot = chunk()
--   boot(resources_folder, app_executable, dev_mode, opts)
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

local function fusion_object()
    local fu = rawget(_G, "fusion") or rawget(_G, "fu")
    if fu == nil then
        local r = rawget(_G, "resolve")
        if r and type(r.Fusion) == "function" then
            fu = r:Fusion()
        end
    end
    return fu
end

-- fu:OpenFile + ReadLine is the one way left to read a file on 21.1.2. ReadLine
-- returns text with its line ending and cuts a line at 65535 bytes, so nothing
-- read here may have longer lines (resolve_bridge.rs splits requests for this).
-- FILE_MODE_READ is documented but no longer defined; its value is 1.
local function read_text_file(path)
    local fu = fusion_object()
    if not fu or type(fu.OpenFile) ~= "function" then
        return nil, "fu:OpenFile is not available"
    end
    local file = fu:OpenFile(path, rawget(_G, "FILE_MODE_READ") or 1)
    if not file then
        return nil, "could not open " .. path
    end
    local parts = {}
    local line = file:ReadLine()
    while type(line) == "string" do
        parts[#parts + 1] = line
        line = file:ReadLine()
    end
    file:Close()
    return table.concat(parts)
end

-- loadfile where it exists, otherwise the same contract on top of fu:OpenFile.
local function load_lua_file(path)
    local native = rawget(_G, "loadfile")
    if type(native) == "function" then
        return native(path)
    end
    local source, err = read_text_file(path)
    if not source then
        return nil, err
    end
    return load(source, "@" .. path)
end

-- Resident-bridge handshake. The Utility/Dev scripts launch the bridge, and a
-- loop from an earlier launch (or from the 3.10.0 startup scriptlib, which ran
-- it via fusion:Execute) may still be alive; these prefs keys (in-memory only,
-- no SavePrefs) coordinate so only one loop ever runs:
--   Probe/ProbeAck: liveness check. A launch writes a unique token to Probe;
--         the loop echoes it into ProbeAck (~2x/sec). The loop keeps NO
--         continuous prefs writes on purpose: every bound fusion: call is
--         marshaled through Resolve's UI event queue, and a queued
--         prefs event landing during Resolve's shutdown teardown crashes
--         the app (FusionApp::PrefsChanged on a half-dead prefs store).
--   Heartbeat: legacy once-a-second liveness write kept only for old loops
--         during upgrades; new loops never write it.
--   Owner: unique token of the launch that claimed the bridge, decided
--          last-writer-wins after a settle window. A running loop also
--          exits when it sees a foreign Owner.
--   Stop: unique token set by a manual launch to ask running loops to exit.
--         A loop exits only when the value differs from what it read at
--         startup, so a Stop aimed at a predecessor never kills the fresh
--         loop — and one persisted to disk by a stray SavePrefs is harmless.
local function bridge_alive(fu)
    if not fu or type(fu.GetPrefs) ~= "function" then
        return false
    end
    -- Fast path: a pre-probe loop still heartbeats once a second.
    local ok, hb = pcall(fu.GetPrefs, fu, "Global.AutoSubsBridge.Heartbeat")
    hb = ok and tonumber(hb) or nil
    if hb ~= nil and os.time() - hb <= 3 then
        return true
    end
    -- Probe the loop directly: it echoes the token into ProbeAck on its next
    -- prefs check (~0.5 s), so 30 x 50 ms covers it with margin.
    local token = tostring(os.time()) .. " " .. tostring({})
    pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Probe", token)
    for _ = 1, 30 do
        bmd.wait(0.05)
        local ack_ok, ack = pcall(fu.GetPrefs, fu, "Global.AutoSubsBridge.ProbeAck")
        if ack_ok and ack == token then
            return true
        end
    end
    return false
end

-- Last-writer-wins claim: publish a unique owner token plus a heartbeat, wait
-- out a settle window so a launch racing us can overwrite it, then read back.
-- The loser sees someone else's token and leaves the bridge alone.
local function claim_bridge(fu)
    local token = tostring(os.time()) .. " " .. tostring({})
    pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Owner", token)
    pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Heartbeat", tostring(os.time()))
    bmd.wait(0.3)
    local ok, owner = pcall(fu.GetPrefs, fu, "Global.AutoSubsBridge.Owner")
    if ok and owner == token then
        _G.AUTOSUBS_OWNER = token
        return true
    end
    return false
end

local function boot(resources_folder, app_executable, dev_mode, opts)
    local platform = detect_platform()
    _G.AUTOSUBS_PLATFORM = platform
    _G.AUTOSUBS_SEP = (platform == "Windows") and "\\" or "/"
    -- The installed launcher bakes the mailbox dir in (os.getenv answers are
    -- ANSI bytes on Windows, which breaks when a profile name isn't in the
    -- system code page); the env-derived path is the fallback for scripts
    -- that can't carry a per-user value, e.g. the shared Linux package one.
    _G.AUTOSUBS_MAILBOX = (opts and opts.mailbox_dir) or mailbox_dir(platform)
    _G.AutoSubs_base64 = base64_encode
    _G.AutoSubs_loadfile = load_lua_file
    _G.AutoSubs_bundle = opts and opts.modules or nil

    -- Launch-mode coordination (see the handshake comment above).
    local mode = (opts and opts.mode) or "manual"
    local fu = fusion_object()
    local can_signal = fu and type(fu.SetPrefs) == "function"
    if can_signal and opts and opts.open_app then
        -- Open from Resolve: this state can't launch programs, so ask the
        -- app's login-item watcher (resolve_launcher.rs) to do it. The
        -- watcher reads Fusion.prefs from disk, so this is the one flush a
        -- launch makes. It happens on the user's click, never from the idle
        -- loop. Done first so the app opens while the takeover below waits.
        -- 21.1.2 has no SavePrefs, but fu:SetData writes Fusion.prefs at once.
        pcall(function()
            fu:SetPrefs("Global.AutoSubsBridge.LaunchRequest",
                tostring(os.time()) .. " " .. tostring({}))
            if type(fu.SavePrefs) == "function" then
                fu:SavePrefs()
            else
                fu:SetData("AutoSubsBridge.Flush", tostring(os.time()))
            end
        end)
    end
    if mode == "manual" and can_signal then
        -- Takeover: ask any running loop to exit, then start fresh. Stop is
        -- set unconditionally — a stale heartbeat means the old loop is dead
        -- OR busy inside a Resolve call, and a busy one must still see the
        -- request when it resumes. Our new loop reads Stop as its startup
        -- snapshot and ignores it. The wait only happens when a loop looks
        -- alive.
        pcall(fu.SetPrefs, fu, "Global.AutoSubsBridge.Stop",
            tostring(os.time()) .. " " .. tostring({}))
        if bridge_alive(fu) then
            local deadline = os.time() + 4
            while os.time() < deadline do
                bmd.wait(0.1)
                local stop = fu:GetPrefs("Global.AutoSubsBridge.Stop")
                if stop == "" or stop == nil then
                    break
                end
            end
        end
        if not claim_bridge(fu) then
            return -- a racing launch claimed the bridge first
        end
    end

    local modules_path = resources_folder .. _G.AUTOSUBS_SEP .. "modules"

    -- Module loader mirroring `require`: caches results in AutoSubs_loaded
    -- (`true` for modules that return nothing), errors with the full path
    -- tried so a missing module is diagnosable. The launcher's bundle wins, so
    -- the installed script needs no file access to start.
    _G.AutoSubs_loaded = _G.AutoSubs_loaded or {}
    function _G.AutoSubs_require(name)
        local loaded = _G.AutoSubs_loaded
        if loaded[name] ~= nil then
            return loaded[name]
        end
        local path = modules_path .. _G.AUTOSUBS_SEP .. name .. ".lua"
        local chunk, load_err
        local bundled = _G.AutoSubs_bundle and _G.AutoSubs_bundle[name]
        if bundled then
            chunk, load_err = load(bundled, "=" .. name)
        else
            chunk, load_err = load_lua_file(path)
        end
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
