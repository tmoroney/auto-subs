-- Fade animation descriptor.
--
-- Fade *is* the fade, so usesFade = false. The actual opacity curve lives in
-- the shared `fade_helper` (single source of truth); set_animations decides
-- when to call apply() vs flat().
return {
	id = "fade",
	label = "Fade",
	controlKey = "FadeEnabled",
	usesFade = false,
	-- Real fade-in/out.
	apply = function(ctx)
		fade_helper.apply(ctx.follower, ctx)
	end,
	-- Flat opacity = 1 (no fade). Called by set_animations when nothing needs a fade.
	flat = function(ctx)
		fade_helper.flat(ctx.follower, ctx)
	end,
	reset = function(follower)
		follower.Opacity1 = nil
		follower.Opacity2 = nil
		follower.Opacity3 = nil
		follower.Opacity4 = nil
		follower:SetInput("Opacity1", 1)
		follower:SetInput("Opacity2", 1)
		follower:SetInput("Opacity3", 1)
		follower:SetInput("Opacity4", 1)
	end,
}
