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

local REPO_PATH = "/Users/moroneyt/Documents/AutoSubsV3"
local ANIMATED_CAPTION = "AutoSubs Caption"
local AUTOSUBS_BIN = "AutoSubs"
local BASIC_TEMPLATE = "Basic Template"
local TEMPLATE_VERSION = os.date("%Y-%m-%d")
local VERSIONED_CAPTION = ANIMATED_CAPTION .. " " .. TEMPLATE_VERSION

local PATHS = {
    captionBin = REPO_PATH .. "/AutoSubs-App/src-tauri/resources/caption-bin.drb",
    macro = REPO_PATH .. "/Resolve-Integration/autosubs-macro.setting",
    versionModule = REPO_PATH .. "/AutoSubs-App/src-tauri/resources/modules/caption_template_version.lua",
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

local function write_version_module(version)
    local file, err = io.open(PATHS.versionModule, "w")
    if not file then
        return false, err
    end
    file:write("return " .. string.format("%q", version) .. "\n")
    file:close()
    return true
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

local function step_update_caption_template(template)
    print("[4/7] Updating caption template on timeline…")

    local clipInfo = {
        mediaPoolItem = template,
        mediaType = 1,
        startFrame = 0,
        recordFrame = timeline:GetStartFrame(),
        trackIndex = 2,
    }

    local appended = mediaPool:AppendToTimeline({ clipInfo })
    if not appended or not appended[1] then
        return nil, "Failed to append template to timeline"
    end
    local clip = appended[1]
    print("  Appended template to timeline")

    -- Appending activates the clip's Fusion comp automatically
    local comp = fu:GetCurrentComp()
    if not comp then
        return nil, "Failed to get current Fusion comp"
    end

    local oldTool = comp:FindTool("AutoSubs")
    if oldTool then
        oldTool:Delete()
        print("  Removed existing AutoSubs tool")
    end

    local settings = bmd.readfile(PATHS.macro)
    if not settings then
        return nil, "Failed to read macro: " .. PATHS.macro
    end
    comp:Paste(settings)

    local autoSubs = comp:FindTool("AutoSubs")
    local mediaOut = comp:FindTool("MediaOut1")
    if not autoSubs or not mediaOut then
        return nil, string.format(
            "Missing tools after paste (AutoSubs=%s, MediaOut1=%s)",
            tostring(autoSubs ~= nil),
            tostring(mediaOut ~= nil)
        )
    end

    mediaOut:ConnectInput("Input", autoSubs)
    print("  Macro pasted and connected to MediaOut1")
    return clip
end

local function step_wait_for_user_drag(updatedBin)
    print("[5/7] Waiting for you to drag the updated caption into \"" .. updatedBin:GetName() .. "\"…")

    if not mediaPool:SetCurrentFolder(updatedBin) then
        return nil, "Failed to select new caption bin"
    end

    local initialClipCount = #updatedBin:GetClipList()

    while true do
        local clips = updatedBin:GetClipList()
        if #clips > initialClipCount then
            local newTemplate = clips[#clips]
            print("  Received: " .. newTemplate:GetClipProperty()["Clip Name"])
            return newTemplate
        end
        sleep(0.2)
    end
end

local function step_version_and_export(updatedBin, newTemplate)
    print("[6/7] Versioning and exporting caption bin…")

    newTemplate:SetName(VERSIONED_CAPTION)
    print("  Renamed template → " .. VERSIONED_CAPTION)

    local tmpBin = PATHS.captionBin .. ".tmp.drb"
    if not updatedBin:Export(tmpBin) then
        return nil, "Failed to export caption bin"
    end

    local ok, err = write_version_module(TEMPLATE_VERSION)
    if not ok then
        os.remove(tmpBin)
        return nil, "Failed to write caption template version: " .. tostring(err)
    end

    os.remove(PATHS.captionBin)
    local renameOk, renameErr = os.rename(tmpBin, PATHS.captionBin)
    if not renameOk then
        return nil, "Failed to replace caption bin: " .. tostring(renameErr)
    end

    print("  Exported caption-bin.drb + version " .. TEMPLATE_VERSION)
    return true
end

local function step_cleanup(originalBin, clip)
    print("[7/7] Deleting the original caption bin…")

    if clip and not timeline:DeleteClips({ clip }) then
        return nil, "Failed to delete temporary timeline clip"
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

local clip, updateErr = step_update_caption_template(template)
if not clip then
    return abort(updateErr)
end

local newTemplate, dragErr = step_wait_for_user_drag(updatedBin)
if not newTemplate then
    return abort(dragErr)
end

ok, err = step_version_and_export(updatedBin, newTemplate)
if not ok then
    return abort(err)
end

ok, err = step_cleanup(originalBin, clip)
if not ok then
    return abort(err)
end
print("Caption template updated successfully → " .. VERSIONED_CAPTION)
print("Next steps:")
print("  1. Commit updated caption-bin.drb to git")
print("  2. Push to remote")
print("  3. Build new AutoSubs release with updated template")
