return function(comp, tool)
	local template, follower = comp:FindTool("Template"), comp:FindTool("Follower1")
	local types = {"Fill", "Outline", "Shadow", "Bubble"}
	
	for _, type in ipairs(types) do
		local id = ({Fill="1", Outline="2", Shadow="3", Bubble="4"})[type]
		
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
	end
end
