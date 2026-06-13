return function(comp)
	-- Final attempt at getting Resolve object for Free version users
	local resolve = _G.resolve 
		or (fusion and fusion.GetResolve and fusion:GetResolve()) 
		or (app and app.GetResolve and app:GetResolve()) 
		or (bmd and bmd.scriptapp and bmd.scriptapp("Resolve"))
		or (comp:GetApp() and comp:GetApp():GetResolve())

	-- Strict check: must be a valid object (userdata or table)
	if type(resolve) ~= "userdata" and type(resolve) ~= "table" then
		print("[CHECK-123] This feature (Markers) requires DaVinci Resolve Studio or enabled Scripting API.")
		return nil
	end

	local projectManager = resolve:GetProjectManager()
	local currentProject = projectManager:GetCurrentProject()
	local timeline = currentProject:GetCurrentTimeline()

	local function itemContainsComp(timelineItem, targetComp)
		if timelineItem:GetFusionCompCount() == 0 then
			return false
		end

		return timelineItem:GetFusionCompByIndex(1) == targetComp
	end
	
	-- Search from top track down (subtitles usually on top track - faster)
	local videoTrackCount = timeline:GetTrackCount("video")
	for trackIndex = videoTrackCount, 1, -1 do
		local itemsOnTrack = timeline:GetItemListInTrack("video", trackIndex)
		
		for _, timelineItem in ipairs(itemsOnTrack or {}) do
			if itemContainsComp(timelineItem, comp) then
				return timelineItem
			end
		end
	end
	
	return nil
end
