return function(tool)
	local keys = tool:GetData("InputKeys")
	local settings = {}
	for _, key in ipairs(keys) do
		settings[key] = tool:GetInput(key)
	end
	return settings
end
