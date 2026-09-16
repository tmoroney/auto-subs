--[[
    Caption styling: everything that differs between the two kinds of caption.

    AutoSubs ships a Fusion macro that animates each word, and also supports any
    Text+ or Fusion title already in the user's media pool. Placing subtitles,
    restyling clips already on the timeline and rendering a preview thumbnail
    all have to handle both, and all three used to carry their own copy of the
    branch. They had already drifted: a missing SetInputValues helper was a hard
    error in one, a per-clip failure in another and a bare print in the third.

    This module owns that branch, so those three become one call each and share
    one error policy.
]]

local caption_style = {}

--- Name of the macro's root tool inside a caption comp.
local AUTOSUBS_TOOL = "AutoSubs"

--- What the bundled caption template is called in the media pool and in the UI.
--- The clip itself is versioned ("AutoSubs Caption 2026-01-01") so an upgrade
--- can sit alongside the old one, but everything outside this module deals in
--- the plain display name.
caption_style.DISPLAY_NAME = "AutoSubs Caption"
caption_style.BIN_NAME = "AutoSubs"

--- The versioned clip name for the template this build ships.
function caption_style.versioned_name(templateVersion)
    return caption_style.DISPLAY_NAME .. " " .. templateVersion
end

--- Whether a media pool clip name refers to the bundled caption template, in
--- any of its versions.
function caption_style.is_autosubs_template(templateName)
    if type(templateName) ~= "string" then return false end
    local display = caption_style.DISPLAY_NAME
    return templateName == display
        or templateName:sub(1, #display + 1) == display .. " "
end

--- TextPlus style slots, indexed as the tool names its inputs (Red1, Enabled2...).
local STYLE_INDEX = {
    Fill = 1,
    Outline = 2,
    Shadow = 3,
    Background = 4,
}

--- Channel names, matching both hex_to_rgb's keys and the TextPlus inputs.
local RGB_CHANNELS = { "Red", "Green", "Blue" }

--- UTF-8 aware character count, for word offsets into the caption text.
local function utf8len(s)
    local _, count = string.gsub(s, "[^\128-\191]", "")
    return count
end

--- Convert a hex colour to Resolve's 0-1 range. Returns nil if unparseable.
function caption_style.hex_to_rgb(hex)
    local r, g, b = hex:match("^#?(%x%x)(%x%x)(%x%x)$")
    if not r then return nil end
    return {
        Red = tonumber(r, 16) / 255,
        Green = tonumber(g, 16) / 255,
        Blue = tonumber(b, 16) / 255,
    }
end

--- Which kind of caption a comp holds: "autosubs" for the bundled macro,
--- "textplus" for anything else.
function caption_style.kind_of(comp)
    if comp and comp:FindTool(AUTOSUBS_TOOL) then
        return "autosubs"
    end
    return "textplus"
end

--- Per-word highlight timing, as frame offsets into the caption's own comp.
function caption_style.word_timing(words, frameRate, segmentStart)
    local result = {}
    local startIndex = 0

    for _, word in ipairs(words or {}) do
        local endIndex = startIndex + utf8len(word.word) - 1
        table.insert(result, {
            startIndex = startIndex,
            endIndex   = endIndex,
            startFrame = math.floor((word.start - segmentStart) * frameRate),
            endFrame   = math.floor((word["end"] - segmentStart) * frameRate),
        })
        startIndex = endIndex + 1
    end

    return result
end

--- Read the macro's current input values through its own GetInputValues helper.
function caption_style.read(tool)
    local getter = tool and tool:GetData("GetInputValues")
    if not getter or getter == "" then
        error("Caption macro is missing its GetInputValues helper")
    end
    return loadstring(getter)()(tool)
end

--- Write input values through the macro's own SetInputValues helper.
function caption_style.write(comp, tool, settings)
    if not settings or next(settings) == nil then return end
    local setter = tool and tool:GetData("SetInputValues")
    if not setter or setter == "" then
        error("Caption macro is missing its SetInputValues helper")
    end
    loadstring(setter)()(comp, tool, settings)
end

--- Copy a preset and overlay one speaker's colour, so each caption can diverge
--- without mutating the shared preset table.
function caption_style.with_speaker(settings, speaker)
    local out = {}
    if type(settings) == "table" then
        for k, v in pairs(settings) do out[k] = v end
    end

    if not speaker or not speaker.color or not speaker.style or speaker.style == "None" then
        return out
    end

    local color = caption_style.hex_to_rgb(speaker.color)
    if not color then return out end

    out[speaker.style .. "Enabled"] = 1
    for _, channel in ipairs(RGB_CHANNELS) do
        out[speaker.style .. "Color" .. channel] = color[channel]
    end

    return out
end

--- Apply a speaker's colour to a stock TextPlus tool, which has no preset
--- mechanism of its own.
function caption_style.apply_speaker_to_textplus(tool, speaker)
    if not tool or not speaker then return false end
    if not speaker.color or speaker.color == "" then return false end
    if not speaker.style or speaker.style == "None" then return false end

    local styleId = STYLE_INDEX[speaker.style]
    if not styleId then return false end

    local color = caption_style.hex_to_rgb(speaker.color)
    if not color then return false end

    for _, channel in ipairs(RGB_CHANNELS) do
        if color[channel] ~= nil then
            tool:SetInput(channel .. styleId, color[channel])
        end
    end
    tool:SetInput("Enabled" .. styleId, 1)
    return true
end

--[[
    Put text and styling into a caption comp, whichever kind it is.

    opts:
      text     - the caption's text (optional; nil leaves the text alone)
      words    - transcript words, for the per-word highlight (autosubs only)
      start    - the segment's start in seconds, which word times are relative to
      settings - macro input values (autosubs only)
      speaker  - speaker whose colour to overlay (optional)

    Returns the tool that carries this caption's style, which is what callers
    tag so later batch operations can find it again.
]]
function caption_style.apply(comp, opts)
    local kind = caption_style.kind_of(comp)

    if kind == "textplus" then
        local tool = comp:FindTool("Template") or comp:FindToolByID("TextPlus")
        if not tool then
            error("Caption clip has no Text+ tool")
        end
        if opts.text ~= nil then
            tool:SetInput("StyledText", opts.text)
        end
        caption_style.apply_speaker_to_textplus(tool, opts.speaker)
        return tool, kind
    end

    local tool = comp:FindTool(AUTOSUBS_TOOL)
    local template = comp:FindTool("Template") or comp:FindToolByID("TextPlus")

    if opts.text ~= nil then
        if not template then
            error("AutoSubs caption is missing its text tool")
        end
        local frameRate = tonumber(comp:GetPrefs("Comp.FrameFormat.Rate")) or 24
        -- WordTiming is turned into keyframes by the macro's ExecuteOnChange
        -- when Text is set, so it has to be in place first.
        tool:SetData(
            "WordTiming",
            caption_style.word_timing(opts.words, frameRate, opts.start or 0)
        )
        template:SetInput("Text", opts.text)

        -- Sync CharacterLevelStyling1.Text so the Follower1 -> CLS binding
        -- chain re-evaluates on playback. The macro's own callback does this
        -- too, but Fusion sometimes skips it.
        local cls = comp:FindTool("CharacterLevelStyling1")
        if cls then
            pcall(cls.SetInput, cls, "Text", opts.text)
        end
    end

    local settings = opts.settings
    if opts.speaker then
        settings = caption_style.with_speaker(settings, opts.speaker)
    end
    caption_style.write(comp, tool, settings)

    return tool, kind
end

return caption_style
