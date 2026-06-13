return function(comp, tool)
	-- Get timeline item that contains this composition
	local getTimelineItem = loadstring(tool:GetData("GetTimelineItem"))()
	local item = getTimelineItem(comp)
	if not item then return end

	-- Get follower delay spline
	local spline = comp:FindTool(tool:GetData("DelaySpline"))

	-- Get comp offset
	local offset = comp:GetAttrs("COMPN_RenderStart")

	-- Collect marker positions from timeline
	local markers = item:GetMarkers()
	local markerFrames = {}
	for frame, markerInfo in pairs(markers) do
		if markerInfo["customData"] == "AutoSubs" then
			table.insert(markerFrames, frame - offset)
		end
	end

	-- Sort markers by frame number
	table.sort(markerFrames)

	-- Split text into words
	local text = tool:GetInput("Text")
	local words = {}
	for word in text:gmatch("%S+") do
		table.insert(words, word)
	end
	
	-- UTF-8 aware character count
	local function utf8len(s)
		local _, count = s:gsub("[^\128-\191]", "")
		return count
	end

	-- Build intermediate word timing format
	local wordTiming = {}
	local count = math.min(#markerFrames, #words)
	local charIndex = 0
	
	for i = 1, count do
		local wordText = words[i]
		if i > 1 then
			wordText = " " .. wordText
		end

		local length = utf8len(wordText)
		local startFrame = markerFrames[i]
		local endFrame
	
		if i < count then
			endFrame = markerFrames[i + 1]
		else
			endFrame = startFrame
		end
	
		table.insert(wordTiming, {
			["startIndex"] = charIndex,
			["endIndex"] = charIndex + length - 1,
			["startFrame"] = startFrame,
			["endFrame"] = endFrame,
		})

		charIndex = charIndex + length
	end
	
	-- Apply word timing (update spline, store data, refresh highlight)
	loadstring(tool:GetData("ApplyWordTiming"))()(comp, tool, wordTiming)

	-- Clean up markers
	while item:DeleteMarkerByCustomData("AutoSubs") do end
end
