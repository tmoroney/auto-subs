return function(comp, tool, settings)
	for key, value in pairs(settings) do
		tool:SetInput(key, value)
	end

	-- Update animation and highlight
	loadstring(tool:GetData("SetAnimations"))()(comp, tool)
	loadstring(tool:GetData("UpdateHighlight"))()(comp, tool)
end
