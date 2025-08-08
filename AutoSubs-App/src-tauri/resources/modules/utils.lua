---@diagnostic disable: undefined-global
local ffi = ffi

local utils = {
    -- Convert hex color to RGB (Davinci Resolve uses 0-1 range)
    hexToRgb = function(self, hex)
        local result = hex:match("^#?(%x%x)(%x%x)(%x%x)$")
        if result then
            local r, g, b = hex:match("^#?(%x%x)(%x%x)(%x%x)$")
            return {
                r = tonumber(r, 16) / 255,
                g = tonumber(g, 16) / 255,
                b = tonumber(b, 16) / 255
            }
        else
            return nil
        end
    end,

    -- Convert seconds to frames based on the timeline frame rate
    to_frames = function(self, seconds, frameRate)
        return seconds * frameRate
    end,

    -- Pause execution for a specified number of seconds (platform-independent)
    sleep = function(self, n)
        if ffi.os == "Windows" then
            -- Windows
            ffi.C.Sleep(n * 1000)
        else
            -- Unix-based (Linux, macOS)
            os.execute("sleep " .. tonumber(n))
        end
    end,

    define_windows_api = function(self)
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
            void Sleep(unsigned int ms);
            int ShellExecuteA(void* hwnd, const char* lpOperation, const char* lpFile, const char* lpParameters, const char* lpDirectory, int nShowCmd);
        ]]
    end
}

return utils
