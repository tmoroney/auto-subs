---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global, deprecated
--
-- Resolve 21.1 sandboxes the Lua state that runs Workspace > Scripts scripts:
-- io, ffi, package, require, os.execute and bmd.readdir are all nil here.
-- Modules are loaded via AutoSubs_require (see bootstrap.lua) and the bridge
-- to the desktop app is a file mailbox (request.lua read via loadfile;
-- responses written to Fusion.prefs via SetPrefs/SavePrefs).

-- Shared access to the Resolve / Fusion scripting environment (see resolve_env.lua).
local resolve_env = AutoSubs_require("resolve_env")

-- resolve is provided implicitly by the Resolve environment - no need to call Resolve() unless running in terminal
local resolve = resolve_env.get_resolve()
local fusion = resolve_env.get_fusion()

local DEV_MODE = false

-- App version reported by the GetVersion endpoint; used to detect stale servers.
local VERSION = AutoSubs_require("version")

local function join_path(dir, filename)
    local sep = AUTOSUBS_SEP or "/"
    -- Remove trailing separator from dir, if any
    if dir:sub(-1) == sep then
        return dir .. filename
    else
        return dir .. sep .. filename
    end
end

-- Load external libraries. These are required lazily in Init(), so the language
-- server would otherwise infer them as `nil` here and flag every later use.
---@type any
local json = nil
---@type any
local timecode = nil
---@type any
local font_fallback = nil

-- OS SPECIFIC CONFIGURATION
local resources_path
local main_app
-- Full path to the mailbox request file the desktop app writes (set in Init).
local REQUEST_FILE

-- Load Resolve objects
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local mediaPool = project:GetMediaPool()

local CAPTION_TEMPLATE_VERSION = AutoSubs_require("caption_template_version")
local caption_style = AutoSubs_require("caption_style")
local ANIMATED_CAPTION_DISPLAY_NAME = caption_style.DISPLAY_NAME
local ANIMATED_CAPTION = caption_style.versioned_name(CAPTION_TEMPLATE_VERSION)
local AUTOSUBS_BIN = caption_style.BIN_NAME
local MEDIA_POOL_UNAVAILABLE = "Resolve media pool is not available"
local defaultTemplateImportAttempted = false
local lastProjectId = project:GetUniqueId()
-- Result of the last full media pool template scan (see get_templates):
-- valid only while the pool fingerprint below still matches.
local templatesCache = { fingerprint = nil, list = nil }

-- Refresh the cached project / mediaPool references and detect project
-- switches. When the user opens a different Resolve project the old
-- mediaPool no longer contains the AutoSubs Caption template, so we
-- must reset the one-shot import guard so get_templates() will try
-- the import again. The template list cache is per project too.
local function refresh_project()
    project = projectManager:GetCurrentProject()
    mediaPool = project:GetMediaPool()
    local currentId = project:GetUniqueId()
    if currentId ~= lastProjectId then
        defaultTemplateImportAttempted = false
        templatesCache.fingerprint = nil
        templatesCache.list = nil
        lastProjectId = currentId
    end
end


-- Global state for an active caption-preset edit session.
-- Populated by OpenPresetEdit, consumed/cleared by SavePresetEdit or
-- CancelPresetEdit. Holds just enough Resolve handles to read the tool's input
-- values and tear the temporary clip down again.
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
    savedMarks = nil -- raw GetMarkInOut() dict (relative frame values)
}

-- Helper that wraps a Resolve-facing operation in pcall and returns a
-- structured `{ error = <short reason>, detail = <underlying error> }` on
-- failure, or the function's result on success. Used so the frontend error
-- dialog can surface the actual error from Resolve instead of a generic
-- "something went wrong".
local function make_error(short, detail)
    return { error = short, detail = tostring(detail or "") }
end

-- Convert seconds to frames based on the timeline frame rate
local function to_frames(seconds, frameRate)
    return seconds * frameRate
end

-- input of time in seconds
function JumpToTime(seconds)
    local timeline = project:GetCurrentTimeline()
    local frameRate = tonumber(timeline:GetSetting("timelineFrameRate"))
    local frames = to_frames(seconds, frameRate) + timeline:GetStartFrame() + 1
    local tc = timecode.timecode_from_frame_auto(frames, frameRate,
        timeline:GetSetting("timelineDropFrameTimecode"))
    timeline:SetCurrentTimecode(tc)
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

-- Resolve exposes media pool folders / clips as either tables or userdata
-- depending on the host version, so never test for "table" alone.
local function is_api_object(obj)
    local t = type(obj)
    return t == "table" or t == "userdata"
end

-- Resolve can return nil instead of an empty list from GetSubFolderList /
-- GetClipList (e.g. while a project is still loading), which crashes ipairs().
local function safe_list(list)
    if type(list) == "table" then
        return list
    end
    return {}
end

local function call_api(obj, method, ...)
    if not is_api_object(obj) then
        return nil
    end
    local ok, fn = pcall(function() return obj[method] end)
    if not ok or type(fn) ~= "function" then
        return nil
    end
    local callOk, result = pcall(fn, obj, ...)
    if not callOk then
        return nil
    end
    return result
end

-- GetClipProperty(key) can fail on clips that Resolve has not fully resolved
-- yet. Always query a single key: the no-argument form builds a full property
-- dict per clip, which is what made media pool scans expensive.
local function clip_property(clip, key)
    return call_api(clip, "GetClipProperty", key)
end

local function walk_media_pool(folder, onClip)
    if not is_api_object(folder) then
        return
    end

    -- Recurse into subfolders first
    for _, subfolder in ipairs(safe_list(call_api(folder, "GetSubFolderList"))) do
        local stop = walk_media_pool(subfolder, onClip)
        if stop then return true end
    end

    -- Visit all clips in this folder
    for _, clip in ipairs(safe_list(call_api(folder, "GetClipList"))) do
        local stop = onClip(clip, folder)
        if stop then return true end
    end
end

local get_templates
local get_template_item
local get_video_tracks
local get_audio_tracks

local function resolve_template_name(templateName)
    if templateName == ANIMATED_CAPTION_DISPLAY_NAME then
        return ANIMATED_CAPTION
    end
    return templateName
end

local function get_root_subfolder(rootFolder, folderName)
    for _, subfolder in ipairs(safe_list(call_api(rootFolder, "GetSubFolderList"))) do
        if call_api(subfolder, "GetName") == folderName then
            return subfolder
        end
    end
    return nil
end

local function find_template_item(folder, templateName)
    local template, sourceBin
    templateName = resolve_template_name(templateName)
    -- The bundled animated template is versioned ("AutoSubs Caption <date>"),
    -- so an older caption-bin.drb or a version skew between builds must still
    -- match. Any other name is compared exactly.
    local wantsAnimated = caption_style.is_autosubs_template(templateName)
    walk_media_pool(folder, function(clip, clipFolder)
        local clipName = clip_property(clip, "Clip Name")
        if clipName == templateName or (wantsAnimated and caption_style.is_autosubs_template(clipName)) then
            template = clip
            sourceBin = clipFolder
            return true
        end
    end)
    return template, sourceBin
end

local function delete_obsolete_caption_templates(autosubsFolder, currentTemplate)
    local obsoleteTemplates = {}
    local currentTemplateId = call_api(currentTemplate, "GetUniqueId")
    if currentTemplateId == nil then
        -- Without a reliable id for the template we just imported, a cleanup
        -- pass could delete that very clip. Leave the bin untouched instead.
        print("Skipping obsolete caption template cleanup: current template has no unique id")
        return
    end
    for _, clip in ipairs(safe_list(call_api(autosubsFolder, "GetClipList"))) do
        local clipName = clip_property(clip, "Clip Name")
        if call_api(clip, "GetUniqueId") ~= currentTemplateId and caption_style.is_autosubs_template(clipName) then
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

-- Add default template to mediapool if not available (get version with resolve:GetVersion()[1])
local function ensure_default_template(rootFolder)
    local template = find_template_item(rootFolder, ANIMATED_CAPTION)
    if template then
        return template
    end
    if defaultTemplateImportAttempted then
        return nil
    end

    local targetBin = get_root_subfolder(rootFolder, AUTOSUBS_BIN)
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

    local sourceBin
    template, sourceBin = find_template_item(rootFolder, ANIMATED_CAPTION)
    if not template or not sourceBin then
        print("Imported caption bin did not contain '" .. ANIMATED_CAPTION .. "'")
        return nil
    end
    if not targetBin then
        return template
    end

    local moved, moveResult = pcall(function()
        return mediaPool:MoveClips({ template }, targetBin)
    end)
    if not moved or not moveResult then
        print("Failed to move imported caption template into AutoSubs media pool folder")
        return nil
    end

    delete_obsolete_caption_templates(targetBin, template)
    local remainingClips = safe_list(call_api(sourceBin, "GetClipList"))
    if #remainingClips > 0 then
        mediaPool:DeleteClips(remainingClips)
    end
    mediaPool:DeleteFolders({ sourceBin })
    return template
end

-- Cheap structural fingerprint of the media pool: one API call per folder
-- (subfolder list + clip list) rather than one per clip. Used to skip the
-- expensive template scan when nothing moved. It can't see same-count
-- edits (a renamed or swapped title), which is why callers may force a
-- rescan.
local function media_pool_fingerprint(rootFolder)
    local parts = {}
    local function visit(folder)
        for _, subfolder in ipairs(safe_list(call_api(folder, "GetSubFolderList"))) do
            visit(subfolder)
        end
        parts[#parts + 1] = tostring(call_api(folder, "GetName"))
            .. "#" .. tostring(#safe_list(call_api(folder, "GetClipList")))
    end
    if is_api_object(rootFolder) then
        visit(rootFolder)
    end
    return table.concat(parts, "|")
end

-- Get a list of all Text+ templates in the media pool. The scan costs one
-- marshaled Resolve API call per media pool clip, which stalls the mailbox
-- loop for a long time on large pools (the app's template dropdown used to
-- time out waiting for it), so the result is cached per project and only
-- re-scanned when the fingerprint above changes or `force` is set.
get_templates = function(force)
    local rootFolder = call_api(mediaPool, "GetRootFolder")
    if not force and templatesCache.list ~= nil
        and media_pool_fingerprint(rootFolder) == templatesCache.fingerprint then
        return templatesCache.list
    end

    local t = {}
    local hasAnimated = ensure_default_template(rootFolder) ~= nil

    walk_media_pool(rootFolder, function(clip)
        -- Filter on Type first: a single-key lookup per clip instead of a
        -- full GetClipProperty() dict for every clip in the pool.
        if not is_matching_title(clip_property(clip, "Type")) then
            return
        end
        local clipName = clip_property(clip, "Clip Name")
        if clipName == nil then
            return
        end
        -- Any versioned "AutoSubs Caption <version>" clip (and legacy
        -- unversioned copies) collapse into a single user-facing entry.
        if caption_style.is_autosubs_template(clipName) then
            hasAnimated = true
        else
            table.insert(t, { label = clipName, value = clipName })
        end
    end)

    if hasAnimated then
        table.insert(t, 1, { label = ANIMATED_CAPTION_DISPLAY_NAME, value = ANIMATED_CAPTION_DISPLAY_NAME })
    end

    -- Fingerprint after the scan: ensure_default_template may have imported,
    -- moved or deleted clips, so the stored value reflects the final state.
    templatesCache.fingerprint = media_pool_fingerprint(rootFolder)
    templatesCache.list = t
    return t
end

-- Find the template item with the specified name using media pool traversal
get_template_item = find_template_item

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
            -- Two projects can share a name, so anything caching per project
            -- needs the id. Older Resolve builds have no GetUniqueId on
            -- Project, hence the pcall and the empty-string fallback.
            projectId = (function()
                local ok, id = pcall(project.GetUniqueId, project)
                return (ok and type(id) == "string") and id or ""
            end)(),
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

function GetTemplates(force)
    refresh_project()
    return get_templates(force)
end

function GetVersion()
    return { version = VERSION, captionTemplateVersion = CAPTION_TEMPLATE_VERSION }
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
            local playheadPosition = timecode.frame_from_timecode(currentTimecode, tonumber(frameRate))

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
            --
            -- Resolve localizes JobStatus (e.g. "Finalizado", "Concluído",
            -- "Завершено"), so we cannot compare only to the English word
            -- "Complete". A real failure is indicated by a non-empty Error
            -- field or an unfinished CompletionPercentage.
            local jobStatus, jobError, completionPercentage
            if currentExportJob.pid then
                local ok, status = pcall(function()
                    return project:GetRenderJobStatus(currentExportJob.pid)
                end)
                if ok and type(status) == "table" then
                    jobStatus = status["JobStatus"]
                    jobError = status["Error"]
                    completionPercentage = status["CompletionPercentage"]
                end
            end

            local detail
            if jobError and tostring(jobError) ~= "" then
                detail = tostring(jobError)
            elseif type(completionPercentage) == "number" and completionPercentage < 100 then
                detail = "Render job incomplete (" .. tostring(completionPercentage) .. "%)"
                if jobStatus then
                    detail = detail .. ": " .. tostring(jobStatus)
                end
            end

            if detail then
                print("[AutoSubs] Export did not complete successfully: " .. detail)
                return {
                    active = false,
                    progress = currentExportJob.progress,
                    error = true,
                    message = "Audio export failed in Resolve",
                    detail = detail
                }
            end

            -- Normal completion (Resolve may report a localized JobStatus here).
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
-- Request handlers below take the decoded request table, so a field renamed on
-- the TypeScript side is a nil value here rather than a silently shifted
-- positional argument.
function ExportAudio(req)
    local outputDir, inputTracks, exportRange = req.outputDir, req.inputTracks, req.exportRange
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

        -- Resolve may not immediately populate the job list. Prefer the job
        -- whose ID matches the PID we just added; if it isn't visible yet, fall
        -- back to the render settings we configured ourselves instead of picking
        -- an unrelated job from the list.
        local jobInfo
        local renderJobList = project:GetRenderJobList()
        if type(renderJobList) == "table" and #renderJobList > 0 then
            for i = #renderJobList, 1, -1 do
                local j = renderJobList[i]
                if type(j) == "table" and (j["JobId"] == pid or j["Id"] == pid) then
                    jobInfo = j
                    break
                end
            end
            if not jobInfo then
                print("[AutoSubs] Render job PID is not visible in the job list yet: " .. tostring(pid))
            end
        end

        -- Fallback so a missing or empty job list doesn't crash the server.
        if not jobInfo then
            print("[AutoSubs] GetRenderJobList did not return job info for PID " ..
            tostring(pid) .. ", using configured render settings")
            jobInfo = {
                TargetDir = outputDir,
                OutputFilename = exportName .. ".wav",
                MarkIn = renderSettings.MarkIn,
                MarkOut = renderSettings.MarkOut
            }
        end

        -- Use timeline bounds when neither the job record nor our render settings
        -- provide marks, so the offset and progress calculations never divide by zero.
        local timelineStart = timeline:GetStartFrame()
        local timelineEnd = timeline:GetEndFrame()
        local markIn = jobInfo["MarkIn"] or renderSettings.MarkIn or timelineStart
        local markOut = jobInfo["MarkOut"] or renderSettings.MarkOut or timelineEnd

        -- Calculate offset to align subtitles back to timeline (exported audio starts at mark in, not timeline 0)
        local framesFromTimelineStart = markIn - timeline:GetStartFrame()
        local frameRate = timeline:GetSetting("timelineFrameRate") or 24
        local timeOffsetInSeconds = framesFromTimelineStart / frameRate

        local targetDir = jobInfo["TargetDir"] or outputDir
        local outputFilename = jobInfo["OutputFilename"] or (exportName .. ".wav")

        local audioInfo = {
            path = join_path(targetDir, outputFilename),
            markIn = markIn,
            markOut = markOut,
            offset = timeOffsetInSeconds
        }
        currentExportJob.audioInfo = audioInfo

        print("Export started with PID: " .. tostring(pid) .. ", path: " .. audioInfo.path)
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

-- Check for existing clips on a track that would conflict with new subtitles
-- Returns conflict info: { hasConflicts, conflictingClips: [{start, end, name}], trackName }
function CheckTrackConflicts(req)
    local filePath, trackIndex = req.filePath, req.trackIndex
    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return { hasConflicts = false, error = "No active timeline" }
    end
    local timelineStart = timeline:GetStartFrame()
    local frame_rate = timeline:GetSetting("timelineFrameRate")

    -- Subtitle data arrives decoded on the request (the app reads the file
    -- itself); filePath only identifies which transcript it came from.
    local data = req.subtitleData
    if type(data) ~= "table" then
        return {
            hasConflicts = false,
            error = "Could not read subtitle file",
            detail = "request did not include subtitleData"
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

local function load_subtitle_data(req)
    local data = req.subtitleData
    if type(data) ~= "table" then
        return nil, "request did not include subtitleData"
    end
    return data
end

local function get_transcript_id(data, filePath)
    return data["transcriptId"]
        or (data["metadata"] and data["metadata"]["transcriptId"])
        or data["filename"]
        or filePath
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

-- Frame rate of the template clip, falling back to the timeline (and finally
-- 24 fps) when Resolve cannot report the clip's FPS property.
local function template_frame_rate_of(templateItem, timeline)
    local fps = tonumber(clip_property(templateItem, "FPS"))
    if not fps then
        fps = tonumber(call_api(timeline, "GetSetting", "timelineFrameRate"))
    end
    return fps or 24
end

local function get_template(rootFolder, templateName, timeline)
    if not is_api_object(rootFolder) then
        return nil, nil, MEDIA_POOL_UNAVAILABLE
    end
    if templateName == "" then
        templateName = ANIMATED_CAPTION
    end

    templateName = resolve_template_name(templateName)
    local templateItem = nil
    local resolvedName = templateName -- tracks which template was actually found
    if templateName ~= nil and templateName ~= "" then
        templateItem = get_template_item(rootFolder, templateName)
    end
    -- If the template wasn't found, auto-import the default caption-bin.drb
    -- if it hasn't been tried for this project yet, then retry the lookup.
    if not templateItem and templateName ~= nil and templateName ~= "" then
        ensure_default_template(rootFolder)
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

    local template_frame_rate = template_frame_rate_of(templateItem, timeline)
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

local function normalize_speaker_id(id)
    if id == nil then return nil end
    local normalized = tostring(id):match("^%s*(.-)%s*$")
    if normalized == "" or normalized == "?" then return nil end

    local withoutPrefix = normalized:match("^Speaker%s+(.+)$")
    if withoutPrefix then
        normalized = withoutPrefix:match("^%s*(.-)%s*$")
    end
    return normalized
end

local function build_speaker_index_by_id(subtitles)
    local speakerIndexById = {}
    local nextIndex = 1
    for _, subtitle in ipairs(subtitles or {}) do
        local speakerId = normalize_speaker_id(subtitle.speaker_id)
        if speakerId and speakerIndexById[speakerId] == nil then
            speakerIndexById[speakerId] = nextIndex
            nextIndex = nextIndex + 1
        end
    end
    return speakerIndexById
end

local function get_speaker_from_id(speakers, id, speakerIndexById)
    local normalizedId = normalize_speaker_id(id)
    if normalizedId == nil then return nil end

    -- Rust builds the speakers array in first-appearance order while preserving
    -- the engine's raw IDs on segments. Mirror that ordering instead of treating
    -- numeric IDs as array positions.
    local speakerIndex = speakerIndexById and speakerIndexById[normalizedId]
    if speakerIndex and speakers[speakerIndex] ~= nil then
        return speakers[speakerIndex]
    end

    -- Preserve compatibility with legacy documents that predate aggregation.
    local numericId = tonumber(normalizedId)
    if numericId == nil then return nil end
    return speakers[numericId + 1] or speakers[numericId]
end

local function tag_subtitle_tool(tool, transcriptId, segmentIndex, speakerId)
    tool:SetData("AutoSubsTranscriptId", tostring(transcriptId))
    tool:SetData("AutoSubsSegmentIndex", segmentIndex)
    tool:SetData("AutoSubsSpeakerId", speakerId ~= nil and tostring(speakerId) or "")
end

local function find_subtitle_clips(timeline, transcriptId, subtitles, targetSpeakerId)
    local matches = {}
    local stats = { scanned = 0, failed = 0, migrated = 0 }
    local expectedByFrame = {}
    local timelineStart = timeline:GetStartFrame()
    local frameRate = tonumber(timeline:GetSetting("timelineFrameRate"))

    -- Legacy animated captions do not have hidden tags. Index the current
    -- transcript by start frame so matching clips can be tagged on first use.
    if frameRate then
        for index, subtitle in ipairs(subtitles or {}) do
            if subtitle.start ~= nil then
                local frame = math.floor(timelineStart + to_frames(subtitle.start, frameRate) + 0.5)
                expectedByFrame[frame] = { index = index, subtitle = subtitle }
            end
        end
    end

    local wantedTranscript = tostring(transcriptId)
    local wantedSpeaker = targetSpeakerId ~= nil and tostring(targetSpeakerId) or nil
    local trackCount = timeline:GetTrackCount("video")

    for trackIndex = 1, trackCount do
        local items = timeline:GetItemListInTrack("video", trackIndex) or {}
        for _, timelineItem in ipairs(items) do
            stats.scanned = stats.scanned + 1
            local ok, err = pcall(function()
                local compCount = timelineItem:GetFusionCompCount()
                if not compCount or compCount < 1 then return end

                local comp = timelineItem:GetFusionCompByIndex(1)
                if not comp then return end

                local autosubsTool = comp:FindTool("AutoSubs")
                local template = comp:FindTool("Template") or comp:FindToolByID("TextPlus")
                local styleTool = autosubsTool or template
                if not styleTool then return end

                local taggedTranscript = styleTool:GetData("AutoSubsTranscriptId")
                local segmentIndex = tonumber(styleTool:GetData("AutoSubsSegmentIndex"))
                local speakerId = styleTool:GetData("AutoSubsSpeakerId")

                -- Migrate legacy AutoSubs Caption clips conservatively: require
                -- the named macro, matching start frame, and matching text.
                if (taggedTranscript == nil or taggedTranscript == "") and autosubsTool and template then
                    local itemFrame = math.floor(tonumber(timelineItem:GetStart()) + 0.5)
                    local expected = expectedByFrame[itemFrame]
                        or expectedByFrame[itemFrame - 1]
                        or expectedByFrame[itemFrame + 1]
                    if expected then
                        local currentText = template:GetInput("Text")
                        if tostring(currentText) == tostring(expected.subtitle.text) then
                            segmentIndex = expected.index
                            speakerId = expected.subtitle.speaker_id
                            tag_subtitle_tool(styleTool, transcriptId, segmentIndex, speakerId)
                            taggedTranscript = wantedTranscript
                            stats.migrated = stats.migrated + 1
                        end
                    end
                end

                if tostring(taggedTranscript) ~= wantedTranscript then return end
                if wantedSpeaker and tostring(speakerId) ~= wantedSpeaker then return end

                table.insert(matches, {
                    timelineItem = timelineItem,
                    comp = comp,
                    styleTool = styleTool,
                    template = template,
                    isAnimated = autosubsTool ~= nil,
                    segmentIndex = segmentIndex,
                    speakerId = speakerId,
                    trackIndex = trackIndex
                })
            end)
            if not ok then
                stats.failed = stats.failed + 1
                print("[AutoSubs] Failed to inspect timeline clip for batch styling: " .. tostring(err))
            end
        end
    end

    stats.matched = #matches
    return matches, stats
end

local function build_clip_list(subtitles, speakers, speakersExist, trackIndex, templateItem, frame_rate,
                               template_frame_rate, timelineStart, speakerIndexById)
    local joinThreshold = frame_rate
    local clipList = {}
    for i, subtitle in ipairs(subtitles) do
        -- Skip malformed segments (nil start/end) instead of crashing in to_frames().
        if subtitle["start"] == nil or subtitle["end"] == nil then
            print(string.format("[AutoSubs] Skipping subtitle #%d with missing start/end time (start=%s, end=%s)",
                i, tostring(subtitle["start"]), tostring(subtitle["end"])))
            goto continue
        end
        -- Resolve 21 AppendToTimeline rejects non-integer frame values and
        -- returns nil for the whole batch. Snap to nearest timeline frame.
        local start_frame = math.floor(to_frames(subtitle["start"], frame_rate) + 0.5)
        local end_frame = math.floor(to_frames(subtitle["end"], frame_rate) + 0.5)
        if end_frame <= start_frame then
            end_frame = start_frame + 1
        end
        local timeline_pos = timelineStart + start_frame
        local clip_timeline_duration = end_frame - start_frame

        if i < #subtitles then
            local nextSub = subtitles[i + 1]
            if nextSub and nextSub["start"] ~= nil then
                local next_start = timelineStart + math.floor(to_frames(nextSub["start"], frame_rate) + 0.5)
                local frames_between = next_start - (timeline_pos + clip_timeline_duration)
                if frames_between < joinThreshold then
                    clip_timeline_duration = clip_timeline_duration + frames_between + 1
                end
            end
        end

        -- endFrame is template-relative source frames, not timeline frames.
        local duration = math.max(1, math.floor((clip_timeline_duration / frame_rate) * template_frame_rate + 0.5))

        local itemTrack = trackIndex
        if speakersExist then
            local speaker = get_speaker_from_id(speakers, subtitle.speaker_id, speakerIndexById)
            if speaker and speaker.track ~= nil and speaker.track ~= "" then
                itemTrack = speaker.track
            end
        end

        local newClip = {
            mediaPoolItem = templateItem,
            mediaType = 1,
            startFrame = 0,
            endFrame = duration,
            recordFrame = math.floor(timeline_pos + 0.5),
            trackIndex = itemTrack
        }

        table.insert(clipList, newClip)
        ::continue::
    end

    return clipList
end

-- Applies subtitle text + styling to each appended timeline item. Instead of
-- spamming one print per failed clip, we aggregate failures and return a
-- summary so the caller can surface a single clean error.
-- Returns: { failed = N, total = M, firstError = "..." }
-- templateName names the media pool clip these items were appended from:
-- caption_style.apply needs it to tell the bundled macro from a user's own
-- title before running any helper the comp carries.
local function apply_subtitle_text(timelineItems, subtitles, speakers, speakersExist, presetSettings,
                                   speakerIndexById, transcriptId, templateName)
    local startTime = os.clock()
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
                error(
                "clip has no Fusion composition (GetFusionCompCount returned nil) — Resolve either refused to place the clip (blocked append) or the template is incompatible with this Resolve version")
            end
            if fusionCompCount > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local speaker = nil
                if speakersExist then
                    speaker = get_speaker_from_id(speakers, subtitle.speaker_id, speakerIndexById)
                end

                local styleTool = caption_style.apply(comp, {
                    templateName = templateName,
                    text = subtitleText,
                    words = subtitle.words,
                    start = subtitle.start,
                    settings = presetSettings,
                    speaker = speaker,
                })

                -- Hidden Fusion tool data lets later batch operations identify
                -- the transcript segment without changing visible clip names.
                tag_subtitle_tool(styleTool, transcriptId, i, subtitle.speaker_id)

                timelineItem:SetClipColor("Green") -- Visualise updated clips
            end
        end)

        if not success then
            failed = failed + 1
            if firstError == nil then firstError = tostring(err) end
        end
    end

    if noFusionComp > 0 then
        print(string.format(
            "[AutoSubs] %d of %d subtitle clips had no Fusion composition (GetFusionCompCount returned nil). Resolve either refused to place those clips or the template is incompatible with this Resolve version.",
            noFusionComp, #timelineItems))
    end
    if failed > 0 then
        print(string.format("[AutoSubs] Failed to place %d of %d subtitles. First error: %s",
            failed, #timelineItems, tostring(firstError)))
    end

    print(string.format("[AutoSubs] Applied subtitle text to %d clips in %.3f seconds.", #timelineItems, os.clock() - startTime))

    return { failed = failed, total = #timelineItems, firstError = firstError, noFusionComp = noFusionComp }
end

-- Add subtitles to the timeline using the specified template
-- conflictMode: "replace" (delete existing), "skip" (write around conflicts), "new_track" (use new track), nil (default/old behavior)
-- presetSettings: optional opaque table of AutoSubs Caption macro input values
-- (captured via OpenPresetEdit/SavePresetEdit). Ignored for non-animated templates.
function AddSubtitles(req)
    local filePath, trackIndex, templateName = req.filePath, req.trackIndex, req.templateName
    local conflictMode, presetSettings = req.conflictMode, req.presetSettings
    refresh_project()
    resolve:OpenPage("edit")

    -- Wrap placement so restore_user_state() runs on every exit path.
    local result
    local ok, err = pcall(function()
        result = (function()
            local data, loadErr = load_subtitle_data(req)
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
            local speakerIndexById = build_speaker_index_by_id(subtitles)
            local transcriptId = get_transcript_id(data, filePath)

            local speakersExist = false
            if speakers and #speakers > 0 then
                speakersExist = true
            end

            trackIndex = sanitize_track_index(timeline, trackIndex, markIn, markOut)

            local frame_rate = timeline:GetSetting("timelineFrameRate")

            local earlyResult = nil
            trackIndex, subtitles, earlyResult = apply_conflict_mode(timeline, subtitles, trackIndex, conflictMode,
                frame_rate,
                timelineStart)
            if earlyResult then
                return earlyResult
            end

            speakers = sanitize_speaker_tracks(timeline, speakers, trackIndex, markIn, markOut)

            local rootFolder = call_api(mediaPool, "GetRootFolder")
            local templateItem, template_frame_rate, templateErr, resolvedTemplateName = get_template(rootFolder,
                templateName, timeline)
            if not templateItem then
                return make_error("Template not found", templateErr)
            end

            local clipList = build_clip_list(subtitles, speakers, speakersExist, trackIndex, templateItem, frame_rate,
                template_frame_rate, timelineStart, speakerIndexById)

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

            -- AppendToTimeline does not report a blocked append: it returns
            -- truthy "dead" item handles whose methods all return nothing (so
            -- they later surface as GetFusionCompCount() == nil and look like
            -- a version-incompatible template). Detect them by probing a cheap
            -- getter, then retry the blocked clips on a freshly added video
            -- track — an empty track can't have placement conflicts.
            local deadIndices = {}
            for i, item in ipairs(timelineItems) do
                local probeOk, probeVal = pcall(function() return item:GetStart() end)
                if not probeOk or probeVal == nil then
                    table.insert(deadIndices, i)
                end
            end
            if #deadIndices > 0 then
                print(string.format(
                    "[AutoSubs] %d of %d appended clips are dead handles (blocked append) — retrying on a fresh video track",
                    #deadIndices, #timelineItems))
                local addOk, added = pcall(function() return timeline:AddTrack("video") end)
                if addOk and added then
                    local newTrackIndex = timeline:GetTrackCount("video")
                    local retryList = {}
                    for _, i in ipairs(deadIndices) do
                        clipList[i].trackIndex = newTrackIndex
                        table.insert(retryList, clipList[i])
                    end
                    local retryOk, retryItems = pcall(function()
                        return mediaPool:AppendToTimeline(retryList)
                    end)
                    if retryOk and type(retryItems) == "table" then
                        for j, i in ipairs(deadIndices) do
                            timelineItems[i] = retryItems[j]
                        end
                        print(string.format("[AutoSubs] Retried %d blocked clips on new video track %d",
                            #deadIndices, newTrackIndex))
                    else
                        print("[AutoSubs] Retry append on fresh track failed: " .. tostring(retryItems))
                    end
                else
                    print("[AutoSubs] Could not add a video track for the blocked-append retry")
                end
            end

            -- Use the resolved template name so a fallback to ANIMATED_CAPTION still
            -- enables the animated-text path.
            local isAnimated = caption_style.is_autosubs_template(resolvedTemplateName)

            -- Auto-swap the caption Font for non-Latin transcript languages when the
            -- user is still on the macro's default font. Uses the transcript JSON's
            -- `language` field so older transcripts in a different language still get
            -- the right font even if the app's current language setting has moved on.
            local fontSwap = nil
            if isAnimated and font_fallback then
                presetSettings, fontSwap = font_fallback.maybe_override(presetSettings, data["language"])
            end

            local applyStats = apply_subtitle_text(timelineItems, subtitles, speakers, speakersExist,
                presetSettings, speakerIndexById, transcriptId, resolvedTemplateName)

            -- Force timeline refresh by jumping to the first subtitle
            if subtitles and #subtitles > 0 then
                JumpToTime(subtitles[1].start)
            end

            -- If some (but not all) clips failed to receive text/styling, still report
            -- success but include a warning summary so the UI can mention it.
            if applyStats and applyStats.failed > 0 and applyStats.failed < applyStats.total then
                local warning = string.format("Failed to place %d of %d subtitles", applyStats.failed, applyStats.total)
                if applyStats.noFusionComp and applyStats.noFusionComp > 0 then
                    warning = warning ..
                    string.format(" (%d clips were not placed or had no Fusion composition)",
                        applyStats.noFusionComp)
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
                    short = short ..
                    " — the caption clips could not be placed on the timeline (Resolve refused the append) or the template is incompatible with this Resolve version."
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

function BatchApplyStyle(req)
    local filePath, targetSpeakerId, presetSettings = req.filePath, req.targetSpeakerId, req.presetSettings
    refresh_project()

    local data, loadErr = load_subtitle_data(req)
    if not data then
        return make_error("Failed to load subtitle file", loadErr)
    end

    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return make_error("Failed to apply caption styles", "No active timeline in Resolve")
    end

    local subtitles = data["segments"] or {}
    if #subtitles == 0 then
        return make_error("Failed to apply caption styles", "Transcript has no segments")
    end

    local speakers = data["speakers"] or {}
    local speakerIndexById = build_speaker_index_by_id(subtitles)
    local transcriptId = get_transcript_id(data, filePath)
    local matches, discovery = find_subtitle_clips(
        timeline,
        transcriptId,
        subtitles,
        targetSpeakerId
    )

    local fontSwap = nil
    if presetSettings ~= nil and next(presetSettings) ~= nil and font_fallback then
        presetSettings, fontSwap = font_fallback.maybe_override(presetSettings, data["language"])
    end

    local updated = 0
    local skipped = 0
    local failed = 0
    local firstError = nil

    for _, match in ipairs(matches) do
        local ok, err = pcall(function()
            local didUpdate = false

            local speaker = get_speaker_from_id(speakers, match.speakerId, speakerIndexById)

            if match.isAnimated then
                local clipSettings = caption_style.with_speaker(presetSettings, speaker)
                if next(clipSettings) ~= nil then
                    caption_style.write(match.comp, match.styleTool, clipSettings)
                    didUpdate = true
                end
            else
                didUpdate = caption_style.apply_speaker_to_textplus(match.styleTool, speaker)
            end

            if didUpdate then
                updated = updated + 1
            else
                skipped = skipped + 1
            end
        end)

        if not ok then
            failed = failed + 1
            if firstError == nil then firstError = tostring(err) end
        end
    end

    if #matches > 0 and failed == #matches then
        return {
            error = "Failed to apply caption styles",
            detail = firstError,
            matched = #matches,
            failed = failed
        }
    end

    return {
        ok = true,
        matched = #matches,
        updated = updated,
        skipped = skipped,
        failed = failed,
        scanned = discovery.scanned,
        inspectionFailed = discovery.failed,
        migrated = discovery.migrated,
        warning = failed > 0 and ("Failed to update " .. failed .. " caption clips") or nil,
        detail = firstError,
        fontSwap = fontSwap
    }
end

-- Which video track holds this item. Resolve hands back a fresh proxy on each
-- call, so fall back to the unique id when identity comparison comes up empty.
local function track_index_of_item(timeline, target)
    if not (timeline and target) then return nil end
    local okId, targetId = pcall(target.GetUniqueId, target)
    local ok, count = pcall(timeline.GetTrackCount, timeline, "video")
    if not ok or type(count) ~= "number" then return nil end
    for index = count, 1, -1 do
        local listed, items = pcall(timeline.GetItemListInTrack, timeline, "video", index)
        if listed and type(items) == "table" then
            for _, item in ipairs(items) do
                if item == target then return index end
                if okId and targetId then
                    local gotId, id = pcall(item.GetUniqueId, item)
                    if gotId and id == targetId then return index end
                end
            end
        end
    end
    return nil
end

-- Export the frame under the playhead to a PNG in `exportDir` via Resolve's
-- own still export and return its path, or "" plus an error message. This
-- deliberately stays on the Resolve API: on Resolve 21.1 every route that
-- renders through the Fusion comp from a script state (Composition:Render,
-- RunScript, Execute) either does nothing or crashes Resolve.
local function extract_frame(timeline, timelineItem, exportDir)
    local function debug_log(message)
        print("[AutoSubs] " .. os.date("%H:%M:%S") .. " " .. tostring(message))
    end

    debug_log("enter")
    local clipStart, clipEnd = timelineItem:GetStart(), timelineItem:GetEnd()
    if not (clipStart and clipEnd and clipEnd > clipStart) then
        return "", "preview clip has no duration"
    end
    local frame = math.floor((clipStart + clipEnd) / 2)
    local outputPath = join_path(exportDir, "subtitle-preview-" .. frame .. ".png")

    -- Video tracks we disable, to re-enable afterwards.
    local trackStates = {}
    local ok, err = pcall(function()
        -- Hide every other video track so the still is the caption on black.
        local count = timeline:GetTrackCount("video")
        local previewTrack = track_index_of_item(timeline, timelineItem)
        if not previewTrack then
            error("could not locate the preview clip's track")
        end
        for i = 1, count do
            if i ~= previewTrack then
                local enabled = timeline:GetIsTrackEnabled("video", i)
                if enabled then
                    -- Record first so a throw still gets the track restored.
                    trackStates[i] = true
                    if not timeline:SetTrackEnable("video", i, false) then
                        error("could not disable video track " .. i)
                    end
                end
            end
        end

        -- Park the playhead mid clip so the viewer shows the settled caption.
        local frameRate = tonumber(timeline:GetSetting("timelineFrameRate"))
        local tc = timecode.timecode_from_frame_auto(frame, frameRate,
            timeline:GetSetting("timelineDropFrameTimecode"))
        if not timeline:SetCurrentTimecode(tc) then
            error("could not move the playhead to the preview clip")
        end

        -- Give the viewer a moment to draw the frame, then export it.
        bmd.wait(0.5)
        debug_log("exporting still for frame " .. frame)
        local exported = project:ExportCurrentFrameAsStill(outputPath)
        debug_log("ExportCurrentFrameAsStill returned " .. tostring(exported))
        if exported ~= true then
            error("ExportCurrentFrameAsStill returned " .. tostring(exported))
        end
        local deadline = os.time() + 10
        while not bmd.fileexists(outputPath) and os.time() < deadline do
            bmd.wait(0.1)
        end
        if not bmd.fileexists(outputPath) then
            error("still export produced no image at " .. outputPath)
        end
    end)

    -- Always restore the tracks we disabled, and say which ones would not come
    -- back: a preview that quietly leaves the user's footage hidden is worse
    -- than no preview.
    local stuck = {}
    for i, _ in pairs(trackStates) do
        local called, restored = pcall(timeline.SetTrackEnable, timeline, "video", i, true)
        if not (called and restored) then
            stuck[#stuck + 1] = i
        end
    end
    if #stuck > 0 then
        table.sort(stuck)
        local message = "could not re-enable video track(s) " .. table.concat(stuck, ", ")
            .. "; turn them back on in the timeline"
        if not ok then message = tostring(err) .. "; " .. message end
        print("[AutoSubs] extract_frame: " .. message)
        return "", message
    end
    if not ok then
        print("[AutoSubs] extract_frame failed: " .. tostring(err))
        return "", tostring(err)
    end
    return outputPath
end

-- place example subtitle on timeline with theme and export frame
-- `language` (optional): ISO code of the transcript this preview represents,
-- used for language-aware font fallback on the AutoSubs Caption macro.
function GeneratePreview(req)
    local speaker, templateName = req.speaker, req.templateName
    local presetSettings, exportDir, language = req.presetSettings, req.exportDir, req.language
    refresh_project()
    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return make_error("Failed to generate preview", "No active timeline in Resolve")
    end
    local rootFolder = call_api(mediaPool, "GetRootFolder")
    if not rootFolder then
        return make_error("Failed to generate preview", MEDIA_POOL_UNAVAILABLE)
    end

    -- Resolve the template item
    local templateItem = get_template_item(rootFolder, templateName)
    if not templateItem then
        -- Template missing — trigger auto-import and retry
        ensure_default_template(rootFolder)
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
    local fps = template_frame_rate_of(templateItem, timeline)

    local appendOk, appended = pcall(function()
        return mediaPool:AppendToTimeline({ {
            mediaPoolItem = templateItem,
            startFrame = 0,
            endFrame = math.floor(fps * 5), -- 5-second preview clip
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

    local isAnimated = caption_style.is_autosubs_template(templateName)
    local fontSwap = nil
    if isAnimated and font_fallback then
        presetSettings, fontSwap = font_fallback.maybe_override(presetSettings, language)
    end

    local savedTimecode = nil
    pcall(function() savedTimecode = timeline:GetCurrentTimecode() end)

    local outputPath, outputErr = nil, nil
    local success, err = pcall(function()
        if timelineItem:GetFusionCompCount() > 0 then
            local comp = timelineItem:GetFusionCompByIndex(1)

            -- A still frame cannot show the animation, so the preview text is
            -- given word timings that put it mid-reveal rather than blank.
            local previewWords = {
                { word = "Subtitle", start = 0.0, ["end"] = 0.7 },
                { word = " Example", start = 0.8, ["end"] = 1.5 },
                { word = " Text",    start = 1.6, ["end"] = 2.3 },
            }

            local styleTool = caption_style.apply(comp, {
                templateName = templateName,
                text = "Subtitle Example Text",
                words = previewWords,
                start = 0,
                settings = presetSettings,
                speaker = speaker,
            })

            if fontSwap and fontSwap.to then
                pcall(function() styleTool:SetInput("Font", fontSwap.to) end)
            end

            outputPath, outputErr = extract_frame(timeline, timelineItem, exportDir)
        end
    end)

    -- Always clean up, even on failure, so the user isn't left with a stray track.
    pcall(function() timeline:DeleteClips({ timelineItem }) end)
    pcall(function() timeline:DeleteTrack("video", trackIndex) end)
    if savedTimecode then
        pcall(function() timeline:SetCurrentTimecode(savedTimecode) end)
    end

    if not success then
        return make_error("Failed to generate preview", err)
    end
    if not outputPath or outputPath == "" then
        return make_error("Failed to generate preview",
            outputErr or "Template has no Fusion composition to render from")
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
-- The three endpoints below are one per user action:
--   OpenPresetEdit   -> drops a caption clip on a temp track, parks on it.
--   SavePresetEdit   -> reads tool inputs, renders the thumbnail, closes.
--   CancelPresetEdit -> closes without reading.
--
-- The clip stays on the timeline for the whole session so the user can tweak
-- its controls and watch the animation play, and so saving is read-plus-render
-- rather than append-render-delete. The page is left alone: the Inspector
-- exposes the macro's controls on the edit page, so there is no need to drag
-- the user over to Fusion. The session remembers the user's playhead position
-- and restores it when the clip comes off the timeline.
-- ---------------------------------------------------------------------------

-- Name given to the temporary track, so teardown can find it again by identity.
local PRESET_EDIT_TRACK_NAME = "AutoSubs Preview"

-- Stamped on the preview clip as a marker. The track name on its own is not
-- proof of ownership -- a user is free to have a track called "AutoSubs
-- Preview" -- and cleanup deletes whole tracks, so every clip has to say it is
-- ours before anything is removed.
local PRESET_EDIT_MARKER = "AutoSubsPresetEdit"

local function mark_preset_edit_item(timelineItem)
    pcall(function()
        timelineItem:AddMarker(0, "Blue", PRESET_EDIT_TRACK_NAME,
            "Temporary AutoSubs preset preview clip", 1, PRESET_EDIT_MARKER)
    end)
end

local function is_preset_edit_item(item)
    if not item then return false end
    local ok, marker = pcall(item.GetMarkerByCustomData, item, PRESET_EDIT_MARKER)
    return ok and type(marker) == "table" and next(marker) ~= nil
end

-- A track is ours only if everything on it is a clip we stamped. An empty
-- track cannot prove anything, so it counts as the user's.
local function preset_edit_track_is_ours(timeline, index)
    local ok, items = pcall(timeline.GetItemListInTrack, timeline, "video", index)
    if not ok or type(items) ~= "table" or #items == 0 then return false end
    for _, item in ipairs(items) do
        if not is_preset_edit_item(item) then return false end
    end
    return true
end

-- Find the preview track by name and ownership. A stored index goes stale the
-- moment the user adds or removes a video track mid session, and deleting by a
-- stale index would delete one of their tracks. A same-named track of theirs is
-- left alone, as is an empty one: a stray empty track beats deleting their work.
local function find_preset_edit_track(timeline)
    if not timeline then return nil end
    local ok, count = pcall(timeline.GetTrackCount, timeline, "video")
    if not ok or type(count) ~= "number" then return nil end
    for index = count, 1, -1 do
        local named, name = pcall(timeline.GetTrackName, timeline, "video", index)
        if named and name == PRESET_EDIT_TRACK_NAME and preset_edit_track_is_ours(timeline, index) then
            return index
        end
    end
    return nil
end

-- Look up one of the project's timelines by unique id, for when the user has
-- switched timelines mid session: cleanup still has to reach the timeline the
-- preview clip actually sits on.
local function find_timeline_by_id(timelineId)
    if not (project and timelineId) then return nil end
    local ok, count = pcall(project.GetTimelineCount, project)
    if not ok or type(count) ~= "number" then return nil end
    for index = 1, count do
        local got, candidate = pcall(project.GetTimelineByIndex, project, index)
        if got and candidate then
            local hasId, id = pcall(candidate.GetUniqueId, candidate)
            if hasId and id == timelineId then return candidate end
        end
    end
    return nil
end

-- Remove the temp clip + track, if any, and return to the edit page in case
-- the user wandered off to Fusion mid session. Safe to call without an active
-- session.
local function teardown_preset_edit_session()
    local session = presetEditSession
    presetEditSession = nil

    local timeline = project and project:GetCurrentTimeline()

    -- Only ever touch the timeline the clip was added to: after a timeline
    -- switch the current one is somewhere else entirely. Go and fetch the
    -- session's own timeline rather than giving up, which used to strand the
    -- preview clip and its track until the user came back and edited a preset
    -- there again.
    -- Closing the timeline leaves no current one at all, which is just as much
    -- a reason to go looking for the session's own as having switched to
    -- another. Only an unreadable id on a timeline we do have is taken as a
    -- match, so a Resolve build without GetUniqueId still cleans up in place.
    if session then
        local sameTimeline = timeline ~= nil
        if timeline then
            pcall(function()
                sameTimeline = timeline:GetUniqueId() == session.timelineId
            end)
        end
        if not sameTimeline then
            timeline = find_timeline_by_id(session.timelineId)
        end
    end

    -- The track has to be identified before the clip goes: once it is empty
    -- nothing on it can show it was ours.
    local trackIndex = nil
    if timeline and session and session.timelineItem then
        local candidate = track_index_of_item(timeline, session.timelineItem)
        -- Only the track our preview clip has to itself. The user may have
        -- dropped clips of their own on it mid session.
        if candidate and preset_edit_track_is_ours(timeline, candidate) then
            trackIndex = candidate
        end
        pcall(function() timeline:DeleteClips({ session.timelineItem }) end)
    elseif timeline then
        trackIndex = find_preset_edit_track(timeline)
    end

    if timeline and trackIndex then
        pcall(function() timeline:DeleteTrack("video", trackIndex) end)
    end

    if timeline and session and session.timecode then
        pcall(function() timeline:SetCurrentTimecode(session.timecode) end)
    end

    pcall(function() resolve:OpenPage("edit") end)
end

-- Remove a preview track left behind by a crash, a server restart or a hot
-- reload: the session only ever lived in memory, so nothing else would. Only
-- a track carrying nothing but our own stamped clips is touched.
local function sweep_orphan_preset_edit_track(timeline)
    if presetEditSession ~= nil then return end
    local trackIndex = find_preset_edit_track(timeline)
    if not trackIndex then return end
    print("[AutoSubs] Removing stranded '" .. PRESET_EDIT_TRACK_NAME .. "' track")
    pcall(function()
        local items = timeline:GetItemListInTrack("video", trackIndex)
        if items and #items > 0 then
            timeline:DeleteClips(items)
        end
    end)
    pcall(function() timeline:DeleteTrack("video", trackIndex) end)
end

function OpenPresetEdit(req)
    local initialSettings = req and req.initialSettings

    -- Never stack sessions. Callers finalise or cancel first.
    if presetEditSession ~= nil then
        return { error = "A caption is already open for editing" }
    end

    refresh_project()
    local timeline = project:GetCurrentTimeline()
    if not timeline then
        return { error = "No active timeline" }
    end

    sweep_orphan_preset_edit_track(timeline)

    local rootFolder = mediaPool and mediaPool:GetRootFolder()
    if not rootFolder then
        return { error = "Could not read the media pool" }
    end
    local templateItem = get_template_item(rootFolder, ANIMATED_CAPTION)
    if not templateItem then
        -- Template missing: trigger auto-import and retry.
        ensure_default_template(rootFolder)
        templateItem = get_template_item(rootFolder, ANIMATED_CAPTION)
    end
    if not templateItem then
        return { error = "Could not find '" .. ANIMATED_CAPTION .. "' template in media pool" }
    end

    -- Read before the protected block so the failure path below can restore
    -- it even when setup throws before the session exists.
    local originalTimecode = nil
    pcall(function() originalTimecode = timeline:GetCurrentTimecode() end)

    local ok, err = pcall(function()
        timeline:AddTrack("video")
        local trackIndex = timeline:GetTrackCount("video")
        pcall(timeline.SetTrackName, timeline, "video", trackIndex, PRESET_EDIT_TRACK_NAME)

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

        -- Stamp it before anything else can go wrong: cleanup will not remove a
        -- track it cannot see an owned clip on.
        mark_preset_edit_item(timelineItem)

        -- Park the playhead at the middle of the preview clip: the animation
        -- has settled by then, so the caption reads as it will on export, and
        -- the clip's controls are what the Inspector shows.
        local parked = false
        local clipStart = timelineItem:GetStart()
        local clipEnd = timelineItem:GetEnd()
        local frameRate = tonumber(timeline:GetSetting("timelineFrameRate")) or fps
        if clipStart and clipEnd and clipEnd > clipStart then
            local centreFrame = math.floor((clipStart + clipEnd) / 2)
            local tc = timecode.timecode_from_frame_auto(centreFrame, frameRate,
                timeline:GetSetting("timelineDropFrameTimecode"))
            parked = timeline:SetCurrentTimecode(tc) and true or false
        end
        if not parked then
            timeline:SetCurrentTimecode(timeline:GetStartTimecode())
        end

        local comp = timelineItem:GetFusionCompByIndex(1)
        local tool = comp and comp:FindTool("AutoSubs")

        -- Seed with the preset's current look so editing starts from it
        -- rather than from the macro defaults. caption_style owns reading and
        -- writing the macro's inputs, here as everywhere else.
        if tool and initialSettings ~= nil and next(initialSettings) ~= nil then
            pcall(caption_style.write, comp, tool, initialSettings)
        end

        presetEditSession = {
            timelineId = timeline:GetUniqueId(),
            timelineItem = timelineItem,
            comp = comp,
            tool = tool,
            timecode = originalTimecode,
        }
    end)

    if not ok then
        -- Best-effort cleanup so we do not leave an orphan track. Without a
        -- session teardown does not know where the playhead was, so put it back
        -- here.
        teardown_preset_edit_session()
        if originalTimecode then
            pcall(function() timeline:SetCurrentTimecode(originalTimecode) end)
        end
        return { error = "Failed to open the caption for editing: " .. tostring(err) }
    end

    return { ok = true }
end

function SavePresetEdit(req)
    local exportDir = req and req.exportDir

    if presetEditSession == nil then
        return { error = "No caption is open for editing" }
    end

    local tool = presetEditSession.tool
    if not tool then
        teardown_preset_edit_session()
        return { error = "AutoSubs tool not found in the preview composition" }
    end

    local settings = nil
    local ok, err = pcall(function()
        settings = caption_style.read(tool)
    end)

    -- Always close, even on failure, so the user is never left with a stray
    -- preview clip. The thumbnail is rendered afterwards from a fresh clip so
    -- the still shows the saved settings on their own, with the session clip
    -- and the user's other tracks out of the picture.
    teardown_preset_edit_session()

    if not ok then
        return { error = "Failed to read the caption settings: " .. tostring(err) }
    end

    -- Render the thumbnail from the captured settings, the same path the
    -- gallery's re-render uses. Once per save, not once per tweak.
    local previewPath, previewError
    if type(exportDir) == "string" and exportDir ~= "" then
        local previewOk, result = pcall(GeneratePreview, {
            templateName = ANIMATED_CAPTION,
            presetSettings = settings,
            exportDir = exportDir,
        })
        if previewOk and type(result) == "table" and result.path then
            previewPath = result.path
        elseif previewOk and type(result) == "table" then
            previewError = (result.detail and result.detail ~= "" and result.detail)
                or result.error
                or "Preset preview render produced no image"
        else
            previewError = tostring(result)
        end
        if previewError then
            print("[AutoSubs] Preset preview render failed: " .. tostring(previewError))
        end
    end

    return { settings = settings or {}, previewPath = previewPath, previewError = previewError }
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


-- ---------------------------------------------------------------------------
-- Request handlers
--
-- One entry per exposed function. Each takes the decoded request table and
-- returns the response value; a handler that stops or reloads the server
-- returns a control table as its second result. Adding a function means adding
-- an entry here and a wrapper in `src/api/resolve-api.ts`, and nothing else.
-- ---------------------------------------------------------------------------
local handlers = {
    GetTimelineInfo = function() return GetTimelineInfo() end,
    GetTemplates = function(req) return GetTemplates(req and req.force) end,
    GetVersion = function() return GetVersion() end,
    GetExportProgress = function() return GetExportProgress() end,
    CancelExport = function() return CancelExport() end,
    ExportAudio = function(req) return ExportAudio(req) end,
    CheckTrackConflicts = function(req) return CheckTrackConflicts(req) end,
    BatchApplyStyle = function(req) return BatchApplyStyle(req) end,
    GeneratePreview = function(req) return GeneratePreview(req) end,
    OpenPresetEdit = function(req) return OpenPresetEdit(req) end,
    SavePresetEdit = function(req) return SavePresetEdit(req) end,
    CancelPresetEdit = function() return CancelPresetEdit() end,

    JumpToTime = function(req)
        JumpToTime(req.seconds)
        return { message = "Jumped to time" }
    end,

    AddSubtitles = function(req)
        -- Kept nested under `result` for backwards compatibility with the
        -- frontend wrapper, which unwraps both levels when checking for errors.
        return { message = "Job completed", result = AddSubtitles(req) }
    end,

    Ping = function() return { message = "Pong" } end,

    ReloadServer = function()
        return { message = "Reloading server" }, { quit = true, reload = true }
    end,

    Exit = function()
        return { message = "Server shutting down" }, { quit = true }
    end,
}

-- Write an ack / response for a request into Fusion.prefs. Rust polls the
-- prefs file on disk; SetPrefs + SavePrefs is the only channel back that the
-- sandboxed scripting state still allows.
local function bridge_write(key, value)
    if not fusion then
        return
    end
    -- Retry a few times: SavePrefs can transiently fail while Resolve is
    -- writing the file itself.
    for _ = 1, 5 do
        local ok = pcall(function()
            fusion:SetPrefs(key, value)
            fusion:SavePrefs()
        end)
        if ok then
            return
        end
        bmd.wait(0.05)
    end
end

local function bridge_ack(id)
    bridge_write("Global.AutoSubsBridge.Ack", id)
end

local function bridge_respond(id, body_json)
    bridge_write("Global.AutoSubsBridge.Response", id .. ":" .. AutoSubs_base64(body_json))
end

-- Claim a mailbox request so only one loop handles it. A raced takeover or
-- double launch can briefly leave two loops polling the same mailbox; the
-- claim lives in shared (in-memory) prefs and is decided last-writer-wins
-- after a settle window, so a request is never handled twice.
local function bridge_claim(req_id, instance_id)
    if not fusion then
        return true
    end
    local key = "Global.AutoSubsBridge.Claim"
    local mine = instance_id .. ":" .. req_id
    local ok, claim = pcall(fusion.GetPrefs, fusion, key)
    if ok and type(claim) == "string" and claim ~= mine
        and claim:sub(-(#req_id + 1)) == ":" .. req_id then
        return false -- another loop already claimed this request
    end
    pcall(fusion.SetPrefs, fusion, key, mine)
    bmd.wait(0.15)
    local ok2, final = pcall(fusion.GetPrefs, fusion, key)
    return ok2 and final == mine
end

function StartServer()
    -- File-mailbox loop: the desktop app drops request.lua in the shared
    -- mailbox directory; we ack it, run the handler, and write the response
    -- into Fusion.prefs (see resolve_bridge.rs for the other side).
    local quitServer = false
    local shouldReload = false
    -- Last handled request id lives in the AUTOSUBS_LAST_REQUEST_ID global
    -- so it survives hot-reloads: a lingering request file can't be
    -- re-dispatched after ReloadServer.
    -- Handshake identity (see bootstrap.lua): a loop exits when the Stop pref
    -- changes from the value it saw at startup, so a Stop aimed at a previous
    -- loop (or a stale one persisted to disk) never kills a fresh loop.
    -- Request claims name this incarnation so a duplicate can't re-run them.
    local stop_snapshot = ""
    local last_probe = ""
    if fusion then
        local ok, s = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Stop")
        if ok and type(s) == "string" then
            stop_snapshot = s
        end
        -- Same for Probe: a token persisted to disk by an earlier SavePrefs
        -- must not be re-acked on behalf of a launcher that asked ages ago.
        local pok, p = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Probe")
        if pok and type(p) == "string" then
            last_probe = p
        end
    end
    local instance_id = rawget(_G, "AUTOSUBS_OWNER") or tostring({})
    local pref_tick = 0

    -- If a launch claimed the bridge while we were offline (e.g. during a
    -- reload), it owns it now — bow out instead of running a second loop.
    if fusion then
        local ok, owner = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Owner")
        if ok and type(owner) == "string" and owner ~= "" and owner ~= instance_id then
            return
        end
    end

    while not quitServer do
        -- Resident-bridge handshake (see bootstrap.lua): every bound fusion:
        -- call is marshaled through Resolve's UI event queue, and a queued
        -- prefs event landing during Resolve's shutdown teardown has crashed
        -- the app — so the idle loop touches prefs only ~2x/sec (10 ticks of
        -- the 50 ms wait) and writes nothing at all unless probed. In-memory
        -- prefs only — no SavePrefs, so this never touches disk.
        --   Stop: a manual launch asks us to exit (value changed from the
        --         snapshot taken above).
        --   Probe: a launcher asking "are you alive" — echo the token into
        --         ProbeAck once, when it changes.
        --   Owner: a foreign token means a launch claimed the bridge while
        --         we were busy — bow out instead of running a second loop.
        pref_tick = pref_tick + 1
        if fusion and pref_tick >= 10 then
            pref_tick = 0
            local stop_ok, stop = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Stop")
            if stop_ok and type(stop) == "string" and stop ~= "" and stop ~= stop_snapshot then
                quitServer = true
            end
            local probe_ok, probe = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Probe")
            if probe_ok and type(probe) == "string" and probe ~= "" and probe ~= last_probe then
                last_probe = probe
                pcall(fusion.SetPrefs, fusion, "Global.AutoSubsBridge.ProbeAck", probe)
            end
            local own_ok, owner = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Owner")
            if own_ok and type(owner) == "string" and owner ~= "" and owner ~= instance_id then
                quitServer = true
            end
        end

        if bmd.fileexists(REQUEST_FILE) then
            -- nil on a half-written/garbage file: just retry next tick
            local chunk = loadfile(REQUEST_FILE)
            local ok, req = false, nil
            if chunk then
                ok, req = pcall(chunk)
            end
            if ok and type(req) == "table" and type(req.id) == "string"
                and req.id ~= AUTOSUBS_LAST_REQUEST_ID then
                AUTOSUBS_LAST_REQUEST_ID = req.id

                -- Request ids are unix_millis * 1000 + counter, and Rust only
                -- writes a request after the previous response, so a
                -- legitimate request is always fresh — unless it queued in
                -- the mailbox behind a handler that outlived its app-side
                -- timeout, which can park it for over a minute. Anything
                -- older than 120 s is a leftover (e.g. an Exit from a
                -- previous app run): record it as handled without acking or
                -- responding.
                local req_millis = tonumber(req.id)
                local stale = req_millis ~= nil
                    and (os.time() * 1000 - math.floor(req_millis / 1000) > 120000)
                if stale then
                    print("[AutoSubs Server] Ignoring stale request id " .. req.id)
                else
                    -- Ack before claiming: the ack is the app's only liveness
                    -- signal on a short deadline, while the claim costs
                    -- several marshaled prefs round trips plus a settle wait,
                    -- so answering "seen" first keeps a congested Resolve UI
                    -- queue from looking like a dead bridge.
                    bridge_ack(req.id)

                    if bridge_claim(req.id, instance_id) then
                        local data, _, jerr = json.decode(req.body, 1, nil)

                        local body = nil
                        local success, err = pcall(function()
                            if data ~= nil then
                                local handler = handlers[data.func]
                                if handler then
                                    print("[AutoSubs Server] " .. tostring(data.func))
                                    local result, control = handler(data)
                                    body = safe_json(result == nil and { message = "OK" } or result)
                                    if control then
                                        quitServer = control.quit or quitServer
                                        shouldReload = control.reload or shouldReload
                                        -- Wind down a raced duplicate too: it
                                        -- would otherwise outlive an Exit.
                                        if control.quit and fusion then
                                            pcall(fusion.SetPrefs, fusion,
                                                "Global.AutoSubsBridge.Stop",
                                                tostring(os.time()) .. " " .. tostring({}))
                                        end
                                    end
                                else
                                    print("Invalid function name: " .. tostring(data.func))
                                    body = safe_json({ error = true, message = "Invalid function name",
                                        func = data.func })
                                end
                            else
                                body = safe_json({ message = "Invalid JSON data" })
                                print("Invalid JSON data: " .. tostring(jerr))
                            end
                        end)

                        -- Ensure we always return a body
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

                        bridge_respond(req.id, body)
                    end
                    -- A lost claim means a racing loop owns the request and
                    -- will respond; the id is already marked handled either
                    -- way, so it won't be re-claimed every tick.
                end
            end
        end
        bmd.wait(0.05)
    end

    -- Leaving the loop (Stop takeover or Exit): clear the handshake keys so a
    -- waiting manual launch can proceed and nothing sees a stale heartbeat —
    -- but only while we still own the bridge, or a busy loop that lost a
    -- takeover would erase the winner's heartbeat on its way out. A reload
    -- keeps ownership: the new incarnation is the same owner, and clearing it
    -- would let a launch mid-reload claim the bridge and double the loops.
    if fusion then
        local owner_ok, owner = pcall(fusion.GetPrefs, fusion, "Global.AutoSubsBridge.Owner")
        if not owner_ok or type(owner) ~= "string" or owner == "" or owner == instance_id then
            pcall(fusion.SetPrefs, fusion, "Global.AutoSubsBridge.Stop", "")
            pcall(fusion.SetPrefs, fusion, "Global.AutoSubsBridge.Probe", "")
            pcall(fusion.SetPrefs, fusion, "Global.AutoSubsBridge.ProbeAck", "")
            if not shouldReload then
                pcall(fusion.SetPrefs, fusion, "Global.AutoSubsBridge.Heartbeat", "0")
                pcall(fusion.SetPrefs, fusion, "Global.AutoSubsBridge.Owner", "")
            end
        end
    end

    print("Shutting down AutoSubs server...")

    if shouldReload then
        print("[AutoSubs Server] Hot-reloading autosubs_core...")

        -- Always reload from the resources directory this server was started with,
        -- so a caller cannot ask us to execute Lua from an arbitrary path.
        local reload_resources_path = resources_path
        local reload_executable_path = main_app

        local new_modules_path = join_path(reload_resources_path, "modules")
        local new_core_path = join_path(new_modules_path, "autosubs_core.lua")

        -- Clear cached modules BEFORE running the new chunk so it re-requires
        -- fresh copies instead of binding the old cached modules. The running
        -- server keeps its own locals, so the fallbacks below still work.
        for _, name in ipairs({
            "autosubs_core", "resolve_env", "caption_template_version",
            "caption_style", "font_fallback", "dkjson", "version",
            "timecode", "bootstrap"
        }) do
            AutoSubs_loaded[name] = nil
        end

        local new_core_chunk, load_err = loadfile(new_core_path)
        if not new_core_chunk then
            print("[AutoSubs Server] Failed to load new autosubs_core.lua:", load_err)
            print("[AutoSubs Server] Restarting previous server...")
            return StartServer()
        end

        local new_core = new_core_chunk()
        if type(new_core) ~= "table" or type(new_core.Init) ~= "function" then
            print("[AutoSubs Server] New autosubs_core.lua did not return an AutoSubs table")
            print("[AutoSubs Server] Restarting previous server...")
            return StartServer()
        end

        local ok, init_err = pcall(new_core.Init, new_core, reload_executable_path, reload_resources_path, DEV_MODE,
            false)
        if not ok then
            print("[AutoSubs Server] New server initialization failed:", init_err)
            print("[AutoSubs Server] Restarting previous server...")
            -- Drop the broken new module so a later reload can be retried.
            AutoSubs_loaded["autosubs_core"] = nil
            return StartServer()
        end

        -- Init tail-calls StartServer; if it returns we are done.
        return
    end

    print("Server shut down.")
end

local AutoSubs = {
    Init = function(self, executable_path, resources_folder, dev_mode)
        DEV_MODE = dev_mode
        main_app = executable_path
        resources_path = resources_folder
        REQUEST_FILE = join_path(AUTOSUBS_MAILBOX, "request.lua")

        json = AutoSubs_require("dkjson")
        timecode = AutoSubs_require("timecode")
        font_fallback = AutoSubs_require("font_fallback")
        return StartServer()
    end
}

return AutoSubs
