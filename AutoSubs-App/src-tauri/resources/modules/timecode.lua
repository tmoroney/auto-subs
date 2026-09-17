-- Pure-Lua SMPTE timecode <-> frame conversion.
--
-- Replaces libavutil.lua, which called Resolve's bundled av_timecode_* C
-- functions through LuaJIT FFI. Resolve 21.1 sandboxes the Lua state that
-- runs Workspace > Scripts scripts (no ffi/io/package), so the conversion
-- is reimplemented here in plain Lua.
--
-- Conventions:
--   * `fps` may be fractional (29.97, 59.94, 119.88, 23.976); the "nominal"
--     rate used for the frame count is round(fps) (30, 60, 120, 24).
--   * Drop-frame is signalled in timecode strings by ';' before the frame
--     field; ':' means non-drop.
--
---@diagnostic disable: undefined-global
local M = {}

local function round(x)
    return math.floor(x + 0.5)
end

-- The integer frame rate Resolve counts in for a given rate setting:
-- 29.97 -> 30, 59.94 -> 60, 23.976 -> 24, 25 -> 25, 119.88 -> 120.
local function nominal_rate(fps)
    return round(tonumber(fps) or 0)
end

-- Frames dropped per non-tenth minute at this nominal rate: 2 @ 30, 4 @ 60,
-- 8 @ 120 (i.e. 2 per 30 nominal fps).
local function drop_count(nominal)
    return round(nominal * 0.0666667)
end

-- Parse "HH:MM:SS:FF" or "HH:MM:SS;FF" (';' marks drop-frame) into a frame
-- count at `fps`. Returns an integer; raises on malformed input.
function M.frame_from_timecode(tc, fps)
    local h, m, s, sep, ff = tostring(tc):match("^(%d+):(%d+):(%d+)([:;])(%d+)$")
    if not h then
        error("invalid timecode: " .. tostring(tc))
    end
    h, m, s, ff = tonumber(h), tonumber(m), tonumber(s), tonumber(ff)

    local nominal = nominal_rate(fps)
    local frames = (h * 3600 + m * 60 + s) * nominal + ff
    if sep == ";" then
        local dropped = drop_count(nominal)
        local total_minutes = h * 60 + m
        frames = frames - dropped * (total_minutes - math.floor(total_minutes / 10))
    end
    return frames
end

-- Convert a frame count to a timecode string at `fps`. `drop` selects ';'
-- separators and applies the drop-frame offset. Wraps at 24h.
function M.timecode_from_frame(frame, fps, drop)
    fps = tonumber(fps) or 0
    local nominal = nominal_rate(fps)
    frame = math.floor(tonumber(frame) or 0)

    if drop then
        local dropped = drop_count(nominal)
        local frames_per_10min = round(fps * 600)
        local frames_per_min = round(fps * 60)
        local d = math.floor(frame / frames_per_10min)
        local m = frame % frames_per_10min
        frame = frame + dropped * 9 * d
            + (m > dropped and dropped * math.floor((m - dropped) / frames_per_min) or 0)
    end

    frame = frame % (nominal * 86400) -- 24h wrap
    local ff = frame % nominal
    local s = math.floor(frame / nominal) % 60
    local m = math.floor(frame / nominal / 60) % 60
    local h = math.floor(frame / nominal / 3600)

    local width = math.max(2, #tostring(nominal - 1))
    local sep = drop and ";" or ":"
    return string.format("%02d:%02d:%02d%s%0" .. width .. "d", h, m, s, sep, ff)
end

-- True for the fractional NTSC rates where drop-frame timecode applies.
function M.is_ntsc_fractional(fps)
    local f = tonumber(fps) or 0
    local function approx(a, b) return math.abs(a - b) < 0.01 end
    return approx(f, 29.97) or approx(f, 59.94) or approx(f, 119.88)
end

-- timecode_from_frame with the timeline's "timelineDropFrameTimecode"
-- setting ("1"/1/true). When `drop_setting` is nil, falls back to guessing
-- from the rate (NTSC fractional -> drop).
function M.timecode_from_frame_auto(frame, fps, drop_setting)
    local drop
    if drop_setting == nil then
        drop = M.is_ntsc_fractional(fps)
    else
        drop = drop_setting == "1" or drop_setting == 1 or drop_setting == true
    end
    return M.timecode_from_frame(frame, fps, drop)
end

return M
