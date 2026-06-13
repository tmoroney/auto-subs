return function(comp, tool, wordTiming)
	local spline = comp:FindTool(tool:GetData("DelaySpline"))

	local settings = spline:SaveSettings()
	if tool:GetInput("AnimationLevel") == 1 then
		local keyframes = loadstring(tool:GetData("ConvertToDelayKeyframes"))()(wordTiming)
		settings.Tools[spline.Name].KeyFrames = keyframes
	else
		local text = tool:GetInput("Text")
		settings.Tools[spline.Name].KeyFrames = {
			[#text] = { 0, Flags = { StepIn = true } },
		}
	end
	spline:LoadSettings(settings)

	tool:SetData("WordTiming", wordTiming)
	loadstring(tool:GetData("UpdateHighlight"))()(comp, tool)
end
