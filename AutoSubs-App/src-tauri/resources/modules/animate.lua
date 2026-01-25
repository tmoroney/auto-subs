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

function AddWordTiming(follower, framerate, wordTimings, clipDuration, animDuration)
    follower:AddModifier("DelayByCharacterPosition", "BezierSpline")
    follower:SetInput("Order", 6)
    local delaySpline = follower.DelayByCharacterPosition:GetConnectedOutput():GetTool()

    local keyframes = {}
    local currentIndex = 0
    for i, word in ipairs(wordTimings) do
        -- Format: [index of first character of word in string] = { frame that word starts }
        keyframes[currentIndex] = { word.start * framerate }

        -- Update start index for next word
        currentIndex = currentIndex + #word.word
    end
    delaySpline:SetKeyFrames(keyframes)

    -- Make sure that all keyframes are set to StepIn (prevent weird character by character animation)
    local name = delaySpline.Name
    local settings = delaySpline:SaveSettings()
    for key, _ in pairs(settings.Tools[name].KeyFrames) do
        settings.Tools[name].KeyFrames[key].Flags = { StepIn = true }
    end
    delaySpline:LoadSettings(settings)

    -- Animate out all at once at the end of the clip
    follower:SetInput("DelayType", 0)
    follower:SetInput("Delay", 0.5)
    follower:AddModifier("Order", "BezierSpline")
    local orderSpline = follower.Order:GetConnectedOutput():GetTool()
    keyframes = {
        [clipDuration - animDuration - 1] = { 6 },
        [clipDuration - animDuration] = { 0 },
    }
    orderSpline:SetKeyFrames(keyframes)
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

    AddWordTiming(follower, framerate, wordData, clipDuration, animDuration)
    --BuildAnimation(follower, clipDuration, animDuration, { "fade", "popin" })
    Fade(follower, clipDuration, animDuration)
    comp.CurrentTime = 0
end

local animate = {}
animate.highlight = HighlightWords
animate.popin = PopIn
animate.fade = Fade
animate.slideup = SlideUp
animate.gradual = AnimateGradual
animate.stepin = AnimateStepIn
return animate
