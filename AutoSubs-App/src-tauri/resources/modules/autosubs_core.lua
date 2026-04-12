---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
local ffi = ffi
local resolve = Resolve()

local DEV_MODE = false

-- Server Port
local PORT = 56002

-- Windows FFI bindings for wide-character file operations to handle special characters in paths
if ffi.os == "Windows" then
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

-- Function to read the content of a file using _wfopen on Windows for special character support
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
        local file = assert(io.open(file_path, "r"))
        local content = file:read("*a")
        file:close()
        return content
    end
end

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

local ANIMATED_CAPTION = "AutoSubs Caption"

local STYLE_INDEX = {
	Fill = 1,
	Outline = 2, 
	Shadow = 3,
	Background = 4
}

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

-- UTF-8 aware character count
local function utf8len(s)
	local _, count = s:gsub("[^\128-\191]", "")
	return count
end

-- Function to read a JSON file
local function read_json_file(file_path)
    local content = read_file(file_path)

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
local function hex_to_rgb(hex)
    local r, g, b = hex:match("^#?(%x%x)(%x%x)(%x%x)$")
    if r then
        return {
            Red = tonumber(r, 16) / 255,
            Green = tonumber(g, 16) / 255,
            Blue = tonumber(b, 16) / 255
        }
    else
        return nil
    end
end

-- Convert seconds to frames based on the timeline frame rate
local function to_frames(seconds, frameRate)
    return seconds * frameRate
end

-- Pause execution for a specified number of seconds (platform-independent)
local function sleep(n)
    if ffi.os == "Windows" then
        ffi.C.Sleep(n * 1000)
    else
        local ts = ffi.new("struct timespec")
        ts.tv_sec = math.floor(n)
        ts.tv_nsec = (n - math.floor(n)) * 1e9
        ffi.C.nanosleep(ts, nil)
    end
end

local function create_response(body)
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

local function is_matching_title(title)
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

local get_templates
local get_template_item
local get_video_tracks
local get_audio_tracks

-- Get a list of all Text+ templates in the media pool
get_templates = function()
    local rootFolder = mediaPool:GetRootFolder()
    local t = {}
    local hasDefault = false

    walk_media_pool(rootFolder, function(clip)
        local props = clip:GetClipProperty()
        local clipType = props["Type"]
        if is_matching_title(clipType) then
            local clipName = props["Clip Name"]
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
get_template_item = function(folder, templateName)
    local found = nil
    walk_media_pool(folder, function(clip)
        local props = clip:GetClipProperty()
        if props["Clip Name"] == templateName then
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
        timelineInfo["outputTracks"] = get_video_tracks()
        timelineInfo["inputTracks"] = get_audio_tracks()
        timelineInfo["templates"] = get_templates()
    end
    return timelineInfo
end

-- Get a list of possible output tracks for subtitles
get_video_tracks = function()
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

get_audio_tracks = function()
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

local function reset_tracks()
    resolve:OpenPage("edit")
    local timeline = project:GetCurrentTimeline()
    local audioTracks = timeline:GetTrackCount("audio")
    for i = 1, audioTracks do
        timeline:SetTrackEnable("audio", i, currentExportJob.trackStates[i])
    end
    currentExportJob.clipBoundaries = nil
end

local function check_track_empty(trackIndex, markIn, markOut)
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
            reset_tracks()

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
        reset_tracks()

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

-- Helper function to find clip boundaries on selected audio tracks
local function get_clip_boundaries(timeline, selectedTracks)
    local earliestStart = nil
    local latestEnd = nil
    
    for trackIndex, _ in pairs(selectedTracks) do
        local clips = timeline:GetItemListInTrack("audio", trackIndex)
        if clips then
            for _, clip in ipairs(clips) do
                local clipStart = clip:GetStart()
                local clipEnd = clip:GetEnd()
                
                if earliestStart == nil or clipStart < earliestStart then
                    earliestStart = clipStart
                end
                if latestEnd == nil or clipEnd > latestEnd then
                    latestEnd = clipEnd
                end
            end
        end
    end
    
    return earliestStart, latestEnd
end

-- Helper function to get individual clips with their boundaries (for segment-based transcription)
-- Returns a sorted array of clip segments: { { start, end, name }, ... }
local function get_individual_clips(timeline, selectedTracks)
    local allClips = {}
    local timelineStart = timeline:GetStartFrame()
    local frameRate = timeline:GetSetting("timelineFrameRate")
    
    for trackIndex, _ in pairs(selectedTracks) do
        local clips = timeline:GetItemListInTrack("audio", trackIndex)
        if clips then
            for _, clip in ipairs(clips) do
                local clipStart = clip:GetStart()
                local clipEnd = clip:GetEnd()
                local clipName = clip:GetName() or "Unnamed"
                
                table.insert(allClips, {
                    startFrame = clipStart,
                    endFrame = clipEnd,
                    -- Convert to seconds relative to timeline start
                    start = (clipStart - timelineStart) / frameRate,
                    ["end"] = (clipEnd - timelineStart) / frameRate,
                    name = clipName
                })
            end
        end
    end
    
    -- Sort by start time
    table.sort(allClips, function(a, b) return a.startFrame < b.startFrame end)
    
    -- Merge overlapping clips (in case clips from different tracks overlap)
    local mergedClips = {}
    for _, clip in ipairs(allClips) do
        if #mergedClips == 0 then
            table.insert(mergedClips, clip)
        else
            local lastClip = mergedClips[#mergedClips]
            -- If this clip overlaps or is adjacent to the last one, merge them
            if clip.startFrame <= lastClip.endFrame then
                lastClip.endFrame = math.max(lastClip.endFrame, clip.endFrame)
                lastClip["end"] = math.max(lastClip["end"], clip["end"])
                lastClip.name = lastClip.name .. " + " .. clip.name
            else
                table.insert(mergedClips, clip)
            end
        end
    end
    
    return mergedClips
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

    -- Find clip boundaries on selected tracks to only export the relevant portion
    local clipStart, clipEnd = get_clip_boundaries(timeline, selected)

    -- Get individual clips for segment-based transcription
    local individualClips = get_individual_clips(timeline, selected)
    currentExportJob.individualClips = individualClips
    print("[AutoSubs] Found " .. #individualClips .. " individual clip(s) for transcription")

    if clipStart and clipEnd then
        print("[AutoSubs] Found clip boundaries: " .. clipStart .. " - " .. clipEnd)
        currentExportJob.clipBoundaries = { start = clipStart, ["end"] = clipEnd }
    else
        print("[AutoSubs] No clips found on selected tracks, using full timeline")
    end

    resolve:OpenPage("deliver")

    project:LoadRenderPreset('Audio Only')

    -- Build render settings
    local renderSettings = {
        TargetDir = outputDir,
        CustomName = "autosubs-exported-audio",
        RenderMode = "Single clip",
        IsExportVideo = false,
        IsExportAudio = true,
        AudioBitDepth = 24,
        AudioSampleRate = 44100
    }

    -- If we found clip boundaries, set the render range to only that portion
    if clipStart and clipEnd then
        renderSettings.MarkIn = clipStart
        renderSettings.MarkOut = clipEnd
        print("[AutoSubs] Setting render range in settings: " .. clipStart .. " - " .. clipEnd)
    end

    project:SetRenderSettings(renderSettings)

    local success, err = pcall(function()
        local pid = project:AddRenderJob()
        currentExportJob.pid = pid
        project:StartRendering(pid)

        local renderJobList = project:GetRenderJobList()
        local renderSettings = renderJobList[#renderJobList]

        local baseOffset = (renderSettings["MarkIn"] - timeline:GetStartFrame()) / timeline:GetSetting("timelineFrameRate")

        -- Calculate relative offsets for each clip segment (relative to the exported audio start)
        local segments = {}
        for _, clip in ipairs(currentExportJob.individualClips or {}) do
            table.insert(segments, {
                start = clip.start - baseOffset,  -- Start time within the exported audio
                ["end"] = clip["end"] - baseOffset,  -- End time within the exported audio
                timelineStart = clip.start,  -- Absolute start on timeline (for subtitle placement)
                timelineEnd = clip["end"],
                name = clip.name
            })
        end

        audioInfo = {
            path = join_path(renderSettings["TargetDir"], renderSettings["OutputFilename"]),
            markIn = renderSettings["MarkIn"],
            markOut = renderSettings["MarkOut"],
            offset = baseOffset,
            segments = segments  -- Individual clip segments for segment-based transcription
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

local function sanitize_track_index(timeline, trackIndex, markIn, markOut)
    -- Only create a new track if trackIndex is explicitly "0" (new track), empty/nil, or invalid
    -- Respect user's track selection regardless of whether the track is empty
    if trackIndex == "0" or trackIndex == "" or trackIndex == nil or tonumber(trackIndex) > timeline:GetTrackCount("video") then
        trackIndex = timeline:GetTrackCount("video") + 1
        timeline:AddTrack("video")
    end

    return tonumber(trackIndex)
end

local function set_speaker_styling(speaker, tool, isAnimated)
    -- Return early if no custom color set for speaker
    if not speaker.color or speaker.color == "" then return end

    local styleId = STYLE_INDEX[speaker.style]

    -- Convert hex color to rgb
    local color = hex_to_rgb(speaker.color)
    if color == nil then return end

    -- Update color for that style e.g. Fill or Outline
    for key, value in ipairs(color) do
        if isAnimated then
            tool:SetInput(speaker.style .. "Color" .. key, value)
        else
            tool:SetInput(key .. styleId, value)
        end
    end

    -- Ensure the selected style is enabled
    if isAnimated then
        tool:SetInput(speaker.style .. "Enabled", 1)
    else
        tool:SetInput("Enabled" .. styleId, 1)
    end
end

-- Check for existing clips on a track that would conflict with new subtitles
-- Returns conflict info: { hasConflicts, conflictingClips: [{start, end, name}], trackName }
function CheckTrackConflicts(filePath, trackIndex)
    local timeline = project:GetCurrentTimeline()
    local timelineStart = timeline:GetStartFrame()
    local frame_rate = timeline:GetSetting("timelineFrameRate")

    -- Read the subtitle data to get time ranges
    local data = read_json_file(filePath)
    if type(data) ~= "table" then
        return { hasConflicts = false, error = "Could not read subtitle file" }
    end

    local subtitles = data["segments"]
    if not subtitles or #subtitles == 0 then
        return { hasConflicts = false, message = "No subtitles to add" }
    end

    -- Get the time range of new subtitles
    local firstSubStart = to_frames(subtitles[1]["start"], frame_rate) + timelineStart
    local lastSubEnd = to_frames(subtitles[#subtitles]["end"], frame_rate) + timelineStart

    -- Validate track index
    trackIndex = tonumber(trackIndex)
    if not trackIndex or trackIndex <= 0 or trackIndex > timeline:GetTrackCount("video") then
        return { hasConflicts = false, trackExists = false, message = "Track does not exist" }
    end

    -- Get track name
    local trackName = timeline:GetTrackName("video", trackIndex) or ("Video " .. trackIndex)

    -- Get existing clips on the track
    local existingClips = timeline:GetItemListInTrack("video", trackIndex)
    if not existingClips or #existingClips == 0 then
        return { hasConflicts = false, trackName = trackName, message = "Track is empty" }
    end

    -- Find clips that overlap with the new subtitle range
    local conflictingClips = {}
    for _, clip in ipairs(existingClips) do
        local clipStart = clip:GetStart()
        local clipEnd = clip:GetEnd()

        -- Check if clip overlaps with subtitle range
        if clipStart < lastSubEnd and clipEnd > firstSubStart then
            table.insert(conflictingClips, {
                start = (clipStart - timelineStart) / frame_rate,
                ["end"] = (clipEnd - timelineStart) / frame_rate,
                name = clip:GetName() or "Unnamed clip"
            })
        end
    end

    return {
        hasConflicts = #conflictingClips > 0,
        conflictingClips = conflictingClips,
        trackName = trackName,
        subtitleRange = {
            start = (firstSubStart - timelineStart) / frame_rate,
            ["end"] = (lastSubEnd - timelineStart) / frame_rate
        },
        totalConflicts = #conflictingClips
    }
end

local function load_subtitle_data(filePath)
    local data = read_json_file(filePath)
    if type(data) ~= "table" then
        print("Error reading JSON file")
        return nil
    end

    return data
end

local function get_mark_in_out(timeline, data)
    local timelineStart = timeline:GetStartFrame()
    local timelineEnd = timeline:GetEndFrame()
    local markIn = data["mark_in"]
    local markOut = data["mark_out"]

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

    return markIn, markOut
end

local function sanitize_speaker_tracks(timeline, speakers, trackIndex, markIn, markOut)
    if not speakers or #speakers == 0 then
        return speakers
    end

    for _, speaker in ipairs(speakers) do
        if speaker.track == nil or speaker.track == "" then
            speaker.track = trackIndex
        else
            speaker.track = sanitize_track_index(timeline, speaker.track, markIn, markOut)
        end
    end

    return speakers
end

local function get_template(rootFolder, templateName)
    if templateName == "" then
        local availableTemplates = get_templates()
        if #availableTemplates > 0 then
            templateName = availableTemplates[1].value
        end
    end

    local templateItem = nil
    if templateName ~= nil and templateName ~= "" then
        templateItem = get_template_item(rootFolder, templateName)
    end
    if not templateItem then
        templateItem = get_template_item(rootFolder, "Default Template")
    end
    if not templateItem then
        print("Error: Could not find subtitle template '" .. tostring(templateName) .. "' in media pool.")
        return nil
    end

    local template_frame_rate = templateItem:GetClipProperty()["FPS"]
    return templateItem, template_frame_rate
end

local function apply_conflict_mode(timeline, subtitles, trackIndex, conflictMode, frame_rate, timelineStart)
    if conflictMode == "new_track" then
        local existingClips = timeline:GetItemListInTrack("video", trackIndex)
        if existingClips and #existingClips > 0 then
            local firstSubStart = to_frames(subtitles[1]["start"], frame_rate) + timelineStart
            local lastSubEnd = to_frames(subtitles[#subtitles]["end"], frame_rate) + timelineStart
            local hasConflict = false
            for _, clip in ipairs(existingClips) do
                if clip:GetStart() < lastSubEnd and clip:GetEnd() > firstSubStart then
                    hasConflict = true
                    break
                end
            end
            if hasConflict then
                trackIndex = timeline:GetTrackCount("video") + 1
                timeline:AddTrack("video")
                print("[AutoSubs] Created new track: " .. trackIndex)
            else
                print("[AutoSubs] No conflicts on track " .. trackIndex .. ", using existing track")
            end
        else
            print("[AutoSubs] Track " .. trackIndex .. " is empty, using existing track")
        end
        return trackIndex, subtitles, nil
    end

    if conflictMode == "replace" then
        local existingClips = timeline:GetItemListInTrack("video", trackIndex)
        if existingClips and #existingClips > 0 then
            local firstSubStart = to_frames(subtitles[1]["start"], frame_rate) + timelineStart
            local lastSubEnd = to_frames(subtitles[#subtitles]["end"], frame_rate) + timelineStart

            local clipsToDelete = {}
            for _, clip in ipairs(existingClips) do
                local clipStart = clip:GetStart()
                local clipEnd = clip:GetEnd()
                if clipStart < lastSubEnd and clipEnd > firstSubStart then
                    table.insert(clipsToDelete, clip)
                end
            end

            for _, clip in ipairs(clipsToDelete) do
                timeline:DeleteClips({clip}, false)
            end
            print("[AutoSubs] Deleted " .. #clipsToDelete .. " conflicting clips")
        end

        return trackIndex, subtitles, nil
    end

    if conflictMode == "skip" then
        local existingClips = timeline:GetItemListInTrack("video", trackIndex)
        if existingClips and #existingClips > 0 then
            local filteredSubtitles = {}
            for _, subtitle in ipairs(subtitles) do
                local subStart = to_frames(subtitle["start"], frame_rate) + timelineStart
                local subEnd = to_frames(subtitle["end"], frame_rate) + timelineStart

                local hasConflict = false
                for _, clip in ipairs(existingClips) do
                    local clipStart = clip:GetStart()
                    local clipEnd = clip:GetEnd()
                    if subStart < clipEnd and subEnd > clipStart then
                        hasConflict = true
                        break
                    end
                end

                if not hasConflict then
                    table.insert(filteredSubtitles, subtitle)
                end
            end

            print("[AutoSubs] Skipped " .. (#subtitles - #filteredSubtitles) .. " conflicting subtitles")
            subtitles = filteredSubtitles

            if #subtitles == 0 then
                print("[AutoSubs] All subtitles skipped due to conflicts")
                return trackIndex, subtitles, { success = true, message = "All subtitles skipped due to existing content", added = 0 }
            end
        end
    end

    return trackIndex, subtitles, nil
end

local function get_speaker_from_id(speakers, id)
    local speakerIndex = tonumber(id)
    if speakerIndex == nil then
        return nil
    end

    local speaker = speakers[speakerIndex]
    if speaker ~= nil then
        return speaker
    end

    return nil
end

local function build_clip_list(subtitles, speakers, speakersExist, trackIndex, templateItem, frame_rate, template_frame_rate, timelineStart)
    local joinThreshold = frame_rate
    local clipList = {}
    for i, subtitle in ipairs(subtitles) do
        local start_frame = to_frames(subtitle["start"], frame_rate)
        local end_frame = to_frames(subtitle["end"], frame_rate)
        local timeline_pos = timelineStart + start_frame
        local clip_timeline_duration = end_frame - start_frame

        if i < #subtitles then
            local next_start = timelineStart + to_frames(subtitles[i + 1]["start"], frame_rate)
            local frames_between = next_start - (timeline_pos + clip_timeline_duration)
            if frames_between < joinThreshold then
                clip_timeline_duration = clip_timeline_duration + frames_between + 1
            end
        end

        local duration = (clip_timeline_duration / frame_rate) * template_frame_rate

        local itemTrack = trackIndex
        if speakersExist then
            local speaker = get_speaker_from_id(speakers, subtitle.speaker_id)
            if speaker and speaker.track ~= nil and speaker.track ~= "" then
                itemTrack = speaker.track
            end
        end

        local newClip = {
            mediaPoolItem = templateItem,
            mediaType = 1,
            startFrame = 0,
            endFrame = duration,
            recordFrame = timeline_pos,
            trackIndex = itemTrack
        }

        table.insert(clipList, newClip)
    end

    return clipList
end

local function to_word_timing(transcript_words, frameRate, segmentStart)
    local result = {}
    local startIndex = 0

    for _, word in ipairs(transcript_words) do
        local endIndex = startIndex + utf8len(word.word) - 1
        table.insert(result, {
            startIndex = startIndex,
            endIndex   = endIndex,
            startFrame = math.floor((word.start - segmentStart) * frameRate),
            endFrame   = math.floor((word["end"] - segmentStart) * frameRate),
        })
        startIndex = endIndex + 1
    end

    return result
end

local function apply_subtitle_text(timelineItems, subtitles, speakers, speakersExist, isAnimated)
    for i, timelineItem in ipairs(timelineItems) do
        local success, err = pcall(function()
            local subtitle = subtitles[i]
            local subtitleText = subtitle["text"]

            if timelineItem:GetFusionCompCount() > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local template = comp:FindTool("Template")
                if isAnimated then
                    local framerate = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate"))
                    local wordTiming = to_word_timing(subtitle.words, framerate, subtitle.start)
                    comp:FindTool("AutoSubs"):SetData("WordTiming", wordTiming) -- Will be applied to keyframes when text is updated
                    template:SetInput("Text", subtitleText) -- AutoSubs Macro uses custom text input
                else
                    template:SetInput("StyledText", subtitleText)
                end

                if speakersExist then
                    local speaker = get_speaker_from_id(speakers, subtitle.speaker_id)
                    if speaker then
                        set_speaker_styling(speaker, template, isAnimated)
                    end
                end

                timelineItem:SetClipColor("Green") -- Visualise updated clips
            end
        end)

        if not success then
            print("Failed to add subtitle to timeline: " .. err)
        end
    end
end

-- Forces timeline view to update and show new subtitle clips
local function refresh_timeline(timeline)
    timeline:SetCurrentTimecode(timeline:GetCurrentTimecode())
end

-- Add subtitles to the timeline using the specified template
-- conflictMode: "replace" (delete existing), "skip" (write around conflicts), "new_track" (use new track), nil (default/old behavior)
function AddSubtitles(filePath, trackIndex, templateName, conflictMode)
    resolve:OpenPage("edit")

    local data = load_subtitle_data(filePath)
    if not data then
        return false
    end

    ---@type { mark_in: integer, mark_out: integer, segments: table, speakers: table }
    data = data

    local timeline = project:GetCurrentTimeline()
    local timelineStart = timeline:GetStartFrame()
    local markIn, markOut = get_mark_in_out(timeline, data)
    local subtitles = data["segments"]
    local speakers = data["speakers"]

    local speakersExist = false
    if speakers and #speakers > 0 then
        speakersExist = true
    end

    trackIndex = sanitize_track_index(timeline, trackIndex, markIn, markOut)

    local frame_rate = timeline:GetSetting("timelineFrameRate")

    local earlyResult = nil
    trackIndex, subtitles, earlyResult = apply_conflict_mode(timeline, subtitles, trackIndex, conflictMode, frame_rate, timelineStart)
    if earlyResult then
        return earlyResult
    end

    speakers = sanitize_speaker_tracks(timeline, speakers, trackIndex, markIn, markOut)

    local rootFolder = mediaPool:GetRootFolder()
    local templateItem, template_frame_rate = get_template(rootFolder, templateName)
    if not templateItem then
        return false
    end

    local clipList = build_clip_list(subtitles, speakers, speakersExist, trackIndex, templateItem, frame_rate,
        template_frame_rate, timelineStart)
    local timelineItems = mediaPool:AppendToTimeline(clipList)

    local isAnimated = templateName == ANIMATED_CAPTION and true or false

    apply_subtitle_text(timelineItems, subtitles, speakers, speakersExist, isAnimated)
    refresh_timeline(timeline)
end

local function extract_frame(comp, exportDir)
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
        local availableTemplates = get_templates()
        if #availableTemplates > 0 then
            templateName = availableTemplates[1].value
        end
    end

    -- Resolve the template item with fallbacks
    local templateItem = nil
    if templateName ~= nil and templateName ~= "" then
        templateItem = get_template_item(rootFolder, templateName)
    end
    if not templateItem then
        templateItem = get_template_item(rootFolder, "Default Template")
    end
    if not templateItem then
        print("Error: Could not find subtitle template '" .. tostring(templateName) .. "' in media pool.")
        return ""
    end

    local templateFrameRate = templateItem:GetClipProperty()["FPS"]
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
            set_speaker_styling(speaker, tool)

            outputPath = extract_frame(comp, exportDir)
        end
    end)
    if not success then
        print("Failed to set timeline position: " .. err)
    end
    timeline:DeleteClips(timelineItems)
    timeline:DeleteTrack("video", trackIndex)

    return outputPath
end

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
    print("Press Ctrl+C to stop the server")

    -- Launch app if not in dev mode
    if not DEV_MODE then
        LaunchApp()
    end

    -- Server loop with signal handling
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
                            elseif data.func == "CheckTrackConflicts" then
                                print("[AutoSubs Server] Checking track conflicts...")
                                local conflictInfo = CheckTrackConflicts(data.filePath, data.trackIndex)
                                body = json.encode(conflictInfo)
                            elseif data.func == "AddSubtitles" then
                                print("[AutoSubs Server] Adding subtitles to timeline...")
                                local result = AddSubtitles(data.filePath, data.trackIndex, data.templateName, data.conflictMode)
                                body = json.encode({
                                    message = "Job completed",
                                    result = result
                                })
                            elseif data.func == "GeneratePreview" then
                                print("[AutoSubs Server] Generating preview...")
                                local previewPath = GeneratePreview(data.speaker, data.templateName, data.exportPath)
                                body = json.encode(previewPath)
                            elseif data.func == "Exit" then
                                body = safe_json({ message = "Server shutting down" })
                                quitServer = true
                            elseif data.func == "Ping" then
                                body = safe_json({ message = "Pong" })
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
                    local response = create_response(body)
                    if DEV_MODE then print(response) end
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
            ffi.cdef [[
                int system(const char *command);
                struct timespec { long tv_sec; long tv_nsec; };
                int nanosleep(const struct timespec *req, struct timespec *rem);
            ]]

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
