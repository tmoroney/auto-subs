-- Shared animation helpers. Available to animation descriptors as the upvalue
-- `helpers` (wired in by build-macro.mjs when it assembles the AnimationRegistry
-- chunk). Files prefixed with `_` are NOT animation descriptors and are skipped
-- by the registry.
return {
	-- Remove the XYPath modifiers from the follower Offset inputs (slide-up uses
	-- these to animate vertical position).
	RemoveOffsetModifiers = function(follower)
		for i = 1, 3 do
			local offsetProp = "Offset" .. i
			local offsetInput = follower[offsetProp]
			if offsetInput then
				local output = offsetInput:GetConnectedOutput()
				if output then
					local xyPath = output:GetTool()
					-- Fusion exposes no tool-type query here, so we fall back to
					-- matching the tool name. slide_up.lua adds these via
					-- AddModifier(offsetProp, "XYPath"), whose default name contains
					-- "XYPath"; this guards against detaching an unrelated modifier.
					if xyPath and xyPath.Name:match("XYPath") then
						follower[offsetProp] = nil
					end
				end
			end
		end
	end,
}
