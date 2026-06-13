					return function(comp, tool)
						local STYLES = {"Fill", "Outline", "Shadow", "Bubble"}
						local STYLE_INDEX = {
							Fill = 1,
							Outline = 2, 
							Shadow = 3,
							Bubble = 4
						}
						local CHANNELS = { "Red", "Green", "Blue" } -- exclude opacity for now as it interferes with other effects
						local INTERNAL_CODES = { Red = 2401, Green = 2402, Blue = 2403, Enabled = 2000 } -- Note: Opacity = 2600

						loadstring(tool:GetData("UpdateAllStyleColors"))()(comp, tool)

						-- Function to retrieve the base style for non-highlighted words
						-- @param template: The template tool
						-- @param styleKey: The style key (e.g. "Fill", "Outline", etc.)
						-- @return: A table containing the base style values
						local function get_current_style(styleKey)
							local base = {}
							
							-- Get color values for all channels (Red, Green, Blue)
							for _, channel in ipairs(CHANNELS) do
								base[channel] = tool:GetInput(styleKey .. "Color" .. channel)
							end

							-- Handle enabled state differently for Bubble vs other styles
							local template = comp:FindTool("Template")
							local isBubbleStyle = styleKey == "Bubble"

							-- Bubble must be enabled at the template level or will not work with character-level styling
							template:SetInput("Enabled4", isBubbleStyle and 1 or 0)

							if isBubbleStyle then
								base["Enabled"] = 0 -- only highlighted words should have bubble enabled (disabled for base style)
							else
								base["Enabled"] = tool:GetInput(styleKey .. "Enabled")
							end

							return base
						end

						-- Build a StyledText Array where word at `activeIndex` uses `highlight` colors and the rest use `base`
						local function build_style_array(wordTiming, activeIndex, highlight, base, styleId)
							local array = {}
							for j, word in ipairs(wordTiming) do
								local style = j == activeIndex and highlight or base
								for key, internalCode in pairs(INTERNAL_CODES) do
									table.insert(array, {
										internalCode,
										word.startIndex,
										word.endIndex,
										Value = style[key],
										__flags = 256,
										Index = styleId
									})
								end
							end
							return array
						end

						-- Create a single StyledText keyframe value
						local function make_keyframe(index, styleArray)
							return {
								index,
								Value = {
									__ctor = "StyledText", -- internal id to designate this as a StyledText object
									Array = styleArray,
									Flags = { StepIn = true, LockedY = true, __flags = 256 }
								},
							}
						end

						local function round(x)
							return math.floor(x + 0.5)
						end

						local follower = comp:FindTool("Follower1")
						local characterLevelStyling = follower.Text:GetConnectedOutput():GetTool()
						local spline = characterLevelStyling.CharacterLevelStyling:GetConnectedOutput():GetTool()

						local wordTiming = tool:GetData("WordTiming")

						local highlight = {
    						Red = tool:GetInput("HighlightColorRed"),
    						Green = tool:GetInput("HighlightColorGreen"),
    						Blue = tool:GetInput("HighlightColorBlue"),
							Enabled = 1
						}

						-- (0=Fill, 1=Outline, 2=Shadow, 3=Bubble)
						local styleId = tool:GetInput("HighlightStyle")

						-- TextPlus input suffixes are 1-based (e.g. Red1, Red2).
						-- CharacterLevelStyling style indices appear to be 0-based.

						-- local animationLength = comp:FindTool("Template"):GetInput("AnimationLength")
						-- local fps = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate")) or 30
						-- local transitionFrames = round(animationLength * fps)
						local transitionFrames = 0

						-- +1 required: styleId is 0-based but Lua arrays are 1-based
						local styleKey = STYLES[styleId + 1]
						local base = get_current_style(styleKey)
						local keyframes = {}
						local keyframeIndex = 0
						for i, word in ipairs(wordTiming) do
							local startFrame = word.startFrame + (i > 1 and transitionFrames or 0)
							local styleArray = build_style_array(wordTiming, i, highlight, base, styleId)

							keyframes[startFrame] = make_keyframe(keyframeIndex, styleArray)
							keyframeIndex = keyframeIndex + 1

							if i < #wordTiming then
								-- Holds the style constant until just before the next word starts, so the
								-- transition only occurs near the word boundary rather than fading from
								-- the beginning of the current word all the way to the next
								keyframes[word.endFrame - 1] = make_keyframe(keyframeIndex, styleArray)
								keyframeIndex = keyframeIndex + 1
							end
						end

						spline:SetKeyFrames(keyframes, true)
					end
