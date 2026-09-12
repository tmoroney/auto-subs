--[[
  AutoSubs — Update Caption Template

  Workflow:
    1. Find (or import) the existing caption bin
    2. Create a new AutoSubs bin for the updated caption
    3. Move the basic template into the new bin
    4. Update the caption template on the timeline
    5. Wait for you to drag the updated clip into the new bin
    6. Version and export the new bin
    7. Delete the original caption bin and leave the updated bin in place
]]

local resolve = Resolve()
local fu = Fusion()
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local timeline = project:GetCurrentTimeline()
local mediaPool = project:GetMediaPool()

------------------------------------------------------------------------
-- Config
------------------------------------------------------------------------

-- `npm run setup-resolve` replaces this placeholder with the absolute path to
-- the local checkout. Do not hardcode a machine-specific path here.
local REPO_PATH = [[__AUTOSUBS_REPO_PATH__]]
if REPO_PATH == "__AUTOSUBS_REPO_PATH__" then
    error(
        "'AutoSubs - Update Caption Template.lua' has not been generated yet. " ..
        "Run `npm run setup-resolve` from the AutoSubs-App directory."
    )
end

local ANIMATED_CAPTION = "AutoSubs Caption"
local AUTOSUBS_BIN = "AutoSubs"
local BASIC_TEMPLATE = "Basic Template"
local TEMPLATE_VERSION = os.date("%Y-%m-%d")
local VERSIONED_CAPTION = ANIMATED_CAPTION .. " " .. TEMPLATE_VERSION
local VERSION_DATA_KEY = "AutoSubs.TemplateVersion"
local TOKEN_DATA_KEY = "AutoSubs.UpdateToken"

local sep = package.config:sub(1, 1) -- '\\' on Windows, '/' elsewhere
local function join_path(dir, ...)
    local parts = { ... }
    local path = dir
    for i = 1, #parts do
        if path:sub(-1) == sep then
            path = path .. parts[i]
        else
            path = path .. sep .. parts[i]
        end
    end
    return path
end

local PATHS = {
    captionBin = join_path(REPO_PATH, "AutoSubs-App", "src-tauri", "resources", "caption-bin.drb"),
    macro = join_path(REPO_PATH, "Resolve-Integration", "autosubs-macro.setting"),
    versionModule = join_path(REPO_PATH, "AutoSubs-App", "src-tauri", "resources", "modules", "caption_template_version.lua"),
}

------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------

if ffi.os == "Windows" then
    ffi.cdef [[
        void Sleep(unsigned int ms);
    ]]
else
    ffi.cdef [[
        struct timespec { long tv_sec; long tv_nsec; };
        int nanosleep(const struct timespec *req, struct timespec *rem);
    ]]
end

local function sleep(seconds)
    if ffi.os == "Windows" then
        ffi.C.Sleep(seconds * 1000)
    else
        local ts = ffi.new("struct timespec")
        ts.tv_sec = math.floor(seconds)
        ts.tv_nsec = (seconds - math.floor(seconds)) * 1e9
        ffi.C.nanosleep(ts, nil)
    end
end

local function is_caption_template(clipName)
    return clipName == ANIMATED_CAPTION
        or clipName:sub(1, #ANIMATED_CAPTION + 1) == ANIMATED_CAPTION .. " "
end

local function find_root_subfolder(name)
    for _, folder in ipairs(mediaPool:GetRootFolder():GetSubFolderList()) do
        if folder:GetName() == name then
            return folder
        end
    end
    return nil
end

local function find_caption_template(folder)
    for _, clip in ipairs(folder:GetClipList()) do
        if is_caption_template(clip:GetClipProperty()["Clip Name"]) then
            return clip
        end
    end
    return nil
end

local function find_clip_by_name(folder, name)
    for _, clip in ipairs(folder:GetClipList()) do
        if clip:GetClipProperty()["Clip Name"] == name then
            return clip
        end
    end
    return nil
end

-- AppendToTimeline fails *silently* when the target slot on the track is already
-- occupied: it still returns a truthy timelineItem, but that handle is dead and
-- every method on it returns no value at all. Appending onto a dedicated track
-- added just for this guarantees a free slot, and validating the handle turns any
-- remaining failure into a real error instead of a corrupt export.
local function append_on_temp_track(mediaPoolItem)
    local trackIndex = timeline:GetTrackCount("video") + 1
    if not timeline:AddTrack("video") then
        return nil, "Failed to add a temporary video track"
    end

    local appended = mediaPool:AppendToTimeline({ {
        mediaPoolItem = mediaPoolItem,
        mediaType = 1,
        startFrame = 0,
        recordFrame = timeline:GetStartFrame(),
        trackIndex = trackIndex,
    } })

    local clip = appended and appended[1]
    local compCount = clip and clip:GetFusionCompCount()
    if not clip or compCount ~= 1 then
        timeline:DeleteTrack("video", trackIndex)
        return nil, string.format(
            "Failed to append to the temporary track (clip=%s, fusionCompCount=%s)",
            tostring(clip ~= nil), tostring(compCount)
        )
    end

    return { clip = clip, trackIndex = trackIndex }
end

local function remove_temp_track(temp)
    if not temp then
        return true
    end
    timeline:DeleteClips({ temp.clip })
    return timeline:DeleteTrack("video", temp.trackIndex)
end

local function rollback_media_pool_changes(originalBin, updatedBin)
    local basicTemplate = find_clip_by_name(updatedBin, BASIC_TEMPLATE)
    if basicTemplate then
        mediaPool:MoveClips({ basicTemplate }, originalBin)
    end
    mediaPool:DeleteFolders({ updatedBin })
end

local function read_file(path)
    local file = io.open(path, "rb")
    if not file then
        return nil
    end
    local content = file:read("*a")
    file:close()
    return content
end

local function write_file(path, content)
    local file, err = io.open(path, "wb")
    if not file then
        return false, err
    end
    file:write(content)
    file:close()
    return true
end

local function write_version_module(version)
    return write_file(PATHS.versionModule, "return " .. string.format("%q", version) .. "\n")
end

------------------------------------------------------------------------
-- Workflow steps
------------------------------------------------------------------------

local function step_find_or_import_caption_bin()
    print("[1/7] Finding existing caption bin…")

    local originalBin = find_root_subfolder(AUTOSUBS_BIN)
    if originalBin then
        print("  Found: " .. originalBin:GetName())
        return originalBin
    end

    print("  Not found — importing caption-bin.drb…")
    local rootFolder = mediaPool:GetRootFolder()
    local previousFolder = mediaPool:GetCurrentFolder()
    mediaPool:SetCurrentFolder(rootFolder)
    local imported = mediaPool:ImportFolderFromFile(PATHS.captionBin)
    mediaPool:SetCurrentFolder(previousFolder)

    if not imported then
        return nil, "Failed to import caption bin"
    end

    originalBin = find_root_subfolder(AUTOSUBS_BIN)
    if not originalBin then
        return nil, "Failed to find imported " .. AUTOSUBS_BIN .. " bin"
    end

    print("  Imported: " .. originalBin:GetName())
    return originalBin
end

local function step_create_updated_bin()
    print("[2/7] Creating new caption bin…")

    local updatedBin = mediaPool:AddSubFolder(mediaPool:GetRootFolder(), AUTOSUBS_BIN)
    if not updatedBin then
        return nil, "Failed to create new caption bin"
    end

    print("  Created: " .. updatedBin:GetName())
    return updatedBin
end

local function step_move_basic_template(originalBin, updatedBin)
    print("[3/7] Moving basic template into new caption bin…")

    local basicTemplate = find_clip_by_name(originalBin, BASIC_TEMPLATE)
    if not basicTemplate then
        return nil, "Failed to find " .. BASIC_TEMPLATE .. " in " .. originalBin:GetName()
    end

    if not mediaPool:MoveClips({ basicTemplate }, updatedBin) then
        return nil, "Failed to move " .. BASIC_TEMPLATE .. " into new caption bin"
    end

    print("  Moved: " .. BASIC_TEMPLATE)
    return true
end

-- Getting the right comp needs both APIs, because each one can only do half the
-- job:
--   * The Resolve API (timelineItem:GetFusionCompByIndex) reliably identifies the
--     appended clip's comp and round-trips SetData/GetData, but Paste on that
--     object always returns false and adds nothing.
--   * The Fusion API (fu:GetCurrentComp) can Paste, but "current" is whatever comp
--     was last active. Appending does not change it, and a long-running session
--     accumulates hundreds of open comps, so it is effectively arbitrary.
-- So: stamp a one-off token through the Resolve API, make the comp active, then
-- refuse to paste unless the active comp reports that same token back.
local function resolve_active_comp(clip)
    local rComp = clip:GetFusionCompByIndex(1)
    if not rComp then
        return nil, "Failed to get the appended clip's Fusion comp"
    end

    local token = string.format("%s-%d-%d", TEMPLATE_VERSION, os.time(), math.random(1e6))
    rComp:SetData(TOKEN_DATA_KEY, token)
    if rComp:GetData(TOKEN_DATA_KEY) ~= token then
        return nil, "Could not stamp the appended clip's Fusion comp"
    end

    local names = clip:GetFusionCompNameList() or {}
    if names[1] then
        clip:LoadFusionCompByName(names[1])
    end
    resolve:OpenPage("fusion")

    local comp = fu:GetCurrentComp()
    if not comp or comp:GetData(TOKEN_DATA_KEY) ~= token then
        return nil, "The active Fusion comp is not the appended clip's comp; refusing to paste"
    end
    return comp
end

local function step_update_caption_template(template)
    print("[4/7] Updating caption template on timeline…")

    local temp, appendErr = append_on_temp_track(template)
    if not temp then
        return nil, appendErr
    end
    print("  Appended template to temporary video track " .. temp.trackIndex)

    local comp, compErr = resolve_active_comp(temp.clip)
    if not comp then
        remove_temp_track(temp)
        return nil, compErr
    end

    local oldTool = comp:FindTool("AutoSubs")
    if oldTool then
        oldTool:Delete()
        print("  Removed existing AutoSubs tool")
    end

    local settings = bmd.readfile(PATHS.macro)
    if not settings then
        remove_temp_track(temp)
        return nil, "Failed to read macro: " .. PATHS.macro
    end
    if not comp:Paste(settings) then
        remove_temp_track(temp)
        return nil, "Fusion rejected the macro paste"
    end

    local autoSubs = comp:FindTool("AutoSubs")
    local mediaOut = comp:FindTool("MediaOut1")
    if not autoSubs or not mediaOut then
        remove_temp_track(temp)
        return nil, string.format(
            "Missing tools after paste (AutoSubs=%s, MediaOut1=%s)",
            tostring(autoSubs ~= nil),
            tostring(mediaOut ~= nil)
        )
    end

    mediaOut:ConnectInput("Input", autoSubs)

    -- Stamp the comp so the dragged clip can be verified before it is exported,
    -- and confirm through the Resolve API that the edit really landed on the
    -- timeline clip rather than on some other comp that matched by accident.
    comp:SetData(VERSION_DATA_KEY, TEMPLATE_VERSION)
    local landed = temp.clip:GetFusionCompByIndex(1)
    if not landed or landed:GetData(VERSION_DATA_KEY) ~= TEMPLATE_VERSION then
        remove_temp_track(temp)
        return nil, "The pasted macro did not land on the timeline clip's comp"
    end

    resolve:OpenPage("edit")
    print("  Macro pasted and connected to MediaOut1")
    return temp
end

local function step_wait_for_user_drag(updatedBin, temp)
    print(string.format(
        "[5/7] Waiting for you to drag the updated caption from video track %d into \"%s\"…",
        temp.trackIndex, updatedBin:GetName()))

    if not mediaPool:SetCurrentFolder(updatedBin) then
        return nil, "Failed to select new caption bin"
    end

    -- Track ids rather than a count: GetClipList() order is not guaranteed, so
    -- the newest clip is not necessarily the last one.
    local known = {}
    for _, clip in ipairs(updatedBin:GetClipList()) do
        known[clip:GetUniqueId()] = true
    end

    while true do
        for _, clip in ipairs(updatedBin:GetClipList()) do
            if not known[clip:GetUniqueId()] then
                print("  Received: " .. clip:GetClipProperty()["Clip Name"])
                return clip
            end
        end
        sleep(0.2)
    end
end

-- The dragged clip is whatever the user picked, so confirm it really carries the
-- freshly pasted macro before it is promoted into the repo.
local function verify_dragged_template(newTemplate)
    local temp, appendErr = append_on_temp_track(newTemplate)
    if not temp then
        return nil, "Verification failed: " .. tostring(appendErr)
    end

    local comp = temp.clip:GetFusionCompByIndex(1)
    local version = comp and comp:GetData(VERSION_DATA_KEY)
    remove_temp_track(temp)

    if version ~= TEMPLATE_VERSION then
        return nil, string.format(
            "The dragged clip does not contain the updated macro (expected version %s, found %s). " ..
            "Drag the caption clip that this script placed on the timeline, not an older one.",
            TEMPLATE_VERSION, tostring(version)
        )
    end
    return true
end

local function step_version_and_export(updatedBin, newTemplate)
    print("[6/7] Versioning and exporting caption bin…")

    local verified, verifyErr = verify_dragged_template(newTemplate)
    if not verified then
        return nil, verifyErr
    end
    print("  Verified macro version " .. TEMPLATE_VERSION)

    newTemplate:SetName(VERSIONED_CAPTION)
    print("  Renamed template → " .. VERSIONED_CAPTION)

    local tmpBin = PATHS.captionBin .. ".tmp.drb"
    local bakBin = PATHS.captionBin .. ".bak.drb"
    os.remove(tmpBin)
    os.remove(bakBin)

    if not updatedBin:Export(tmpBin) then
        return nil, "Failed to export caption bin"
    end

    -- Keep the previous bin intact until the new one is in place, so a failed
    -- promote never leaves the repo without caption-bin.drb.
    local probe = io.open(PATHS.captionBin, "rb")
    local hadOld = probe ~= nil
    if probe then
        probe:close()
    end

    if hadOld then
        local bakOk, bakErr = os.rename(PATHS.captionBin, bakBin)
        if not bakOk then
            os.remove(tmpBin)
            return nil, "Failed to backup caption bin: " .. tostring(bakErr)
        end
    end

    local renameOk, renameErr = os.rename(tmpBin, PATHS.captionBin)
    if not renameOk then
        os.remove(tmpBin)
        if hadOld then
            os.rename(bakBin, PATHS.captionBin)
        end
        return nil, "Failed to replace caption bin: " .. tostring(renameErr)
    end

    -- Version module last: on failure restore the previous bin + version so the
    -- artifact pair never diverges.
    local previousVersion = read_file(PATHS.versionModule)
    local ok, err = write_version_module(TEMPLATE_VERSION)
    if not ok then
        if hadOld then
            -- Restore the previous artifact before discarding the promoted one. If
            -- the restore fails, put the promoted artifact back so the repo never
            -- loses its packaged caption-bin.drb.
            local recovery = PATHS.captionBin .. ".recovery.drb"
            os.remove(recovery)
            os.rename(PATHS.captionBin, recovery)
            local restoreOk, restoreErr = os.rename(bakBin, PATHS.captionBin)
            if not restoreOk then
                os.rename(recovery, PATHS.captionBin)
                -- The promoted bin is the new one; keep the version module paired
                -- with it instead of reverting to the previous version.
                write_version_module(TEMPLATE_VERSION)
                return nil, "Failed to write caption template version and could not restore previous caption bin: " .. tostring(restoreErr)
            end
            os.remove(recovery)
        end
        if previousVersion then
            write_file(PATHS.versionModule, previousVersion)
        end
        return nil, "Failed to write caption template version: " .. tostring(err)
    end

    os.remove(bakBin)
    print("  Exported caption-bin.drb + version " .. TEMPLATE_VERSION)
    return true
end

local function step_cleanup(originalBin, temp)
    print("[7/7] Deleting the original caption bin…")

    if not remove_temp_track(temp) then
        return nil, "Failed to remove the temporary video track"
    end

    if not mediaPool:DeleteFolders({ originalBin }) then
        return nil, "Failed to delete original caption bin"
    end

    print("  Deleted original caption bin")
    return true
end

------------------------------------------------------------------------
-- Run
------------------------------------------------------------------------

local function abort(message)
    print("ERROR: " .. message)
end

local originalBin, err = step_find_or_import_caption_bin()
if not originalBin then
    return abort(err)
end

local template = find_caption_template(originalBin)
if not template then
    return abort("Failed to find " .. ANIMATED_CAPTION .. " in " .. originalBin:GetName())
end

local updatedBin, createErr = step_create_updated_bin()
if not updatedBin then
    return abort(createErr)
end

local ok, moveErr = step_move_basic_template(originalBin, updatedBin)
if not ok then
    return abort(moveErr)
end

local temp, updateErr = step_update_caption_template(template)
if not temp then
    rollback_media_pool_changes(originalBin, updatedBin)
    return abort(updateErr)
end

local newTemplate, dragErr = step_wait_for_user_drag(updatedBin, temp)
if not newTemplate then
    remove_temp_track(temp)
    return abort(dragErr)
end

ok, err = step_version_and_export(updatedBin, newTemplate)
if not ok then
    remove_temp_track(temp)
    return abort(err)
end

ok, err = step_cleanup(originalBin, temp)
if not ok then
    return abort(err)
end
print("Caption template updated successfully → " .. VERSIONED_CAPTION)
print("Next steps:")
print("  1. Commit updated caption-bin.drb to git")
print("  2. Push to remote")
print("  3. Build new AutoSubs release with updated template")
