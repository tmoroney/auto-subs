-- test-macro-logic.lua — offline smoke test for the generated macro logic.
--
-- Runs WITHOUT DaVinci Resolve. It loads the generated macro_logic.lua bundle,
-- builds the animation registry, and drives the registry-based SetAnimations
-- against a mock Fusion graph for every fade/pop-in/slide-up/mode/level
-- combination. Catches runtime errors and contract violations early so a
-- contributor doesn't need to launch Resolve just to sanity-check a change.
--
-- Usage:
--   luajit Resolve-Integration/scripts/test-macro-logic.lua [path/to/macro_logic.lua]
--
-- For a live, rendered preview in Resolve, use test-macro.lua instead.

local BUNDLE = arg and arg[1]
if not BUNDLE then
	-- Default: the generated bundle shipped as a Tauri resource.
	BUNDLE = (debug.getinfo(1, "S").source:match("@(.*/)") or "./")
		.. "../../AutoSubs-App/src-tauri/resources/modules/macro_logic.lua"
end

------------------------------------------------------------------------------
-- Minimal mock Fusion tool graph (enough for the animation orchestrator).
------------------------------------------------------------------------------
local Tool = {}
Tool.__index = function(t, k)
	local m = rawget(Tool, k)
	if m then return m end
	return setmetatable({ _tool = t, _prop = k }, {
		__index = {
			GetConnectedOutput = function() return t.conns[k] end,
			GetTool = function() return t end,
		},
	})
end
Tool.__newindex = function(t, k, v) t.conns[k] = v end

local _uid = 0
local function newTool(kind, name)
	_uid = _uid + 1
	local t = setmetatable({}, Tool)
	rawset(t, "conns", {})
	rawset(t, "inputs", {})
	rawset(t, "kind", kind)
	rawset(t, "Name", name or (kind .. _uid))
	return t
end
function Tool:SetInput(k, v) self.inputs[k] = v; self.conns[k] = nil end
function Tool:SetKeyFrames(_, _) end
function Tool:AddModifier(prop, modKind)
	local mod = newTool(modKind, modKind .. _uid)
	self.conns[prop] = setmetatable({ _tool = mod }, {
		__index = { GetTool = function() return mod end, GetConnectedOutput = function() return nil end } })
	return mod
end

local function makeScene(settings, getData)
	local follower = newTool("Follower", "Follower1")
	local function stretcherWithSpline(name)
		local spline = newTool("BezierSpline", name .. "Spline")
		local stretcher = newTool("KeyStretcher", name)
		stretcher.conns["Keyframes"] = setmetatable({ _tool = spline },
			{ __index = { GetTool = function() return spline end } })
		return stretcher
	end
	local tools = {
		Follower1 = follower,
		AnimationKeyframeStretcher = stretcherWithSpline("AnimationKeyframeStretcher"),
		OrderKeyframeStretcher = stretcherWithSpline("OrderKeyframeStretcher"),
	}
	local comp = {
		FindTool = function(_, name) return tools[name] end,
		GetPrefs = function() return 30 end,
	}
	local tool = {
		GetInput = function(_, k) return settings[k] end,
		GetData = function(_, k) return getData(k) end,
		SetData = function() end,
	}
	return comp, tool
end

------------------------------------------------------------------------------
-- Load + validate the bundle.
------------------------------------------------------------------------------
local ml = dofile(BUNDLE)
assert(type(ml) == "table" and type(ml.blocks) == "table", "bundle missing blocks")
assert(ml.blocks.SetAnimations, "missing SetAnimations block")
assert(ml.blocks.AnimationRegistry, "missing AnimationRegistry block")

-- Every block must parse.
for k, v in pairs(ml.blocks) do
	local fn, err = loadstring(v, k)
	assert(fn, "block '" .. k .. "' failed to parse: " .. tostring(err))
end

-- Registry contract: unique ids, apply() present, controlKeys exist in InputKeys.
local inputKeys = {}
for _, k in ipairs(ml.data.InputKeys) do inputKeys[k] = true end
local registry = loadstring(ml.blocks.AnimationRegistry)()
assert(type(registry) == "table" and #registry > 0, "registry empty")
local seen = {}
for _, a in ipairs(registry) do
	assert(a.id and a.id ~= "", "animation missing id")
	assert(not seen[a.id], "duplicate animation id: " .. tostring(a.id))
	seen[a.id] = true
	assert(type(a.apply) == "function", "animation '" .. a.id .. "' missing apply()")
	assert(type(a.reset) == "function", "animation '" .. a.id .. "' missing reset()")
	if a.controlKey then
		assert(inputKeys[a.controlKey],
			"animation '" .. a.id .. "' controlKey '" .. a.controlKey .. "' not in InputKeys")
	end
end

------------------------------------------------------------------------------
-- Drive SetAnimations across every combination (must not error).
------------------------------------------------------------------------------
local setAnimations = loadstring(ml.blocks.SetAnimations)()
local runs = 0
for _, fade in ipairs({ 0, 1 }) do
for _, popIn in ipairs({ 0, 1 }) do
for _, slideUp in ipairs({ 0, 1 }) do
for _, mode in ipairs({ 0, 1, 2 }) do
for _, level in ipairs({ 0, 1 }) do
	local settings = {
		FadeEnabled = fade, PopInEnabled = popIn, SlideUpEnabled = slideUp,
		AnimationMode = mode, AnimationLevel = level, AnimationLength = 0.2,
	}
	local comp, tool = makeScene(settings, function(k)
		if k == "AnimationRegistry" then return ml.blocks.AnimationRegistry end
		return nil
	end)
	local ok, err = pcall(setAnimations, comp, tool)
	assert(ok, string.format("SetAnimations errored (fade=%d pop=%d slide=%d mode=%d level=%d): %s",
		fade, popIn, slideUp, mode, level, tostring(err)))
	runs = runs + 1
end end end end end

print(string.format("OK: %d block(s), %d animation(s), %d SetAnimations runs passed",
	(function() local n = 0 for _ in pairs(ml.blocks) do n = n + 1 end return n end)(),
	#registry, runs))
