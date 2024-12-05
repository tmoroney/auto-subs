local ffi = require("ffi")
local socket = require("ljsocket")
local json = require("dkjson")

-- Detect the operating system
local os_name = ffi.os
print("Operating System: " .. os_name)

local storagePath = ""
local module_path = ""
local mainApp = ""
local transcriptionServer = ""
local command_open = ""
local command_close = ""
local command_kill_server = ""

if os_name == "Windows" then
    local appDataPath = os.getenv("APPDATA")
    storagePath = "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Fusion\\AutoSubs\\"
    mainApp = "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Fusion\\AutoSubs\\AutoSubs.exe"
    transcriptionServer =
        "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Fusion\\AutoSubs\\Transcription-Server\\transcription-server.exe"

    -- Use the C system function to execute shell commands
    ffi.cdef [[ int __cdecl system(const char *command); ]]

    ffi.cdef [[
        void Sleep(unsigned int ms);
    ]]

    -- Windows commands to open and close apps using PowerShell
    command_open = 'start "" "' .. mainApp .. '"'
    command_close = 'powershell -Command "Get-Process AutoSubs | Stop-Process -Force"'
    command_kill_server = 'powershell -Command "Get-Process transcription-server | Stop-Process -Force"'

elseif os_name == "OSX" then
    storagePath = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/AutoSubs/"
    mainApp = '/Library/Application\\ Support/Blackmagic\\ Design/DaVinci\\ Resolve/Fusion/AutoSubs/AutoSubs.app'
    transcriptionServer =
        '/Library/Application\\ Support/Blackmagic\\ Design/DaVinci\\ Resolve/Fusion/AutoSubs/Transcription-Server/transcription-server'

    -- Use the C system function to execute shell commands on macOS
    ffi.cdef [[ int system(const char *command); ]]

    -- MacOS commands to open and close
    command_open = 'open ' .. mainApp
    command_close = "pkill -f " .. mainApp
    command_kill_server = "pkill -f " .. transcriptionServer
else
    print("Unsupported OS")
    return
end

-- Load common DaVinci Resolve API utilities
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local mediaPool = project:GetMediaPool()

function CreateResponse(body)
    local header = "HTTP/1.1 200 OK\r\n" .. "Server: ljsocket/0.1\r\n" .. "Content-Type: application/json\r\n" ..
                       "Content-Length: " .. #body .. "\r\n" .. "Connection: close\r\n" .. "\r\n"

    local response = header .. body
    return response
end

-- UTILS

function lstrip(str)
    return string.gsub(str, "^%s+", "")
end

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

-- DaVinci Resolve API functions

-- input of time in seconds
function JumpToTime(time, markIn)
    local timeline = project:GetCurrentTimeline()
    local frameRate = timeline:GetSetting("timelineFrameRate")
    local frames = SecondsToFrames(time, frameRate) + markIn
    local timecode = FramesToTimecode(frames, frameRate)
    timeline:SetCurrentTimecode(timecode)
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
        if clip:GetClipProperty()["Type"] == "Fusion Title" then
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
        mediaPool:ImportFolderFromFile(
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/AutoSubsV2/Subtitles.drb")
        local clipName = "Default Template"
        local newTemplate = {
            label = clipName,
            value = clipName
        }
        table.insert(templates, newTemplate)
        defaultTemplateExists = true
    end
    return templates
end

function GetTimelineInfo()
    local timeline = project:GetCurrentTimeline()
    local timelineInfo = {
        name = timeline:GetName(),
        timelineId = timeline:GetUniqueId()
    }
    print("Timeline Name: ", timelineInfo.timelineId)
    return timelineInfo
end

function GetTracks()
    local timeline = project:GetCurrentTimeline()
    local trackCount = timeline:GetTrackCount("video")
    local tracks = {}
    local createNewTrack = {
        value = "0",
        label = "Add to New Track"
    }
    table.insert(tracks, createNewTrack)
    for i = 1, trackCount do
        local track = {
            value = tostring(i),
            label = timeline:GetTrackName("video", i)
        }
        table.insert(tracks, track)
    end
    return tracks
end

function ExportAudio(outputDir)
    -- resolve:OpenPage("deliver")
    -- resolve:ImportRenderPreset(storagePath .. "render-audio-only.xml")
    project:LoadRenderPreset('render-audio-only')
    project:SetRenderSettings({
        TargetDir = outputDir
    })
    local pid = project:AddRenderJob()
    print("PID: ", pid)

    project:StartRendering(pid)

    local renderJobList = project:GetRenderJobList()
    local renderSettings = renderJobList[#renderJobList]

    local audioInfo = {
        timeline = project:GetCurrentTimeline():GetUniqueId(),
        path = renderSettings["TargetDir"] .. "/" .. renderSettings["OutputFilename"],
        markIn = renderSettings["MarkIn"],
        markOut = renderSettings["MarkOut"]
    }

    while project:IsRenderingInProgress() do
        print("Rendering...")
        sleep(0.5) -- Check every 500 milliseconds
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

-- Function to read a JSON file
local function read_json_file(file_path)
    local file = assert(io.open(file_path, "r")) -- Open file for reading
    local content = file:read("*a") -- Read the entire file content
    file:close() -- Close the file

    -- Parse the JSON content
    local data, pos, err = json.decode(content, 1, nil)

    if err then
        print("Error:", err)
        return nil
    end

    return data -- Return the decoded Lua table
end

-- Add subtitles to the timeline using the specified template
function AddSubtitles(filePath, trackIndex, templateName)
    local timeline = project:GetCurrentTimeline()

    if trackIndex == "0" or trackIndex == "" then
        trackIndex = timeline:GetTrackCount("video") + 1
    else
        trackIndex = tonumber(trackIndex)
    end

    local data = read_json_file(filePath)
    if data == nil then
        print("Error reading JSON file")
        return false
    end

    local subtitles = data["segments"]

    print("Adding subtitles to timeline")
    resolve:OpenPage("edit")
    local timeline = project:GetCurrentTimeline()
    local timeline_start_frame = data["mark_in"]
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
    local subtitlesCount = #subtitles

    for i, subtitle in ipairs(subtitles) do
        -- print("Adding subtitle: ", subtitle["text"])
        local start_frame = SecondsToFrames(subtitle["start"], frame_rate)
        local end_frame = SecondsToFrames(subtitle["end"], frame_rate)

        local duration = end_frame - start_frame
        local newClip = {}

        newClip["mediaPoolItem"] = text_clip
        newClip["mediaType"] = 1
        newClip["startFrame"] = 0
        newClip["endFrame"] = duration
        newClip["recordFrame"] = start_frame + timeline_start_frame
        newClip["trackIndex"] = trackIndex

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

            local timelineItem = mediaPool:AppendToTimeline({newClip})[1]

            subtitle = subtitles[i]

            -- Skip if text is not compatible
            if timelineItem:GetFusionCompCount() > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local text_plus_tools = comp:GetToolList(false, "TextPlus")
                text_plus_tools[1]:SetInput("StyledText", lstrip(subtitle["text"]))

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
            print("Error adding subtitle:", err)
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
assert(server:bind(info))
assert(server:listen())

-- Start AutoSubs Main App
local result_open = ffi.C.system(command_open)
if result_open == 0 then
    print("Success: AutoSubs app opened.")
else
    print("Error: Failed to open AutoSubs app.")
    return
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
                local body = json.encode({
                    message = "Job failed"
                })
                if data == nil then
                    -- set_cors_headers(client)
                    print("Invalid JSON data")
                elseif data.func == "GetTimelineInfo" then
                    print("[AutoSubs Server] Retrieving Timeline Info...")
                    local timelineInfo = GetTimelineInfo()
                    body = json.encode(timelineInfo)
                elseif data.func == "GetTemplates" then
                    print("[AutoSubs Server] Retrieving Text+ Templates...")
                    local templateList = GetTemplates()
                    dump(templateList)
                    body = json.encode(templateList)
                elseif data.func == "GetTracks" then
                    print("[AutoSubs Server] Retrieving Timeline Tracks...")
                    local trackList = GetTracks()
                    dump(trackList)
                    body = json.encode(trackList)
                elseif data.func == "JumpToTime" then
                    print("[AutoSubs Server] Jumping to time...")
                    JumpToTime(data.start, data.markIn)
                    body = json.encode({
                        message = "Jumped to time"
                    })
                elseif data.func == "ExportAudio" then
                    print("[AutoSubs Server] Exporting audio...")
                    local audioInfo = ExportAudio(data.outputDir)
                    body = json.encode(audioInfo)
                elseif data.func == "AddSubtitles" then
                    print("[AutoSubs Server] Adding subtitles to timeline...")
                    AddSubtitles(data.filePath, data.trackIndex, data.templateName)
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
                -- Send HTTP response content
                local response = CreateResponse(body)
                -- Set CORS headers
                -- set_cors_headers(client)
                -- print("Sending response:", response)
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
