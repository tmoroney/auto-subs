return function(wordTiming)
	local keyframes = {}
	for _, word in ipairs(wordTiming) do
		keyframes[word.startIndex] = { word.startFrame, Flags = { StepIn = true } }
	end
	return keyframes
end
