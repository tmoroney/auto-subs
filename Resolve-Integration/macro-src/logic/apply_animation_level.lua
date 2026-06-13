return function(comp, tool)
	-- Get current spline settings to be modified
	local spline = comp:FindTool(tool:GetData("DelaySpline"))
	local settings = spline:SaveSettings()

	if tool:GetInput("AnimationLevel") == 1 then
		-- Restore word timing keyframes
		local wordTiming = tool:GetData("WordTiming")
		local keyframes = loadstring(tool:GetData("ConvertToDelayKeyframes"))()(wordTiming)

		settings.Tools[spline.Name].KeyFrames = keyframes
		spline:LoadSettings(settings)
	else
		-- Remove word timing keyframes
		-- TODO: Investigate if easier to set Order type to Automatic
		local text = tool:GetInput("Text")
		if text and #text > 0 then
			settings.Tools[spline.Name].KeyFrames = {
				[#text] = { 0, Flags = { StepIn = true } },
			}
			spline:LoadSettings(settings)
		end
	end

	-- Scale type must be changed to line or word (if being utilised)
	if tool:GetInput("PopInEnabled") == 1 then
		loadstring(tool:GetData("SetAnimations"))()(comp, tool)
	end
end
