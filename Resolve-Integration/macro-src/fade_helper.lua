-- Shared fade implementation: the single source of truth for the caption
-- fade-in / fade-out opacity curve.
--
-- set_animations applies this exactly once per update, either because the user
-- enabled FadeEnabled directly, or because an enabled animation declares
-- `usesFade = true` (pop-in / slide-up look nicer over a fade). Do NOT duplicate
-- this curve into other animations.
--
-- Available to animation descriptors as the upvalue `fade_helper` (wired in by
-- build-macro.mjs when it assembles the AnimationRegistry chunk).
return {
	-- Connect the follower Opacity to the animation stretcher and write the fade
	-- spline. `ctx` is the shared context built in set_animations.lua.
	apply = function(follower, ctx)
		local animStretcher = ctx.animStretcher
		local animSpline = ctx.animSpline
		local animInEnd = ctx.animInEnd
		local animOutStart = ctx.animOutStart
		local mode = ctx.mode

		follower.Opacity1 = animStretcher.Result
		follower.Opacity2 = animStretcher.Result
		follower.Opacity3 = animStretcher.Result
		follower.Opacity4 = animStretcher.Result

		local keyframes
		if mode == 0 then
			-- In only
			keyframes = {
				[0] = { 0 },
				[animInEnd] = { 1, LH = { -animInEnd, 0 } },
				[100] = { 1 },
			}
		elseif mode == 1 then
			-- Out only
			keyframes = {
				[0] = { 1 },
				[animOutStart] = { 1 },
				[100] = { 0 },
			}
		else
			-- Both (default)
			keyframes = {
				[0] = { 0 },
				[animInEnd] = { 1, LH = { -animInEnd, 0 } },
				[animOutStart] = { 1 },
				[100] = { 0 },
			}
		end

		animSpline:SetKeyFrames(keyframes, true)
		print("Applied Fade animation (mode: " .. mode .. ")")
	end,
	-- Flat opacity = 1 across the whole clip (used when nothing needs a fade).
	flat = function(follower, ctx)
		local animStretcher = ctx.animStretcher
		local animSpline = ctx.animSpline

		follower.Opacity1 = animStretcher.Result
		follower.Opacity2 = animStretcher.Result
		follower.Opacity3 = animStretcher.Result
		follower.Opacity4 = animStretcher.Result
		animSpline:SetKeyFrames({
			[0] = { 1, Flags = { StepIn = true } },
			[100] = { 1, Flags = { StepIn = true } },
		}, true)
	end,
}
