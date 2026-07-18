--[[
  AutoSubs — Update Caption Template

  Workflow:
    1. Find (or import) the existing caption template
    2. Drop it on the timeline and open its Fusion comp
    3. Replace the AutoSubs macro with the latest .setting
    4. Wait for you to drag the updated clip into the staging bin
    5. Version, package, and export the caption bin
    6. Clean up the temporary timeline clip
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
local STAGING_BIN = "AutoSubs New"
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

local function find_template(folder)
    for _, clip in ipairs(folder:GetClipList()) do
        if is_caption_template(clip:GetClipProperty()["Clip Name"]) then
            return clip
        end
    end

    for _, subfolder in ipairs(folder:GetSubFolderList()) do
        local template = find_template(subfolder)
        if template then
            return template
        end
    end

    return nil
end

local function ensure_basic_template(targetBin)
    for _, clip in ipairs(targetBin:GetClipList()) do
        if clip:GetClipProperty()["Clip Name"] == BASIC_TEMPLATE then
            return
        end
    end

    local rootFolder = mediaPool:GetRootFolder()
    local targetId = targetBin:GetUniqueId()

    for _, subfolder in ipairs(rootFolder:GetSubFolderList()) do
        if subfolder:GetUniqueId() ~= targetId then
            for _, clip in ipairs(subfolder:GetClipList()) do
                if clip:GetClipProperty()["Clip Name"] == BASIC_TEMPLATE then
                    pcall(function()
                        mediaPool:MoveClips({ clip }, targetBin)
                    end)
                    return
                end
            end
        end
    end
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

local function step_find_or_import_template()
    print("[1/6] Finding existing caption template…")

    local template = find_template(mediaPool:GetRootFolder())
    if template then
        print("  Found: " .. template:GetClipProperty()["Clip Name"])
        return template
    end

    print("  Not found — importing caption-bin.drb…")
    local rootFolder = mediaPool:GetRootFolder()
    local previousFolder = mediaPool:GetCurrentFolder()
    mediaPool:SetCurrentFolder(rootFolder)

    local success = mediaPool:ImportFolderFromFile(PATHS.captionBin)
    mediaPool:SetCurrentFolder(previousFolder)

    if not success then
        return nil, "Failed to import caption bin"
    end

    template = find_template(mediaPool:GetRootFolder())
    if not template then
        return nil, "Failed to find imported template"
    end

    print("  Imported: " .. template:GetClipProperty()["Clip Name"])
    return template
end

local function step_place_on_timeline(template)
    print("[2/6] Placing template on timeline…")

    local clipInfo = {
        mediaPoolItem = template,
        mediaType = 1,
        startFrame = 0,
        recordFrame = timeline:GetStartFrame(),
        trackIndex = 2,
    }

    local clip = mediaPool:AppendToTimeline({ clipInfo })[1]
    if not clip then
        return nil, "Failed to append template to timeline"
    end

    -- Appending activates the clip's Fusion comp automatically
    local comp = fu:GetCurrentComp()
    if not comp then
        return nil, "Failed to get current Fusion comp"
    end

    print("  Clip on timeline, Fusion comp ready")
    return clip, comp
end

local function step_reload_macro(comp)
    print("[3/6] Reloading AutoSubs macro…")

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
    return true
end

local function step_wait_for_user_drag()
    print("[4/6] Waiting for you to drag the updated caption into \"" .. STAGING_BIN .. "\"…")

    local captionBin = mediaPool:AddSubFolder(mediaPool:GetRootFolder(), STAGING_BIN)
    print("  Staging bin ready: " .. captionBin:GetName())

    while true do
        local clips = captionBin:GetClipList()
        if #clips > 0 then
            print("  Received: " .. clips[1]:GetClipProperty()["Clip Name"])
            return captionBin, clips[1]
        end
        sleep(0.2)
    end
end

local function step_version_and_export(captionBin, newTemplate)
    print("[5/6] Versioning and exporting caption bin…")

    newTemplate:SetName(VERSIONED_CAPTION)
    print("  Renamed template → " .. VERSIONED_CAPTION)

    ensure_basic_template(captionBin)

    if not captionBin:Export(PATHS.captionBin) then
        return nil, "Failed to export caption bin"
    end

    local ok, err = write_version_module(TEMPLATE_VERSION)
    if not ok then
        return nil, "Failed to write caption template version: " .. tostring(err)
    end

    print("  Exported caption-bin.drb + version " .. TEMPLATE_VERSION)
    return true
end

local function step_cleanup(captionBin, clip)
    print("[6/6] Cleaning up…")
    if clip then
        timeline:DeleteClips({ clip })
    end
    if captionBin then
        -- Move new items to
        local rootFolder = mediaPool:GetRootFolder()
        local autoSubsBin = nil
        for _, folder in ipairs(rootFolder:GetSubFolderList()) do
            if folder:GetName() == "AutoSubs" then
                autoSubsBin = folder
                break
            end
        end
        if autoSubsBin then
            mediaPool:MoveClips(captionBin:GetClipList(), autoSubsBin)
            print("  Moved clips to AutoSubs bin")
        end
        mediaPool:DeleteFolders({ captionBin })
        print("  Deleted staging bin")
    end
    print("  Done")
end

------------------------------------------------------------------------
-- Run
------------------------------------------------------------------------

local function abort(message)
    print("ERROR: " .. message)
end

local template, err = step_find_or_import_template()
if not template then
    return abort(err)
end

local clip, compOrErr = step_place_on_timeline(template)
if not clip then
    return abort(compOrErr)
end
local comp = compOrErr

local ok, reloadErr = step_reload_macro(comp)
if not ok then
    step_cleanup(clip)
    return abort(reloadErr)
end

local captionBin, newTemplate = step_wait_for_user_drag()

ok, err = step_version_and_export(captionBin, newTemplate)
if not ok then
    step_cleanup(captionBin, clip)
    return abort(err)
end

step_cleanup(captionBin, clip)
print("Caption template updated successfully → " .. VERSIONED_CAPTION)
print("Next steps:")
print("  1. Commit updated caption-bin.drb to git")
print("  2. Push to remote")
print("  3. Build new AutoSubs release with updated template")
