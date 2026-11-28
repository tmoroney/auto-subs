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
---
--- The macro's read and write helpers are Lua source carried in the comp's own
--- tool data, so this cannot rest on the tool name alone: a third-party title
--- out of the user's media pool could call its root tool "AutoSubs" and have
--- that data compiled and run. Callers name the media pool template the clip
--- came from, and only the bundled caption reaches the helper path.
function caption_style.kind_of(comp, templateName)
    if not caption_style.is_autosubs_template(templateName) then
        return "textplus"
    end
    if comp and comp:FindTool(AUTOSUBS_TOOL) then
        return "autosubs"
    end
    return "textplus"
end

--- Byte length of the whitespace character that starts at `pos` of `text`,
--- or 0 when there is none. These are the characters the app separates words
--- by: ASCII whitespace and the Unicode spaces, such as the no-break space.
local function whitespace_length(text, pos)
    local a, b, c = text:byte(pos, pos + 2)
    if a == 32 or (a and a >= 9 and a <= 13) then
        return 1
    elseif a == 0xC2 and b == 0xA0 then
        return 2
    elseif a == 0xE2 and b == 0x80 and c and (c <= 0x8A or c == 0xA8 or c == 0xA9 or c == 0xAF) then
        return 3
    elseif c and ((a == 0xE1 and b == 0x9A and c == 0x80) or (a == 0xE2 and b == 0x81 and c == 0x9F)
            or (a == 0xE3 and b == 0x80 and c == 0x80) or (a == 0xEF and b == 0xBB and c == 0xBF)) then
        return 3
    end
    return 0
end

--- Length in bytes of the character that starts at `pos` of `text`.
local function character_length(text, pos)
    local length = 1
    while pos + length <= #text do
        local byte = text:byte(pos + length)
        if byte < 0x80 or byte >= 0xC0 then break end
        length = length + 1
    end
    return length
end

--- The number of characters of `text`, whitespace included. A character is counted as the
--- functions above count it, so an invalid byte is one character.
local function count_all(text)
    local pos, count = 1, 0
    while pos <= #text do
        pos = pos + math.max(whitespace_length(text, pos), character_length(text, pos))
        count = count + 1
    end
    return count
end

--- The number of characters of `text` that are not whitespace.
local function count_characters(text)
    local pos, count = 1, 0
    while pos <= #text do
        local space = whitespace_length(text, pos)
        if space > 0 then
            pos = pos + space
        else
            pos = pos + character_length(text, pos)
            count = count + 1
        end
    end
    return count
end

--- `s` without its whitespace.
local function without_whitespace(s)
    local out, pos = {}, 1
    while pos <= #s do
        local space = whitespace_length(s, pos)
        if space > 0 then
            pos = pos + space
        else
            local length = character_length(s, pos)
            out[#out + 1] = s:sub(pos, pos + length - 1)
            pos = pos + length
        end
    end
    return table.concat(out)
end

--- The words of `text`, in order: where each word starts and ends, counted in
--- characters from 0, and the word itself. A word owns the one whitespace
--- character before it, the way a transcript word carries its leading space.
local function text_words(text)
    local words = {}
    local pos, chars = 1, 0

    while pos <= #text do
        local space = whitespace_length(text, pos)
        if space > 0 then
            pos, chars = pos + space, chars + 1
        else
            local startIndex = chars > 0 and chars - 1 or 0
            local first = pos
            repeat
                local length = character_length(text, pos)
                pos, chars = pos + length, chars + 1
            until pos > #text or whitespace_length(text, pos) > 0
            words[#words + 1] = { startIndex = startIndex, endIndex = chars - 1, word = text:sub(first, pos - 1) }
        end
    end

    return words
end

--- `s` without the whitespace at its two ends.
local function trimmed(s)
    local first, last = 1, #s
    while first <= last do
        local space = whitespace_length(s, first)
        if space == 0 then break end
        first = first + space
    end
    while last >= first do
        -- The character that ends at `last` starts at its lead byte.
        local lead = last
        while lead > first and s:byte(lead) >= 0x80 and s:byte(lead) < 0xC0 do lead = lead - 1 end
        if whitespace_length(s, lead) ~= last - lead + 1 then break end
        last = lead - 1
    end
    return s:sub(first, last)
end

local function number(value)
    return tonumber(value) or 0
end

local function entry(range, start, finish, frameRate, segmentStart)
    return {
        startIndex = range.startIndex,
        endIndex   = range.endIndex,
        startFrame = math.floor((start - segmentStart) * frameRate),
        endFrame   = math.floor((finish - segmentStart) * frameRate),
    }
end

--- The words as they are spelled, laid one after the other.
local function by_spelling(words, frameRate, segmentStart)
    local result = {}
    local startIndex = 0

    for _, word in ipairs(words) do
        local endIndex = startIndex + utf8len(word.word or "") - 1
        table.insert(result, entry(
            { startIndex = startIndex, endIndex = endIndex },
            number(word.start), number(word["end"]), frameRate, segmentStart))
        startIndex = endIndex + 1
    end

    return result
end

--- The timed words laid over `text`: each word covers as many characters of
--- the text as it is long, without its whitespace. A word owns the one
--- whitespace character before it, the first word also owns the whitespace
--- before it, and the other whitespace of the text belongs to the word before
--- it. A timed word that is only whitespace takes the whitespace character
--- before it. A timed word without any character gets no entry. A timed word
--- is left out when the text is used up.
local function over_text(text, words, lengths, frameRate, segmentStart)
    local result = {}
    local last = count_all(text) - 1
    local pos, chars = 1, 0

    for index = 1, #words do
        local length = lengths[index]
        local space = whitespace_length(text, pos)
        if length == 0 then
            local spelling = words[index].word or ""
            if space > 0 and spelling ~= "" and trimmed(spelling) == "" then
                result[#result + 1] = entry({ startIndex = chars, endIndex = chars },
                    number(words[index].start), number(words[index]["end"]), frameRate, segmentStart)
                pos, chars = pos + space, chars + 1
            end
        else
            -- The whitespace before a word: all but its last character belongs to the word before it.
            local run = 0
            while space > 0 do
                run = run + 1
                pos, chars = pos + space, chars + 1
                space = whitespace_length(text, pos)
            end
            for _ = 1, run - 1 do
                if #result > 0 then result[#result].endIndex = result[#result].endIndex + 1 end
            end
            if pos <= #text then
                result[#result + 1] = entry(
                    { startIndex = #result > 0 and (run > 0 and chars - 1 or chars) or 0,
                      endIndex = math.min(chars + length - 1, last) },
                    number(words[index].start), number(words[index]["end"]), frameRate, segmentStart)
                local taken = 0
                while pos <= #text and taken < length do
                    local size = character_length(text, pos)
                    pos, chars = pos + size, chars + 1
                    taken = taken + 1
                end
            end
        end
        if pos > #text then break end
    end

    return result
end

--- The start and end time of each word of `names`, taken from the timed
--- `words`. A word that keeps its spelling keeps its time, and so does a word
--- that replaces exactly one other word that had time. The other words share
--- the time between their neighbours, in proportion to their length. Where
--- there is no time between two kept words, a neighbouring kept word gives up
--- part of its own time. The same happens at an end of the caption: a word
--- added before the first or after the last kept word takes part of the time
--- of that kept word.
local function aligned_times(words, names)
    local n, m = #words, #names
    local spelled = {}
    for i = 1, n do spelled[i] = trimmed(words[i].word or "") end

    -- length[i][j]: the longest run of equal words at the start of words[i + 1..] and names[j + 1..]
    local length = {}
    for i = 0, n do
        length[i] = { [m] = 0 }
    end
    for j = 0, m do length[n][j] = 0 end
    for i = n - 1, 0, -1 do
        for j = m - 1, 0, -1 do
            if spelled[i + 1] == names[j + 1] then
                length[i][j] = length[i + 1][j + 1] + 1
            else
                length[i][j] = math.max(length[i + 1][j], length[i][j + 1])
            end
        end
    end

    -- kept: the words that keep their spelling, in order
    local kept = {}
    local i, j = 1, 1
    while i <= n and j <= m do
        if spelled[i] == names[j] then
            kept[#kept + 1] = { previous = i, next = j }
            i, j = i + 1, j + 1
        elseif length[i][j - 1] > length[i - 1][j] then
            i = i + 1
        else
            j = j + 1
        end
    end

    local from, to = number(words[1].start), number(words[n]["end"])
    local gap = 1
    while gap <= #kept + 1 do
        local left, right = kept[gap - 1], kept[gap]
        local first = left and left.next + 1 or 1
        local last = right and right.next - 1 or m
        local available_from = left and number(words[left.previous]["end"]) or from
        local available_to = right and number(words[right.previous].start) or to
        if last >= first and available_to <= available_from and #kept > 0 then
            table.remove(kept, right and gap or gap - 1)
            gap = math.max(1, gap - 1)
        else
            gap = gap + 1
        end
    end

    local times = {}
    for _, k in ipairs(kept) do
        times[k.next] = { number(words[k.previous].start), number(words[k.previous]["end"]) }
    end
    for gap = 1, #kept + 1 do
        local left, right = kept[gap - 1], kept[gap]
        local first = left and left.next + 1 or 1
        local last = right and right.next - 1 or m
        if last >= first then
            local old_first = left and left.previous + 1 or 1
            local old_last = right and right.previous - 1 or n
            local one_for_one = last - first == old_last - old_first
            for s = old_first, old_last do
                if number(words[s]["end"]) <= number(words[s].start) then one_for_one = false end
            end
            if one_for_one then
                for t = first, last do
                    local word = words[old_first + t - first]
                    times[t] = { number(word.start), number(word["end"]) }
                end
            else
                local weight = 0
                for t = first, last do weight = weight + utf8len(names[t]) end
                local from_time = left and number(words[left.previous]["end"]) or from
                local to_time = right and number(words[right.previous].start) or to
                local consumed = 0
                for t = first, last do
                    times[t] = {
                        from_time + (to_time - from_time) * consumed / weight,
                        from_time + (to_time - from_time) * (consumed + utf8len(names[t])) / weight,
                    }
                    consumed = consumed + utf8len(names[t])
                end
            end
        end
    end

    return times
end

--- Per-word highlight timing, as frame offsets into the caption's own comp.
--- Without `text`, the caption's text, the words are laid out as they are
--- spelled. With it, the guide is chosen for the caption:
---   * The timed words add up to the text, or add up to it apart from
---     whitespace (the leading space of a caption that was split, a line break
---     of a caption of two lines): the timed words are laid over the text by
---     their length. That is every caption that was not corrected.
---   * A corrected caption of a script without spaces between words is laid
---     over the text by length too when every timed word is one character (a
---     word that is only whitespace counts as one), or when its text is one
---     word that has a character for every character of the timed words. The
---     formatter gives such a script one timed word per grapheme cluster, and
---     its text shows no word boundaries.
---   * Otherwise the text. A corrected caption of such a script that lost
---     characters, or that got a space typed into it, lands here and is shown
---     as one word for each word of the text.
--- Timed words do not always add up to the text: the first word of a caption
--- split from a longer segment keeps a leading space the text does not show,
--- and a caption corrected in the app keeps the words of its previous text.
--- Laid out by their spelling, the highlight then sits between two words, so
--- a caption on the guide of the text also gets the time of the words it
--- kept.
function caption_style.word_timing(words, frameRate, segmentStart, text)
    words = words or {}
    if #words == 0 or type(text) ~= "string" then
        return by_spelling(words, frameRate, segmentStart)
    end
    local tokens = text_words(text)
    if #tokens == 0 then
        return {}
    end

    local spelled, lengths, total, single = {}, {}, 0, 0
    for i, word in ipairs(words) do
        spelled[i] = word.word or ""
        lengths[i] = utf8len(trimmed(word.word or ""))
        total = total + lengths[i]
        if lengths[i] <= 1 then single = single + 1 end
    end
    local joined = table.concat(spelled)
    local apart_from_whitespace = joined == text or without_whitespace(joined) == without_whitespace(text)
    local corrected = #tokens < #words and (single == #words or (#tokens == 1 and total <= count_characters(text)))
    if apart_from_whitespace or corrected then
        return over_text(text, words, lengths, frameRate, segmentStart)
    end

    local names = {}
    for t, range in ipairs(tokens) do names[t] = range.word end
    local times = aligned_times(words, names)
    local result = {}
    for t, range in ipairs(tokens) do
        result[t] = entry(range, times[t][1], times[t][2], frameRate, segmentStart)
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
      templateName - the media pool template this clip came from, which is what
                 decides whether the bundled macro's helpers may be run
      text     - the caption's text (optional; nil leaves the text alone)
      words    - transcript words, for the per-word highlight (autosubs only)
      start    - the segment's start in seconds, which word times are relative to
      settings - macro input values (autosubs only)
      speaker  - speaker whose colour to overlay (optional)

    Returns the tool that carries this caption's style, which is what callers
    tag so later batch operations can find it again.
]]
function caption_style.apply(comp, opts)
    local kind = caption_style.kind_of(comp, opts.templateName)

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
            caption_style.word_timing(opts.words, frameRate, opts.start or 0, opts.text)
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
