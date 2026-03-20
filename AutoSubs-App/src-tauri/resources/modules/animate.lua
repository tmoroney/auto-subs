---@diagnostic disable: undefined-global
local resolve = resolve

-- Resolve variables
local projectManager = resolve:GetProjectManager()

-- Project variables (probably best to get these when actual function is called)
local project = projectManager:GetCurrentProject()
local timeline = project:GetCurrentTimeline()

function SetInputs(tool, inputTable)
    for key, value in pairs(inputTable) do
        tool:SetInput(key, value)
    end
end

function Fade(follower, duration, animDuration)
    local properties = { "Opacity1", "Opacity2", "Opacity3" }
    print("Anim duration: " .. animDuration)
    for _, prop in ipairs(properties) do
        local value = follower:GetInput(prop)

        -- Fade in
        local keyframes = {
            [0] = { 0, RH = { 3.33333333, 0.333333333 } },
            [animDuration] = { value, LH = { 0, value } },
            [duration - animDuration] = { value },
            [duration] = { 0 },
        }
        follower:AddModifier(prop, "BezierSpline")
        local spline = follower[prop]:GetConnectedOutput():GetTool()
        spline:SetKeyFrames(keyframes)
    end
end

function PopIn(follower, duration, animDuration)
    local value = follower:GetInput("Size")

    -- Pop in
    local keyframes = {
        [0] = { 0 },
        [animDuration] = { value },
        [duration - animDuration] = { value },
        [duration] = { 0 },
    }
    follower:AddModifier("Size", "BezierSpline")
    local spline = follower.Size:GetConnectedOutput():GetTool()
    spline:SetKeyFrames(keyframes, true)
end

function SlideUp(follower, duration, animDuration)
    local keyframes = {
        [0] = { -0.7 },
        [animDuration] = { 0 },
        [duration - animDuration] = { 0 },
        [duration] = { -0.7 },
    }

    for i = 1, 3 do
        local offsetProp = "Offset" .. i
        local path = "XYPath" .. i
        follower:AddModifier(offsetProp, "XYPath")
        local xyPath = follower:FindTool(path)
        xyPath:AddModifier("Y", "BezierSpline")
        local spline = xyPath.Y:GetConnectedOutput():GetTool()
        spline:DeleteKeyFrames(0)
        spline:SetKeyFrames(keyframes)
    end
end

-- Animate characters gradually
function AnimateGradual(follower, duration, wordTimings)
    follower:AddModifier("DelayByCharacterPosition", "BezierSpline")
    local spline = follower.DelayByCharacterPosition:GetConnectedOutput():GetTool()

    local keyframes = {}
    for i, word in ipairs(wordTimings) do
        local startFrame = word.startFrame
        local endFrame = word.endFrame
        local startIndex = word.startIndex
        local endIndex = word.endIndex
        local charsToAdd = endIndex - startIndex
        if i == 1 then
            keyframes[0] = { startFrame, RH = { endIndex, animDuration } }
        else
            local gapBefore = wordTimings[i - 1].startFrame - startFrame
            if i < #wordTimings then
                keyframes[startIndex] = { startFrame, LH = { -1, gapBefore }, RH = { charsToAdd, animDuration } }
            else
                keyframes[startIndex] = { startFrame, LH = { -1, gapBefore }, RH = { charsToAdd, 0 } }
                keyframes[endIndex] = { endFrame, LH = { 0, startFrame - endFrame } }
            end
        end
    end
    dump(keyframes)
    spline:SetKeyFrames(keyframes)

    -- Configure all words to animate together at the end
    follower:SetInput("Order", 6)
    follower:SetInput("DelayType", 1)
    follower:SetInput("Delay", 0.5)
    follower:AddModifier("Order", "BezierSpline")
    spline = follower.Order:GetConnectedOutput():GetTool()
    print(duration)
    keyframes = {
        [duration - animDuration - 1] = { 6 },
        [duration - animDuration] = { 0 },
    }
    spline:SetKeyFrames(keyframes)
end

-- Animate whole words (no character by character animation)
function AnimateStepIn(follower, duration)
    follower:AddModifier("DelayByCharacterPosition", "BezierSpline")
    local spline = follower.DelayByCharacterPosition:GetConnectedOutput():GetTool()
    local keyframes = {
        [0] = { 0 },
        [8] = { 20 },
        [16] = { 50 },
        [21] = { 80 }
    }
    spline:SetKeyFrames(keyframes)
    local name = spline.Name
    local settings = spline:SaveSettings()
    for key, _ in pairs(settings.Tools[name].KeyFrames) do
        settings.Tools[name].KeyFrames[key].Flags = {}
        settings.Tools[name].KeyFrames[key].Flags["StepIn"] = true
    end
    spline:LoadSettings(settings)

    -- Configure all words to animate together at the end
    follower:SetInput("Order", 6)
    follower:SetInput("DelayType", 1)
    follower:SetInput("Delay", 0.5)
    follower:AddModifier("Order", "BezierSpline")
    spline = follower.Order:GetConnectedOutput():GetTool()
    print(duration)
    keyframes = {
        [duration - animDuration - 1] = { 6 },
        [duration - animDuration] = { 0 },
    }
    spline:SetKeyFrames(keyframes)
end

function HighlightSpokenWords(comp, follower, wordTimings, duration)
    -- Ensure the StyledTextCLS modifier is added
    --follower:AddModifier("Text", "StyledTextCLS")
    -- Find the CharacterLevelStyling tool
    --local characterLevelStyling = follower.Text:GetConnectedOutput():GetTool()
    -- Add the BezierSpline modifier to the CharacterLevelStyling tool
    --characterLevelStyling:AddModifier("CharacterLevelStyling", "BezierSpline")
    --local spline = characterLevelStyling.CharacterLevelStyling:GetConnectedOutput():GetTool()

    -- Extract existing settings for the specific tool
    local splineKey = "CharacterLevelStyling1RightclickHeretoAnimateCharacterLevelStyling"
    local compSettings = comp:CopySettings()
    local settings = compSettings.Tools[splineKey]

    -- if the spline doesn't exist, create it
    if settings == nil then
        local characterLevelStyling = follower.Text:GetConnectedOutput():GetTool()
        characterLevelStyling:AddModifier("CharacterLevelStyling", "BezierSpline")
        -- can be removed like this comp.Settings.Tools.CharacterLevelStyling = nil
    end

    -- should be passed in to functions (only setting the outline colour for testing)
    local styleKey = "Outline"
    local highlight = { Red = 0.8, Green = 0.2, Blue = 0.2, Opacity = 1.0 }

    -- Global Constants
    local styleIdMap = {
        Fill = 1,
        Outline = 2,
        Shadow = 3,
        Background = 4
    }
    local inputCodes = {
        Red = 2401,
        Green = 2402,
        Blue = 2403,
        Opacity = 2600
    }
    local styleId = styleIdMap[styleKey] or styleIdMap.Background

    -- Get current style info (from inputs) - possibly not needed as could set to nil
    local tool = comp:FindToolByID("TextPlus")
    local original = {}
    for key, _ in pairs(inputCodes) do
        original[key] = tool:GetInput(key .. styleId)
    end

    -- Append all styling attributes for a word
    local function appendWordColors(styledText, word, styleIndex, data)
        for key, value in pairs(data) do
            table.insert(styledText, {
                inputCodes[key], -- get resolve internal id
                word.startIndex,
                word.endIndex,
                __flags = 256,
                Index = styleIndex,
                Value = value
            })
        end
    end

    local keyframes = {}
    for i, spokenWord in ipairs(wordTimings) do
        local styledText = {}
        for j, word in ipairs(wordTimings) do
            -- Highlight spoken word + Reset styling for all other words
            appendWordColors(styledText, word, styleId, (i == j) and highlight or original)
        end

        -- Create keyframe data with internal Resolve boilerplate
        local keyframeData = {
            i - 1,
            Value = {
                __ctor = "StyledText",
                Array = styledText,
                Flags = { Linear = true, LockedY = false, __flags = 256 }
            }
        }

        -- Set styling to show when word is spoken
        keyframes[spokenWord.startFrame] = keyframeData

        if i < #wordTimings then
            -- Hold until just before next word (prevents unwanted interpolation)
            keyframes[wordTimings[i + 1].startFrame - animDurationShort] = keyframeData
        end
    end

    -- Update keyframes
    settings.KeyFrames = keyframes
    follower:LoadSettings(settings)
    print("Keyframes successfully updated.")
end

function BuildAnimation(follower, clipDuration, animDuration, animationList)
    print(animDuration)
    for _, animation in ipairs(animationList) do
        if animation == "fade" then
            Fade(follower, clipDuration, animDuration)
        elseif animation == "popin" then
            PopIn(follower, clipDuration, animDuration)
        elseif animation == "slideup" then
            SlideUp(follower, clipDuration, animDuration)
        end
    end
end

function ExampleData()
    local wordData = {}

    -- add 3 empty words (prevent .end from causing issues)
    for i = 1, 3 do
        table.insert(wordData, {})
    end

    wordData[1]["start"] = 0
    wordData[1]["end"] = 1.0
    wordData[1]["word"] = "Subtitle"
    wordData[1]["value"] = 0.8

    wordData[2]["start"] = 1
    wordData[2]["end"] = 2.5
    wordData[2]["word"] = " Example"
    wordData[2]["value"] = 0.8

    wordData[3]["start"] = 2
    wordData[3]["end"] = 4.0
    wordData[3]["word"] = " Text"
    wordData[3]["value"] = 0.8

    return wordData
end

local function generate_word_keyframes(wordTimings, framerate)
    local keyframes = {}
    local charIndex = 0
    for i, word in ipairs(wordTimings) do
        -- Format: [index of first character in word] = { frame to start showing word }
        keyframes[charIndex] = { word.start * framerate, Flags = { StepIn = true } }

        -- Move to start of next word
        charIndex = charIndex + #word.word + 1 -- +1 for space
    end
    return keyframes
end

local function get_delay_spline(comp)
    local splineName = "Follower1DelaybyCharacterPosition"
    local spline = comp:FindTool(splineName)
    if not spline then
        splineName = "AutoSubsDelaybyCharacterPosition"
        spline = comp:FindTool(splineName)
    end
    return spline
end

function AddWordTiming(comp, framerate, wordTimings, clipDuration, animDuration)
    local spline = get_delay_spline(comp)

    -- Make sure that all keyframes are set to StepIn (prevent weird character by character animation)
    local name = spline.Name
    local settings = spline:SaveSettings()
    settings.Tools[name].KeyFrames = generate_word_keyframes(wordTimings, framerate)
    spline:LoadSettings(settings)
end

function SetupAnimation(comp, follower, stretcher1, stretcher2, spline1, spline2, animInEnd, animOutStart)
    local mainTool = comp:FindTool("AutoSubs")
    local anims = mainTool:GetData("Animations")
    local animLength = tool:GetInput("AnimLength")
    local fadeEnabled = tool:GetInput("FadeEnabled") == 1
    local popInEnabled = tool:GetInput("PopInEnabled") == 1
    local slideUpEnabled = tool:GetInput("SlideUpEnabled") == 1

    -- Load helper functions from CustomData
    local findTools = loadstring(anims.FindTools)()
    local removeXYPaths = loadstring(anims.RemoveXYPaths)()

    local tools = findTools(comp)
    if not tools then return end

    local follower = tools.follower
    local stretcher1 = tools.stretcher1
    local stretcher2 = tools.stretcher2
    local spline1 = tools.spline1
    local spline2 = tools.spline2

    local fps = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate")) or 30
    local frames = math.max(math.floor(animLength * fps + 0.5), 5)
    local animInEnd = frames
    local animOutStart = 100 - frames

    -- Fade (also applied with SlideUp and PopIn)
    if fadeEnabled or slideUpEnabled or popInEnabled then
        local applyFade = loadstring(anims.ApplyFade)()
        applyFade(follower, stretcher1, spline1, animInEnd, animOutStart)
    else
        -- No fade: preserve word timing but make opacity jump to full in 1 frame
        follower.Opacity1 = stretcher1.Result
        follower.Opacity2 = stretcher1.Result
        follower.Opacity3 = stretcher1.Result
        spline1:SetKeyFrames({
            [0] = { 0, Flags = { StepIn = true } },
            [1] = { 1, Flags = { StepIn = true } },
            [99] = { 1, Flags = { StepIn = true } },
            [100] = { 0, Flags = { StepIn = true } },
        }, true)
    end

    -- PopIn
    if popInEnabled then
        local applyPopIn = loadstring(anims.ApplyPopIn)()
        applyPopIn(follower, animInEnd, animOutStart)
    else
        local resetPopIn = loadstring(anims.ResetPopIn)()
        resetPopIn(follower)
    end

    -- SlideUp
    if slideUpEnabled then
        local applySlideUp = loadstring(anims.ApplySlideUp)()
        applySlideUp(follower, animInEnd, animOutStart)
    else
        removeXYPaths(follower)
    end

    -- Update stretcher timing
    stretcher1:SetInput("StretchStart", animInEnd)
    stretcher1:SetInput("StretchEnd", animOutStart)
    spline2:SetKeyFrames({
        [animOutStart - 1] = { 6, Flags = { StepIn = true } },
        [animOutStart] = { 0, Flags = { StepIn = true } },
    }, true)
    stretcher2:SetInput("StretchEnd", animOutStart)
end

-- Animation Plan
-- 1. Add animation to follower
-- 2. Add word timings



-- Main
local timelineItems = timeline:GetItemListInTrack("video", 2);
local timelineItem = timelineItems[1]

if timelineItem:GetFusionCompCount() > 0 then
    local comp = timelineItem:GetFusionCompByIndex(1)
    local framerate = comp:GetPrefs("Comp.FrameFormat.Rate")
    local clipDuration = timelineItem:GetDuration()
    local animDuration = 0.14 * framerate
    local animDurationShort = 0.05 * framerate

    local template = comp:FindToolByID("TextPlus")
    template:SetInput("StyledText", "Subtitle Example Text")
    local currentTool = comp:GetToolList(false, "StyledTextFollower")
    local follower = nil
    if #currentTool > 0 then
        follower = currentTool[1]
    else
        template:AddModifier("StyledText", "StyledTextFollower")
        follower = comp:GetToolList(false, "StyledTextFollower")[1]
    end

    local wordData = ExampleData()

    AddWordTiming(comp, framerate, wordData, clipDuration, animDuration)
    --BuildAnimation(follower, clipDuration, animDuration, { "fade", "popin" })
    Fade(follower, clipDuration, animDuration)
    comp.CurrentTime = 0
end

local animate = {}
animate.addWordTiming = AddWordTiming
animate.highlight = HighlightWords
animate.popin = PopIn
animate.fade = Fade
animate.slideup = SlideUp
animate.gradual = AnimateGradual
animate.stepin = AnimateStepIn
return animate
