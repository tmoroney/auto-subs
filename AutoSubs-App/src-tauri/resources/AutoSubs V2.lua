-- Detect the operating system
local os_name = ffi.os
print("Operating System: " .. os_name)

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
    if (os_name == "OSX") then
        local file = assert(io.open(file_path, "r")) -- Open file for reading
        local content = file:read("*a")              -- Read the entire file content
        file:close()
        return content
    end

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
end

-- OS SPECIFIC CONFIGURATION
local storage_path
local modules_path
local main_app
local command_open
local command_close

if os_name == "Windows" then
    -- Define the necessary Windows API functions using FFI
    -- Note: Sleep and ShellExecuteA are used to prevent terminal from opening (replaces os.execute)
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

    -- Get the storage path for the files used by the script
    storage_path = os.getenv("APPDATA") .. "/Blackmagic Design/DaVinci Resolve/Support/Fusion/Scripts/Utility/AutoSubs/"

    -- Get path to the main AutoSubs app and modules
    local install_path = assert(read_file(storage_path .. "install_path.txt"))
    install_path = string.gsub(install_path, "\\", "/")
    main_app = install_path .. "/AutoSubs.exe"
    modules_path = install_path .. "/resources/modules/"

    -- Windows commands to open and close main app
    command_open = 'start "" "' .. main_app .. '"'
    command_close = 'powershell -Command "Get-Process AutoSubs | Stop-Process -Force"'
elseif os_name == "OSX" then
    -- Use the C system function to execute shell commands on macOS
    ffi.cdef [[ int system(const char *command); ]]

    local install_path = "/Applications"
    main_app = install_path .. "/AutoSubs.app"
    modules_path = main_app .. "/Contents/Resources/resources/modules/"
    storage_path = main_app .. "/Contents/Resources/resources/AutoSubs/"

    print("Main App Path: ", main_app)
    -- MacOS commands to open and close main app
    command_open = 'open ' .. main_app
    command_close = "pkill -f " .. main_app
else
    print("Unsupported OS")
    return
end


-- Add custom modules path for Lua require
package.path = package.path .. ";" .. modules_path .. "?.lua"

-- Import modules
local socket = require("ljsocket")
local json = require("dkjson")
local utf8 = require("utf8")

-- Load common DaVinci Resolve API utilities
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local mediaPool = project:GetMediaPool()

-- Function to read a JSON file
local function read_json_file(file_path)
    local file = assert(io.open(file_path, "r")) -- Open file for reading
    local content = file:read("*a")              -- Read the entire file content
    file:close()

    -- Parse the JSON content
    local data, pos, err = json.decode(content, 1, nil)

    if err then
        print("Error:", err)
        return nil
    end

    return data -- Return the decoded Lua table
end

function CreateResponse(body)
    local header = "HTTP/1.1 200 OK\r\n" .. "Server: ljsocket/0.1\r\n" .. "Content-Type: application/json\r\n" ..
        "Content-Length: " .. #body .. "\r\n" .. "Connection: close\r\n" .. "\r\n"

    local response = header .. body
    return response
end

-- UTILS
function lstrip(str)
    return str:gsub("^%s*(.-)%s*$", "%1")
end

-- Convert hex color to RGB (Davinci Resolve uses 0-1 range)
function hexToRgb(hex)
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
end

-- Pause execution for a specified number of seconds (platform-independent)
function sleep(n)
    if os_name == "Windows" then
        -- Windows
        ffi.C.Sleep(n * 1000)
    else
        -- Unix-based (Linux, macOS)
        os.execute("sleep " .. tonumber(n))
    end
end

-- Convert seconds to frames based on the timeline frame rate
function SecondsToFrames(seconds, frameRate)
    return seconds * frameRate
end

-- convert seconds to timecode in format HH:MM:SS:FF
function FramesToTimecode(frames, frameRate)
    local hours = math.floor(frames / (frameRate * 60 * 60))
    local minutes = math.floor((frames / (frameRate * 60)) % 60)
    local seconds = math.floor((frames / frameRate) % 60)
    local remainingFrames = frames % frameRate
    return string.format("%02d:%02d:%02d:%02d", hours, minutes, seconds, remainingFrames)
end

-- input of time in seconds
function JumpToTime(time, markIn)
    local timeline = project:GetCurrentTimeline()
    local frameRate = timeline:GetSetting("timelineFrameRate")
    local frames = SecondsToFrames(time, frameRate) + markIn
    local timecode = FramesToTimecode(frames, frameRate)
    timeline:SetCurrentTimecode(timecode)
end

-- List of title strings to search for
local titleStrings = {
    "Título – Fusion", -- Spanish
    "Título Fusion", -- Portuguese
    "Generator", -- English (older versions)
    "Fusion Title", -- English
    "Titre Fusion", -- French
    "Титры на стр. Fusion", -- Russian
    "Fusion Titel", -- German
    "Titolo Fusion", -- Italian
    "Fusionタイトル", -- Japanese
    "Fusion标题", -- Chinese
    "퓨전 타이틀", -- Korean
    "Tiêu đề Fusion", -- Vietnamese
    "Fusion Titles" -- Thai
}

-- Helper function to check if a string is in the titleStrings list
local function isMatchingTitle(title)
    for _, validTitle in ipairs(titleStrings) do
        if title == validTitle then
            return true
        end
    end
    return false
end

-- Recursive search for all Text+ templates in the media pool
local defaultTemplateExists = false;
local templates = {}
function FindAllTemplates(folder)
    -- Get subfolders and recursively process them
    for _, subfolder in ipairs(folder:GetSubFolderList()) do
        FindAllTemplates(subfolder)
    end

    -- Get clips in the current folder and add them to the templates list
    for _, clip in ipairs(folder:GetClipList()) do
        local clipType = clip:GetClipProperty()["Type"]
        if isMatchingTitle(clipType) then
            local clipName = clip:GetClipProperty()["Clip Name"]
            local newTemplate = {
                label = clipName,
                value = clipName
            }
            table.insert(templates, newTemplate)

            if clipName == "Default Template" then
                defaultTemplateExists = true
            end
        end
    end
end

-- Get a list of all Text+ templates in the media pool
function GetTemplates()
    local rootFolder = mediaPool:GetRootFolder()
    templates = {}
    FindAllTemplates(rootFolder)
    -- Add default template to mediapool if not available
    if defaultTemplateExists == false then
        local success, err = pcall(function()
            mediaPool:ImportFolderFromFile(storage_path .. "subtitle-template.drb")
            local clipName = "Default Template"
            local newTemplate = {
                label = clipName,
                value = clipName
            }
            table.insert(templates, newTemplate)
        end)
        defaultTemplateExists = true
    end
    return templates
end

function GetTimelineInfo()
    local timelineInfo = {}
    local success, err = pcall(function()
        local timeline = project:GetCurrentTimeline()
        timelineInfo = {
            name = timeline:GetName(),
            timelineId = timeline:GetUniqueId()
        }
    end)
    if not success then
        print("Error retrieving timeline info:", err)
        timelineInfo = {
            timelineId = "",
            name = "No timeline selected"
        }
    else -- get tracks and templates
        timelineInfo["outputTracks"] = GetVideoTracks()
        timelineInfo["inputTracks"] = GetAudioTracks()
        timelineInfo["templates"] = GetTemplates()
    end
    return timelineInfo
end

-- Get a list of possible output tracks for subtitles
function GetVideoTracks()
    local tracks = {}
    local createNewTrack = {
        value = "0",
        label = "Add to New Track"
    }
    table.insert(tracks, createNewTrack)

    local success, err = pcall(function()
        local timeline = project:GetCurrentTimeline()
        local trackCount = timeline:GetTrackCount("video")
        for i = 1, trackCount do
            local track = {
                value = tostring(i),
                label = timeline:GetTrackName("video", i)
            }
            table.insert(tracks, track)
        end
    end)
    return tracks
end

function GetAudioTracks()
    local tracks = {}
    local allTracks = {
        value = "0",
        label = "All Audio Tracks"
    }
    table.insert(tracks, allTracks)

    local success, err = pcall(function()
        local timeline = project:GetCurrentTimeline()
        local trackCount = timeline:GetTrackCount("audio")
        for i = 1, trackCount do
            local track = {
                value = tostring(i),
                label = timeline:GetTrackName("audio", i)
            }
            table.insert(tracks, track)
        end
    end)
    return tracks
end

function CheckTrackEmpty(trackIndex, markIn, markOut)
    trackIndex = tonumber(trackIndex)
    local timeline = project:GetCurrentTimeline()
    local trackItems = timeline:GetItemListInTrack("video", trackIndex)
    for i, item in ipairs(trackItems) do
        local itemStart = item:GetStart()
        local itemEnd = item:GetEnd()
        if (itemStart <= markIn and itemEnd >= markIn) or (itemStart <= markOut and itemEnd >= markOut) then
            return false
        end
        if itemStart > markOut then
            break
        end
    end
    return #trackItems == 0
end

function ExportAudio(outputDir, inputTrack)
    local audioInfo = {
        timeline = ""
    }
    -- local success, err = pcall(function()
    --     resolve:ImportRenderPreset(storagePath .. "render-audio-only.xml")
    --     project:LoadRenderPreset('render-audio-only')
    --     project:SetRenderSettings({ TargetDir = outputDir })
    -- end)

    local trackStates = {}
    local timeline;
    local audioTracks;
    if inputTrack ~= "0" and inputTrack ~= "" then
        -- mute all tracks except the selected one
        timeline = project:GetCurrentTimeline()
        audioTracks = timeline:GetTrackCount("audio")
        for i = 1, audioTracks do
            local state = timeline:GetIsTrackEnabled("audio", i)
            trackStates[i] = state
            if i == tonumber(inputTrack) then
                timeline:SetTrackEnable("audio", i, true)
            else
                timeline:SetTrackEnable("audio", i, false)
            end
        end
    end

    resolve:OpenPage("deliver")

    project:LoadRenderPreset('Audio Only')
    project:SetRenderSettings({
        TargetDir = outputDir,
        CustomName = "autosubs-exported-audio",
        RenderMode = "Single clip",
        IsExportVideo = false,
        IsExportAudio = true,
        AudioBitDepth = 24,
        AudioSampleRate = 44100
    })

    pcall(function()
        local pid = project:AddRenderJob()
        project:StartRendering(pid)

        local renderJobList = project:GetRenderJobList()
        local renderSettings = renderJobList[#renderJobList]

        audioInfo = {
            timeline = project:GetCurrentTimeline():GetUniqueId(),
            path = renderSettings["TargetDir"] .. "/" .. renderSettings["OutputFilename"],
            markIn = renderSettings["MarkIn"],
            markOut = renderSettings["MarkOut"]
        }

        while project:IsRenderingInProgress() do
            print("Rendering...")
            sleep(0.5) -- Check every 500 milliseconds
        end
    end)

    resolve:OpenPage("edit")

    -- unmute all tracks
    if inputTrack ~= "0" and inputTrack ~= "" then
        for i = 1, audioTracks do
            timeline:SetTrackEnable("audio", i, trackStates[i])
        end
    end

    -- check if audio file exists
    if not io.open(audioInfo.path, "r") then
        sleep(1)
    end

    return audioInfo
end

-- Recursively searches to find the template item with the specified ID
function GetTemplateItem(folder, templateName)
    local subfolders = folder:GetSubFolderList()
    for i, subfolder in ipairs(subfolders) do
        local result = GetTemplateItem(subfolder, templateName)
        if result then
            return result
        end
    end
    local clips = folder:GetClipList()
    for i, clip in ipairs(clips) do
        if clip:GetClipProperty()["Clip Name"] == templateName then
            return clip
        end
    end
end

-- Add subtitles to the timeline using the specified template
function AddSubtitles(filePath, trackIndex, templateName, textFormat, removePunctuation)
    resolve:OpenPage("edit")
    local data = read_json_file(filePath)
    if data == nil then
        print("Error reading JSON file")
        return false
    end

    local timeline = project:GetCurrentTimeline()
    local markInOut = timeline:GetMarkInOut()
    local timelineStart = timeline:GetStartFrame()
    local timelineEnd = timeline:GetEndFrame()

    local markIn = data["mark_in"] or (markInOut.audio["in"] and markInOut.audio["in"] + timelineStart) or timelineStart
    local markOut = data["mark_out"] or (markInOut.audio["out"] and markInOut.audio["out"] + timelineStart) or timelineEnd

    if trackIndex == "0" or trackIndex == "" or not CheckTrackEmpty(trackIndex, markIn, markOut) then
        trackIndex = timeline:GetTrackCount("video") + 1
    else
        trackIndex = tonumber(trackIndex)
    end

    local subtitles = data["segments"]

    print("Adding subtitles to timeline")
    
    local frame_rate = timeline:GetSetting("timelineFrameRate")

    local rootFolder = mediaPool:GetRootFolder()

    if templateName == "" then
        FindAllTemplates(rootFolder)
        templateName = templates[1].value
    end

    local text_clip = GetTemplateItem(rootFolder, templateName)

    -- convert speakers to dictionary
    local speakersExist = false
    local speakers = {}
    if #data.speakers > 0 then
        speakersExist = true
        for _, speaker in ipairs(data.speakers) do
            speakers[speaker.id] = {
                color = speaker.color,
                style = speaker.style
            }
        end
    end

    -- If within 1 second, join the subtitles
    local clipList = {}
    local joinThreshold = frame_rate
    --local subtitlesCount = #subtitles

    for i, subtitle in ipairs(subtitles) do
        -- print("Adding subtitle: ", subtitle["text"])
        local start_frame = SecondsToFrames(subtitle["start"], frame_rate)
        local end_frame = SecondsToFrames(subtitle["end"], frame_rate)

        local duration = end_frame - start_frame
        local newClip = {
            mediaPoolItem = text_clip,
            mediaType = 1,
            startFrame = 0,
            endFrame = duration,
            recordFrame = start_frame + markIn,
            trackIndex = trackIndex
        }

        table.insert(clipList, newClip)
    end

    -- Append all clips to the timeline
    for i, newClip in ipairs(clipList) do
        local success, err = pcall(function()
            -- Check if near next subtitle
            if i < #clipList then
                local nextStart = clipList[i + 1]["recordFrame"]
                local framesBetween = nextStart - (newClip["recordFrame"] + newClip["endFrame"])
                if (framesBetween < joinThreshold) then
                    newClip["endFrame"] = nextStart - newClip["recordFrame"] + 1
                end
            end

            local timelineItem = mediaPool:AppendToTimeline({ newClip })[1]

            local subtitle = subtitles[i]
            local subtitleText = subtitle["text"]

            -- Remove punctuation if specified
            if removePunctuation then
                subtitleText = utf8.gsub(subtitleText, "[%p%c]", function(c)
                    if c == "*" then
                        return c
                    else
                        return ""
                    end
                end)
            end

            -- Apply text formatting
            if textFormat == "uppercase" then
                subtitleText = utf8.upper(subtitleText)
            end

            if textFormat == "lowercase" then
                subtitleText = utf8.lower(subtitleText)
            end

            -- Skip if text is not compatible
            if timelineItem:GetFusionCompCount() > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local text_plus_tools = comp:GetToolList(false, "TextPlus")
                text_plus_tools[1]:SetInput("StyledText", lstrip(subtitleText))

                -- Set text colors if available
                if speakersExist then
                    local speaker = speakers[subtitle["speaker"]]
                    -- dump(speaker)
                    local color = hexToRgb(speaker.color)
                    -- print("Color: ", color.r, color.g, color.b)
                    if speaker.style == "Fill" then
                        text_plus_tools[1]:SetInput("Red1", color.r)
                        text_plus_tools[1]:SetInput("Green1", color.g)
                        text_plus_tools[1]:SetInput("Blue1", color.b)
                    elseif speaker.style == "Outline" then
                        text_plus_tools[1]:SetInput("Red2", color.r)
                        text_plus_tools[1]:SetInput("Green2", color.g)
                        text_plus_tools[1]:SetInput("Blue2", color.b)
                    end
                end

                -- Set the clip color to symbolize that the subtitle was added
                timelineItem:SetClipColor("Green")
            end
        end)

        if not success then
            print("Attempted to add subtitle on top of existing timeline item. Please select an empty track.")
        end
    end
end

local function set_cors_headers(client)
    client:send("HTTP/1.1 200 OK\r\n")
    client:send("Access-Control-Allow-Origin: *\r\n")
    client:send("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
    client:send("Access-Control-Allow-Headers: Content-Type\r\n")
    client:send("\r\n")
end

-- Server
local port = 55010

-- Set up server socket configuration
local info = assert(socket.find_first_address("127.0.0.1", port))
local server = assert(socket.create(info.family, info.socket_type, info.protocol))

-- Set socket options
server:set_blocking(false)
assert(server:set_option("nodelay", true, "tcp"))
assert(server:set_option("reuseaddr", true))

-- Bind and listen
local success, err = pcall(function()
    assert(server:bind(info))
end)

if not success then
    os.execute([[
        curl --request POST \
            --url http://localhost:55010/ \
            --header 'Content-Type: application/json' \
            --header 'content-type: application/json' \
            --data '{
            "func":"Exit"
        }'
    ]])
    sleep(0.5)
    assert(server:bind(info))
end

assert(server:listen())

-- Start AutoSubs app
if os_name == "Windows" then
    -- Windows
    local SW_SHOW = 5 -- Show the window

    -- Call ShellExecuteA from Shell32.dll
    local shell32 = ffi.load("Shell32")
    local result_open = shell32.ShellExecuteA(nil, "open", main_app, nil, nil, SW_SHOW)

    if result_open > 32 then
        print("AutoSubs launched successfully.")
    else
        print("Failed to launch AutoSubs. Error code:", result_open)
        return
    end
else
    -- MacOS
    local result_open = ffi.C.system(command_open)

    if result_open == 0 then
        print("AutoSubs launched successfully.")
    else
        print("Failed to launch AutoSubs. Error code:", result_open)
        return
    end
end

print("AutoSubs server is listening on port: ", port)
local quitServer = false
while not quitServer do
    -- Server loop to handle client connections
    local client, err = server:accept()
    if client then
        local peername, peer_err = client:get_peer_name()
        if peername then
            assert(client:set_blocking(false))
            -- Try to receive data (example HTTP request)
            local str, err = client:receive()
            if str then
                -- print("Received request:", str)
                -- Split the request by the double newline
                local header_body_separator = "\r\n\r\n"
                local _, _, content = string.find(str, header_body_separator .. "(.*)")
                print("Received request:", content)

                -- Parse the JSON content
                local data, pos, err = json.decode(content, 1, nil)
                local body = ""

                local success, err = pcall(function()
                    if data == nil then
                        body = json.encode({
                            message = "Invalid JSON data"
                        })
                        print("Invalid JSON data")
                    elseif data.func == "GetTimelineInfo" then
                        print("[AutoSubs Server] Retrieving Timeline Info...")
                        local timelineInfo = GetTimelineInfo()
                        body = json.encode(timelineInfo)
                    elseif data.func == "JumpToTime" then
                        print("[AutoSubs Server] Jumping to time...")
                        JumpToTime(data.start, data.markIn)
                        body = json.encode({
                            message = "Jumped to time"
                        })
                    elseif data.func == "ExportAudio" then
                        print("[AutoSubs Server] Exporting audio...")
                        local audioInfo = ExportAudio(data.outputDir, data.inputTrack)
                        body = json.encode(audioInfo)
                    elseif data.func == "AddSubtitles" then
                        print("[AutoSubs Server] Adding subtitles to timeline...")
                        AddSubtitles(data.filePath, data.trackIndex, data.templateName, data.textFormat,
                            data.removePunctuation)
                        body = json.encode({
                            message = "Job completed"
                        })
                    elseif data.func == "Exit" then
                        body = json.encode({
                            message = "Server shutting down"
                        })
                        quitServer = true
                    else
                        print("Invalid function name")
                    end
                end)

                if not success then
                    body = json.encode({
                        message = "Job failed with error: " .. err
                    })
                    print("Error:", err)
                end

                -- Send HTTP response content
                local response = CreateResponse(body)
                assert(client:send(response))

                -- Close connection
                client:close()
            elseif err == "closed" then
                client:close()
            elseif err ~= "timeout" then
                error(err)
            end
        end
    elseif err ~= "timeout" then
        error(err)
    end
    sleep(0.1)
end

print("Shutting down AutoSubs Link server...")
server:close()

-- Kill transcription server if necessary
-- ffi.C.system(command_close)

print("Server shut down.")
