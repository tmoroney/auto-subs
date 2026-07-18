local resolve = Resolve()
local fu = Fusion()
local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local timeline = project:GetCurrentTimeline()
local mediaPool = project:GetMediaPool()

local REPO_PATH = "/Users/moroneyt/Documents/AutoSubsV3"
local ANIMATED_CAPTION = "AutoSubs Caption"
local STAGING_BIN = "AutoSubs New"
local TEMPLATE_VERSION = os.date("%Y-%m-%d")
local VERSIONED_CAPTION = ANIMATED_CAPTION .. " " .. TEMPLATE_VERSION
local VERSION_MODULE_PATH = REPO_PATH .. "/AutoSubs-App/src-tauri/resources/modules/caption_template_version.lua"

-- Platform-specific FFI bindings
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

local function get_existing_template()
    local rootFolder = mediaPool:GetRootFolder()

    -- find "AutoSubs" folder in root
    for _, subfolder in ipairs(rootFolder:GetSubFolderList()) do
        local folderName = subfolder:GetName()
        if folderName == "AutoSubs" then
            -- Visit all clips in this folder
            for _, clip in ipairs(subfolder:GetClipList()) do
                local clipName = clip:GetClipProperty()["Clip Name"]
                if clipName == ANIMATED_CAPTION or clipName:sub(1, #ANIMATED_CAPTION + 1) == ANIMATED_CAPTION .. " " then
                    return clip
                end
            end
        end
    end

    return nil
end

local template = get_existing_template()

if not template then
    mediaPool:ImportFolderFromFile(REPO_PATH .. "/AutoSubs-App/src-tauri/resources/caption-bin.drb")
    template = get_existing_template()
    if not template then
        print("Failed to import template")
        return
    end
end

-- no end set so use default
local newClip = {
    mediaPoolItem = template,
    mediaType = 1,
    startFrame = 0,
    recordFrame = timeline:GetStartFrame(),
    trackIndex = 2
}

local clip = mediaPool:AppendToTimeline({ newClip })[1]
local comp = clip:GetFusionCompByIndex(1)
-- pasting settings only seems to work if we use Fusion
--local comp = fu:GetCurrentComp()

-- Remove existing AutoSubs tool if it exists
local oldTool = comp:FindTool("AutoSubs")
if oldTool then
    oldTool:Delete() -- should delete existing AutoSubs node first
end

-- load in the macro
local macroPath = REPO_PATH .. "/Resolve-Integration/autosubs-macro.setting"
local settings = bmd.readfile(macroPath)
comp:Paste(settings)

-- Retrieve handles for the tools
local autoSubs = comp:FindTool("AutoSubs")
local mediaOut = comp:FindTool("MediaOut1")

print("AutoSubs tool found: " .. tostring(autoSubs ~= nil))
print("MediaOut1 tool found: " .. tostring(mediaOut ~= nil))

-- Connect MediaOut1's "Input" to the AutoSubs tool
if mediaOut and autoSubs then
    mediaOut:ConnectInput("Input", autoSubs)
    print("AutoSubs tool reloaded successfully")
else
    print("Failed to connect MediaOut1 to AutoSubs")
end

-- Create new bin for captions
local captionBin = mediaPool:AddSubFolder(mediaPool:GetRootFolder(), STAGING_BIN)
print("Created caption bin: " .. captionBin:GetName())

-- wait for user to drag new caption into folder
while true do
    local clips = captionBin:GetClipList()
    if #clips > 0 then
        break
    end
    sleep(0.2)
end

-- Get new clip and rename
local newTemplate = captionBin:GetClipList()[1]
newTemplate:SetName(VERSIONED_CAPTION)
print("Created caption template: " .. VERSIONED_CAPTION)

-- Export bin
local success = captionBin:Export(REPO_PATH .. "/AutoSubs-App/src-tauri/resources/caption-bin.drb")
if success then
    local versionFile, err = io.open(VERSION_MODULE_PATH, "w")
    if versionFile then
        versionFile:write("return " .. string.format("%q", TEMPLATE_VERSION) .. "\n")
        versionFile:close()
        print("Exported caption bin successfully")
    else
        print("Failed to write caption template version: " .. tostring(err))
    end
else
    print("Failed to export caption bin")
end

-- Cleanup
timeline:DeleteClips({clip})