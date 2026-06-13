-- test-macro.lua — live preview harness for the AutoSubs caption macro.
--
-- Iterate on macro-src/animations/*.lua without launching the full Tauri app:
--   1. edit an animation,
--   2. `npm run build:macro` (regenerates macro_logic.lua),
--   3. run this harness in DaVinci Resolve,
--   4. eyeball the rendered frame.
--
-- It drops the "AutoSubs Caption" template on a scratch track of the current
-- timeline, injects the freshly built macro_logic.lua via tool:SetData (exactly
-- like the app does), applies a settings dict that enables the animation under
-- test, renders the middle frame to a PNG, prints the path, and tears the
-- scratch track down again.
--
-- Run (Resolve must be open with an active timeline):
--   macOS:   "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fuscript" \
--                Resolve-Integration/scripts/test-macro.lua [animationId] [/path/to/macro_logic.lua]
--   Windows: "C:\Program Files\Blackmagic Design\DaVinci Resolve\fuscript.exe" ^
--                Resolve-Integration\scripts\test-macro.lua [animationId] [path\to\macro_logic.lua]
--
-- animationId defaults to "popIn" (one of: fade, popIn, slideUp, or any id you add).

---@diagnostic disable: undefined-global

local ANIMATED_CAPTION = "AutoSubs Caption"

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
local function script_dir()
	local src = debug.getinfo(1, "S").source
	return (src:match("@(.*[/\\])")) or "./"
end

local function is_windows()
	return package.config:sub(1, 1) == "\\"
end

local function join_path(a, b)
	local sep = is_windows() and "\\" or "/"
	if a:sub(-1) == "/" or a:sub(-1) == "\\" then return a .. b end
	return a .. sep .. b
end

local function temp_dir()
	return os.getenv("TMPDIR") or os.getenv("TEMP") or os.getenv("TMP") or "/tmp"
end

local function file_exists(path)
	local f = io.open(path, "r")
	if f then f:close() return true end
	return false
end

-- Recursively search the media pool for a clip by name.
local function find_media_pool_item(folder, itemName)
	for _, subfolder in ipairs(folder:GetSubFolderList() or {}) do
		local found = find_media_pool_item(subfolder, itemName)
		if found then return found end
	end
	for _, clip in ipairs(folder:GetClipList() or {}) do
		local props = clip:GetClipProperty()
		if props and props["Clip Name"] == itemName then return clip end
	end
	return nil
end

-- ---------------------------------------------------------------------------
-- Args
-- ---------------------------------------------------------------------------
local animationId = (arg and arg[1]) or "popIn"
local bundlePath = (arg and arg[2])
	or join_path(script_dir(), "../../AutoSubs-App/src-tauri/resources/modules/macro_logic.lua")

if not file_exists(bundlePath) then
	print("[test-macro] Could not find macro_logic.lua at: " .. bundlePath)
	print("[test-macro] Run `npm run build:macro` first, or pass the path as the 2nd argument.")
	return
end

-- Map known animation ids -> the control key the macro toggles.
local CONTROL_KEY = {
	fade = "FadeEnabled",
	popIn = "PopInEnabled",
	slideUp = "SlideUpEnabled",
}

-- ---------------------------------------------------------------------------
-- Resolve / timeline setup
-- ---------------------------------------------------------------------------
local resolve = rawget(_G, "resolve")
if not resolve and type(rawget(_G, "Resolve")) == "function" then resolve = Resolve() end
if not resolve then
	print("[test-macro] No Resolve scripting environment. Run this with fuscript inside DaVinci Resolve.")
	return
end

local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local mediaPool = project:GetMediaPool()
local timeline = project:GetCurrentTimeline()
if not timeline then
	print("[test-macro] No active timeline. Open a timeline in Resolve and try again.")
	return
end

local rootFolder = mediaPool:GetRootFolder()
local templateItem = find_media_pool_item(rootFolder, ANIMATED_CAPTION)
if not templateItem then
	print("[test-macro] Could not find the '" .. ANIMATED_CAPTION .. "' clip in the media pool.")
	print("[test-macro] Import AutoSubs-App/src-tauri/resources/AutoSubs/caption-bin.drb first.")
	return
end

-- Build the settings dict that enables the animation under test.
local settings = {
	AnimationLength = 0.2,
	AnimationLevel = 1,
	AnimationMode = 2,
	FadeEnabled = 0,
	PopInEnabled = 0,
	SlideUpEnabled = 0,
	HighlightEnabled = 0,
}
local controlKey = CONTROL_KEY[animationId]
if controlKey then
	settings[controlKey] = 1
else
	print("[test-macro] Unknown animation id '" .. animationId ..
		"'. Falling back to enabling nothing; pass fade/popIn/slideUp or your own id.")
end

print(string.format("[test-macro] Testing animation '%s' (control: %s)",
	animationId, tostring(controlKey)))

-- ---------------------------------------------------------------------------
-- Drop a scratch clip, inject logic, apply settings, render a frame.
-- ---------------------------------------------------------------------------
timeline:AddTrack("video")
local trackIndex = timeline:GetTrackCount("video")
local fps = tonumber(templateItem:GetClipProperty()["FPS"]) or 24

local appended = mediaPool:AppendToTimeline({ {
	mediaPoolItem = templateItem,
	startFrame = 0,
	endFrame = math.floor(fps * 5),
	recordFrame = timeline:GetStartFrame(),
	trackIndex = trackIndex,
} })
local timelineItem = appended and appended[1]

local outputPath = nil
local ok, err = pcall(function()
	if not timelineItem or timelineItem:GetFusionCompCount() == 0 then
		error("scratch clip has no Fusion composition")
	end
	local comp = timelineItem:GetFusionCompByIndex(1)
	local tool = comp:FindTool("AutoSubs")
	if not tool then error("AutoSubs macro tool not found in composition") end

	-- Inject the freshly built macro logic (same path the app uses).
	local bundle = dofile(bundlePath)
	for key, src in pairs(bundle.blocks or {}) do tool:SetData(key, src) end
	for key, value in pairs(bundle.data or {}) do tool:SetData(key, value) end

	-- Apply the animation settings through the macro's own helper.
	local setter = tool:GetData("SetInputValues")
	if not setter or setter == "" then error("macro missing SetInputValues helper") end
	loadstring(setter)()(comp, tool, settings)

	-- Render the middle frame via a temporary Saver.
	comp:Lock()
	local saver = comp:AddTool("Saver")
	local exportDir = temp_dir()
	local name = saver.Name
	local sset = saver:SaveSettings()
	local frameIndex = math.floor(comp:GetAttrs().COMPN_GlobalEnd / 2)
	local filename = "autosubs-macro-test-" .. animationId .. "-" .. frameIndex .. ".png"
	sset.Tools[name].Inputs.Clip.Value["Filename"] = join_path(exportDir, filename)
	sset.Tools[name].Inputs.Clip.Value["FormatID"] = "PNGFormat"
	sset.Tools[name].Inputs["OutputFormat"]["Value"] = "PNGFormat"
	saver:LoadSettings(sset)
	saver:SetInput("Input", comp:FindToolByID("MediaOut"))

	local rendered = comp:Render({ Start = frameIndex, End = frameIndex, Tool = saver, Wait = true })
	comp:Unlock()
	if not rendered then error("comp:Render failed") end
	outputPath = join_path(exportDir, filename)
end)

-- Always clean up the scratch track.
pcall(function() if timelineItem then timeline:DeleteClips({ timelineItem }) end end)
pcall(function() timeline:DeleteTrack("video", trackIndex) end)

if not ok then
	print("[test-macro] FAILED: " .. tostring(err))
	return
end

print("[test-macro] Rendered preview frame: " .. tostring(outputPath))
