return function(comp, tool, type)
	local id = ({Fill="1", Outline="2", Shadow="3", Bubble="4"})[type]
	local template, follower = comp:FindTool("Template"), comp:FindTool("Follower1")

	local value = tool:GetInput(type .. "Enabled")
	template:SetInput("Enabled" .. id, value)
	follower:SetInput("Enabled" .. id, value)
	
	for _, key in ipairs({"Red", "Green", "Blue", "Thickness"}) do
		if type == "Outline" and key == "Thickness" then
			local value = tool:GetInput(type .. "Thickness")
			template:SetInput(key .. id, value)
			follower:SetInput(key .. id, value)
		else
			local value = tool:GetInput(type .. "Color" .. key)
			template:SetInput(key .. id, value)
			follower:SetInput(key .. id, value)
		end
	end

	loadstring(tool:GetData("UpdateHighlight"))()(comp, tool)
end
