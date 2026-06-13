-- Slide-up animation descriptor: XYPath + KeyStretcher on the follower Offset
-- inputs animate the text vertically with a smooth ease-in.
return {
	id = "slideUp",
	label = "Slide Up",
	controlKey = "SlideUpEnabled",
	usesFade = true, -- looks nicer over a fade; set_animations adds the fade once
	apply = function(ctx)
		local follower = ctx.follower
		local animInEnd = ctx.animInEnd
		local animOutStart = ctx.animOutStart
		local mode = ctx.mode

		local yKeyframes
		if mode == 0 then
			-- In only
			yKeyframes = {
				[0] = { -0.1 },
				[animInEnd] = { 0, LH = { -animInEnd, 0 } },
				[100] = { 0 },
			}
		elseif mode == 1 then
			-- Out only
			yKeyframes = {
				[0] = { 0 },
				[animOutStart] = { 0 },
				[100] = { -0.1 },
			}
		else
			-- Both (default)
			yKeyframes = {
				[0] = { -0.1 },
				[animInEnd] = { 0, LH = { -animInEnd, 0 } },
				[animOutStart] = { 0 },
				[100] = { -0.1 },
			}
		end
		for i = 1, 3 do
			local offsetProp = "Offset" .. i
			follower:AddModifier(offsetProp, "XYPath")
			local xyPath = follower[offsetProp]:GetConnectedOutput():GetTool()
			if xyPath then
				xyPath:AddModifier("Y", "KeyStretcherMod")
				local yStretcher = xyPath.Y:GetConnectedOutput():GetTool()
				if yStretcher then
					yStretcher:AddModifier("Keyframes", "BezierSpline")
					local ySpline = yStretcher.Keyframes:GetConnectedOutput():GetTool()
					if ySpline then
						ySpline:SetKeyFrames(yKeyframes, true)
					end
					yStretcher:SetInput("StretchStart", animInEnd)
					yStretcher:SetInput("StretchEnd", animOutStart)
				end
			end
		end
		print("Applied SlideUp animation (mode: " .. mode .. ")")
	end,
	reset = function(follower)
		helpers.RemoveOffsetModifiers(follower)
	end,
}
