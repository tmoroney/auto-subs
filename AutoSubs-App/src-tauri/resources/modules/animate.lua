local projectManager = resolve:GetProjectManager()
local project = projectManager:GetCurrentProject()
local timeline = project:GetCurrentTimeline()
local framerate = timeline:GetSetting("timelineFrameRate")
local animDuration = math.floor(0.14 * framerate)
local animDurationShort = math.floor(0.05 * framerate)

function SetInputs(tool, inputTable)
    for key, value in pairs(inputTable) do
        tool:SetInput(key, value)
    end
end

function Fade(template, follower, duration)
    local properties = { "Opacity1", "Opacity2", "Opacity3" }
    for _, prop in ipairs(properties) do
        local value = template:GetInput(prop)

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

function PopIn(template, follower, duration)
    local value = template:GetInput("Size")

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

function SlideUp(comp, follower, duration)
    local keyframes = {
        [0] = { -0.7 },
        [animDuration] = { 0 },
        [duration - 7] = { 0 },
        [duration] = { -0.7 },
    }

    for i = 1, 3 do
        local offsetProp = "Offset" .. i
        local path = "XYPath" .. i
        follower:AddModifier(offsetProp, "XYPath")
        local xyPath = comp:FindTool(path)
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
            local gapBefore = wordTimings[i-1].startFrame - startFrame
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

function HighlightWords(comp, follower, wordTimings, duration)
    -- Ensure the StyledTextCLS modifier is added
    follower:AddModifier("Text", "StyledTextCLS")

    -- Find the CharacterLevelStyling tool
    local characterLevelStyling = follower.Text:GetConnectedOutput():GetTool()

    -- Add the BezierSpline modifier to the CharacterLevelStyling tool
    characterLevelStyling:AddModifier("CharacterLevelStyling", "BezierSpline")
    --local spline = characterLevelStyling.CharacterLevelStyling:GetConnectedOutput():GetTool()

    -- Extract existing settings for the specific tool
    local settings = comp:CopySettings()
    local characterLevelStylingSettings = settings.Tools["CharacterLevelStyling1RightclickHeretoAnimateCharacterLevelStyling"]

    local keyframes = {}
    for i, spokenWord in ipairs(wordTimings) do
        local styledText = {}
        -- Set styled text properties for each word at the current frame
        for j, word in ipairs(wordTimings) do
            if i == j then
                table.insert(styledText, { 2401, word.startIndex, word.endIndex, Value = word.value, __flags = 256, Index = 1 })
            else
                table.insert(styledText, { 2401, word.startIndex, word.endIndex, Value = 0, __flags = 256, Index = 1 })
            end
        end
        local keyframeData = {
            i - 1,
            Value = {
                __ctor = "StyledText",
                Array = styledText,
                Flags = { Linear = true, LockedY = false, __flags = 256 }
            }
        }
        keyframes[spokenWord.startFrame] = keyframeData
        if i < #wordTimings then
            keyframes[wordTimings[i+1].startFrame - animDurationShort] = keyframeData
        end
    end

    characterLevelStylingSettings.KeyFrames = keyframes

    -- Delete existing tool and apply the updated settings back to the tool
    characterLevelStyling:Delete()
    follower:LoadSettings(settings)
    print("Keyframes successfully updated.")
end

local function getWordTimings(text, words)
    local timings = {}
    local currentIndex = 0

    for _, word in ipairs(words) do
        local startIndex = string.find(text, word.text, currentIndex + 1, true) - 1
        local endIndex = startIndex + #word.text
        table.insert(timings, {
            startTime = word.startTime,
            endTime = word.endTime,
            startFrame = math.floor(word.startTime * framerate),
            endFrame = math.floor(word.endTime * framerate),
            startIndex = startIndex,
            endIndex = endIndex,
            value = 0.8 -- Highlight colour
        })
        currentIndex = endIndex + 1
    end

    return timings
end



-- Main
local timelineItems = timeline:GetItemListInTrack("video", 2);
local timelineItem = timelineItems[1]

if timelineItem:GetFusionCompCount() > 0 then
    local comp = timelineItem:GetFusionCompByIndex(1)
    local duration = timelineItem:GetDuration()
    print("Duration:", duration)

    local template = comp:FindToolByID("TextPlus")
    local currentTool = comp:GetToolList(false, "StyledTextFollower")
    local follower = nil
    if #currentTool > 0 then
        follower = currentTool[1]
    else
        template:AddModifier("StyledText", "StyledTextFollower")
        follower = comp:GetToolList(false, "StyledTextFollower")[1]
    end

    local textExample = "Subtitle Example Text"
    local wordData = {
        { startTime = 0, endTime = 1.0, text = "Subtitle" },
        { startTime = 1, endTime = 2.5, text = "Example" },
        { startTime = 2, endTime = 4.0, text = "Text" }
    }

    local wordTimings = getWordTimings(textExample, wordData)

    comp.CurrentTime = 0

    -- Animation
    Fade(template, follower, duration)
    PopIn(template, follower, duration)
    --SlideUp(comp, follower, duration)

    -- Type of Animation
    AnimateGradual(follower, duration, wordTimings)
    --AnimateStepIn(follower, duration, wordTimings)

    -- Highlight spoken words
    --HighlightWords(comp, follower, wordTimings, duration)
end

local animate = {}
animate.highlight = HighlightWords
animate.popin = PopIn
animate.fade = Fade
animate.slideup = SlideUp
animate.gradual = AnimateGradual
animate.stepin = AnimateStepIn
return animate