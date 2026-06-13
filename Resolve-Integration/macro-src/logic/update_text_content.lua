return function(comp, tool, text)
	local function utf8len(s)
		local _, count = s:gsub("[^\128-\191]", "")
		return count
	end

	-- Split text into words
	local words = {}
	for word in text:gmatch("%S+") do
		table.insert(words, word)
	end

	local wordTiming = tool:GetData("WordTiming")
	if not wordTiming then return end

	local oldWordCount = #wordTiming
	local newWordCount = #words
	local hasExistingWords = oldWordCount > 0

	-- Determine a frames-per-character rate to dynamically estimate new word durations.
	local defaultFrameRate = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate")) or 30
	-- Default speaking speed: ~15 characters per second
	local defaultFramesPerChar = defaultFrameRate / 15
	local framesPerChar = defaultFramesPerChar

	-- Calculate pacing from existing words if available
	if hasExistingWords then
		local totalFrames = 0
		local totalChars = 0
		-- Sum up the durations and lengths of existing words to analyze the speaker's true pacing.
		for j = 1, oldWordCount do
			local duration = wordTiming[j].endFrame - wordTiming[j].startFrame
			local length = wordTiming[j].endIndex - wordTiming[j].startIndex + 1
			-- Only average words with valid timings and non-zero character counts.
			if duration > 0 and length > 0 then
				totalFrames = totalFrames + duration
				totalChars = totalChars + length
			end
		end
		
		-- If we have valid historical pacing data, use it.
		if totalChars > 0 then
			framesPerChar = totalFrames / totalChars
		end
	end

	-- If words were removed, delete their corresponding timing data from the end of the list first.
	if newWordCount < oldWordCount then
		for i = oldWordCount, newWordCount + 1, -1 do
			table.remove(wordTiming, i)
		end
	end

	-- Traverse all words to add new timings and recompute absolute character indices.
	local currentFrame = hasExistingWords and wordTiming[oldWordCount].endFrame or 0
	local charIndex = 0

	-- Used for clamping words to be within clip range
	local compositionEndFrame = comp:GetAttrs("COMPN_RenderEnd") or 1000

	for i = 1, newWordCount do
		local wordText = words[i]
		-- Reconstruct spaces between words to match the combined subtitle text structure.
		if i > 1 then
			wordText = " " .. wordText
		end

		-- Use UTF-8 safe length to accurately handle multi-byte characters and map index boundaries.
		local length = utf8len(wordText)

		if i > oldWordCount then
			-- Estimate timing for newly added words scaled by their character length.
			local startFrame = currentFrame
			local wordLength = utf8len(words[i])
			local duration = math.max(1, math.floor(wordLength * framesPerChar))
			local endFrame = startFrame + duration

			table.insert(wordTiming, {
				["startIndex"] = charIndex,
				["endIndex"] = charIndex + length - 1,
				["startFrame"] = math.min(startFrame, compositionEndFrame - 1),
				["endFrame"] = math.min(endFrame, compositionEndFrame - 1),
			})
			
			currentFrame = endFrame
		else
			-- Update character boundaries for existing words.
			wordTiming[i].startIndex = charIndex
			wordTiming[i].endIndex = charIndex + length - 1
		end

		-- Advance the character playhead for the next word.
		charIndex = charIndex + length
	end

	loadstring(tool:GetData("ApplyWordTiming"))()(comp, tool, wordTiming)
end
