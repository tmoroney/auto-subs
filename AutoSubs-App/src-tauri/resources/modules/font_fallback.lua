-- Language-aware font fallback for the AutoSubs Caption macro.
--
-- Why this exists:
--   The AutoSubs Caption macro ships with "Arial Rounded MT Bold" as its
--   default font. That font does not include glyphs for many scripts
--   (Japanese, Korean, Chinese, Arabic, Hebrew, Thai, Devanagari, ...), so
--   non-Latin transcripts render as tofu/question marks in Resolve. This
--   module picks a sensible, pre-installed fallback font per script when the
--   user is still on the default and the transcript language needs it.
--
-- The module is intentionally side-effect free aside from querying Fusion's
-- installed font list. Callers decide whether to apply the suggestion.

---@diagnostic disable: undefined-global
local M = {}

-- Keep this in sync with the macro's Font default. Changing the macro
-- default should also update this value.
M.DEFAULT_FONT = "Arial Rounded MT Bold"

-- Per-script ordered candidate lists. First installed match wins. Lists
-- combine fonts that ship pre-installed on macOS, Windows and common Linux
-- distributions (Noto families). Add/extend conservatively; every entry here
-- should be something a reasonable number of users actually have.
M.CANDIDATES = {
    japanese   = {
        "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI",
        "Yu Gothic", "Meiryo", "MS Gothic",
        "Noto Sans CJK JP", "Noto Sans JP",
    },
    korean     = {
        "Apple SD Gothic Neo", "Malgun Gothic",
        "Noto Sans CJK KR", "Noto Sans KR",
    },
    chinese_sc = {
        "PingFang SC", "Microsoft YaHei", "SimHei",
        "Noto Sans CJK SC", "Noto Sans SC",
    },
    chinese_tc = {
        "PingFang TC", "Microsoft JhengHei", "PMingLiU",
        "Noto Sans CJK TC", "Noto Sans TC",
    },
    arabic     = {
        "Geeza Pro", "Segoe UI", "Tahoma", "Arial",
        "Noto Naskh Arabic", "Noto Sans Arabic",
    },
    hebrew     = {
        "Arial Hebrew", "Segoe UI", "Arial",
        "Noto Sans Hebrew",
    },
    thai       = {
        "Thonburi", "Leelawadee UI", "Tahoma",
        "Noto Sans Thai",
    },
    devanagari = {
        "Kohinoor Devanagari", "Nirmala UI",
        "Noto Sans Devanagari",
    },
}

-- Whisper-style language codes -> script bucket. Latin, Cyrillic and Greek
-- scripts are deliberately absent: the default font covers them well enough
-- that swapping would be more disruptive than helpful.
M.LANG_TO_SCRIPT = {
    ja            = "japanese",
    ko            = "korean",
    zh            = "chinese_sc", -- whisper emits bare "zh" for Mandarin
    ["zh-cn"]     = "chinese_sc",
    ["zh-hans"]   = "chinese_sc",
    ["zh-tw"]     = "chinese_tc",
    ["zh-hant"]   = "chinese_tc",
    yue           = "chinese_tc", -- Cantonese commonly uses Traditional
    ar            = "arabic",
    fa            = "arabic",
    ur            = "arabic",
    he            = "hebrew",
    iw            = "hebrew", -- legacy code for Hebrew
    th            = "thai",
    hi            = "devanagari",
    mr            = "devanagari",
    ne            = "devanagari",
    sa            = "devanagari",
}

-- Normalise a language code to lowercase and accept simple BCP-47-ish forms
-- like "zh-Hant". Returns nil for empty/invalid input.
local function normalise_lang(language)
    if type(language) ~= "string" or language == "" then return nil end
    return language:lower()
end

-- Build a case-insensitive map of installed fonts. Queries Fusion's
-- FontManager, which returns a table keyed by font family (e.g.
-- "Noto Sans JP") whose values are per-weight subtables (Regular, Bold, W3,
-- ...). We capture both the canonical family name and the set of available
-- style names so callers can pick a Style that actually exists for the font
-- (Fusion's setInput does NOT auto-pick a valid style the way the GUI does).
--
-- Returned shape:
--   { ["noto sans jp"] = { canonical = "Noto Sans JP",
--                          styles = { ["Regular"] = true, ["Bold"] = true } } }
function M.get_installed_fonts()
    local list = nil
    local ok = pcall(function()
        local fu = rawget(_G, "fusion") or rawget(_G, "fu")
        if fu == nil and type(rawget(_G, "Fusion")) == "function" then
            fu = Fusion()
        end
        if fu and fu.FontManager and fu.FontManager.GetFontList then
            list = fu.FontManager:GetFontList()
        end
    end)
    local set = {}
    if not ok or type(list) ~= "table" then return set end
    for name, weights in pairs(list) do
        if type(name) == "string" and name ~= "" then
            local styles = {}
            if type(weights) == "table" then
                for style, _ in pairs(weights) do
                    if type(style) == "string" and style ~= "" then
                        styles[style] = true
                    end
                end
            end
            set[name:lower()] = { canonical = name, styles = styles }
        end
    end
    return set
end

-- Preferred Style names tried in order when the preset's captured Style is
-- not available on the picked font. Covers the common Latin labels plus
-- Hiragino's "W*" weight scale (W3 is the regular weight).
local STYLE_FALLBACKS = { "Regular", "Normal", "Book", "Medium", "W3", "W4", "Roman" }

-- Choose a Style that exists for `font_entry`. Prefer `desired_style` if the
-- font has it, otherwise walk STYLE_FALLBACKS, otherwise return any available
-- style. Returns nil only when the font has no styles at all.
local function pick_style(font_entry, desired_style)
    if not font_entry or type(font_entry.styles) ~= "table" then return nil end
    if type(desired_style) == "string" and font_entry.styles[desired_style] then
        return desired_style
    end
    for _, candidate in ipairs(STYLE_FALLBACKS) do
        if font_entry.styles[candidate] then return candidate end
    end
    -- Last resort: any style the font has.
    for style, _ in pairs(font_entry.styles) do return style end
    return nil
end

-- Pick the first installed font from the candidate list for the given
-- language. Returns (font_entry, script) on success, or (nil, script) when
-- the script is known but no candidate is installed, or (nil, nil) when the
-- language is unknown / doesn't need an override.
function M.pick_fallback(language, installed_set)
    local lang = normalise_lang(language)
    if not lang then return nil, nil end
    local script = M.LANG_TO_SCRIPT[lang]
    if not script then
        -- Also try the primary subtag (e.g. "zh-hant" -> "zh").
        local primary = lang:match("^([^-]+)")
        if primary and primary ~= lang then
            script = M.LANG_TO_SCRIPT[primary]
        end
    end
    if not script then return nil, nil end
    local candidates = M.CANDIDATES[script]
    if not candidates then return nil, script end
    for _, name in ipairs(candidates) do
        local hit = installed_set[name:lower()]
        if hit then return hit, script end
    end
    return nil, script
end

-- Decide whether to inject a Font override into an opaque preset-settings
-- table. Returns (next_settings, swap_info).
--
-- next_settings: a shallow copy of presetSettings with Font set (only when a
--   swap was applied); otherwise the original table reference (may be nil).
-- swap_info: nil when no action is needed, or a descriptor table:
--   { from = <string>, to = <string|nil>, language = <string>,
--     script = <string>, missing = <boolean> }
--   `to` is nil and `missing` is true when the script is known but no
--   candidate font is installed on the host.
function M.maybe_override(presetSettings, language)
    if normalise_lang(language) == nil then return presetSettings, nil end
    local current = presetSettings and presetSettings.Font
    -- Only override when the user is on the default (missing or equal).
    if current ~= nil and current ~= M.DEFAULT_FONT then
        return presetSettings, nil
    end
    local installed = M.get_installed_fonts()
    local font_entry, script = M.pick_fallback(language, installed)
    if script == nil then
        -- Language doesn't need an override (Latin/Cyrillic/Greek/etc.).
        return presetSettings, nil
    end
    if not font_entry then
        return presetSettings, {
            from = current or M.DEFAULT_FONT,
            to = nil,
            language = language,
            script = script,
            missing = true,
        }
    end
    local next_settings = {}
    if presetSettings then
        for k, v in pairs(presetSettings) do next_settings[k] = v end
    end
    next_settings.Font = font_entry.canonical
    -- Pick a Style that the new font actually has. Fusion's GUI auto-corrects
    -- Style on font change; SetInput does not, so we have to do it ourselves.
    -- Prefer the preset's captured Style if the new font supports it.
    local desired_style = next_settings.Style
    local picked_style = pick_style(font_entry, desired_style)
    if picked_style then next_settings.Style = picked_style end
    return next_settings, {
        from = current or M.DEFAULT_FONT,
        to = font_entry.canonical,
        language = language,
        script = script,
        missing = false,
    }
end

return M
