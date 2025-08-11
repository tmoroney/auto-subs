local DEV_MODE = false

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
    ]]

    -- Get path to the main AutoSubs app and modules
    local storage_path = os.getenv("APPDATA") ..
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

-- temporarily redefine path for dev_mode
if DEV_MODE then
    resources_folder = os.getenv("HOME") .. "/Documents/AutoSubsV3/AutoSubs-App/src-tauri/resources"
end

-- Set package path for module loading
local modules_path = join_path(resources_folder, "modules")
package.path = package.path .. ";" .. join_path(modules_path, "?.lua")

-- Launch AutoSubs
local AutoSubs = require("autosubs_core")
AutoSubs:Init(app_executable, resources_folder, DEV_MODE)
