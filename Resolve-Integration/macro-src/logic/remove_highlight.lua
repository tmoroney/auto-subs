return function(comp, tool)
	local follower = comp:FindTool("Follower1")
	local characterLevelStyling = follower.Text:GetConnectedOutput():GetTool()
	local spline = characterLevelStyling.CharacterLevelStyling:GetConnectedOutput():GetTool()
	loadstring(tool:GetData("UpdateAllStyleColors"))()(comp, tool)

	local keyframes = {
		[0] = {
	        0,                         -- index of keyframe in the array (0-based) - kinda random - why?
	        Value = {
	            __ctor = "StyledText", -- internal id to designate this as a StyledText object
	            Array = {}, -- empty array uses default styling
	            Flags = { StepIn = true, LockedY = true, __flags = 256 }
	        },
	    },
	}

	spline:SetKeyFrames(keyframes, true)

	-- Disable Bubble (enabled specifically for highlight)
	local template = comp:FindTool("Template")
	template:SetInput("Enabled4", 0)
end
