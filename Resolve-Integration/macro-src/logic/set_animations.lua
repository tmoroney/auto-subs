-- Registry-driven animation orchestrator.
--
-- Replaces the old hard-coded fade coupling. Fade is now applied exactly once,
-- when FadeEnabled is on OR any enabled animation declares `usesFade = true`
-- (see macro-src/animations/*.lua). Adding an animation no longer requires
-- editing this file — just drop a descriptor in animations/ and list it in
-- animations/_registry.lua.
return function(comp, tool)
	-- Ordered list of animation descriptors ({ id, label, controlKey, usesFade,
	-- apply, reset, [flat] }). Assembled by build-macro.mjs.
	local registry = loadstring(tool:GetData("AnimationRegistry"))()

	local animationLength = tool:GetInput("AnimationLength")
	local animationLevel = tool:GetInput("AnimationLevel")
	local animationMode = tool:GetInput("AnimationMode") or 2

	local follower = comp:FindTool("Follower1")
	local animStretcher = comp:FindTool("AnimationKeyframeStretcher")
	local orderStretcher = comp:FindTool("OrderKeyframeStretcher")
	local animSpline = animStretcher.Keyframes:GetConnectedOutput():GetTool()
	local orderSpline = orderStretcher.Keyframes:GetConnectedOutput():GetTool()

	-- Calculate animation frames
	local fps = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate")) or 30
	local function round(x) return math.floor(x + 0.5) end
	local frames = round(animationLength * fps)
	local animInEnd = frames
	local animOutStart = 100 - frames

	-- Shared context handed to every animation's apply()/flat() so new animations
	-- never need new positional arguments.
	local ctx = {
		comp = comp,
		tool = tool,
		follower = follower,
		animStretcher = animStretcher,
		animSpline = animSpline,
		animInEnd = animInEnd,
		animOutStart = animOutStart,
		animationLevel = animationLevel,
		mode = animationMode,
		fps = fps,
	}

	-- 1. Reset every animation to a clean slate (idempotent).
	for _, anim in ipairs(registry) do
		if anim.reset then anim.reset(follower) end
	end

	-- 2. Determine enabled animations and whether a fade is needed.
	local enabled = {}
	local needsFade = tool:GetInput("FadeEnabled") == 1
	local fadeAnim = nil
	for _, anim in ipairs(registry) do
		if anim.id == "fade" then fadeAnim = anim end
		if anim.controlKey and tool:GetInput(anim.controlKey) == 1 then
			table.insert(enabled, anim)
			if anim.usesFade then needsFade = true end
		end
	end

	-- 3. Apply the single shared fade (or flat opacity) exactly once.
	if fadeAnim then
		if needsFade then
			fadeAnim.apply(ctx)
		else
			fadeAnim.flat(ctx)
		end
	end

	-- 4. Apply each enabled animation's own effect (the fade module is a no-op here).
	for _, anim in ipairs(enabled) do
		if anim.id ~= "fade" then
			anim.apply(ctx)
		end
	end

	-- 5. Set stretcher time ranges
	animStretcher:SetInput("StretchStart", animInEnd)
	animStretcher:SetInput("StretchEnd", animOutStart)

	-- Configure order spline for out animation (animate entire line out, not word by word)
	orderSpline:SetKeyFrames({
		[animOutStart-1] = { 6, Flags = { StepIn = true } }, -- "Manual Curve"
		[animOutStart] = { 0, Flags = { StepIn = true } },   -- "Automatic" (everything animates together)
	}, true)
	orderSpline:SetInput("StretchEnd", animOutStart)
end
