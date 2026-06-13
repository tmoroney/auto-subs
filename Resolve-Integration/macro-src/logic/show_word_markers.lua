return function(comp, tool)
	local getTimelineItem = loadstring(tool:GetData("GetTimelineItem"))()
	local item = getTimelineItem(comp)
	if not item then return end

	local wordTiming = tool:GetData("WordTiming")
	if not wordTiming or #wordTiming == 0 then
		print("[AutoSubs] No word timing data found. Please transcribe or add text first.")
		return
	end

	-- Clear existing markers
	while item:DeleteMarkerByCustomData("AutoSubs") do end

	print("[AutoSubs] Generating markers for " .. #wordTiming .. " words.")

	local offset = comp:GetAttrs("COMPN_RenderStart")
	for i, word in ipairs(wordTiming) do
		if word.startFrame then
			item:AddMarker(word.startFrame + offset, "Blue", "Word " .. i, "", 1, "AutoSubs")
		end
	end
end
