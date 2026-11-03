-- AutoSubs sandbox probe: reports what the Lua state behind Workspace > Scripts
-- can still do on the running Resolve version, and which channels are left for
-- getting data from the desktop app into that state.
--
-- Setup and usage: run sandbox_probe_setup.sh with Resolve closed, start Resolve,
-- open an empty throwaway project, run AutoSubs Sandbox Probe from Workspace >
-- Scripts and copy the whole Console output. Without the setup script only the
-- enumeration sections run.
--
-- What it touches:
--   * fu:LoadPrefs, where it exists, reloads Fusion's preferences from the fixture
--     files. The setup script backs Fusion.prefs up first, and the replace-or-merge
--     check only runs after a reload of the full copy proved a restore is possible.
--   * Prefs and fu:SetData values under AutoSubsProbe, cleared at the end. Resolve
--     keeps the emptied keys in Fusion.prefs, which is harmless.
--   * The comp tests open the fixture comp hidden and close it again, and add one
--     temporary tool to the current comp, if there is one, and delete it.
--
-- Never look up fu.UIManager here, not even to test whether it exists: on the free
-- edition that alone opens the "You have reached a limitation" upgrade dialog.
--
-- Every API here is part of the documented scripting surface. The probe does not
-- try to get around the sandbox itself (no debug library, no bytecode, no reach
-- into hidden tables), it only reports which official calls still work.
--
---@diagnostic disable: undefined-global

local TOKEN = "autosubs-probe-7f3a"
local BIG_LINE = 'AutoSubs 0123456789 "quoted" back\\slash ]] äöü 日本語 Привет'
local BIG_LINES = 15000
local WAIT_SECONDS = 5
local BIG_WAIT_SECONDS = 20
local PREF_ROOT = "Global.AutoSubsProbe"
local DATA_ROOT = "AutoSubsProbe"
local MODE_READ = rawget(_G, "FILE_MODE_READ") or 1
local MODE_WRITE = rawget(_G, "FILE_MODE_WRITE") or 2
local FLUSH_SETTLE_SECONDS = 3

local results = {}

local function say(text)
    print("[probe] " .. text)
end

local function record(name, status, detail)
    local line = string.format("%-4s %s", status, name)
    if detail ~= nil and detail ~= "" then
        line = line .. " :: " .. tostring(detail)
    end
    results[#results + 1] = line
    say(line)
end

-- Printed before each call, so a call that takes Resolve down still names itself.
local function step(name)
    say("-> " .. name)
end

local function section(title)
    say("")
    say("=== " .. title)
end

local function emit_list(label, items)
    say(label .. " (" .. #items .. "):")
    local line = "  "
    for index, item in ipairs(items) do
        local piece = item .. (index < #items and ", " or "")
        if #line + #piece > 110 and line ~= "  " then
            say(line)
            line = "  "
        end
        line = line .. piece
    end
    if line ~= "  " then
        say(line)
    end
end

local function describe(value)
    local text = tostring(value)
    if type(value) == "string" then
        text = '"' .. text .. '"'
    end
    if #text > 160 then
        text = text:sub(1, 160) .. "... (" .. #text .. " chars)"
    end
    return text
end

local function member_of(object, name)
    local ok, value = pcall(function()
        return object[name]
    end)
    if ok then
        return value
    end
    return nil
end

local function has_method(object, name)
    return object ~= nil and type(member_of(object, name)) == "function"
end

-- Everything a table, or a userdata's metatable, will list.
local function members(value)
    local seen, out = {}, {}
    local function add(source)
        if type(source) ~= "table" then
            return
        end
        pcall(function()
            for key, item in pairs(source) do
                local name = tostring(key)
                if not seen[name] then
                    seen[name] = true
                    out[#out + 1] = name .. ":" .. type(item)
                end
            end
        end)
    end
    add(value)
    local get_meta = rawget(_G, "getmetatable")
    if get_meta then
        local ok, meta = pcall(get_meta, value)
        if ok and type(meta) == "table" then
            add(meta)
            add(rawget(meta, "__index"))
        end
    end
    table.sort(out)
    return out
end

local function report_methods(label, object, names)
    if object == nil then
        say(label .. ": object is nil")
        return
    end
    say(label .. ": " .. type(object) .. " " .. describe(object))
    local listed = members(object)
    if #listed > 0 then
        emit_list(label .. " enumerated", listed)
    end
    local present, missing = {}, {}
    for _, name in ipairs(names) do
        local value_type = type(member_of(object, name))
        if value_type == "nil" then
            missing[#missing + 1] = name
        else
            present[#present + 1] = name .. ":" .. value_type
        end
    end
    emit_list(label .. " present", present)
    emit_list(label .. " missing", missing)
    if member_of(object, "__AutoSubsNoSuchMember__") ~= nil then
        say(label .. " answers for unknown names, so 'present' proves nothing")
    end
end

local fu = rawget(_G, "fusion") or rawget(_G, "fu")
if fu == nil and type(rawget(_G, "bmd")) ~= "nil" and has_method(bmd, "scriptapp") then
    local ok, app = pcall(bmd.scriptapp, "Fusion")
    fu = ok and app or nil
end

local resolve_app = rawget(_G, "resolve")
if resolve_app == nil and has_method(fu, "GetResolve") then
    local ok, app = pcall(fu.GetResolve, fu)
    resolve_app = ok and app or nil
end
if resolve_app == nil and type(rawget(_G, "bmd")) ~= "nil" and has_method(bmd, "scriptapp") then
    local ok, app = pcall(bmd.scriptapp, "Resolve")
    resolve_app = ok and app or nil
end

local function get_pref(name)
    if not has_method(fu, "GetPrefs") then
        return nil
    end
    local ok, value = pcall(fu.GetPrefs, fu, name)
    if ok then
        return value
    end
    return nil
end

local function set_pref(name, value)
    if has_method(fu, "SetPrefs") then
        return pcall(fu.SetPrefs, fu, name, value)
    end
    return false, "SetPrefs missing"
end

local function pref_filled(name)
    local value = get_pref(name)
    return value ~= nil and value ~= ""
end

-- Polls in 50 ms steps. Returns the seconds waited, or nil on timeout.
local function wait_until(condition, seconds)
    local ticks = 0
    local limit = seconds * 20
    while ticks <= limit do
        if condition() then
            return ticks * 0.05
        end
        bmd.wait(0.05)
        ticks = ticks + 1
    end
    return nil
end

local function stopwatch()
    local wall, cpu = os.time(), os.clock()
    return function()
        return string.format("wall~%ds cpu=%.3fs", os.time() - wall, os.clock() - cpu)
    end
end

local function platform_name()
    local jit_global = rawget(_G, "jit")
    if jit_global and jit_global.os then
        return jit_global.os
    end
    if os.getenv("WINDIR") ~= nil then
        return "Windows"
    end
    if bmd.direxists("/Applications") then
        return "OSX"
    end
    return "Linux"
end

local function fixture_root(platform)
    if platform == "Windows" then
        return (os.getenv("LOCALAPPDATA") or "") .. "\\com.autosubs\\sandbox-probe"
    elseif platform == "OSX" then
        return (os.getenv("HOME") or "") .. "/Library/Application Support/com.autosubs/sandbox-probe"
    end
    return (os.getenv("XDG_DATA_HOME") or ((os.getenv("HOME") or "") .. "/.local/share"))
        .. "/com.autosubs/sandbox-probe"
end

local platform = platform_name()
local separator = platform == "Windows" and "\\" or "/"
local root = fixture_root(platform)

local function fixture(name)
    return root .. separator .. name
end

local big_text = string.rep(BIG_LINE .. "\n", BIG_LINES)

---------------------------------------------------------------------------
-- Enumeration
---------------------------------------------------------------------------

local function enumerate_header()
    section("environment")
    say("platform: " .. platform .. ", _VERSION: " .. tostring(rawget(_G, "_VERSION")))
    local jit_global = rawget(_G, "jit")
    say("jit: " .. tostring(jit_global and jit_global.version))
    if has_method(resolve_app, "GetVersionString") then
        local ok, version = pcall(resolve_app.GetVersionString, resolve_app)
        say("Resolve: " .. tostring(ok and version))
    end
    if has_method(resolve_app, "GetProductName") then
        local ok, name = pcall(resolve_app.GetProductName, resolve_app)
        say("Product: " .. tostring(ok and name))
    end
    if has_method(fu, "MapPath") then
        for _, path in ipairs({ "Scripts:", "Profile:", "UserData:", "Temp:" }) do
            local ok, mapped = pcall(fu.MapPath, fu, path)
            say(path .. " -> " .. tostring(ok and mapped))
        end
    end
    say("fixture dir: " .. root)
    -- A script RunScript only started after the previous run ended leaves this.
    for _, name in ipairs({ "RunScript", "Execute" }) do
        local leftover = get_pref(PREF_ROOT .. "." .. name)
        if leftover ~= nil and leftover ~= "" then
            say("marker from a previous run, " .. name .. ": " .. describe(leftover))
        end
    end
end

local function enumerate_globals()
    section("globals")
    local names = {}
    local library_names = {}
    for key, value in pairs(_G) do
        local name = tostring(key)
        names[#names + 1] = name .. ":" .. type(value)
        if type(value) == "table" and name ~= "_G" then
            library_names[#library_names + 1] = name
        end
    end
    table.sort(names)
    table.sort(library_names)
    emit_list("_G", names)

    local get_meta = rawget(_G, "getmetatable")
    local meta = get_meta and get_meta(_G) or nil
    say("_G metatable: " .. tostring(meta))
    local expected = {
        "load", "loadstring", "loadfile", "dofile", "require", "package", "io", "ffi",
        "debug", "jit", "bit", "setfenv", "getfenv", "getmetatable", "setmetatable", "newproxy",
        "FILE_MODE_READ", "FILE_MODE_WRITE", "FILE_MODE_UNBUFFERED", "FILE_MODE_SHARED",
        "bmd", "fu", "fusion", "resolve", "comp", "app", "ui", "dump",
    }
    local checks = {}
    for _, name in ipairs(expected) do
        checks[#checks + 1] = name .. "=" .. type(_G[name])
    end
    emit_list("named globals", checks)

    section("libraries")
    for _, name in ipairs(library_names) do
        emit_list(name, members(rawget(_G, name)))
    end
    if type(rawget(_G, "bmd")) ~= "table" then
        emit_list("bmd", members(rawget(_G, "bmd")))
    end
end

local FUSION_METHODS = {
    "GetPrefs", "SetPrefs", "SavePrefs", "LoadPrefs", "GetData", "SetData", "Execute", "RunScript",
    "OpenFile", "LoadComp", "LoadRecentComp", "NewComp", "GetCurrentComp", "GetCompList", "MapPath",
    "MapPathSegments", "ReverseMapPath", "GetGlobalPathMap", "GetEnv", "GetArgs", "GetAppInfo",
    "GetAttrs", "GetClipboard", "SetClipboard", "GetResolve", "GetRegList", "GetRegAttrs", "FindReg",
    "OpenLibrary", "CreateMail", "FileLogging", "ClearFileLog", "QueueComp", "ToggleUtility",
    "ShowPrefs", "GetMainWindow", "GetPreviewList", "CreateFloatingView", "GetCPULoad", "SetBatch",
    "DumpCgObjects", "DumpGLObjects", "DumpGraphicsHardwareInfo", "DumpOpenCLDeviceInfo", "AllowNetwork",
    "__AutoSubsNoSuchMember__",
}

local RESOLVE_METHODS = {
    "Fusion", "GetMediaStorage", "GetProjectManager", "OpenPage", "GetCurrentPage", "GetProductName",
    "GetVersion", "GetVersionString", "LoadLayoutPreset", "UpdateLayoutPreset", "ExportLayoutPreset",
    "DeleteLayoutPreset", "SaveLayoutPreset", "ImportLayoutPreset", "ImportRenderPreset",
    "ExportRenderPreset", "ImportBurnInPreset", "ExportBurnInPreset", "GetKeyframeMode",
    "SetKeyframeMode", "GetFairlightPresets", "GetFairlightPresetList", "GetEffectsList",
    "__AutoSubsNoSuchMember__",
}

local COMP_METHODS = {
    "Execute", "RunScript", "GetData", "SetData", "GetPrefs", "SetPrefs", "Paste", "CopySettings",
    "AddTool", "GetToolList", "StartUndo", "EndUndo", "Render", "Save", "SaveCopyAs", "Close",
    "MapPath", "GetConsoleHistory", "__AutoSubsNoSuchMember__",
}

local STORAGE_METHODS = {
    "GetMountedVolumeList", "GetSubFolderList", "GetFileList", "RevealInStorage",
    "AddItemListToMediaPool", "AddClipMattesToMediaPool", "AddTimelineMattesToMediaPool",
    "__AutoSubsNoSuchMember__",
}

local function enumerate_objects()
    section("objects")
    report_methods("fu", fu, FUSION_METHODS)
    report_methods("resolve", resolve_app, RESOLVE_METHODS)
    if has_method(fu, "GetCurrentComp") then
        local ok, comp = pcall(fu.GetCurrentComp, fu)
        report_methods("comp", ok and comp or nil, COMP_METHODS)
    end
    if has_method(resolve_app, "GetMediaStorage") then
        local ok, storage = pcall(resolve_app.GetMediaStorage, resolve_app)
        report_methods("mediaStorage", ok and storage or nil, STORAGE_METHODS)
    end
    if has_method(fu, "GetAttrs") then
        local ok, attrs = pcall(fu.GetAttrs, fu)
        if ok and type(attrs) == "table" then
            for _, name in ipairs({ "FUSIONS_FileName", "FUSIONS_Version", "FUSIONH_MainWindow", "FUSIONB_IsPost" }) do
                say("fu attr " .. name .. " = " .. tostring(attrs[name]))
            end
        end
    end
end

---------------------------------------------------------------------------
-- Code loading
---------------------------------------------------------------------------

local function test_code_loading()
    section("code loading")
    local global_load = rawget(_G, "load")
    if type(global_load) == "function" then
        local ok, chunk, err = pcall(global_load, "return 41 + 1")
        local value = ok and chunk and select(2, pcall(chunk))
        record("load(string)", value == 42 and "OK" or "FAIL", value == 42 and "" or tostring(chunk or err))
    else
        record("load(string)", "FAIL", "load is nil")
    end
    local global_loadstring = rawget(_G, "loadstring")
    if type(global_loadstring) == "function" then
        local timer = stopwatch()
        -- Same order of size as the modules inlined into one launcher.
        local source = string.rep("do local _ = 1 end\n", 12600) .. "return 'done'"
        local ok, chunk, err = pcall(global_loadstring, source, "=probe")
        local value = ok and chunk and select(2, pcall(chunk))
        record("loadstring(240 KB)", value == "done" and "OK" or "FAIL",
            value == "done" and timer() or tostring(chunk or err))
    else
        record("loadstring", "FAIL", "loadstring is nil")
    end
end

---------------------------------------------------------------------------
-- bmd file helpers
---------------------------------------------------------------------------

local function test_bmd()
    section("bmd file helpers")
    local exists = bmd.fileexists(fixture("plain.txt"))
    local absent = bmd.fileexists(fixture("does-not-exist.txt"))
    say("bmd.fileexists fixture=" .. tostring(exists) .. " absent=" .. tostring(absent))
    record("bmd.fileexists", (exists and not absent) and "OK" or "FAIL")

    if has_method(bmd, "readstring") then
        step("bmd.readstring")
        local on_path_ok, on_path = pcall(bmd.readstring, fixture("plain.txt"))
        local on_text_ok, on_text = pcall(bmd.readstring, "{ answer = 42 }")
        say("bmd.readstring(path): " .. tostring(on_path_ok) .. " " .. describe(on_path))
        say("bmd.readstring(text): " .. tostring(on_text_ok) .. " " .. describe(on_text))
        local parses_text = on_text_ok and type(on_text) == "table" and on_text.answer == 42
        local reads_file = on_path_ok and type(on_path) == "string" and on_path:find(TOKEN, 1, true) ~= nil
        record("bmd.readstring reads a file", reads_file and "OK" or "FAIL",
            parses_text and "parses a Lua table string, no file I/O" or "")
    end

    -- Any other helper that looks like it reads or describes a file. Names that
    -- write, delete, launch or create anything are never called.
    for _, entry in ipairs(members(bmd)) do
        local name = entry:match("^([^:]+):function$")
        if name and name ~= "readstring" and name ~= "fileexists" and name ~= "direxists" then
            local lowered = name:lower()
            local readable = (lowered:find("read") or lowered:find("load") or lowered:find("get"))
                and (lowered:find("file") or lowered:find("path") or lowered:find("dir") or lowered:find("info")
                    or lowered:find("size"))
            local risky = lowered:find("write") or lowered:find("delete") or lowered:find("remove")
                or lowered:find("open") or lowered:find("exec") or lowered:find("create")
                or lowered:find("copy") or lowered:find("move") or lowered:find("rename")
            if readable and not risky then
                step("bmd." .. name .. "(plain.txt)")
                local ok, value = pcall(bmd[name], fixture("plain.txt"))
                say("bmd." .. name .. ": " .. tostring(ok) .. " " .. describe(value))
            end
        end
    end
end

---------------------------------------------------------------------------
-- fu:OpenFile
---------------------------------------------------------------------------

local function open_file(name, mode)
    local ok, file = pcall(fu.OpenFile, fu, fixture(name), mode)
    if ok and file then
        return file
    end
    say("  fu:OpenFile " .. name .. " returned " .. tostring(ok) .. " " .. describe(file))
    return nil
end

local function strip_line_end(text)
    return (text:gsub("[\r\n]+$", ""))
end

local function test_open_file()
    section("fu:OpenFile")
    if not has_method(fu, "OpenFile") then
        record("fu:OpenFile", "FAIL", "method missing")
        return
    end

    step("file:ReadLine on a fresh handle")
    local file = open_file("plain.txt", MODE_READ)
    if not file then
        record("fu:OpenFile read", "FAIL", "could not open the fixture")
        return
    end
    local size_ok, size = pcall(file.GetFileSize, file)
    say("  GetFileSize: " .. tostring(size_ok) .. " " .. describe(size))
    local line_ok, line = pcall(file.ReadLine, file)
    pcall(file.Close, file)
    say("  ReadLine: " .. tostring(line_ok) .. " " .. type(line) .. " " .. describe(line))
    local line_text = line_ok and type(line) == "string" and strip_line_end(line) == TOKEN
    record("file:ReadLine returns text", line_text and "OK" or "FAIL", describe(line))
    if not line_text then
        return
    end

    step("file:ReadLine over 15000 lines")
    local big = open_file("big.txt", MODE_READ)
    if big then
        local timer = stopwatch()
        local lines = {}
        while true do
            local ok, next_line = pcall(big.ReadLine, big)
            if not ok or type(next_line) ~= "string" then
                break
            end
            lines[#lines + 1] = strip_line_end(next_line)
            if #lines > BIG_LINES then
                break
            end
        end
        pcall(big.Close, big)
        local same = table.concat(lines, "\n") .. "\n" == big_text
        record("ReadLine 15000 lines", same and "OK" or "FAIL", #lines .. " lines, " .. timer())
    end

    step("file:ReadLine on one 1 MiB line")
    local long = open_file("oneline.txt", MODE_READ)
    if long then
        local timer = stopwatch()
        local ok, long_line = pcall(long.ReadLine, long)
        pcall(long.Close, long)
        local expected = string.rep(BIG_LINE, BIG_LINES)
        local same = ok and type(long_line) == "string" and strip_line_end(long_line) == expected
        record("ReadLine one 1 MiB line", same and "OK" or "FAIL",
            "got " .. tostring(type(long_line) == "string" and #long_line) .. " of " .. #expected
            .. " bytes, " .. timer())
    end
end

---------------------------------------------------------------------------
-- MemBlock
---------------------------------------------------------------------------

local MEMBLOCK_METHODS = {
    "Size", "GetSize", "Length", "Len", "Count", "Data", "GetData", "Get", "GetByte", "GetBytes",
    "GetChar", "GetString", "ToString", "AsString", "String", "Text", "Read", "ReadByte", "ReadBytes",
    "ReadString", "ReadLine", "ReadInt8", "ReadUInt8", "Set", "SetByte", "SetString", "Write",
    "WriteByte", "WriteString", "__AutoSubsNoSuchMember__",
}

-- Called without arguments. Everything that could change the block stays out.
local MEMBLOCK_GETTERS = {
    "Size", "GetSize", "Length", "Len", "Count", "Data", "GetData", "GetBytes", "GetString", "ToString",
    "AsString", "String", "Text", "ReadString", "ReadLine",
}

local function carries_token(value)
    if type(value) ~= "string" then
        return false
    end
    local hex = TOKEN:gsub(".", function(c)
        return string.format("%02x", c:byte())
    end)
    local lowered = value:lower()
    return value:find(TOKEN, 1, true) ~= nil or lowered:find(hex, 1, true) ~= nil
end

local function try_text(label, fn)
    step(label)
    local ok, value = pcall(fn)
    say("  " .. tostring(ok) .. " " .. type(value) .. " " .. describe(value))
    if carries_token(value) then
        record("MemBlock to text via " .. label, "OK")
    end
    return ok and value or nil
end

local function test_memblock()
    section("MemBlock")
    if not has_method(fu, "OpenFile") then
        return
    end
    local file = open_file("plain.txt", MODE_READ)
    if not file then
        return
    end
    local ok, block = pcall(file.Read, file, 4096)
    pcall(file.Close, file)
    say("file:Read: " .. tostring(ok) .. " " .. type(block) .. " " .. describe(block))
    if not ok or block == nil then
        record("file:Read", "FAIL", describe(block))
        return
    end
    say("_typename: " .. describe(member_of(block, "_typename")))
    report_methods("memblock", block, MEMBLOCK_METHODS)

    for _, name in ipairs(MEMBLOCK_GETTERS) do
        if has_method(block, name) then
            try_text("block:" .. name .. "()", function()
                return block[name](block)
            end)
        elseif member_of(block, name) ~= nil then
            say("block." .. name .. " = " .. describe(member_of(block, name)))
        end
    end
    try_text("#block", function() return #block end)
    try_text("block[0]", function() return block[0] end)
    try_text("block[1]", function() return block[1] end)
    try_text("block .. ''", function() return block .. "" end)
    if type(rawget(_G, "dumptostring")) == "function" then
        try_text("dumptostring(block)", function() return dumptostring(block) end)
    end
    try_text("bmd.writestring(block)", function() return bmd.writestring(block) end)
    try_text("bmd.writestring({ block })", function() return bmd.writestring({ block }) end)

    for _, ctor in ipairs({
        { "MemBlock(16)", function() return MemBlock(16) end },
        { "MemBlock(text)", function() return MemBlock(TOKEN) end },
        { "HexData(hex)", function() return HexData("6175746f") end },
    }) do
        local made = try_text(ctor[1], ctor[2])
        if made ~= nil and type(made) ~= "string" then
            say("  bmd.writestring: " .. describe(select(2, pcall(bmd.writestring, { made }))))
        end
    end
end

---------------------------------------------------------------------------
-- File writes
---------------------------------------------------------------------------

local function test_file_write()
    section("file write")
    if not has_method(fu, "OpenFile") then
        record("fu:OpenFile write", "FAIL", "method missing")
        return
    end

    local function attempt(label, name, action)
        step(label)
        local file = open_file(name, MODE_WRITE)
        if not file then
            record(label, "FAIL", "could not open for writing")
            return false
        end
        local ok, returned = pcall(action, file)
        pcall(file.Flush, file)
        pcall(file.Close, file)
        local check = open_file(name, MODE_READ)
        local size = nil
        if check then
            size = select(2, pcall(check.GetFileSize, check))
            pcall(check.Close, check)
        end
        record(label, tonumber(size) and tonumber(size) > 0 and "OK" or "FAIL",
            tostring(ok) .. " " .. describe(returned) .. ", " .. tostring(size) .. " bytes on disk")
        return tonumber(size) ~= nil and tonumber(size) > 0
    end

    local line_ok = attempt("file:WriteLine(text)", "write_line.txt", function(file)
        return file:WriteLine(TOKEN)
    end)
    attempt("file:Write(text)", "write_text.txt", function(file)
        return file:Write(TOKEN)
    end)
    attempt("file:Write(text, size)", "write_text_size.txt", function(file)
        return file:Write(TOKEN, #TOKEN)
    end)

    local source = open_file("plain.txt", MODE_READ)
    if source then
        local read_ok, block = pcall(source.Read, source, 4096)
        pcall(source.Close, source)
        if read_ok and block ~= nil then
            attempt("file:Write(MemBlock)", "write_block.txt", function(file)
                return file:Write(block)
            end)
            attempt("file:Write(MemBlock, size)", "write_block_size.txt", function(file)
                return file:Write(block, 32)
            end)
        end
    end

    if line_ok then
        local timer = stopwatch()
        attempt("file:WriteLine(1 MiB)", "write_big.txt", function(file)
            return file:WriteLine(string.rep(BIG_LINE, BIG_LINES))
        end)
        say("  " .. timer())
    end
end

---------------------------------------------------------------------------
-- Prefs flush (Lua -> Rust)
---------------------------------------------------------------------------

local function test_prefs_flush()
    section("prefs flush")
    local holders = {
        { "fu", fu },
        { "app", rawget(_G, "app") },
        { "_thisapp", rawget(_G, "_thisapp") },
    }
    if has_method(bmd, "scriptapp") then
        holders[#holders + 1] = { "bmd.scriptapp", select(2, pcall(bmd.scriptapp, "Fusion")) }
    end
    if has_method(resolve_app, "Fusion") then
        holders[#holders + 1] = { "resolve:Fusion()", select(2, pcall(resolve_app.Fusion, resolve_app)) }
    end
    for _, holder in ipairs(holders) do
        say(holder[1] .. " " .. describe(holder[2]) .. " SavePrefs=" .. type(member_of(holder[2], "SavePrefs"))
            .. " LoadPrefs=" .. type(member_of(holder[2], "LoadPrefs")))
    end
    if not has_method(fu, "SavePrefs") then
        record("SetPrefs + SavePrefs", "FAIL", "SavePrefs missing")
        return
    end
    local marker = TOKEN .. "-" .. tostring(os.time())
    step("SetPrefs + SavePrefs")
    set_pref(PREF_ROOT .. ".SaveMarker", marker)
    local ok, saved = pcall(fu.SavePrefs, fu)
    record("SetPrefs + SavePrefs", ok and "OK" or "FAIL",
        "grep " .. marker .. " in Fusion.prefs on disk, returned " .. describe(saved))
end

-- SavePrefs is gone from 21.1.2 and Fusion.prefs still changed on disk during a
-- run. Each step stores its name in the Flush pref and pauses, so a watcher on
-- Fusion.prefs sees which step reached the disk.
local function flush_step(name, action)
    set_pref(PREF_ROOT .. ".Flush", name)
    say(os.date("%H:%M:%S") .. " flush step: " .. name)
    if action then
        action()
    end
    bmd.wait(FLUSH_SETTLE_SECONDS)
end

local function test_flush_triggers()
    section("flush triggers")
    flush_step("SetPrefs only")
    if has_method(fu, "SetData") then
        flush_step("SetData", function()
            pcall(fu.SetData, fu, DATA_ROOT .. ".Flush", TOKEN)
        end)
        pcall(fu.SetData, fu, DATA_ROOT .. ".Flush", nil)
    end
    if has_method(fu, "RunScript") then
        flush_step("RunScript end", function()
            pcall(fu.RunScript, fu, fixture("runscript_noop.lua"))
        end)
    end
    if has_method(fu, "Execute") then
        flush_step("Execute end", function()
            pcall(fu.Execute, fu, "local _ = 1")
        end)
    end
    if not has_method(fu, "LoadComp") then
        record("fu:LoadComp", "FAIL", "method missing")
        return
    end

    local loaded = nil
    flush_step("LoadComp hidden", function()
        local ok, comp = pcall(fu.LoadComp, fu, fixture("marker.comp"), true, true, true)
        loaded = ok and comp or nil
        say("  LoadComp: " .. tostring(ok) .. " " .. describe(comp))
    end)
    if loaded == nil then
        record("fu:LoadComp", "FAIL", "no comp returned")
        return
    end
    local marker = select(2, pcall(loaded.GetData, loaded, "Marker"))
    record("fu:LoadComp reads a file", marker == TOKEN and "OK" or "FAIL", describe(marker))

    flush_step("comp SetData and Save", function()
        pcall(loaded.SetData, loaded, "SaveMarker", TOKEN)
        local ok, saved = pcall(loaded.Save, loaded, fixture("saved.comp"))
        record("comp:Save(own path)", bmd.fileexists(fixture("saved.comp")) and "OK" or "FAIL",
            tostring(ok) .. " " .. describe(saved))
    end)
    flush_step("comp SaveCopyAs", function()
        local ok, saved = pcall(loaded.SaveCopyAs, loaded, fixture("saved_copy.comp"))
        record("comp:SaveCopyAs(own path)", bmd.fileexists(fixture("saved_copy.comp")) and "OK" or "FAIL",
            tostring(ok) .. " " .. describe(saved))
    end)
    flush_step("comp Close", function()
        say("  Close: " .. describe(select(2, pcall(loaded.Close, loaded))))
    end)
    flush_step("script end")
end

---------------------------------------------------------------------------
-- RunScript and Execute
---------------------------------------------------------------------------

local function test_marker_script(label, key, run)
    local pref = PREF_ROOT .. "." .. key
    set_pref(pref, "")
    step(label)
    local ok, first, second = run()
    say("  returned " .. tostring(ok) .. " " .. describe(first) .. " " .. describe(second))
    local waited = wait_until(function()
        return pref_filled(pref)
    end, WAIT_SECONDS)
    if waited then
        record(label, "OK", string.format("ran after %.2fs, state: %s", waited, describe(get_pref(pref))))
    else
        record(label, "FAIL", "no marker within " .. WAIT_SECONDS
            .. "s, run the probe again to see whether it started late")
    end
    return waited ~= nil
end

local function compare_big(label, value)
    local same = value == big_text
    record(label, same and "OK" or "FAIL",
        "got " .. (type(value) == "string" and #value or type(value)) .. " of " .. #big_text .. " bytes")
end

local function test_scripts()
    section("RunScript and Execute")
    if not has_method(fu, "RunScript") then
        record("fu:RunScript", "FAIL", "method missing")
    else
        local ran = test_marker_script("fu:RunScript(.lua)", "RunScript", function()
            return pcall(fu.RunScript, fu, fixture("runscript_marker.lua"))
        end)
        say("shared _G with the RunScript state: " .. describe(rawget(_G, "AUTOSUBS_PROBE_GLOBAL")))
        say("fu:SetData seen from here: " .. describe(has_method(fu, "GetData")
            and select(2, pcall(fu.GetData, fu, DATA_ROOT .. ".RunScript"))))

        if ran then
            step("fu:RunScript(1 MiB payload)")
            local timer = stopwatch()
            set_pref(PREF_ROOT .. ".BigDone", "")
            local ok, err = pcall(fu.RunScript, fu, fixture("runscript_big.lua"))
            local waited = wait_until(function()
                return pref_filled(PREF_ROOT .. ".BigDone")
            end, BIG_WAIT_SECONDS)
            if waited then
                record("fu:RunScript(1 MiB payload)", "OK", timer())
                compare_big("payload via shared _G", rawget(_G, "AUTOSUBS_PROBE_BIG"))
                if has_method(fu, "GetData") then
                    compare_big("payload via fu:SetData", select(2, pcall(fu.GetData, fu, DATA_ROOT .. ".Big")))
                end
                compare_big("payload via SetPrefs", get_pref(PREF_ROOT .. ".Big"))
            else
                record("fu:RunScript(1 MiB payload)", "FAIL", tostring(ok) .. " " .. describe(err))
            end
            rawset(_G, "AUTOSUBS_PROBE_BIG", nil)
            set_pref(PREF_ROOT .. ".Big", "")
            if has_method(fu, "SetData") then
                pcall(fu.SetData, fu, DATA_ROOT .. ".Big", nil)
            end
        end

    end

    if not has_method(fu, "Execute") then
        record("fu:Execute", "FAIL", "method missing")
    else
        local source = string.format(
            "local f = fusion or fu; f:SetPrefs(%q, 'loadfile=' .. type(loadfile) .. ' SavePrefs=' .. type(f.SavePrefs))",
            PREF_ROOT .. ".Execute")
        test_marker_script("fu:Execute(string)", "Execute", function()
            return pcall(fu.Execute, fu, source)
        end)
    end
end

---------------------------------------------------------------------------
-- fu:SetData
---------------------------------------------------------------------------

local function test_data()
    section("fu:SetData")
    if not (has_method(fu, "SetData") and has_method(fu, "GetData")) then
        record("fu:SetData round trip", "FAIL", "method missing")
        return
    end
    local ok = pcall(fu.SetData, fu, DATA_ROOT .. ".RoundTrip", TOKEN)
    local read_ok, value = pcall(fu.GetData, fu, DATA_ROOT .. ".RoundTrip")
    record("fu:SetData round trip", ok and read_ok and value == TOKEN and "OK" or "FAIL", describe(value))
end

---------------------------------------------------------------------------
-- fu:LoadPrefs
---------------------------------------------------------------------------

local function restore_prefs()
    step("fu:LoadPrefs(full.prefs) to restore")
    pcall(fu.LoadPrefs, fu, fixture("full.prefs"))
    if get_pref(PREF_ROOT .. ".FullMarker") == TOKEN then
        return true
    end
    record("restore prefs", "WARN", "prefs may be damaged: quit Resolve, then copy "
        .. fixture("Fusion.prefs.backup") .. " over Fusion.prefs")
    return false
end

local function test_load_prefs()
    section("fu:LoadPrefs")
    if not has_method(fu, "LoadPrefs") then
        record("fu:LoadPrefs(file)", "FAIL", "method missing")
        return
    end

    -- The full copy proves LoadPrefs reads the given path at all. Only then is a
    -- restore possible, so the minimal file is never loaded without it.
    local timer = stopwatch()
    step("fu:LoadPrefs(full.prefs)")
    local ok, loaded = pcall(fu.LoadPrefs, fu, fixture("full.prefs"))
    local full_read = get_pref(PREF_ROOT .. ".FullMarker") == TOKEN
    record("fu:LoadPrefs(full copy)", full_read and "OK" or "FAIL",
        tostring(ok) .. " " .. describe(loaded) .. ", " .. timer())
    if not full_read then
        say("skipping the minimal prefs test, no way to restore")
        return
    end

    set_pref(PREF_ROOT .. ".InMemory", TOKEN)
    timer = stopwatch()
    step("fu:LoadPrefs(minimal.prefs)")
    ok, loaded = pcall(fu.LoadPrefs, fu, fixture("minimal.prefs"))
    local minimal_read = get_pref(PREF_ROOT .. ".Marker") == TOKEN
    local kept_full = get_pref(PREF_ROOT .. ".FullMarker") == TOKEN
    local kept_memory = get_pref(PREF_ROOT .. ".InMemory") == TOKEN
    record("fu:LoadPrefs(minimal file)", minimal_read and "OK" or "FAIL",
        tostring(ok) .. " " .. describe(loaded) .. ", " .. timer())
    record("minimal load keeps other prefs", (kept_full and kept_memory) and "OK" or "FAIL",
        string.format("file-backed key kept=%s, in-memory key kept=%s (FAIL means it replaces everything)",
            tostring(kept_full), tostring(kept_memory)))
    if not restore_prefs() then
        return
    end

    step("fu:LoadPrefs(full.prefs, minimal.prefs)")
    set_pref(PREF_ROOT .. ".Marker", "")
    set_pref(PREF_ROOT .. ".InMemory", TOKEN)
    ok, loaded = pcall(fu.LoadPrefs, fu, fixture("full.prefs"), fixture("minimal.prefs"))
    record("fu:LoadPrefs(file, master)", get_pref(PREF_ROOT .. ".Marker") == TOKEN and "OK" or "FAIL",
        tostring(ok) .. " " .. describe(loaded) .. ", in-memory key kept="
        .. tostring(get_pref(PREF_ROOT .. ".InMemory") == TOKEN))
    restore_prefs()
end

---------------------------------------------------------------------------
-- MediaStorage directory listings
---------------------------------------------------------------------------

local function test_media_storage()
    section("MediaStorage listings")
    local ok, storage = false, nil
    if has_method(resolve_app, "GetMediaStorage") then
        ok, storage = pcall(resolve_app.GetMediaStorage, resolve_app)
    end
    if not ok or storage == nil then
        record("MediaStorage", "FAIL", "GetMediaStorage unavailable")
        return
    end
    if has_method(storage, "GetMountedVolumeList") then
        local volumes_ok, volumes = pcall(storage.GetMountedVolumeList, storage)
        say("mounted volumes: " .. tostring(volumes_ok) .. " " .. (type(volumes) == "table"
            and table.concat(volumes, " | ") or describe(volumes)))
    end
    for _, method in ipairs({ "GetSubFolderList", "GetFileList" }) do
        if has_method(storage, method) then
            step(method .. "(dirlist)")
            local list_ok, list = pcall(storage[method], storage, fixture("dirlist"))
            local count = type(list) == "table" and #list or 0
            record(method .. " on an arbitrary path", count > 0 and "OK" or "FAIL",
                tostring(list_ok) .. " " .. count .. " entries")
            if count > 0 then
                local sample = {}
                for index = 1, math.min(count, 6) do
                    sample[index] = list[index]
                end
                emit_list(method .. " sample", sample)
            end
        else
            record(method, "FAIL", "method missing")
        end
    end
    if has_method(storage, "GetSubFolderList") then
        step("GetSubFolderList(dirlist_1000)")
        local timer = stopwatch()
        local list_ok, list = pcall(storage.GetSubFolderList, storage, fixture("dirlist_1000"))
        local count = type(list) == "table" and #list or 0
        local longest = 0
        for index = 1, count do
            longest = math.max(longest, #tostring(list[index]))
        end
        record("GetSubFolderList 1000 folders", count == 1000 and "OK" or "FAIL",
            tostring(list_ok) .. " " .. count .. " entries, longest path " .. longest .. ", " .. timer())
    end
end

---------------------------------------------------------------------------
-- Comp level loaders
---------------------------------------------------------------------------

local function test_comp_loaders()
    section("comp loaders")
    local ok, comp = false, nil
    if has_method(fu, "GetCurrentComp") then
        ok, comp = pcall(fu.GetCurrentComp, fu)
    end
    if not ok or comp == nil then
        record("tool:LoadSettings", "SKIP", "no current comp, open the Fusion page on a clip to test this")
    else
        step("tool:LoadSettings(marker.setting)")
        pcall(comp.StartUndo, comp, "AutoSubs probe")
        local added, tool = pcall(comp.AddTool, comp, "Background", -32768, -32768)
        if added and tool then
            local load_ok, loaded = pcall(tool.LoadSettings, tool, fixture("marker.setting"))
            local data_ok, marker = pcall(tool.GetData, tool, "Marker")
            pcall(tool.Delete, tool)
            record("tool:LoadSettings", data_ok and marker == TOKEN and "OK" or "FAIL",
                tostring(load_ok) .. " " .. describe(loaded) .. ", marker " .. describe(marker))
        else
            record("tool:LoadSettings", "FAIL", "AddTool failed: " .. describe(tool))
        end
        pcall(comp.EndUndo, comp, false)
    end
end

---------------------------------------------------------------------------
-- Run
---------------------------------------------------------------------------

local function guarded(name, fn)
    local ok, err = pcall(fn)
    if not ok then
        record(name, "FAIL", "section aborted: " .. tostring(err))
    end
end

local function cleanup()
    rawset(_G, "AUTOSUBS_PROBE_GLOBAL", nil)
    for _, key in ipairs({ "Marker", "FullMarker", "InMemory", "RunScript", "Execute", "BigDone", "Flush" }) do
        set_pref(PREF_ROOT .. "." .. key, "")
    end
    if has_method(fu, "SetData") then
        pcall(fu.SetData, fu, DATA_ROOT .. ".RunScript", nil)
        pcall(fu.SetData, fu, DATA_ROOT .. ".RoundTrip", nil)
    end
end

say("AutoSubs sandbox probe start")
guarded("environment", enumerate_header)
guarded("globals", enumerate_globals)
guarded("objects", enumerate_objects)
guarded("code loading", test_code_loading)

local fixtures_ready = bmd.fileexists(fixture("plain.txt"))
if fixtures_ready then
    guarded("bmd helpers", test_bmd)
    guarded("fu:OpenFile", test_open_file)
    guarded("MemBlock", test_memblock)
    guarded("file write", test_file_write)
    guarded("prefs flush", test_prefs_flush)
    guarded("RunScript and Execute", test_scripts)
    guarded("fu:SetData", test_data)
    guarded("fu:LoadPrefs", test_load_prefs)
    guarded("MediaStorage", test_media_storage)
    guarded("flush triggers", test_flush_triggers)
    guarded("comp loaders", test_comp_loaders)
    guarded("cleanup", cleanup)
else
    record("fixtures", "SKIP", "not found at " .. root .. ", run sandbox_probe_setup.sh for the channel tests")
end

section("summary")
for _, line in ipairs(results) do
    say(line)
end
say("AutoSubs sandbox probe end")

-- Resolve's stdout is block buffered, so a piped log would otherwise stop short.
print(string.rep(" ", 16384))
if fixtures_ready and has_method(fu, "OpenFile") then
    local ok, done = pcall(fu.OpenFile, fu, fixture("probe_done"), MODE_WRITE)
    if ok and done then
        pcall(done.Close, done)
    end
end
