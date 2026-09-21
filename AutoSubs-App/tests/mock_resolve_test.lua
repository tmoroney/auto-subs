-- Mock-Resolve harness for autosubs_core.lua AddSubtitles.
--
-- Run from the AutoSubs-App directory with stock Lua:
--   lua5.3 tests/mock_resolve_test.lua
--
-- Exercises the real module (build_clip_list, dead-handle retry, per-clip
-- fallback, apply accounting) against a fake timeline/mediaPool that
-- reproduces Resolve's "dead handle" behaviour: a blocked AppendToTimeline
-- returns a truthy handle whose methods all return nil.

local MODULES = (arg and arg[0] and arg[0]:match("(.*/)") or "./") .. "../src-tauri/resources/modules"

loadstring = load -- Lua 5.3 compat for caption_style.write

-- ---------------------------------------------------------------------------
-- Fusion comp / tool mocks (enough for caption_style.apply)
-- ---------------------------------------------------------------------------
local SETTER_SNIPPET =
    "return function(comp, tool, settings) tool.__applied = settings; return true end"

local function make_tool()
    local tool = { _inputs = {}, _data = { SetInputValues = SETTER_SNIPPET } }
    function tool:SetInput(k, v) self._inputs[k] = v end
    function tool:SetData(k, v) self._data[k] = v end
    function tool:GetData(k) return self._data[k] end
    return tool
end

local function make_comp()
    local comp = { tools = { AutoSubs = make_tool(), Template = make_tool() } }
    function comp:FindTool(name) return self.tools[name] end
    function comp:FindToolByID(id)
        if id == "TextPlus" then return self.tools.Template end
    end
    function comp:GetPrefs(k)
        if k == "Comp.FrameFormat.Rate" then return "24" end
    end
    return comp
end

-- ---------------------------------------------------------------------------
-- Timeline / media pool mocks
-- ---------------------------------------------------------------------------
local function dead_handle()
    return setmetatable({}, { __index = function() return function() return nil end end })
end

local function make_item(s, e, comp)
    local item = { _start = s, _end = e, _comp = comp, _color = nil }
    function item:GetStart() return self._start end
    function item:GetEnd() return self._end end
    function item:GetFusionCompCount() return self._comp and 1 or 0 end
    function item:GetFusionCompByIndex(i) return i == 1 and self._comp or nil end
    function item:SetClipColor(c) self._color = c end
    function item:GetUniqueId() return "item-" .. tostring(s) end
    return item
end

local function make_timeline(opts)
    opts = opts or {}
    local tl = {
        frameRate = opts.frameRate or 24,
        startFrame = opts.startFrame or 0,
        endFrame = opts.endFrame or 24 * 120,
        tracks = {},
        addTrackWorks = opts.addTrack ~= false,
        timecodes = {},
    }
    for _ = 1, (opts.trackCount or 1) do
        tl.tracks[#tl.tracks + 1] = { locked = false, items = {} }
    end

    function tl:GetStartFrame() return self.startFrame end
    function tl:GetEndFrame() return self.endFrame end
    function tl:GetSetting(k)
        if k == "timelineFrameRate" then return tostring(self.frameRate) end
        if k == "timelineDropFrameTimecode" then return "0" end
    end
    function tl:GetTrackCount() return #self.tracks end
    function tl:AddTrack()
        if not self.addTrackWorks then return false end
        self.tracks[#self.tracks + 1] = { locked = false, items = {} }
        return true
    end
    function tl:DeleteTrack(_, idx) table.remove(self.tracks, idx) end
    function tl:GetIsTrackLocked(_, idx)
        return self.tracks[idx] and self.tracks[idx].locked or false
    end
    function tl:SetTrackLock(_, idx, locked)
        if self.tracks[idx] then self.tracks[idx].locked = locked end
    end
    function tl:GetItemListInTrack(_, idx)
        local track = self.tracks[idx]
        if not track then return {} end
        local list = {}
        for _, it in ipairs(track.items) do list[#list + 1] = it.handle end
        return list
    end
    function tl:GetItemsInTrack(_, idx)
        local track = self.tracks[idx]
        if not track then return nil end
        if #track.items == 0 then return nil end
        local out = {}
        for i, it in ipairs(track.items) do out[i] = it.handle end
        return out
    end
    function tl:DeleteClips(items)
        for _, dead in ipairs(items) do
            for _, track in ipairs(self.tracks) do
                for i = #track.items, 1, -1 do
                    if track.items[i].handle == dead then table.remove(track.items, i) end
                end
            end
        end
        return true
    end
    function tl:SetCurrentTimecode(tc) self.timecodes[#self.timecodes + 1] = tc end
    return tl
end

local function make_media_pool(timeline, opts)
    opts = opts or {}
    local mp = { tl = timeline, templateFPS = opts.templateFPS or 24 }
    for k, v in pairs(opts) do mp[k] = v end

    -- Simple pool: root folder holds one template clip.
    local templateClip = {
        GetClipProperty = function(_, k)
            if k == "Clip Name" then return opts.templateName or "AutoSubs Caption 2026-09-17" end
            if k == "FPS" then return tostring(mp.templateFPS) end
            if k == "Type" then return "Generator" end
        end,
        GetUniqueId = function() return "tpl-1" end,
    }
    mp.templateClip = templateClip
    local rootFolder = {
        GetSubFolderList = function() return {} end,
        GetClipList = function() return { templateClip } end,
        GetName = function() return "Master" end,
    }
    function mp:GetRootFolder() return rootFolder end
    function mp:GetCurrentFolder() return rootFolder end
    function mp:SetCurrentFolder() end
    function mp:ImportFolderFromFile() return nil end -- mock: no auto-import needed

    -- The behavioural core: a clipInfo that overlaps an occupied slot or
    -- targets a missing/locked track returns a dead handle (truthy, all
    -- methods return nil) exactly like real Resolve.
    function mp:AppendToTimeline(clipInfos)
        if self.batchThrows and #clipInfos > 1 then error("simulated batch failure") end
        local results = {}
        local dropped = {} -- indices this batch silently dropped (sparse table sim)
        for i, ci in ipairs(clipInfos) do
            local track = self.tl.tracks[ci.trackIndex]
            local s = ci.recordFrame
            local durTL = math.max(1, math.floor(
                ((ci.endFrame - ci.startFrame) / self.templateFPS) * self.tl.frameRate + 0.5))
            local e = s + durTL
            local blocked = track == nil or track.locked
            if not blocked then
                for _, it in ipairs(track.items) do
                    if s < it.handle:GetEnd() and e > it.handle:GetStart() then
                        blocked = true
                        break
                    end
                end
            end
            local sparseDrop = self.sparseDrops and self.sparseDrops[i]
            if sparseDrop then
                -- Resolve never placed this clip and returned no handle for it:
                -- the result table has a hole at i.
                results[i] = nil
            elseif blocked then
                results[i] = dead_handle()
            else
                local item = make_item(s, e, self.noComps and nil or make_comp())
                item._sourceTrack = ci.trackIndex
                table.insert(track.items, item and { handle = item } or nil)
                results[i] = item
            end
        end
        return results
    end
    return mp
end

-- ---------------------------------------------------------------------------
-- Global stubs the module expects from Resolve
-- ---------------------------------------------------------------------------
local tl, mp
local project = {}
local projectManager = { GetCurrentProject = function() return project end }
resolve = {
    GetProjectManager = function() return projectManager end,
    Fusion = function() return fusion end,
    OpenPage = function() end,
}
fusion = { SetPrefs = function() end, GetPrefs = function() return nil end, SavePrefs = function() end }

AUTOSUBS_SEP = "/"
AUTOSUBS_MAILBOX = "/tmp/luatest/mailbox"

function AutoSubs_require(name)
    local chunk = assert(loadfile(MODULES .. "/" .. name .. ".lua"))
    return chunk()
end

-- Resolve objects that survive refresh_project()
local function wire_project(timeline, pool)
    tl, mp = timeline, pool
    project.GetMediaPool = function() return mp end
    project.GetCurrentTimeline = function() return tl end
    project.GetUniqueId = function() return "proj-1" end
end

-- placeholder so module load works before wire_project is called
wire_project(make_timeline {}, nil)
mp = make_media_pool(tl, {})
project.GetMediaPool = function() return mp end

-- ---------------------------------------------------------------------------
-- Load the real module
-- ---------------------------------------------------------------------------
local core = assert(loadfile(MODULES .. "/autosubs_core.lua"))()

-- Inject lazy locals that Init() would populate: `timecode` for JumpToTime.
local fake_timecode = { timecode_from_frame_auto = function(f, _, _)
    return string.format("00:00:%02d:%02d", math.floor(f / 24), f % 24)
end }
for _, fname in ipairs({ "JumpToTime", "AddSubtitles" }) do
    local fn = _G[fname]
    local i = 1
    while true do
        local name = debug.getupvalue(fn, i)
        if not name then break end
        if name == "timecode" then debug.setupvalue(fn, i, fake_timecode) end
        i = i + 1
    end
end

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
local function transcript(list)
    local segs = {}
    for _, p in ipairs(list) do
        segs[#segs + 1] = { start = p[1], ["end"] = p[2], text = p[3] or ("sub-" .. #segs + 1) }
    end
    return { transcriptId = "tx-1", segments = segs }
end

local function req(segs, track, extra)
    local r = {
        func = "AddSubtitles",
        filePath = "/tmp/luatest/tx.json",
        trackIndex = track or "1",
        templateName = "AutoSubs Caption 2026-09-17",
        subtitleData = transcript(segs),
    }
    if extra then for k, v in pairs(extra) do r[k] = v end end
    return r
end

local function track_items(tl_, idx)
    local out = {}
    for _, it in ipairs(tl_.tracks[idx] and tl_.tracks[idx].items or {}) do
        out[#out + 1] = { it.handle:GetStart(), it.handle:GetEnd() }
    end
    return out
end

local function fmt_items(items)
    local parts = {}
    for _, p in ipairs(items) do parts[#parts + 1] = "[" .. p[1] .. "," .. p[2] .. ")" end
    return table.concat(parts, " ")
end

local PASS, FAIL = 0, 0
local function check(cond, label, extra)
    if cond then PASS = PASS + 1; print("  PASS " .. label)
    else FAIL = FAIL + 1; print("  FAIL " .. label .. (extra and (" -> " .. extra) or "")) end
end

local function run(name, opts)
    tl = make_timeline(opts)
    mp = make_media_pool(tl, opts.pool or {})
    wire_project(tl, mp)
    if opts.occupants then
        for _, occ in ipairs(opts.occupants) do
            local track = tl.tracks[occ.track]
            local item = make_item(occ[1], occ[2], nil)
            track.items[#track.items + 1] = { handle = item }
        end
    end
    print("\n=== " .. name .. " ===")
    local res = AddSubtitles(req(opts.subs, opts.track or "1", opts.reqExtra))
    return res
end

-- ---------------------------------------------------------------------------
-- Scenarios
-- ---------------------------------------------------------------------------

-- S1: empty track, dense captions -> all land on V1, no warning.
do
    local r = run("happy path", { subs = { { 0, 1 }, { 1.2, 2 }, { 2.1, 3 } } })
    check(r and r.ok == true, "ok", tostring(r and r.error))
    check(#tl.tracks == 1, "no extra tracks", #tl.tracks)
    check(#track_items(tl, 1) == 3, "3 clips on V1", fmt_items(track_items(tl, 1)))
    -- joined clips abut but never overlap
    local items = track_items(tl, 1)
    local clean = true
    for i = 2, #items do if items[i - 1][2] > items[i][1] then clean = false end end
    check(clean, "joined clips don't overlap", fmt_items(items))
end

-- S2: THE BUG — V1 occupied by user footage. Old code: dead handles ->
-- "no Fusion composition" for every clip. New code: retry onto fresh V2.
do
    local r = run("occupied V1 -> retry on fresh track", {
        subs = { { 0, 1 }, { 2, 3 }, { 4, 5 } },
        occupants = { { track = 1, 0, 24 * 60 } }, -- V1 covered for 60s
    })
    check(r and r.ok == true, "ok despite occupied track", tostring(r and r.error))
    check(#tl.tracks == 2, "one fresh track added", #tl.tracks)
    check(#track_items(tl, 1) == 1, "V1 keeps only the occupant", fmt_items(track_items(tl, 1)))
    check(#track_items(tl, 2) == 3, "all 3 captions landed on V2", fmt_items(track_items(tl, 2)))
end

-- S3: partial conflict — only the middle caption is blocked.
do
    local r = run("partial block", {
        subs = { { 0, 1 }, { 2, 3 }, { 4, 5 } },
        occupants = { { track = 1, 2 * 24 - 2, 2 * 24 + 24 } }, -- covers caption 2
    })
    check(r and r.ok == true, "ok", tostring(r and r.error))
    check(#track_items(tl, 1) == 3, "V1 has occupant + 2 captions", fmt_items(track_items(tl, 1)))
    check(#tl.tracks == 2, "fresh track for the blocked clip")
    check(#track_items(tl, 2) == 1, "1 caption recovered on V2", fmt_items(track_items(tl, 2)))
end

-- S4: everything blocked and AddTrack fails -> honest error message.
do
    local r = run("all blocked, AddTrack fails", {
        subs = { { 0, 1 }, { 2, 3 } },
        occupants = { { track = 1, 0, 24 * 60 } },
        addTrack = false,
    })
    check(r and r.error ~= nil, "returns error", "got ok=true")
    check(r and r.code == "clips_blocked", "error code tells the UI this was a blocked append",
        tostring(r and r.code))
end

-- S5: subtitles beyond the timeline end are skipped and reported in the
-- structured stats the frontend localizes.
do
    local r = run("bounds skip", {
        subs = { { 0, 1 }, { 2, 3 }, { 500, 501 } },
    }) -- timeline is 120s
    check(r and r.ok == true, "ok", tostring(r and r.error))
    check(#track_items(tl, 1) == 2, "2 in-range captions placed")
    check(r and r.failed == 1 and r.total == 3 and r.skipped == 1,
        "stats report the skip",
        tostring(r and r.failed) .. "/" .. tostring(r and r.total) ..
            " skipped=" .. tostring(r and r.skipped))
end

-- S6: whole batch call throws -> per-clip fallback still places them.
do
    local r = run("batch throws -> per-clip fallback", {
        subs = { { 0, 1 }, { 2, 3 } },
        pool = { batchThrows = true },
    })
    check(r and r.ok == true, "ok", tostring(r and r.error))
    check(#track_items(tl, 1) == 2, "per-clip append placed both")
end

-- S7: sparse batch return (index 2 missing from the result table) ->
-- hole detected as dead and retried on a fresh track.
do
    local r = run("sparse batch return", {
        subs = { { 0, 1 }, { 2, 3 }, { 4, 5 } },
        pool = { sparseDrops = { [2] = true } },
    })
    check(r and r.ok == true, "ok", tostring(r and r.error))
    local total = #track_items(tl, 1) + (tl.tracks[2] and #track_items(tl, 2) or 0)
    check(total == 3, "all 3 placed somewhere", fmt_items(track_items(tl, 1)))
end

-- S8: explicit "Add to New Track" (trackIndex "0") -> V2 even though V1 empty.
do
    local r = run("trackIndex 0 = new track", { subs = { { 0, 1 } }, track = "0" })
    check(r and r.ok == true, "ok", tostring(r and r.error))
    check(#tl.tracks == 2, "new track added", #tl.tracks)
    check(#track_items(tl, 2) == 1, "caption on the new track")
end

-- S9: overlapping same-track captions (clip i ends inside clip i+1) must not
-- deadlock each other on the retry track.
do
    local r = run("overlapping subs on blocked track", {
        subs = { { 0, 3 }, { 1, 4 } }, -- caption 1 overlaps caption 2's range
        occupants = { { track = 1, 0, 24 * 60 } },
    })
    check(r and r.ok == true, "ok", tostring(r and r.error))
    local placed = 0
    for ti = 1, #tl.tracks do placed = placed + #track_items(tl, ti) end
    check(placed - 1 == 2, "both captions landed (one on a spill track)",
        "placed=" .. placed)
end

print(string.format("\n%d passed, %d failed", PASS, FAIL))
os.exit(FAIL == 0 and 0 or 1)
