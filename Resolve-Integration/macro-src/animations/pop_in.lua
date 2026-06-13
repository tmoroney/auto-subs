-- Pop-in animation descriptor: KeyStretcher modifiers on the follower
-- Word/Line size inputs scale the text up with a smooth ease-in.
return {
	id = "popIn",
	label = "Pop In",
	controlKey = "PopInEnabled",
	usesFade = true, -- looks nicer over a fade; set_animations adds the fade once
	apply = function(ctx)
		local follower = ctx.follower
		local animInEnd = ctx.animInEnd
		local animOutStart = ctx.animOutStart
		local animationLevel = ctx.animationLevel
		local mode = ctx.mode

		local sizeKeyframes
		if mode == 0 then
			-- In only
			sizeKeyframes = {
				[0] = { 0.8 },
				[animInEnd] = { 1, LH = { -animInEnd, 0 } },
				[100] = { 1 },
			}
		elseif mode == 1 then
			-- Out only
			sizeKeyframes = {
				[0] = { 1 },
				[animOutStart] = { 1 },
				[100] = { 0.8 },
			}
		else
			-- Both (default)
			sizeKeyframes = {
				[0] = { 0.8 },
				[animInEnd] = { 1, LH = { -animInEnd, 0 } },
				[animOutStart] = { 1 },
				[100] = { 0 },
			}
		end
		local function applyStretchedKeyframes(propName)
			follower:AddModifier(propName, "KeyStretcherMod")
			local stretcher = follower[propName]:GetConnectedOutput():GetTool()
			if stretcher then
				stretcher:AddModifier("Keyframes", "BezierSpline")
				local spline = stretcher.Keyframes:GetConnectedOutput():GetTool()
				if spline then
					spline:SetKeyFrames(sizeKeyframes, true)
				end
				stretcher:SetInput("StretchStart", animInEnd)
				stretcher:SetInput("StretchEnd", animOutStart)
			end
		end
		local propX = animationLevel == 0 and "Line" or "Word"
		applyStretchedKeyframes(propX .. "SizeX")
		applyStretchedKeyframes(propX .. "SizeY")
		print("Applied PopIn animation (mode: " .. mode .. ")")
	end,
	reset = function(follower)
		follower.LineSizeX = nil
		follower.LineSizeY = nil
		follower.WordSizeX = nil
		follower.WordSizeY = nil
		follower:SetInput("LineSizeX", 1)
		follower:SetInput("LineSizeY", 1)
		follower:SetInput("WordSizeX", 1)
		follower:SetInput("WordSizeY", 1)
	end,
}
