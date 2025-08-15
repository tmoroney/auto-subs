---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
local ffi = ffi
local resolve = resolve

local DEV_MODE = false

-- Server Port
local PORT = 56002

-- Load external libraries
local socket = nil
local json = nil
local luaresolve = nil

-- OS SPECIFIC CONFIGURATION
local assets_path
local resources_path
local main_app
local command_open

-- Load Resolve objects
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local mediaPool = project:GetMediaPool()

-- Global state for export operations
local currentExportJob = {
    active = false,
    pid = nil,
    progress = 0,
    cancelled = false,
    startTime = nil,
    audioInfo = {
        path = "",
        markIn = 0,  -- mark in (frames) - may display in UI as timecode
        markOut = 0, -- mark out (frames) - may display in UI as timecode
        offset = 0   -- offset on timeline in seconds (regardless of timeline start)
    },
    trackStates = nil
}

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

local function join_path(dir, filename)
    local sep = package.config:sub(1, 1) -- returns '\\' on Windows, '/' elsewhere
    -- Remove trailing separator from dir, if any
    if dir:sub(-1) == sep then
        return dir .. filename
    else
        return dir .. sep .. filename
    end
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

-- Convert seconds to frames based on the timeline frame rate
function to_frames(seconds, frameRate)
    return seconds * frameRate
end

-- Pause execution for a specified number of seconds (platform-independent)
function sleep(n)
    if ffi.os == "Windows" then
        -- Windows
        ffi.C.Sleep(n * 1000)
    else
        -- Unix-based (Linux, macOS)
        os.execute("sleep " .. tonumber(n))
    end
end

function CreateResponse(body)
    local header = "HTTP/1.1 200 OK\r\n" .. "Server: ljsocket/0.1\r\n" .. "Content-Type: application/json\r\n" ..
        "Content-Length: " .. #body .. "\r\n" .. "Connection: close\r\n" .. "\r\n"

    local response = header .. body
    return response
end

-- input of time in seconds
function JumpToTime(seconds)
    local timeline = project:GetCurrentTimeline()
    local frameRate = timeline:GetSetting("timelineFrameRate")
    local frames = to_frames(seconds, frameRate) + timeline:GetStartFrame() + 1
    local timecode = luaresolve:timecode_from_frame_auto(frames, frameRate)
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
-- Build quick lookup set for titleStrings for O(1) membership checks
local titleSet = {}
for _, t in ipairs(titleStrings) do
    titleSet[t] = true
end

local function isMatchingTitle(title)
    return titleSet[title] == true
end

local function walk_media_pool(folder, onClip)
    -- Recurse into subfolders first
    for _, subfolder in ipairs(folder:GetSubFolderList()) do
        local stop = walk_media_pool(subfolder, onClip)
        if stop then return true end
    end

    -- Visit all clips in this folder
    for _, clip in ipairs(folder:GetClipList()) do
        local stop = onClip(clip)
        if stop then return true end
    end
end

-- Get a list of all Text+ templates in the media pool
function GetTemplates()
    local rootFolder = mediaPool:GetRootFolder()
    local t = {}
    local hasDefault = false

    walk_media_pool(rootFolder, function(clip)
        local clipType = clip:GetClipProperty()["Type"]
        if isMatchingTitle(clipType) then
            local clipName = clip:GetClipProperty()["Clip Name"]
            table.insert(t, { label = clipName, value = clipName })
            if clipName == "Default Template" then
                hasDefault = true
            end
        end
    end)

    -- Add default template to mediapool if not available
    if not hasDefault and tonumber(resolve:GetVersion()[1]) >= 19 then
        print("Default template not found. Importing default template...")
        local ok = pcall(function()
            mediaPool:ImportFolderFromFile(join_path(assets_path, "subtitle-template.drb"))
            -- Append the default template to the list
            table.insert(t, { label = "Default Template", value = "Default Template" })
        end)
    end

    return t
end

-- Find the template item with the specified name using media pool traversal
function GetTemplateItem(folder, templateName)
    local found = nil
    walk_media_pool(folder, function(clip)
        if clip:GetClipProperty()["Clip Name"] == templateName then
            found = clip
            return true -- early stop traversal
        end
    end)
    return found
end

function GetTimelineInfo()
    -- Get project and media pool
    project = projectManager:GetCurrentProject()
    mediaPool = project:GetMediaPool()

    -- Get timeline info
    local timelineInfo = {}
    local success, err = pcall(function()
        local timeline = project:GetCurrentTimeline()
        timelineInfo = {
            name = timeline:GetName(),
            timelineId = timeline:GetUniqueId(),
            timelineStart = timeline:GetStartFrame() / timeline:GetSetting("timelineFrameRate")
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

function ResetTracks()
    resolve:OpenPage("edit")
    local timeline = project:GetCurrentTimeline()
    local audioTracks = timeline:GetTrackCount("audio")
    for i = 1, audioTracks do
        timeline:SetTrackEnable("audio", i, currentExportJob.trackStates[i])
    end
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

-- Get the current export progress
function GetExportProgress()
    if not currentExportJob.active then
        return {
            active = false,
            progress = 0,
            message = "No export in progress"
        }
    end

    if currentExportJob.cancelled then
        return {
            active = false,
            progress = currentExportJob.progress,
            cancelled = true,
            message = "Export was cancelled"
        }
    end

    -- Check if render is still in progress
    if currentExportJob.pid then
        local renderInProgress = false
        local success, result = pcall(function()
            return project:IsRenderingInProgress()
        end)

        if success then
            renderInProgress = result
        end

        if renderInProgress then
            -- Progress check using playhead position compared to 'mark in' and 'mark out' points (better than job status)
            local timeline = project:GetCurrentTimeline()
            local currentTimecode = timeline:GetCurrentTimecode()
            local frameRate = timeline:GetSetting("timelineFrameRate")

            -- Playhead position in frames
            local playheadPosition = luaresolve:frame_from_timecode(currentTimecode, frameRate)

            -- Get mark in and out from audioInfo (already in frames)
            local markIn = currentExportJob.audioInfo.markIn
            local markOut = currentExportJob.audioInfo.markOut

            -- Calculate progress percentage
            currentExportJob.progress = math.floor(((playheadPosition - markIn) / (markOut - markIn)) * 100 + 0.5)

            return {
                active = true,
                progress = currentExportJob.progress,
                message = "Export in progress...",
                pid = currentExportJob.pid
            }
        else
            -- Export completed - check if it was cancelled or completed normally
            currentExportJob.active = false

            -- Reset track states and open edit page
            ResetTracks()

            if currentExportJob.cancelled then
                return {
                    active = false,
                    progress = currentExportJob.progress,
                    cancelled = true,
                    message = "Export was cancelled"
                }
            else
                -- Normal completion
                currentExportJob.progress = 100
                return {
                    active = false,
                    progress = 100,
                    completed = true,
                    message = "Export completed successfully",
                    audioInfo = currentExportJob.audioInfo
                }
            end
        end
    else
        -- No PID available - something went wrong
        currentExportJob.active = false
        return {
            active = false,
            progress = 0,
            error = true,
            message = "Export job lost - no process ID available"
        }
    end
end

-- Cancel the current export operation
function CancelExport()
    if not currentExportJob.active then
        return {
            success = false,
            message = "No export in progress to cancel"
        }
    end

    if currentExportJob.pid then
        local success, err = pcall(function()
            project:StopRendering()
        end)

        -- reset tracks to original state and return to edit page
        ResetTracks()

        if success then
            currentExportJob.cancelled = true
            currentExportJob.active = false
            return {
                success = true,
                message = "Export cancelled successfully"
            }
        else
            return {
                success = false,
                message = "Failed to cancel export: " .. (err or "unknown error")
            }
        end
    else
        return {
            success = false,
            message = "No render job to cancel"
        }
    end
end

-- Export audio from selected tracks
-- inputTracks is a table of track indices to export
function ExportAudio(outputDir, inputTracks)
    -- Check if another export is already in progress
    if project:IsRenderingInProgress() then
        return {
            error = true,
            message = "Another export is already in progress"
        }
    end

    -- Initialize export job state
    currentExportJob = {
        active = true,
        pid = nil,
        progress = 0,
        cancelled = false,
        startTime = os.time(),
        audioInfo = nil
    }

    local audioInfo = {
        timeline = ""
    }

    local trackStates = {}
    local timeline;
    local audioTracks;
    -- mute all tracks except the selected one
    timeline = project:GetCurrentTimeline()
    audioTracks = timeline:GetTrackCount("audio")

    -- Save track states
    for i = 1, audioTracks do
        local state = timeline:GetIsTrackEnabled("audio", i)
        trackStates[i] = state
    end

    -- Build a set of selected track indices for O(1) membership checks
    local selected = {}
    for _, v in ipairs(inputTracks) do
        local n = tonumber(v)
        if n then selected[n] = true end
    end

    -- Enable only the tracks that are present in the selection set
    for i = 1, audioTracks do
        local isEnabled = selected[i] == true
        timeline:SetTrackEnable("audio", i, isEnabled)
    end

    -- save track states for later use
    currentExportJob.trackStates = trackStates

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

    local success, err = pcall(function()
        local pid = project:AddRenderJob()
        currentExportJob.pid = pid
        project:StartRendering(pid)

        local renderJobList = project:GetRenderJobList()
        local renderSettings = renderJobList[#renderJobList]

        audioInfo = {
            path = join_path(renderSettings["TargetDir"], renderSettings["OutputFilename"]),
            markIn = renderSettings["MarkIn"],
            markOut = renderSettings["MarkOut"],
            offset = (renderSettings["MarkIn"] - timeline:GetStartFrame()) / timeline:GetSetting("timelineFrameRate")
        }
        dump(audioInfo)
        currentExportJob.audioInfo = audioInfo

        print("Export started with PID: " .. pid)
    end)

    -- Handle export start result
    if not success then
        currentExportJob.active = false
        return {
            error = true,
            message = "Failed to start export: " .. (err or "unknown error")
        }
    else
        -- Export started successfully - return immediately
        return {
            started = true,
            message = "Export started successfully. Use GetExportProgress to monitor progress.",
            pid = currentExportJob.pid
        }
    end
end

function SanitizeTrackIndex(timeline, trackIndex, markIn, markOut)
    if trackIndex == "0" or trackIndex == "" or trackIndex == nil or tonumber(trackIndex) > timeline:GetTrackCount("video") or CheckTrackEmpty(trackIndex, markIn, markOut) then
        trackIndex = timeline:GetTrackCount("video") + 1
        timeline:AddTrack("video")
    end

    return tonumber(trackIndex)
end

function SetCustomColors(speaker, tool)
    local color = nil
    -- Set custom colors for each speaker if enabled
    if speaker.fill.enabled and speaker.fill.color ~= "" then
        color = hexToRgb(speaker.fill.color)
        if color ~= nil then
            tool:SetInput("Enabled1", 1)
            tool:SetInput("Red1", color.r)
            tool:SetInput("Green1", color.g)
            tool:SetInput("Blue1", color.b)
        end
    end

    if speaker.outline.enabled and speaker.outline.color ~= "" then
        color = hexToRgb(speaker.outline.color)
        if color ~= nil then
            tool:SetInput("Enabled2", 1)
            tool:SetInput("Red2", color.r)
            tool:SetInput("Green2", color.g)
            tool:SetInput("Blue2", color.b)
        end
    end

    if speaker.border.enabled and speaker.border.color ~= "" then
        color = hexToRgb(speaker.border.color)
        if color ~= nil then
            tool:SetInput("Enabled4", 1)
            tool:SetInput("Red4", color.r)
            tool:SetInput("Green4", color.g)
            tool:SetInput("Blue4", color.b)
        end
    end
end

-- Add subtitles to the timeline using the specified template
function AddSubtitles(filePath, trackIndex, templateName)
    resolve:OpenPage("edit")

    local data = read_json_file(filePath)
    if type(data) ~= "table" then
        print("Error reading JSON file")
        return false
    end

    ---@type { mark_in: integer, mark_out: integer, segments: table, speakers: table }
    data = data

    local timeline = project:GetCurrentTimeline()
    local timelineStart = timeline:GetStartFrame()
    local timelineEnd = timeline:GetEndFrame()

    local markIn = data["mark_in"]
    local markOut = data["mark_out"]
    local subtitles = data["segments"]
    local speakers = data["speakers"]

    local speakersExist = false
    if speakers and #speakers > 0 then
        speakersExist = true
    end

    if not markIn or not markOut then
        local success, err = pcall(function()
            local markInOut = timeline:GetMarkInOut()
            markIn = (markInOut.audio["in"] and markInOut.audio["in"] + timelineStart) or timelineStart
            markOut = (markInOut.audio["out"] and markInOut.audio["out"] + timelineStart) or timelineEnd
        end)

        if not success then
            markIn = timelineStart
            markOut = timelineEnd
        end
    end

    trackIndex = SanitizeTrackIndex(timeline, trackIndex, markIn, markOut)

    -- Sanitize speaker tracks
    if speakersExist then
        for i, speaker in ipairs(speakers) do
            if speaker.track == nil or speaker.track == "" then
                speaker.track = trackIndex
            else
                speaker.track = SanitizeTrackIndex(timeline, speaker.track, markIn, markOut)
            end
        end
    end

    local rootFolder = mediaPool:GetRootFolder()

    if templateName == "" then
        local availableTemplates = GetTemplates()
        if #availableTemplates > 0 then
            templateName = availableTemplates[1].value
        end
    end

    -- Get template and frame rate (with safety guards)
    local templateItem = nil
    if templateName ~= nil and templateName ~= "" then
        templateItem = GetTemplateItem(rootFolder, templateName)
    end
    if not templateItem then
        -- Fallback to Default Template if not found
        templateItem = GetTemplateItem(rootFolder, "Default Template")
    end
    if not templateItem then
        print("Error: Could not find subtitle template '" .. tostring(templateName) .. "' in media pool.")
        return false
    end
    local template_frame_rate = templateItem:GetClipProperty()["FPS"]

    -- Get Timeline Frame rate
    local frame_rate = timeline:GetSetting("timelineFrameRate")

    -- If within 1 second, join the subtitles
    local joinThreshold = frame_rate
    local clipList = {}
    for i, subtitle in ipairs(subtitles) do
        -- print("Adding subtitle: ", subtitle["text"])
        local start_frame = to_frames(subtitle["start"], frame_rate)
        local end_frame = to_frames(subtitle["end"], frame_rate)
        local timeline_pos = timelineStart + start_frame
        local clip_timeline_duration = end_frame - start_frame

        if i < #subtitles then
            local next_start = timelineStart + to_frames(subtitles[i + 1]["start"], frame_rate)
            local frames_between = next_start - (timeline_pos + clip_timeline_duration)
            -- if gap between clips is less than threshold, join them
            if frames_between < joinThreshold then
                clip_timeline_duration = clip_timeline_duration + frames_between + 1
            end
        end

        -- Resolve uses frame rate of clip for startFrame and endFrame, so we need to convert clip_timeline_duration to template frame rate
        local duration = (clip_timeline_duration / frame_rate) * template_frame_rate

        -- If speakers exists then check for custom track
        local itemTrack = trackIndex
        if speakersExist then
            local speaker = speakers[tonumber(subtitle["speaker_id"]) + 1]
            if speaker.track ~= nil and speaker.track ~= "" then
                itemTrack = speaker.track
            end
        end

        local newClip = {
            mediaPoolItem = templateItem, -- source MediaPoolItem to add to timeline
            mediaType = 1,                -- media type 1 is video
            startFrame = 0,               -- start frame means within the clip
            endFrame = duration,          -- end frame means within the clip
            recordFrame = timeline_pos,   -- record frame means where in the timeline the clip should be placed
            trackIndex = itemTrack        -- track the clip should be placed on
        }

        table.insert(clipList, newClip)
    end

    -- Note: Seems to be faster to add all clips at once then add one by one (which arguably looks cooler)
    local timelineItems = mediaPool:AppendToTimeline(clipList)

    -- Append all clips to the timeline
    for i, timelineItem in ipairs(timelineItems) do
        local success, err = pcall(function()
            local subtitle = subtitles[i]
            local subtitleText = subtitle["text"]

            -- Skip if text is not TextPlus (TODO: Add support for other types of text if possible)
            if timelineItem:GetFusionCompCount() > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local tool = comp:FindToolByID("TextPlus")
                tool:SetInput("StyledText", subtitleText)

                -- Set text colors if available
                if speakersExist then
                    local speaker_id = subtitle["speaker_id"]
                    if speaker_id ~= "?" then
                        local speaker = speakers[tonumber(speaker_id) + 1]
                        SetCustomColors(speaker, tool)
                    end
                end

                -- Set the clip color to symbolize that the subtitle was added
                timelineItem:SetClipColor("Green")
            end
        end)

        if not success then
            print("Failed to add subtitle to timeline: " .. err)
        end
    end

    -- Update timeline by moving playhead position
    timeline:SetCurrentTimecode(timeline:GetCurrentTimecode())
end

function ExtractFrame(comp, exportDir, templateFrameRate)
    -- Lock the composition to prevent redraws and pop-ups during scripting [15, 16]
    comp:Lock()

    -- Access the Saver tool by its name (assuming it exists in the comp)
    local mySaver = comp:AddTool("Saver")

    local outputPath = ""

    if mySaver ~= nil then
        -- Set the output filename for the Saver tool [6, 7]
        -- Make sure to provide a full path and desired image format extension
        local name = mySaver.Name
        local settings = mySaver:SaveSettings()
        settings.Tools[name].Inputs.Clip.Value["Filename"] = join_path(exportDir, "subtitle-preview-0.png")
        settings.Tools[name].Inputs.Clip.Value["FormatID"] = "PNGFormat"
        settings.Tools[name].Inputs["OutputFormat"]["Value"] = "PNGFormat"
        mySaver:LoadSettings(settings)

        -- Set the input for the Saver tool to the MediaOut tool
        local mediaOut = comp:FindToolByID("MediaOut")
        mySaver:SetInput("Input", mediaOut)

        -- Define the frame number you want to extract
        local frameToExtract = math.floor(comp:GetAttrs().COMPN_GlobalEnd / 2)

        -- Trigger the render for only the specified frame through the Saver tool [1, 13, 14]
        local success = comp:Render({
            Start = frameToExtract, -- Start rendering at this frame
            End = frameToExtract,   -- End rendering at this frame
            Tool = mySaver,         -- Render up to this specific Saver tool [13]
            Wait = true             -- Wait for the render to complete before continuing the script [19]
        })

        local outputFilename = "subtitle-preview-" .. frameToExtract .. ".png"
        outputPath = join_path(exportDir, outputFilename)

        if success then
            print("Frame " .. frameToExtract .. " successfully saved by " .. mySaver.Name .. " to " .. outputPath)
        else
            print("Failed to save frame " .. frameToExtract)
        end
    else
        print("Saver tool 'MySaver' not found in the composition.")
    end

    -- Unlock the composition after changes are complete [15, 20]
    comp:Unlock()

    return outputPath
end

-- place example subtitle on timeline with theme and export frame
function GeneratePreview(speaker, templateName, exportDir)
    local timeline = project:GetCurrentTimeline()
    local rootFolder = mediaPool:GetRootFolder()

    -- Choose a template if none provided
    if templateName == "" then
        local availableTemplates = GetTemplates()
        if #availableTemplates > 0 then
            templateName = availableTemplates[1].value
        end
    end

    -- Resolve the template item with fallbacks
    local templateItem = nil
    if templateName ~= nil and templateName ~= "" then
        templateItem = GetTemplateItem(rootFolder, templateName)
    end
    if not templateItem then
        templateItem = GetTemplateItem(rootFolder, "Default Template")
    end
    if not templateItem then
        print("Error: Could not find subtitle template '" .. tostring(templateName) .. "' in media pool.")
        return ""
    end

    local templateFrameRate = templateItem:GetClipProperty()["FPS"]

    -- Only add a track after we have a valid template
    timeline:AddTrack("video")
    local trackIndex = timeline:GetTrackCount("video")

    local newClip = {
        mediaPoolItem = templateItem,     -- source MediaPoolItem to add to timeline
        startFrame = 0,                   -- start frame means within the clip
        endFrame = templateFrameRate * 2, -- end frame means within the clip
        recordFrame = 0,                  -- record frame means where in the timeline the clip should be placed
        trackIndex = trackIndex           -- track the clip should be placed on
    }
    local timelineItems = mediaPool:AppendToTimeline({ newClip })
    local timelineItem = timelineItems[1]

    local outputPath = nil
    local success, err = pcall(function()
        -- Set timeline position to middle of clip
        if timelineItem:GetFusionCompCount() > 0 then
            local comp = timelineItem:GetFusionCompByIndex(1)
            local tool = comp:FindToolByID("TextPlus")
            tool:SetInput("StyledText", "Example Subtitle Text")
            SetCustomColors(speaker, tool)

            outputPath = ExtractFrame(comp, exportDir, templateFrameRate)
        end
    end)
    if not success then
        print("Failed to set timeline position: " .. err)
    end
    timeline:DeleteClips(timelineItems)
    timeline:DeleteTrack("video", trackIndex)

    return outputPath
end

local function set_cors_headers(client)
    client:send("HTTP/1.1 200 OK\r\n")
    client:send("Access-Control-Allow-Origin: *\r\n")
    client:send("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
    client:send("Access-Control-Allow-Headers: Content-Type\r\n")
    client:send("\r\n")
end

function LaunchApp()
    if ffi.os == "Windows" then
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
        -- MacOS & Linux
        local result_open = ffi.C.system(command_open)

        if result_open == 0 then
            print("AutoSubs launched successfully.")
        else
            print("Failed to launch AutoSubs. Error code:", result_open)
            return
        end
    end
end

-- Send a small HTTP POST to 127.0.0.1:PORT with {"func":"Exit"}
local function send_exit_via_socket()
    local ok = pcall(function()
        local info = assert(socket.find_first_address("127.0.0.1", PORT))
        local client = assert(socket.create(info.family, info.socket_type, info.protocol))
        assert(client:set_option("nodelay", true, "tcp"))
        client:set_blocking(true)

        assert(client:connect(info))

        local body = "{\"func\":\"Exit\"}"
        local req = string.format(
            "POST / HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
            PORT, #body, body
        )

        assert(client:send(req))
        client:close()
    end)
    if not ok then
        print("Failed to send Exit via socket")
    end
end

function StartServer()
    -- Set up server socket configuration
    local info = assert(socket.find_first_address("127.0.0.1", PORT))
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
        send_exit_via_socket()
        sleep(0.5)
        assert(server:bind(info))
    end

    assert(server:listen())
    print("AutoSubs server is listening on port: ", PORT)

    -- Launch app if not in dev mode
    if not DEV_MODE then
        LaunchApp()
    end

    -- Server loop
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
                    -- Accumulate the full HTTP request (headers + body). Start with what we have.
                    local request = str
                    local header_body_separator = "\r\n\r\n"
                    -- Temporarily allow short blocking reads to finish the HTTP request, then return to non-blocking
                    if client.settimeout then client:settimeout(0.2) end
                    while true do
                        local sep_start, sep_end = string.find(request, header_body_separator, 1, true)
                        if sep_end then
                            local headers = string.sub(request, 1, sep_start - 1)
                            local body_start_idx = sep_end + 1
                            local cl = string.match(headers, "[Cc]ontent%-[Ll]ength:%s*(%d+)")
                            if cl then
                                local needed = tonumber(cl) or 0
                                local current = #request - (body_start_idx - 1)
                                if current >= needed then
                                    break
                                end
                            else
                                -- No Content-Length: assume no body or already complete
                                break
                            end
                        end
                        local chunk, rerr, partial = client:receive(1024)
                        if chunk and #chunk > 0 then
                            request = request .. chunk
                        elseif partial and #partial > 0 then
                            request = request .. partial
                        else
                            -- timeout or other read error; stop accumulating
                            break
                        end
                    end
                    if client.settimeout then client:settimeout(0) end

                    -- Extract body content after headers, if present
                    local _, sep_end = string.find(request, header_body_separator, 1, true)
                    local content = nil
                    if sep_end then
                        content = string.sub(request, sep_end + 1)
                    end
                    print("Received request:", content)

                    -- Minimal JSON helper to avoid crashes if `json` is unavailable
                    local function safe_json(obj)
                        if json and json.encode then
                            return json.encode(obj)
                        end
                        if obj and obj.message ~= nil then
                            local msg = tostring(obj.message):gsub('"', '\\"')
                            return '{"message":"' .. msg .. '"}'
                        end
                        return "{}"
                    end

                    -- Parse the JSON content safely (avoid crashes if body is missing/partial)
                    local data, pos, jerr = nil, nil, nil
                    if content and #content > 0 then
                        local ok, r1, r2, r3 = pcall(json.decode, content, 1, nil)
                        if ok then
                            data, pos, jerr = r1, r2, r3
                        else
                            jerr = r1
                        end
                    end

                    -- Initialize body for response
                    local body = nil

                    -- success already defined above
                    success, err = pcall(function()
                        if data ~= nil then
                            if data.func == "GetTimelineInfo" then
                                print("[AutoSubs Server] Retrieving Timeline Info...")
                                local timelineInfo = GetTimelineInfo()
                                body = json.encode(timelineInfo)
                            elseif data.func == "JumpToTime" then
                                print("[AutoSubs Server] Jumping to time...")
                                JumpToTime(data.seconds)
                                body = json.encode({
                                    message = "Jumped to time"
                                })
                            elseif data.func == "ExportAudio" then
                                print("[AutoSubs Server] Exporting audio...")
                                local audioInfo = ExportAudio(data.outputDir, data.inputTracks)
                                body = json.encode(audioInfo)
                            elseif data.func == "GetExportProgress" then
                                print("[AutoSubs Server] Getting export progress...")
                                local progressInfo = GetExportProgress()
                                body = json.encode(progressInfo)
                            elseif data.func == "CancelExport" then
                                print("[AutoSubs Server] Cancelling export...")
                                local cancelResult = CancelExport()
                                body = json.encode(cancelResult)
                            elseif data.func == "AddSubtitles" then
                                print("[AutoSubs Server] Adding subtitles to timeline...")
                                AddSubtitles(data.filePath, data.trackIndex, data.templateName)
                                body = json.encode({
                                    message = "Job completed"
                                })
                            elseif data.func == "GeneratePreview" then
                                print("[AutoSubs Server] Generating preview...")
                                local previewPath = GeneratePreview(data.speaker, data.templateName, data.exportPath)
                                body = json.encode(previewPath)
                            elseif data.func == "Exit" then
                                body = safe_json({ message = "Server shutting down" })
                                quitServer = true
                            else
                                print("Invalid function name")
                            end
                        else
                            -- Fallback: if JSON parse failed, detect Exit command by substring
                            -- Check both the parsed body `content` and the raw request `str`
                            local has_exit = false
                            if content and string.find(content, '"func"%s*:%s*"Exit"') then
                                has_exit = true
                            elseif str and string.find(str, '"func"%s*:%s*"Exit"') then
                                has_exit = true
                            end
                            if has_exit then
                                body = safe_json({ message = "Server shutting down" })
                                quitServer = true
                            else
                                body = safe_json({ message = "Invalid JSON data" })
                                print("Invalid JSON data")
                            end
                        end
                    end)

                    -- Ensure we always return a body to avoid response builder crashes
                    if body == nil then
                        body = safe_json({ message = "OK" })
                    end

                    if not success then
                        body = safe_json({
                            message = "Job failed with error: " .. tostring(err)
                        })
                        print("Error:", err)
                    end

                    -- Send HTTP response content (don't assert to avoid crashing on client disconnect)
                    local response = CreateResponse(body)
                    print(response)
                    local sent, sendErr = client:send(response)
                    if not sent then
                        print("Send failed:", sendErr or "unknown")
                    end

                    -- Close connection
                    client:close()
                elseif err == "closed" then
                    client:close()
                elseif err ~= "timeout" then
                    -- Don't crash the server on unexpected client receive errors
                    print("Socket recv error:", err or "unknown")
                    client:close()
                end
            end
        elseif err ~= "timeout" then
            -- Don't crash the server on unexpected accept errors
            print("Accept error:", err or "unknown")
        end
        sleep(0.1)
    end

    print("Shutting down AutoSubs Link server...")
    server:close()
    print("Server shut down.")
end

local AutoSubs = {
    Init = function(self, executable_path, resources_folder, dev_mode)
        DEV_MODE = dev_mode
        if ffi.os == "Windows" then
            -- Define Windows API functions using FFI to prevent terminal opening
            ffi.cdef [[
                void Sleep(unsigned int ms);
                int ShellExecuteA(void* hwnd, const char* lpOperation, const char* lpFile, const char* lpParameters, const char* lpDirectory, int nShowCmd);
            ]]

            main_app = executable_path
            resources_path = resources_folder
            command_open = 'start "" "' .. main_app .. '"'
        else
            ffi.cdef [[ int system(const char *command); ]]

            if ffi.os == "OSX" then
                main_app = executable_path
                resources_path = resources_folder
                command_open = 'open ' .. main_app
            else -- Linux
                main_app = executable_path
                resources_path = resources_folder
                command_open = string.format("'%s' &", main_app)
            end
        end

        -- Set package path for module loading and import required modules
        local modules_path = join_path(resources_folder, "modules")
        package.path = package.path .. ";" .. join_path(modules_path, "?.lua")
        socket = require("ljsocket")
        json = require("dkjson")
        luaresolve = require("libavutil")

        assets_path = join_path(resources_path, "AutoSubs")
        StartServer()
    end
}

return AutoSubs
