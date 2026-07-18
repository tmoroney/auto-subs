---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global, deprecated
local ffi = ffi

-- Shared access to the Resolve / Fusion scripting environment (see resolve_env.lua).
-- The entry scripts add the modules dir to package.path before requiring us.
local resolve_env = require("resolve_env")

-- resolve is provided implicitly by the Resolve environment - no need to call Resolve() unless running in terminal
local resolve = resolve_env.get_resolve()

local DEV_MODE = false

-- Server Port
local PORT = 56002

-- Platform-specific FFI bindings
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

        void Sleep(unsigned int ms);
        int ShellExecuteA(
            void* hwnd,
            const char* lpOperation,
            const char* lpFile,
            const char* lpParameters,
            const char* lpDirectory,
            int nShowCmd);
    ]]
else
    ffi.cdef [[
        int system(const char *command);
        struct timespec { long tv_sec; long tv_nsec; };
        int nanosleep(const struct timespec *req, struct timespec *rem);
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

local function join_path(dir, filename)
    local sep = package.config:sub(1, 1) -- returns '\\' on Windows, '/' elsewhere
    -- Remove trailing separator from dir, if any
    if dir:sub(-1) == sep then
        return dir .. filename
    else
        return dir .. sep .. filename
    end
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

-- Load external libraries
local socket = nil
local json = nil
local luaresolve = nil
local font_fallback = nil

-- Function to read a JSON file. Returns the decoded table on success, or
-- `nil, err` on failure so callers can surface the real reason.
local function read_json_file(file_path)
    local ok, content = pcall(read_file, file_path)
    if not ok then
        return nil, tostring(content)
    end

    -- Parse the JSON content
    if json == nil or json.decode == nil then
        return nil, "JSON library not available"
    end
    local data, _, err = json.decode(content, 1, nil)
    if err then
        return nil, tostring(err)
    end
    return data
end

-- OS SPECIFIC CONFIGURATION
local resources_path
local main_app
local command_open

-- Load Resolve objects
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local mediaPool = project:GetMediaPool()

local ANIMATED_CAPTION_DISPLAY_NAME = "AutoSubs Caption"
local CAPTION_TEMPLATE_VERSION = require("caption_template_version")
local ANIMATED_CAPTION = ANIMATED_CAPTION_DISPLAY_NAME .. " " .. CAPTION_TEMPLATE_VERSION
local AUTOSUBS_BIN = "AutoSubs"
local STAGING_BIN = "AutoSubs New"
local defaultTemplateImportAttempted = false
local lastProjectId = project:GetUniqueId()

-- Refresh the cached project / mediaPool references and detect project
-- switches. When the user opens a different Resolve project the old
-- mediaPool no longer contains the AutoSubs Caption template, so we
-- must reset the one-shot import guard so get_templates() will try
-- the import again.
local function refresh_project()
    project = projectManager:GetCurrentProject()
    mediaPool = project:GetMediaPool()
    local currentId = project:GetUniqueId()
    if currentId ~= lastProjectId then
        defaultTemplateImportAttempted = false
        lastProjectId = currentId
    end
end

local STYLE_INDEX = {
    Fill = 1,
    Outline = 2,
    Shadow = 3,
    Background = 4
}

-- Global state for an active caption-preset edit session.
-- Populated by StartPresetEdit, consumed/cleared by CapturePresetSettings or
-- CancelPresetEdit. Holds just enough Resolve handles to tear down the
-- temporary clip/track and read the tool's input values.
local presetEditSession = nil

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
    trackStates = nil,
    clipBoundaries = nil,
    -- Captured before ExportAudio, restored by restore_user_state() in AddSubtitles.
    savedMarks = nil       -- raw GetMarkInOut() dict (relative frame values)
}

-- Helper that wraps a Resolve-facing operation in pcall and returns a
-- structured `{ error = <short reason>, detail = <underlying error> }` on
-- failure, or the function's result on success. Used so the frontend error
-- dialog can surface the actual error from Resolve instead of a generic
-- "something went wrong".
local function make_error(short, detail)
    return { error = short, detail = tostring(detail or "") }
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

local function is_animated_caption(templateName)
    return type(templateName) == "string" and
        (templateName == ANIMATED_CAPTION_DISPLAY_NAME or
            templateName:sub(1, #ANIMATED_CAPTION_DISPLAY_NAME + 1) == ANIMATED_CAPTION_DISPLAY_NAME .. " ")
end

local function resolve_template_name(templateName)
    if templateName == ANIMATED_CAPTION_DISPLAY_NAME then
        return ANIMATED_CAPTION
    end
    return templateName
end

local function get_root_subfolder(rootFolder, folderName)
    for _, subfolder in ipairs(rootFolder:GetSubFolderList()) do
        if subfolder:GetName() == folderName then
            return subfolder
        end
    end
    return nil
end

local function get_folder_template_item(folder, templateName)
    for _, clip in ipairs(folder:GetClipList()) do
        local props = clip:GetClipProperty()
        if props["Clip Name"] == templateName and is_matching_title(props["Type"]) then
            return clip
        end
    end
    return nil
end

local function find_default_template_in_folder(folder)
    local template = get_folder_template_item(folder, ANIMATED_CAPTION)
    if template then
        return template, folder
    end

    for _, subfolder in ipairs(folder:GetSubFolderList()) do
        local nestedTemplate, sourceFolder = find_default_template_in_folder(subfolder)
        if nestedTemplate then
            return nestedTemplate, sourceFolder
        end
    end
    return nil, nil
end

local function find_default_template(rootFolder)
    local autosubsFolder = get_root_subfolder(rootFolder, AUTOSUBS_BIN)
    if autosubsFolder then
        local template = get_folder_template_item(autosubsFolder, ANIMATED_CAPTION)
        if template then
            return template, autosubsFolder
        end
    end
    return find_default_template_in_folder(rootFolder)
end

local function delete_obsolete_caption_templates(autosubsFolder, currentTemplate)
    local obsoleteTemplates = {}
    local currentTemplateId = currentTemplate:GetUniqueId()
    for _, clip in ipairs(autosubsFolder:GetClipList()) do
        local clipName = clip:GetClipProperty()["Clip Name"]
        if clip:GetUniqueId() ~= currentTemplateId and is_animated_caption(clipName) then
            table.insert(obsoleteTemplates, clip)
        end
    end
    if #obsoleteTemplates == 0 then
        return
    end

    local deleted, deleteResult = pcall(function()
        return mediaPool:DeleteClips(obsoleteTemplates)
    end)
    if not deleted or not deleteResult then
        print("Failed to delete obsolete AutoSubs caption templates")
    end
end

local function folder_has_clip(folder, clipName)
    for _, clip in ipairs(folder:GetClipList()) do
        if clip:GetClipProperty()["Clip Name"] == clipName then
            return true
        end
    end
    return false
end

local function is_staging_folder_name(folderName)
    return folderName == STAGING_BIN or folderName:sub(1, #STAGING_BIN + 1) == STAGING_BIN .. " "
end

local function move_default_template(rootFolder, template, sourceFolder)
    local autosubsFolder = get_root_subfolder(rootFolder, AUTOSUBS_BIN)
    if not autosubsFolder then
        autosubsFolder = mediaPool:AddSubFolder(rootFolder, AUTOSUBS_BIN)
    end
    if not autosubsFolder then
        print("Failed to create AutoSubs media pool folder")
        return nil
    end
    if sourceFolder:GetUniqueId() == autosubsFolder:GetUniqueId() then
        delete_obsolete_caption_templates(autosubsFolder, template)
        return template
    end

    local clipsToMove = {}
    for _, clip in ipairs(sourceFolder:GetClipList()) do
        local clipName = clip:GetClipProperty()["Clip Name"]
        if not folder_has_clip(autosubsFolder, clipName) then
            table.insert(clipsToMove, clip)
        end
    end

    if #clipsToMove > 0 then
        local moved, moveResult = pcall(function()
            return mediaPool:MoveClips(clipsToMove, autosubsFolder)
        end)
        if not moved or not moveResult then
            print("Failed to move clips into AutoSubs media pool folder")
            return nil
        end
    end

    local sourceFolderName = sourceFolder:GetName()
    if is_staging_folder_name(sourceFolderName) then
        local remainingClips = {}
        for _, clip in ipairs(sourceFolder:GetClipList()) do
            table.insert(remainingClips, clip)
        end
        if #remainingClips > 0 then
            pcall(function()
                mediaPool:DeleteClips(remainingClips)
            end)
        end
        if #sourceFolder:GetClipList() == 0 and #sourceFolder:GetSubFolderList() == 0 then
            pcall(function()
                mediaPool:DeleteFolders({ sourceFolder })
            end)
        end
    end

    delete_obsolete_caption_templates(autosubsFolder, template)
    return template
end

-- Add default template to mediapool if not available (get version with resolve:GetVersion()[1])
local function ensure_default_template(rootFolder)
    local template, sourceFolder = find_default_template(rootFolder)
    if template then
        return move_default_template(rootFolder, template, sourceFolder)
    end
    if defaultTemplateImportAttempted then
        return nil
    end

    print("Default template not found. Importing default template...")
    defaultTemplateImportAttempted = true
    local previousFolder = nil
    pcall(function()
        previousFolder = mediaPool:GetCurrentFolder()
        mediaPool:SetCurrentFolder(rootFolder)
    end)
    local imported, importResult = pcall(function()
        return mediaPool:ImportFolderFromFile(join_path(resources_path, "caption-bin.drb"))
    end)
    if previousFolder then
        pcall(function()
            mediaPool:SetCurrentFolder(previousFolder)
        end)
    end
    if not imported or not importResult then
        print("Failed to import default template")
        return nil
    end

    template, sourceFolder = find_default_template(rootFolder)
    if not template then
        print("Imported caption bin did not contain '" .. ANIMATED_CAPTION .. "'")
        return nil
    end
    return move_default_template(rootFolder, template, sourceFolder)
end

-- Get a list of all Text+ templates in the media pool
get_templates = function()
    local rootFolder = mediaPool:GetRootFolder()
    local t = {}
    local hasDefault = ensure_default_template(rootFolder) ~= nil

    walk_media_pool(rootFolder, function(clip)
        local props = clip:GetClipProperty()
        local clipType = props["Type"]
        if is_matching_title(clipType) then
            local clipName = props["Clip Name"]
            if not (hasDefault and clipName == ANIMATED_CAPTION_DISPLAY_NAME) then
                local displayName = clipName == ANIMATED_CAPTION and ANIMATED_CAPTION_DISPLAY_NAME or clipName
                table.insert(t, { label = displayName, value = displayName })
            end
        end
    end)

    return t
end

-- Find the template item with the specified name using media pool traversal
get_template_item = function(folder, templateName)
    local found = nil
    templateName = resolve_template_name(templateName)
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
    -- Get project and media pool (resets template-import flag on project switch)
    refresh_project()

    -- Get timeline info
    local timelineInfo = {}
    local success, err = pcall(function()
        local timeline = project:GetCurrentTimeline()
        timelineInfo = {
            name = timeline:GetName(),
            timelineId = timeline:GetUniqueId(),
            timelineStart = timeline:GetStartFrame() / timeline:GetSetting("timelineFrameRate"),
            projectName = project:GetName(),
        }
    end)
    if not success then
        print("Error retrieving timeline info:", err)
        timelineInfo = {
            timelineId = "",
            name = "No timeline selected"
        }
    else
        timelineInfo["outputTracks"] = get_video_tracks()
        timelineInfo["inputTracks"] = get_audio_tracks()
    end
    return timelineInfo
end

function GetTemplates()
    refresh_project()
    return get_templates()
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
        timeline:SetTrackEnable("audio", i, currentExportJob["trackStates"][i])
    end
    currentExportJob["clipBoundaries"] = nil
end

-- Restore the user's pre-export In/Out markers. No-ops if nothing was saved
-- (standalone AddSubtitles without a prior export).
local function restore_user_state()
    if currentExportJob.savedMarks == nil then return end

    local timeline = project:GetCurrentTimeline()
    if timeline and timeline.SetMarkInOut then
        for _, markType in ipairs({ "audio", "video" }) do
            local m = currentExportJob.savedMarks[markType]
            local ok = false
            if m and m["in"] ~= nil and m["out"] ~= nil then
                ok = pcall(timeline.SetMarkInOut, timeline, m["in"], m["out"], markType)
            elseif timeline.ClearMarkInOut then
                ok = pcall(timeline.ClearMarkInOut, timeline, markType)
            end
            if not ok then
                print("[AutoSubs] restore_user_state: could not restore " .. markType .. " markers")
            end
        end
    end
    currentExportJob.savedMarks = nil
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
            end

            -- IsRenderingInProgress() going false only means Resolve stopped
            -- rendering — it does NOT mean the job actually succeeded. Check
            -- the job's real status so a silently failed render (e.g. bad
            -- output path, disk full, no encoder) is reported as an error
            -- instead of a fabricated success with a non-existent file.
            local jobStatus, jobError
            if currentExportJob.pid then
                local ok, status = pcall(function()
                    return project:GetRenderJobStatus(currentExportJob.pid)
                end)
                if ok and type(status) == "table" then
                    jobStatus = status["JobStatus"]
                    jobError = status["Error"]
                end
            end

            if jobStatus and jobStatus ~= "Complete" then
                local detail = jobError or ("Render job status: " .. tostring(jobStatus))
                print("[AutoSubs] Export did not complete successfully: " .. detail)
                return {
                    active = false,
                    progress = currentExportJob.progress,
                    error = true,
                    message = "Audio export failed in Resolve",
                    detail = detail
                }
            end

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

-- Helper function to get individual clips with their boundaries (for segment-based transcription)
-- Returns a sorted array of clip segments: { { start, end, name }, ... }
local function get_individual_clips(timeline, selectedTracks, rangeStart, rangeEnd)
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

                -- Skip clips entirely outside the marker region; clamp those that overlap
                if clipEnd > rangeStart and clipStart < rangeEnd then
                    local cs = math.max(clipStart, rangeStart)
                    local ce = math.min(clipEnd, rangeEnd)

                    table.insert(allClips, {
                        startFrame = cs,
                        endFrame = ce,
                        -- Convert to seconds relative to timeline start
                        start = (cs - timelineStart) / frameRate,
                        ["end"] = (ce - timelineStart) / frameRate,
                        name = clipName
                    })
                end
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

-- Helper function to resolve in/out markers to absolute timeline frame positions.
-- timeline:GetMarkInOut() returns a dict like {audio={in=0,out=134}, video={...}}
-- where values are RELATIVE to the timeline start (0-based). Clip positions
-- (clip:GetStart()/GetEnd()) however are ABSOLUTE timeline frames, so we must
-- offset markers by timeline:GetStartFrame() before comparing.
-- If only one of in/out is set, the missing side defaults to the timeline
-- start/end frame respectively.
local function get_marker_range(timeline)
    local startFrame = timeline:GetStartFrame()
    local endFrame = timeline:GetEndFrame()

    local marks = {}
    if timeline.GetMarkInOut then
        marks = timeline:GetMarkInOut() or {}
    end
    -- Prefer audio markers; fall back to video if audio not present
    local m = marks["audio"] or marks["video"] or {}

    local inAbs = m["in"] and (m["in"] + startFrame) or startFrame
    local outAbs = m["out"] and (m["out"] + startFrame) or endFrame

    return inAbs, outAbs
end

-- Helper function to find clip boundaries on selected audio tracks within in/out markers.
-- Clips entirely outside the marker region are ignored. Clips that overlap the
-- region are clamped to the marker boundaries.
local function get_clip_boundaries(timeline, selectedTracks, rangeStart, rangeEnd)
    local earliestStart = nil
    local latestEnd = nil

    for trackIndex, _ in pairs(selectedTracks) do
        local clips = timeline:GetItemListInTrack("audio", trackIndex)
        if clips then
            for _, clip in ipairs(clips) do
                local clipStart = clip:GetStart()
                local clipEnd = clip:GetEnd()

                -- Skip clips completely outside the marker region
                if clipEnd > rangeStart and clipStart < rangeEnd then
                    local start = math.max(clipStart, rangeStart)
                    local end_ = math.min(clipEnd, rangeEnd)

                    if earliestStart == nil or start < earliestStart then
                        earliestStart = start
                    end
                    if latestEnd == nil or end_ > latestEnd then
                        latestEnd = end_
                    end
                end
            end
        end
    end

    return earliestStart, latestEnd
end


-- Export audio from selected tracks
-- inputTracks is a table of track indices to export
function ExportAudio(outputDir, inputTracks, exportRange)
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
        audioInfo = nil,
        trackStates = nil
    }

    local timeline = project:GetCurrentTimeline()
    local audioTracks = timeline:GetTrackCount("audio")

    -- Save track states immediately for restoration or error
    local trackStates = {}
    for i = 1, audioTracks do
        local state = timeline:GetIsTrackEnabled("audio", i)
        trackStates[i] = state
    end
    currentExportJob["trackStates"] = trackStates

    -- Create Set of selected track indices for quick lookup
    local selected = {}
    for _, v in ipairs(inputTracks) do
        local n = tonumber(v)
        if n then selected[n] = true end
    end

    -- Enable selected tracks (disable / mute others)
    for i = 1, audioTracks do
        local isEnabled = selected[i] == true
        timeline:SetTrackEnable("audio", i, isEnabled)
    end

    local exportName = "autosubs-exported-audio-" ..
        os.date("!%Y%m%d-%H%M%S") .. "-" .. tostring(math.random(100000, 999999))

    -- Build render settings
    local renderSettings = {
        TargetDir = outputDir,
        CustomName = exportName,
        RenderMode = "Single clip",
        IsExportVideo = false,
        IsExportAudio = true,
        AudioBitDepth = 24,
        AudioSampleRate = 44100
    }

    -- Determine the broad region to export (in/out markers or entire timeline)
    local rangeStart, rangeEnd
    if exportRange == "inout" then
        local ok, inPt, outPt = pcall(get_marker_range, timeline)
        if ok then
            rangeStart, rangeEnd = inPt, outPt
        else
            -- GetMarkInOut() requires Resolve 20+, fall back to current In/Out points
            print("[AutoSubs] No markers found — using current In/Out points")
        end
    else
        rangeStart = timeline:GetStartFrame()
        rangeEnd = timeline:GetEndFrame()
    end

    -- Trim to actual clip boundaries (skip leading/trailing silence). Fall back
    -- to the full region if no clips are found (nil would crash the print below).
    if rangeStart then
        local exportStart, exportEnd = get_clip_boundaries(timeline, selected, rangeStart, rangeEnd)
        if exportStart == nil or exportEnd == nil then
            print("[AutoSubs] No clips found in export range — falling back to full region " ..
                tostring(rangeStart) .. " - " .. tostring(rangeEnd))
            exportStart = rangeStart
            exportEnd = rangeEnd
        end
        renderSettings.MarkIn = exportStart
        renderSettings.MarkOut = exportEnd
        print("[AutoSubs] Export range: " .. tostring(exportStart) .. " - " .. tostring(exportEnd))
    end

    -- Capture markers before the Deliver switch clobbers them.
    currentExportJob.savedMarks = nil
    if timeline.GetMarkInOut then
        pcall(function()
            currentExportJob.savedMarks = timeline:GetMarkInOut() or nil
        end)
    end

    -- Must switch to Deliver page to start render and customise settings (wierd quirk of Resolve API)
    resolve:OpenPage("deliver")
    project:LoadRenderPreset('Audio Only')

    project:SetRenderSettings(renderSettings)

    local success, err = pcall(function()
        local pid = project:AddRenderJob()
        currentExportJob.pid = pid
        project:StartRendering(pid)

        local renderJobList = project:GetRenderJobList()
        local jobInfo = renderJobList[#renderJobList]

        -- Calculate offset to align subtitles back to timeline (exported audio starts at mark in, not timeline 0)
        local framesFromTimelineStart = jobInfo["MarkIn"] - timeline:GetStartFrame()
        local timeOffsetInSeconds = framesFromTimelineStart / timeline:GetSetting("timelineFrameRate")

        local audioInfo = {
            path = join_path(jobInfo["TargetDir"], jobInfo["OutputFilename"]),
            markIn = jobInfo["MarkIn"],
            markOut = jobInfo["MarkOut"],
            offset = timeOffsetInSeconds
        }
        currentExportJob.audioInfo = audioInfo

        print("Export started with PID: " .. pid)
    end)

    -- Handle export start result
    if not success then
        reset_tracks()
        currentExportJob.active = false
        local detail = tostring(err or "unknown error")
        print("[AutoSubs] ExportAudio failed to start: " .. detail)
        return {
            error = true,
            message = "Failed to start audio export",
            detail = detail
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
    if not timeline then
        return { hasConflicts = false, error = "No active timeline" }
    end
    local timelineStart = timeline:GetStartFrame()
    local frame_rate = timeline:GetSetting("timelineFrameRate")

    -- Read the subtitle data to get time ranges
    local data, readErr = read_json_file(filePath)
    if type(data) ~= "table" then
        return {
            hasConflicts = false,
            error = "Could not read subtitle file",
            detail = readErr or "unknown error"
        }
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
    local data, err = read_json_file(filePath)
    if type(data) ~= "table" then
        return nil, err or "Could not parse subtitle JSON"
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
            if timeline.GetMarkInOut then
                local markInOut = timeline:GetMarkInOut()
                markIn = (markInOut.audio["in"] and markInOut.audio["in"] + timelineStart) or timelineStart
                markOut = (markInOut.audio["out"] and markInOut.audio["out"] + timelineStart) or timelineEnd
            else
                markIn = timelineStart
                markOut = timelineEnd
            end
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
        templateName = ANIMATED_CAPTION
    end

    templateName = resolve_template_name(templateName)
    local templateItem = nil
    local resolvedName = templateName -- tracks which template was actually found
    if templateName ~= nil and templateName ~= "" then
        templateItem = get_template_item(rootFolder, templateName)
    end
    -- If the template wasn't found, trigger get_templates() which will
    -- auto-import the default caption-bin.drb if it hasn't been tried for
    -- this project yet, then retry the lookup.
    if not templateItem and templateName ~= nil and templateName ~= "" then
        get_templates()
        templateItem = get_template_item(rootFolder, templateName)
    end
    if not templateItem then
        templateItem = get_template_item(rootFolder, "Default Template")
        resolvedName = "Default Template"
    end
    -- Final fallback: the bundled animated caption template.
    if not templateItem then
        templateItem = get_template_item(rootFolder, ANIMATED_CAPTION)
        resolvedName = ANIMATED_CAPTION
    end
    if not templateItem then
        return nil, nil, "Could not find subtitle template '" .. tostring(templateName) ..
            "' in media pool (also tried 'Default Template' and '" .. ANIMATED_CAPTION .. "')"
    end

    local template_frame_rate = templateItem:GetClipProperty()["FPS"]
    -- Return resolvedName so callers detect the animated caption template even
    -- after a fallback (the isAnimated flag depends on it).
    return templateItem, template_frame_rate, nil, resolvedName
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
                timeline:DeleteClips({ clip }, false)
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
                return trackIndex, subtitles,
                    { success = true, message = "All subtitles skipped due to existing content", added = 0 }
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

local function build_clip_list(subtitles, speakers, speakersExist, trackIndex, templateItem, frame_rate,
                               template_frame_rate, timelineStart)
    local joinThreshold = frame_rate
    local clipList = {}
    for i, subtitle in ipairs(subtitles) do
        -- Skip malformed segments (nil start/end) instead of crashing in to_frames().
        if subtitle["start"] == nil or subtitle["end"] == nil then
            print(string.format("[AutoSubs] Skipping subtitle #%d with missing start/end time (start=%s, end=%s)",
                i, tostring(subtitle["start"]), tostring(subtitle["end"])))
            goto continue
        end
        local start_frame = to_frames(subtitle["start"], frame_rate)
        local end_frame = to_frames(subtitle["end"], frame_rate)
        local timeline_pos = timelineStart + start_frame
        local clip_timeline_duration = end_frame - start_frame

        if i < #subtitles then
            local nextSub = subtitles[i + 1]
            if nextSub and nextSub["start"] ~= nil then
                local next_start = timelineStart + to_frames(nextSub["start"], frame_rate)
                local frames_between = next_start - (timeline_pos + clip_timeline_duration)
                if frames_between < joinThreshold then
                    clip_timeline_duration = clip_timeline_duration + frames_between + 1
                end
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
        ::continue::
    end

    return clipList
end

-- UTF-8 aware character count
local function utf8len(s)
    local _, count = s:gsub("[^\128-\191]", "")
    return count
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

-- Applies subtitle text + styling to each appended timeline item. Instead of
-- spamming one print per failed clip, we aggregate failures and return a
-- summary so the caller can surface a single clean error.
-- Returns: { failed = N, total = M, firstError = "..." }
local function apply_subtitle_text(timelineItems, subtitles, speakers, speakersExist, isAnimated, presetSettings)
    local hasPresetSettings = isAnimated and presetSettings ~= nil and next(presetSettings) ~= nil
    local failed = 0
    local noFusionComp = 0
    local firstError = nil
    for i, timelineItem in ipairs(timelineItems) do
        local success, err = pcall(function()
            local subtitle = subtitles[i]
            local subtitleText = subtitle["text"]

            local fusionCompCount = timelineItem:GetFusionCompCount()
            if not fusionCompCount then
                noFusionComp = noFusionComp + 1
                error("template clip has no Fusion composition (GetFusionCompCount returned nil) — your DaVinci Resolve version may be incompatible")
            end
            if fusionCompCount > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local template = comp:FindTool("Template") or comp:FindToolByID("TextPlus")
                if isAnimated then
                    local framerate = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate"))
                    local wordTiming = to_word_timing(subtitle.words, framerate, subtitle.start)
                    local autosubsTool = comp:FindTool("AutoSubs")
                    autosubsTool:SetData("WordTiming", wordTiming) -- Will be applied to keyframes when text is updated
                    template:SetInput("Text", subtitleText)        -- AutoSubs Macro uses custom text input

                    -- Sync CharacterLevelStyling1.Text so the Follower1 -> CLS
                    -- binding chain re-evaluates with the correct text on playback.
                    -- The macro's ExecuteOnChange also does this, but setting it
                    -- here covers cases where Fusion skips that callback.
                    local clsTool = comp:FindTool("CharacterLevelStyling1")
                    if clsTool then
                        pcall(clsTool.SetInput, clsTool, "Text", subtitleText)
                    end

                    -- Apply caption preset settings via the macro's built-in helper
                    -- so inspector values captured during a preset edit are faithfully
                    -- reproduced here. Swallow errors for forward-compat with future
                    -- macro versions that may gain/lose fields.
                    if hasPresetSettings then
                        local applyOk, applyErr = pcall(function()
                            local setter = autosubsTool:GetData("SetInputValues")
                            if setter and setter ~= "" then
                                loadstring(setter)()(comp, autosubsTool, presetSettings)
                            end
                        end)
                        if not applyOk then
                            -- Re-raise so it's counted as a per-clip failure.
                            error("preset apply failed: " .. tostring(applyErr))
                        end
                    end
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
            failed = failed + 1
            if firstError == nil then firstError = tostring(err) end
        end
    end

    if noFusionComp > 0 then
        print(string.format("[AutoSubs] %d of %d subtitle clips had no Fusion composition (GetFusionCompCount returned nil). This usually means your DaVinci Resolve version is incompatible with the AutoSubs Caption template.",
            noFusionComp, #timelineItems))
    end
    if failed > 0 then
        print(string.format("[AutoSubs] Failed to place %d of %d subtitles. First error: %s",
            failed, #timelineItems, tostring(firstError)))
    end

    return { failed = failed, total = #timelineItems, firstError = firstError, noFusionComp = noFusionComp }
end

-- Add subtitles to the timeline using the specified template
-- conflictMode: "replace" (delete existing), "skip" (write around conflicts), "new_track" (use new track), nil (default/old behavior)
-- presetSettings: optional opaque table of AutoSubs Caption macro input values
-- (captured via StartPresetEdit/CapturePresetSettings). Ignored for non-animated templates.
function AddSubtitles(filePath, trackIndex, templateName, conflictMode, presetSettings)
    refresh_project()
    resolve:OpenPage("edit")

    -- Wrap placement so restore_user_state() runs on every exit path.
    local result
    local ok, err = pcall(function()
        result = (function()
    local data, loadErr = load_subtitle_data(filePath)
    if not data then
        return make_error("Failed to load subtitle file", loadErr)
    end

    ---@type { mark_in: integer, mark_out: integer, segments: table, speakers: table }
    data = data

    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return make_error("Failed to add subtitles", "No active timeline in Resolve")
    end
    local timelineStart = timeline:GetStartFrame()
    local markIn, markOut = get_mark_in_out(timeline, data)
    local subtitles = data["segments"]
    local speakers = data["speakers"]

    if not subtitles or #subtitles == 0 then
        return make_error("Failed to add subtitles", "Transcript has no segments")
    end

    local speakersExist = false
    if speakers and #speakers > 0 then
        speakersExist = true
    end

    trackIndex = sanitize_track_index(timeline, trackIndex, markIn, markOut)

    local frame_rate = timeline:GetSetting("timelineFrameRate")

    local earlyResult = nil
    trackIndex, subtitles, earlyResult = apply_conflict_mode(timeline, subtitles, trackIndex, conflictMode, frame_rate,
        timelineStart)
    if earlyResult then
        return earlyResult
    end

    speakers = sanitize_speaker_tracks(timeline, speakers, trackIndex, markIn, markOut)

    local rootFolder = mediaPool:GetRootFolder()
    local templateItem, template_frame_rate, templateErr, resolvedTemplateName = get_template(rootFolder, templateName)
    if not templateItem then
        return make_error("Template not found", templateErr)
    end

    local clipList = build_clip_list(subtitles, speakers, speakersExist, trackIndex, templateItem, frame_rate,
        template_frame_rate, timelineStart)

    -- Temporarily unlock locked target tracks so AppendToTimeline doesn't
    -- silently return an empty table. Re-lock them afterwards.
    local lockedTracks = {}
    if timeline.GetIsTrackLocked and timeline.SetTrackLock then
        local trackSet = {}
        for _, clip in ipairs(clipList) do
            trackSet[clip.trackIndex] = true
        end
        for ti in pairs(trackSet) do
            local isLocked = false
            pcall(function()
                isLocked = timeline:GetIsTrackLocked("video", ti) or false
            end)
            if isLocked then
                pcall(timeline.SetTrackLock, timeline, "video", ti, false)
                lockedTracks[ti] = true
                print("[AutoSubs] Temporarily unlocked video track " .. ti .. " for placement")
            end
        end
    end

    local appendOk, timelineItems = pcall(function()
        return mediaPool:AppendToTimeline(clipList)
    end)

    for ti in pairs(lockedTracks) do
        pcall(timeline.SetTrackLock, timeline, "video", ti, true)
        print("[AutoSubs] Re-locked video track " .. ti)
    end

    if not appendOk then
        return make_error("Failed to add subtitles to timeline", timelineItems)
    end
    if type(timelineItems) ~= "table" or #timelineItems == 0 then
        return make_error("Failed to add subtitles to timeline",
            "Resolve did not return any timeline items from AppendToTimeline. " ..
            "This can happen if the template clip is invalid/corrupt or the target " ..
            "track index is out of range. Try re-importing the template or choosing " ..
            "a different track.")
    end

    -- Use the resolved template name so a fallback to ANIMATED_CAPTION still
    -- enables the animated-text path.
    local isAnimated = is_animated_caption(resolvedTemplateName)

    -- Auto-swap the caption Font for non-Latin transcript languages when the
    -- user is still on the macro's default font. Uses the transcript JSON's
    -- `language` field so older transcripts in a different language still get
    -- the right font even if the app's current language setting has moved on.
    local fontSwap = nil
    if isAnimated and font_fallback then
        presetSettings, fontSwap = font_fallback.maybe_override(presetSettings, data["language"])
    end

    local applyStats = apply_subtitle_text(timelineItems, subtitles, speakers, speakersExist, isAnimated,
        presetSettings)

    -- Force timeline refresh by jumping to the first subtitle
    if subtitles and #subtitles > 0 then
        JumpToTime(subtitles[1].start)
    end

    -- If some (but not all) clips failed to receive text/styling, still report
    -- success but include a warning summary so the UI can mention it.
    if applyStats and applyStats.failed > 0 and applyStats.failed < applyStats.total then
        local warning = string.format("Failed to place %d of %d subtitles", applyStats.failed, applyStats.total)
        if applyStats.noFusionComp and applyStats.noFusionComp > 0 then
            warning = warning .. string.format(" (%d had no Fusion composition — your Resolve version may be incompatible)", applyStats.noFusionComp)
        end
        return {
            ok = true,
            fontSwap = fontSwap,
            warning = warning,
            detail = applyStats.firstError
        }
    elseif applyStats and applyStats.failed == applyStats.total and applyStats.total > 0 then
        local short = string.format("Failed to place all %d subtitles", applyStats.total)
        if applyStats.noFusionComp and applyStats.noFusionComp == applyStats.total then
            short = short .. " — template clips had no Fusion composition. Check that your DaVinci Resolve version supports the AutoSubs Caption template."
        end
        return make_error(short, applyStats.firstError)
    end

    return { ok = true, fontSwap = fontSwap }
        end)() -- end of inner placement function
    end)

    restore_user_state()

    if not ok then
        return make_error("Failed to add subtitles", err)
    end
    return result
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

        -- Get the middle frame of the clip (best representative)
        local frameIndex = math.floor(comp:GetAttrs().COMPN_GlobalEnd / 2)

        -- Trigger the render for only the specified frame through the Saver tool [1, 13, 14]
        local success = comp:Render({
            Start = frameIndex, -- Start rendering at this frame
            End = frameIndex,   -- End rendering at this frame (same in this case)
            Tool = mySaver,     -- Render up to this specific Saver tool [13]
            Wait = true         -- Wait for the render to complete before continuing the script [19]
        })

        local outputFilename = "subtitle-preview-" .. frameIndex .. ".png"
        outputPath = join_path(exportDir, outputFilename)

        if success then
            print("Frame " .. frameIndex .. " successfully saved by " .. mySaver.Name .. " to " .. outputPath)
        else
            print("Failed to save frame " .. frameIndex)
        end
    else
        print("Saver tool 'MySaver' not found in the composition.")
    end

    -- Unlock the composition after changes are complete [15, 20]
    comp:Unlock()

    return outputPath
end

-- place example subtitle on timeline with theme and export frame
-- `language` (optional): ISO code of the transcript this preview represents,
-- used for language-aware font fallback on the AutoSubs Caption macro.
function GeneratePreview(speaker, templateName, presetSettings, exportDir, language)
    refresh_project()
    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return make_error("Failed to generate preview", "No active timeline in Resolve")
    end
    local rootFolder = mediaPool:GetRootFolder()

    -- Resolve the template item
    local templateItem = get_template_item(rootFolder, templateName)
    if not templateItem then
        -- Template missing — trigger auto-import and retry
        get_templates()
        templateItem = get_template_item(rootFolder, templateName)
    end
    if not templateItem then
        return make_error("Failed to generate preview",
            "Could not find subtitle template '" .. tostring(templateName) .. "' in media pool")
    end

    -- Add new track and place item at start of timeline (avoids overwriting existing clips)
    local setupOk, setupErr = pcall(function()
        timeline:AddTrack("video")
    end)
    if not setupOk then
        return make_error("Failed to generate preview", setupErr)
    end

    local trackIndex = timeline:GetTrackCount("video")
    local fps = templateItem:GetClipProperty()["FPS"]

    local appendOk, appended = pcall(function()
        return mediaPool:AppendToTimeline({ {
            mediaPoolItem = templateItem,
            startFrame = 0,
            endFrame = fps * 5, -- set preview to 5 seconds long
            recordFrame = timeline:GetStartFrame(),
            trackIndex = trackIndex
        } })
    end)
    if not appendOk or type(appended) ~= "table" or not appended[1] then
        pcall(function() timeline:DeleteTrack("video", trackIndex) end)
        return make_error("Failed to generate preview",
            (not appendOk) and tostring(appended) or "AppendToTimeline returned no items")
    end
    local timelineItem = appended[1]

    local isAnimated = is_animated_caption(templateName)
    local fontSwap = nil
    if isAnimated and font_fallback then
        presetSettings, fontSwap = font_fallback.maybe_override(presetSettings, language)
    end

    local outputPath = nil
    local success, err = pcall(function()
        if timelineItem:GetFusionCompCount() > 0 then
            local comp = timelineItem:GetFusionCompByIndex(1)
            local tool = comp:FindToolByID("TextPlus")
            tool:SetInput("StyledText", "Subtitle Example Text")
            set_speaker_styling(speaker, tool)
            if fontSwap and fontSwap.to then
                pcall(function() tool:SetInput("Font", fontSwap.to) end)
            end
            outputPath = extract_frame(comp, exportDir)
        end
    end)

    -- Always clean up, even on failure, so the user isn't left with a stray track.
    pcall(function() timeline:DeleteClips({ timelineItem }) end)
    pcall(function() timeline:DeleteTrack("video", trackIndex) end)

    if not success then
        return make_error("Failed to generate preview", err)
    end
    if not outputPath or outputPath == "" then
        return make_error("Failed to generate preview",
            "Template has no Fusion composition to render from")
    end

    return { path = outputPath, fontSwap = fontSwap }
end

-- ---------------------------------------------------------------------------
-- Caption-preset editing
--
-- The AutoSubs animated caption macro exposes two helper scripts via
-- `tool:GetData("GetInputValues")` and `tool:GetData("SetInputValues")`. We
-- use these to let the user tweak preset parameters in Resolve's Fusion
-- inspector and round-trip those values back into a JSON preset we store in
-- the app.
--
-- The three endpoints below form a mini state machine driven from the app:
--   StartPresetEdit  -> drops a caption clip on a temp track, opens Fusion.
--   CapturePresetSettings -> reads tool inputs, tears down the temp track.
--   CancelPresetEdit -> tears down without reading.
-- ---------------------------------------------------------------------------

-- Remove the temp clip + track created by StartPresetEdit, if any, and return
-- to the edit page. Safe to call without an active session.
local function teardown_preset_edit_session()
    if presetEditSession == nil then return end
    local timeline = project:GetCurrentTimeline()
    pcall(function()
        if timeline and presetEditSession.timelineItem then
            timeline:DeleteClips({ presetEditSession.timelineItem })
        end
    end)
    pcall(function()
        if timeline and presetEditSession.trackIndex then
            timeline:DeleteTrack("video", presetEditSession.trackIndex)
        end
    end)
    pcall(function() resolve:OpenPage("edit") end)
    presetEditSession = nil
end

function StartPresetEdit(initialSettings)
    -- Never stack sessions. Callers are expected to finalise or cancel first.
    if presetEditSession ~= nil then
        return { error = "A preset edit is already in progress" }
    end

    refresh_project()
    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return { error = "No active timeline" }
    end

    local rootFolder = mediaPool:GetRootFolder()
    local templateItem = get_template_item(rootFolder, ANIMATED_CAPTION)
    if not templateItem then
        -- Template missing — trigger auto-import and retry
        get_templates()
        templateItem = get_template_item(rootFolder, ANIMATED_CAPTION)
    end
    if not templateItem then
        return { error = "Could not find '" .. ANIMATED_CAPTION .. "' template in media pool" }
    end

    local ok, err = pcall(function()
        timeline:AddTrack("video")
        local trackIndex = timeline:GetTrackCount("video")
        local fps = tonumber(templateItem:GetClipProperty()["FPS"]) or 24
        local position = timeline:GetStartFrame()

        local appended = mediaPool:AppendToTimeline({ {
            mediaPoolItem = templateItem,
            startFrame = 0,
            endFrame = math.floor(fps * 5), -- 5-second preview clip
            recordFrame = position,
            trackIndex = trackIndex,
        } })
        local timelineItem = appended and appended[1]
        if not timelineItem then
            error("Failed to append preview clip to timeline")
        end

        -- Open caption in Fusion (move playhead over it and open Fusion page)
        timeline:SetCurrentTimecode(timeline:GetStartTimecode())
        local comp = timelineItem:GetFusionCompByIndex(1)
        local tool = comp:FindTool("AutoSubs")

        -- Apply any existing settings so editing an existing preset starts
        -- from its current look rather than macro defaults.
        if tool and initialSettings ~= nil and next(initialSettings) ~= nil then
            pcall(function()
                local setter = tool:GetData("SetInputValues")
                if setter and setter ~= "" then
                    loadstring(setter)()(comp, tool, initialSettings)
                end
            end)
        end

        presetEditSession = {
            trackIndex = trackIndex,
            timelineItem = timelineItem,
            comp = comp,
            tool = tool,
        }
    end)

    if not ok then
        -- Best-effort cleanup so we don't leave an orphan track.
        teardown_preset_edit_session()
        return { error = "Failed to start preset edit: " .. tostring(err) }
    end

    return { ok = true }
end

function CapturePresetSettings()
    if presetEditSession == nil then
        return { error = "No preset edit in progress" }
    end

    local tool = presetEditSession.tool
    if not tool then
        teardown_preset_edit_session()
        return { error = "AutoSubs tool not found in preview composition" }
    end

    local settings = nil
    local ok, err = pcall(function()
        local getter = tool:GetData("GetInputValues")
        if not getter or getter == "" then
            error("Macro is missing GetInputValues helper")
        end
        settings = loadstring(getter)()(tool)
    end)

    -- Always tear down, even on failure, so the user isn't left with a
    -- stranded preview clip on their timeline.
    teardown_preset_edit_session()

    if not ok then
        return { error = "Failed to capture preset settings: " .. tostring(err) }
    end

    dump(settings)
    return { settings = settings or {} }
end

function CancelPresetEdit()
    teardown_preset_edit_session()
    return { ok = true }
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

local function create_response(body)
    local header = "HTTP/1.1 200 OK\r\n" .. "Server: ljsocket/0.1\r\n" .. "Content-Type: application/json\r\n" ..
        "Content-Length: " .. #body .. "\r\n" .. "Connection: close\r\n" .. "\r\n"

    local response = header .. body
    return response
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
                                body = safe_json(timelineInfo)
                            elseif data.func == "GetTemplates" then
                                print("[AutoSubs Server] Retrieving Templates...")
                                local templates = GetTemplates()
                                body = safe_json(templates)
                            elseif data.func == "JumpToTime" then
                                print("[AutoSubs Server] Jumping to time...")
                                JumpToTime(data.seconds)
                                body = safe_json({
                                    message = "Jumped to time"
                                })
                            elseif data.func == "ExportAudio" then
                                print("[AutoSubs Server] Exporting audio...")
                                local audioInfo = ExportAudio(data.outputDir, data.inputTracks, data.exportRange)
                                body = safe_json(audioInfo)
                            elseif data.func == "GetExportProgress" then
                                print("[AutoSubs Server] Getting export progress...")
                                local progressInfo = GetExportProgress()
                                body = safe_json(progressInfo)
                            elseif data.func == "CancelExport" then
                                print("[AutoSubs Server] Cancelling export...")
                                local cancelResult = CancelExport()
                                body = safe_json(cancelResult)
                            elseif data.func == "CheckTrackConflicts" then
                                print("[AutoSubs Server] Checking track conflicts...")
                                local conflictInfo = CheckTrackConflicts(data.filePath, data.trackIndex)
                                body = safe_json(conflictInfo)
                            elseif data.func == "AddSubtitles" then
                                print("[AutoSubs Server] Adding subtitles to timeline...")
                                local result = AddSubtitles(data.filePath, data.trackIndex, data.templateName,
                                    data.conflictMode, data.presetSettings)
                                body = safe_json({
                                    message = "Job completed",
                                    result = result
                                })
                            elseif data.func == "GeneratePreview" then
                                print("[AutoSubs Server] Generating preview...")
                                local previewResult = GeneratePreview(data.speaker, data.templateName,
                                    data.presetSettings, data.exportPath, data.language)
                                body = safe_json(previewResult)
                            elseif data.func == "StartPresetEdit" then
                                print("[AutoSubs Server] Starting caption preset edit...")
                                local result = StartPresetEdit(data.initialSettings)
                                body = safe_json(result)
                            elseif data.func == "CapturePresetSettings" then
                                print("[AutoSubs Server] Capturing caption preset settings...")
                                local result = CapturePresetSettings()
                                body = safe_json(result)
                            elseif data.func == "CancelPresetEdit" then
                                print("[AutoSubs Server] Cancelling caption preset edit...")
                                local result = CancelPresetEdit()
                                body = safe_json(result)
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
                        local errMsg = tostring(err)
                        body = safe_json({
                            error = true,
                            message = "Server handler failed",
                            detail = errMsg,
                            func = data and data.func or nil
                        })
                        print("[AutoSubs Server] handler error (" ..
                            tostring(data and data.func or "<unknown>") .. "): " .. errMsg)
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
        main_app = executable_path
        resources_path = resources_folder

        if ffi.os == "OSX" then
            command_open = 'open ' .. main_app
        elseif ffi.os ~= "Windows" then -- Linux
            command_open = string.format("'%s' &", main_app)
        end

        -- Set package path for module loading and import required modules
        local modules_path = join_path(resources_folder, "modules")
        package.path = package.path .. ";" .. join_path(modules_path, "?.lua")
        socket = require("ljsocket")
        json = require("dkjson")
        luaresolve = require("libavutil")
        font_fallback = require("font_fallback")
        StartServer()
    end
}

return AutoSubs
