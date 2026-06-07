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

-- Helper to convert a UTF-8 string to a wide-character (WCHAR) string
local function to_wide_string(str)
    local len = #str + 1 -- Include null terminator
    local buffer = ffi.new("WCHAR[?]", len)
    local bytes_written = ffi.C.MultiByteToWideChar(65001, 0, str, -1, buffer, len)
    if bytes_written == 0 then
        error("Failed to convert string to wide string: " .. str)
    end
    return buffer
end

-- Function to read the content of a file using _wfopen
local function read_file(file_path)
    if (ffi.os == "Windows") then
        local wide_path = to_wide_string(file_path)
        local mode = to_wide_string("rb")
        local f = ffi.C._wfopen(wide_path, mode)
        if f == nil then
            error("Failed to open file: " .. file_path)
        end

        local buffer = {}
        local temp_buffer = ffi.new("char[4096]") -- 4KB buffer for reading
        while true do
            local read_bytes = ffi.C.fread(temp_buffer, 1, 4096, f)
            if read_bytes == 0 then
                break
            end
            buffer[#buffer + 1] = ffi.string(temp_buffer, read_bytes)
        end
        ffi.C.fclose(f)

        return table.concat(buffer)
    else
        local file = assert(io.open(file_path, "r")) -- Open file for reading
        local content = file:read("*a")              -- Read the entire file content
        file:close()
        return content
    end
end

-- Detect the operating system
local os_name = ffi.os
print("Operating System: " .. os_name)

-- Path to the script to launch
local resources_folder = nil
local app_executable = nil

if os_name == "Windows" then
    -- Define the necessary Windows API functions using FFI to prevent special character issues
    ffi.cdef [[
        typedef wchar_t WCHAR;

        int MultiByteToWideChar(
            unsigned int CodePage,
            unsigned long dwFlags,
            const char* lpMultiByteStr,
            int cbMultiByte,
            WCHAR* lpWideCharStr,
            int cchWideChar);

        void* _wfopen(const WCHAR* filename, const WCHAR* mode);
        size_t fread(void* buffer, size_t size, size_t count, void* stream);
        int fclose(void* stream);

        unsigned long GetEnvironmentVariableW(const WCHAR* lpName, WCHAR* lpBuffer, unsigned long nSize);
        int WideCharToMultiByte(unsigned int CodePage, unsigned long dwFlags,
            const WCHAR* lpWideCharStr, int cchWideChar,
            char* lpMultiByteStr, int cbMultiByte,
            const char* lpDefaultChar, int* lpUsedDefaultChar);
    ]]

    -- Use the Wide API to get environment variables so special characters in
    -- usernames (e.g. accented letters) are not corrupted by the ANSI fallback.
    local function getenv_wide(name)
        local wide_name = to_wide_string(name)
        local size = ffi.C.GetEnvironmentVariableW(wide_name, nil, 0)
        if size == 0 then return nil end
        local buffer = ffi.new("WCHAR[?]", size)
        ffi.C.GetEnvironmentVariableW(wide_name, buffer, size)
        local utf8_size = ffi.C.WideCharToMultiByte(65001, 0, buffer, -1, nil, 0, nil, nil)
        if utf8_size == 0 then return nil end
        local utf8_buffer = ffi.new("char[?]", utf8_size)
        ffi.C.WideCharToMultiByte(65001, 0, buffer, -1, utf8_buffer, utf8_size, nil, nil)
        return ffi.string(utf8_buffer, utf8_size - 1)
    end

    -- Get path to the main AutoSubs app and modules
    local storage_path = getenv_wide("APPDATA") ..
        "\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Utility\\AutoSubs"
    local install_path = assert(read_file(join_path(storage_path, "install_path.txt")))
    app_executable = install_path .. "\\AutoSubs.exe"
    resources_folder = install_path .. "\\resources"
elseif os_name == "OSX" then
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
if os_name ~= "Windows" and not file_exists(core_module_path) then
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
