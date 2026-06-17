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

-- Substitutes for fonts that ship on macOS / Linux but NOT on Windows.
-- Used when a preset references one of these and it isn't installed.
-- Each entry is an ordered list; the first installed candidate wins.
M.FONT_SUBSTITUTES = {
    -- Futura (macOS geometric sans) → Century Gothic is the closest Windows match
    ["futura"]                 = { "Century Gothic", "Trebuchet MS", "Segoe UI", "Arial" },
    ["futura pt"]              = { "Century Gothic", "Trebuchet MS", "Segoe UI", "Arial" },
    ["futura condensed"]       = { "Century Gothic", "Trebuchet MS", "Arial Narrow", "Arial" },
    -- Chalkboard (macOS chalk/handwritten) → Comic Sans is the standard Windows alt
    ["chalkboard"]             = { "Comic Sans MS", "Segoe Print", "Segoe Script", "Arial" },
    ["chalkboard se"]          = { "Comic Sans MS", "Segoe Print", "Segoe Script", "Arial" },
    -- Menlo (macOS monospace) → Consolas is the standard Windows monospace
    ["menlo"]                  = { "Consolas", "Courier New", "Lucida Console", "Arial" },
    -- Monaco (macOS monospace fallback)
    ["monaco"]                 = { "Consolas", "Courier New", "Lucida Console", "Arial" },
    -- Optima (macOS humanist serif)
    ["optima"]                 = { "Segoe UI", "Calibri", "Arial", "Tahoma" },
    -- Helvetica Neue (macOS system sans) → Arial is the Windows default
    ["helvetica neue"]         = { "Arial", "Calibri", "Segoe UI" },
    ["helvetica"]              = { "Arial", "Calibri", "Segoe UI" },
    -- Gill Sans (macOS humanist)
    ["gill sans"]              = { "Trebuchet MS", "Segoe UI", "Calibri", "Arial" },
    ["gill sans mt"]           = { "Trebuchet MS", "Segoe UI", "Calibri", "Arial" },
    -- SF Pro (Apple system font)
    ["sf pro display"]         = { "Segoe UI", "Calibri", "Arial" },
    ["sf pro text"]            = { "Segoe UI", "Calibri", "Arial" },
    ["sf pro"]                 = { "Segoe UI", "Calibri", "Arial" },
    -- Avenir (macOS geometric)
    ["avenir"]                 = { "Century Gothic", "Trebuchet MS", "Segoe UI", "Arial" },
    ["avenir next"]            = { "Century Gothic", "Trebuchet MS", "Segoe UI", "Arial" },
    -- Rockwell (present on some but not all Windows installs)
    ["rockwell"]               = { "Rockwell", "Courier New", "Georgia", "Arial" },
    -- Didot (macOS serif)
    ["didot"]                  = { "Bodoni MT", "Georgia", "Times New Roman", "Arial" },
    -- American Typewriter
    ["american typewriter"]    = { "Courier New", "Consolas", "Lucida Console", "Arial" },
    -- Marker Felt (macOS marker)
    ["marker felt"]            = { "Comic Sans MS", "Segoe Print", "Arial" },
    -- Zapf Dingbats / Symbol (special glyph fonts)
    ["zapf dingbats"]          = { "Wingdings", "Symbol", "Arial" },
    -- Apple Chancery / Zapfino (calligraphic)
    ["apple chancery"]         = { "Segoe Script", "Comic Sans MS", "Arial" },
    ["zapfino"]                = { "Segoe Script", "Comic Sans MS", "Arial" },
}

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

local cached_fonts = nil

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
    if cached_fonts then return cached_fonts end

    local list = nil
    local ok = pcall(function()
        local fu = rawget(_G, "fusion") or rawget(_G, "fu")
        
        -- If missing from _G, try to get it from the resolve object
        if not fu then
            local r = rawget(_G, "resolve")
            if not r and type(rawget(_G, "Resolve")) == "function" then
                r = Resolve()
            end
            if r and type(r.Fusion) == "function" then
                fu = r:Fusion()
            end
        end

        -- Only as an absolute last resort, call Fusion() but be careful as this can spawn headless instances
        if fu == nil and type(rawget(_G, "Fusion")) == "function" then
            fu = Fusion()
        end
        
        if fu and fu.FontManager and fu.FontManager.GetFontList then
            list = fu.FontManager:GetFontList()
        end
    end)
    local set = {}
    if not ok or type(list) ~= "table" then 
        cached_fonts = set -- Cache empty to prevent infinite re-tries that hang Resolve
        return set 
    end
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
    
    -- Only cache if we actually found fonts (prevents caching an empty list if Resolve wasn't ready)
    if next(set) ~= nil then
        cached_fonts = set
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
-- Attempt to find a substitute for `font_name` from FONT_SUBSTITUTES.
-- Returns a font_entry (from installed set) or nil.
local function find_substitute(font_name, installed)
    if type(font_name) ~= "string" then return nil end
    local key = font_name:lower()
    -- Try exact key first, then strip trailing style words (Bold, Italic, etc.)
    local candidates = M.FONT_SUBSTITUTES[key]
    if not candidates then
        -- Strip common style suffixes to find the base font family
        local base = key:gsub("%s*bold$", ""):gsub("%s*italic$", "")
                        :gsub("%s*oblique$", ""):gsub("%s*light$", "")
                        :gsub("%s*medium$", ""):gsub("%s*regular$", "")
                        :gsub("%s*condensed$", "")
        if base ~= key then
            candidates = M.FONT_SUBSTITUTES[base]
        end
    end
    if not candidates then return nil end
    for _, name in ipairs(candidates) do
        local hit = installed[name:lower()]
        if hit then return hit end
    end
    return nil
end

function M.maybe_override(presetSettings, language)
    local lang = normalise_lang(language) or "en"
    local current = presetSettings and presetSettings.Font
    local installed = M.get_installed_fonts()

    -- ── NEW: if the preset specifies a font that is NOT on this system, swap it
    -- for the best available substitute BEFORE doing the language check.
    -- This fixes built-in presets whose fonts only exist on macOS (Futura,
    -- Chalkboard, Menlo, …) when AutoSubs runs on Windows or Linux.
    if current ~= nil and current ~= M.DEFAULT_FONT then
        local is_installed = installed[current:lower()] ~= nil
        if not is_installed then
            local sub_entry = find_substitute(current, installed)
            if sub_entry then
                local next_settings = {}
                if presetSettings then
                    for k, v in pairs(presetSettings) do next_settings[k] = v end
                end
                next_settings.Font = sub_entry.canonical
                local desired_style = next_settings.Style
                local picked_style = pick_style(sub_entry, desired_style)
                if picked_style then next_settings.Style = picked_style end
                return next_settings, {
                    from    = current,
                    to      = sub_entry.canonical,
                    language = language,
                    script  = "font_substitute",
                    missing = false,
                }
            end
            -- No substitute found – fall through and let the font stay as-is
            -- (Resolve will render with its own missing-font fallback).
            return presetSettings, {
                from    = current,
                to      = nil,
                language = language,
                script  = "font_substitute",
                missing = true,
            }
        end
        -- Font is installed and is not the default: nothing to do.
        return presetSettings, nil
    end

    -- ── Original logic: preset is on the default font (or has no font set) ──
    local has_default = installed[M.DEFAULT_FONT:lower()] ~= nil

    local font_entry, script = M.pick_fallback(lang, installed)

    -- If no language fallback is found, but the default font is missing on the system:
    if not font_entry and not has_default then
        local latin_candidates = { "Arial", "Segoe UI", "Calibri", "Trebuchet MS" }
        for _, name in ipairs(latin_candidates) do
            local hit = installed[name:lower()]
            if hit then
                font_entry = hit
                script = "latin_fallback"
                break
            end
        end
    end

    if not font_entry then
        if script == nil then
            return presetSettings, nil
        else
            return presetSettings, {
                from = current or M.DEFAULT_FONT,
                to = nil,
                language = language,
                script = script,
                missing = true,
            }
        end
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
