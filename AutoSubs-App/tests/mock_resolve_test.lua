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
    function tl:GetCurrentTimecode() return self.currentTimecode or "00:00:00:00" end
    function tl:GetIsTrackEnabled(_, idx)
        return self.tracks[idx] ~= nil and self.tracks[idx].enabled ~= false
    end
    function tl:SetTrackEnable(_, idx, en)
        if self.tracks[idx] then self.tracks[idx].enabled = en end
        return true
    end
    function tl:GetMarkInOut() return self.markInOut end
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
bmd = { wait = function() end, fileexists = function() return false end }

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
local fake_timecode = {
    timecode_from_frame_auto = function(f, _, _)
        return string.format("00:00:%02d:%02d", math.floor(f / 24), f % 24)
    end,
    frame_from_timecode = function() return 0 end,
}
for _, fname in ipairs({ "JumpToTime", "AddSubtitles", "GetExportProgress" }) do
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

-- ---------------------------------------------------------------------------
-- Export lifecycle (render job queue, snapshot/restore, start failures)
-- ---------------------------------------------------------------------------

-- Render-side project methods. `r` holds the fake Deliver state; each job is
-- { JobId, rendering, pct, status, err, live }. A `live` job's Completion-
-- Percentage ticks on every status read — how remove_stale_export_jobs(true)
-- tells a running render apart from a stalled one.
local function wire_render(opts)
    opts = opts or {}
    local r = {
        jobs = {},
        presets = {},
        rendering = false,
        nextId = 0,
        deletedJobs = {},
        loadedPresets = {},
        deletedPresets = {},
        savedPresets = {},
        startCalls = 0,
        renderSettings = nil,
        audioOnly = opts.audioOnly ~= false,
        savePreset = opts.savePreset ~= false,
        failStarts = opts.failStarts or 0,
        silentStarts = opts.silentStarts or 0,
    }
    function r:add_job(fields)
        self.nextId = self.nextId + 1
        local j = { JobId = "job-" .. self.nextId, rendering = false, pct = 0 }
        for k, v in pairs(fields or {}) do j[k] = v end
        self.jobs[#self.jobs + 1] = j
        return j
    end
    function r:find_job(id)
        for _, j in ipairs(self.jobs) do
            if (j.JobId or j.Id) == id then return j end
        end
    end
    function r:finish_job(id, err)
        local j = self:find_job(id)
        if j then
            j.rendering = false
            j.pct = err and 0 or 100
            j.status = err and "Failed" or "Complete"
            j.err = err
        end
        self.rendering = false
    end
    project.IsRenderingInProgress = function() return r.rendering end
    project.GetRenderJobList = function() return r.jobs end
    project.AddRenderJob = function()
        return r:add_job({ CustomName = "autosubs-exported-audio-new.wav" }).JobId
    end
    project.DeleteRenderJob = function(_, id)
        r.deletedJobs[#r.deletedJobs + 1] = id
        for i, j in ipairs(r.jobs) do
            if (j.JobId or j.Id) == id then table.remove(r.jobs, i) return true end
        end
        return true
    end
    project.StartRendering = function(_, id)
        r.startCalls = r.startCalls + 1
        if r.failStarts > 0 then
            r.failStarts = r.failStarts - 1
            return false
        end
        -- Silent start: Resolve claims success but the job never leaves Ready.
        if r.silentStarts > 0 then
            r.silentStarts = r.silentStarts - 1
            return true
        end
        local j = r:find_job(id)
        if j then j.rendering = true end
        r.rendering = true
        return true
    end
    project.StopRendering = function()
        r.rendering = false
        return true
    end
    project.GetRenderJobStatus = function(_, id)
        local j = r:find_job(id)
        if not j then return nil end
        if j.live then j.pct = (j.pct or 0) + 1 end -- progress ticks each read
        return {
            JobStatus = j.rendering and "Rendering" or (j.status or "Ready"),
            CompletionPercentage = j.pct or 0,
            Error = j.err,
        }
    end
    project.SaveAsNewRenderPreset = function(_, name)
        if not r.savePreset then return false end
        r.presets[name] = true
        r.savedPresets[#r.savedPresets + 1] = name
        return true
    end
    project.LoadRenderPreset = function(_, name)
        if name == "Audio Only" then return r.audioOnly end
        r.loadedPresets[#r.loadedPresets + 1] = name
        return r.presets[name] == true
    end
    project.DeleteRenderPreset = function(_, name)
        r.deletedPresets[#r.deletedPresets + 1] = name
        r.presets[name] = nil
        return true
    end
    project.SetRenderSettings = function(_, s) r.renderSettings = s; return true end
    project.GetCurrentRenderFormatAndCodec = function()
        return { format = "quicktime", codec = "h264" }
    end
    project.SetCurrentRenderFormatAndCodec = function(_, f, c)
        r.fmt = tostring(f) .. ":" .. tostring(c)
        return true
    end
    project.GetCurrentRenderMode = function() return 0 end
    project.SetCurrentRenderMode = function(_, m) r.mode = m; return true end
    return r
end

local function run_export(name, r)
    tl = make_timeline({ trackCount = 1 })
    -- an audio clip covering the range so get_clip_boundaries finds content
    tl.tracks[1].items[1] = { handle = make_item(0, 24 * 60, nil) }
    mp = make_media_pool(tl, {})
    wire_project(tl, mp)
    print("\n=== " .. name .. " ===")
    return ExportAudio({
        func = "ExportAudio",
        outputDir = "/tmp/luatest/out",
        inputTracks = { 1 },
        exportRange = "entire",
    }), r
end

local function has_value(list, v)
    for _, x in ipairs(list) do if x == v then return true end end
    return false
end

-- E1: happy path — job starts, completes, job + backup preset are cleaned up.
do
    local r = wire_render()
    local res = run_export("export completes and restores render state", r)
    check(res and res.started == true, "export started", tostring(res and res.error))
    local pid = res and res.pid
    check(pid ~= nil, "job id reported", tostring(pid))
    r:finish_job(pid)
    local prog = GetExportProgress()
    check(prog and prog.completed == true, "progress reports completion", tostring(prog and prog.error))
    check(has_value(r.deletedJobs, pid), "render job deleted after completion")
    check(#r.savedPresets == 1, "user settings backed up to a temp preset")
    check(has_value(r.loadedPresets, r.savedPresets[1]), "backup preset restored")
    check(has_value(r.deletedPresets, r.savedPresets[1]), "backup preset deleted")
end

-- E2: idle queue — a leftover AutoSubs job is swept before the new export.
do
    local r = wire_render()
    r:add_job({ JobId = "stale-1", OutputFilename = "autosubs-exported-audio-old.wav" })
    local res = run_export("stale queue entry swept when idle", r)
    check(res and res.started == true, "export started", tostring(res and res.error))
    check(has_value(r.deletedJobs, "stale-1"), "stale job deleted")
end

-- E3: busy queue — an AutoSubs render still making progress must survive the
-- sweep, and the new export reports busy instead of stealing the renderer.
do
    local r = wire_render()
    r:add_job({ JobId = "live-1", OutputFilename = "autosubs-exported-audio-live.wav", live = true })
    r.rendering = true -- Resolve is mid-render
    local res = run_export("live render is not deleted; export reports busy", r)
    check(res and res.error == true, "busy error returned", tostring(res and res.started))
    check(not has_value(r.deletedJobs, "live-1"), "live job kept")
    check(r:find_job("live-1") ~= nil, "live job still queued")
end

-- E3b: busy queue — a stalled leftover AutoSubs job IS swept, then the export
-- can start once Resolve notices the queue is empty.
do
    local r = wire_render()
    r:add_job({ JobId = "zombie-1", OutputFilename = "autosubs-exported-audio-zombie.wav" })
    r.rendering = true -- Resolve still reports busy because of the zombie
    -- deleting the zombie clears IsRenderingInProgress on the next check
    local orig_delete = project.DeleteRenderJob
    project.DeleteRenderJob = function(p, id)
        local out = orig_delete(p, id)
        r.rendering = false
        return out
    end
    local res = run_export("stalled job swept while busy; export proceeds", r)
    check(res and res.started == true, "export started after sweep", tostring(res and res.error))
    check(has_value(r.deletedJobs, "zombie-1"), "stalled job deleted")
end

-- E4: job stays 'Ready' after start — one restart attempt, then completes.
do
    local r = wire_render({ silentStarts = 1 })
    local res = run_export("stuck Ready job gets one restart", r)
    check(res and res.started == true, "export started", tostring(res and res.error))
    local pid = res and res.pid
    -- First poll: job never left Ready at 0% -> restart fires.
    local prog = GetExportProgress()
    check(prog and prog.active == true, "still active after restart", tostring(prog and prog.error))
    check(r.startCalls == 2, "StartRendering retried once", "calls=" .. r.startCalls)
    r:finish_job(pid)
    prog = GetExportProgress()
    check(prog and prog.completed == true, "completes after restart")
end

-- E4b: a job that failed with a real error at 0% is NOT restarted.
do
    local r = wire_render()
    local res = run_export("failed job is not restarted", r)
    local pid = res and res.pid
    r:finish_job(pid, "disk full")
    local prog = GetExportProgress()
    check(prog and prog.error == true, "error surfaced", tostring(prog and prog.completed))
    check(r.startCalls == 1, "no restart for a real failure", "calls=" .. r.startCalls)
end

-- E5: StartRendering refuses twice — the start-failure path must still clean
-- the job and restore the user's render settings.
do
    local r = wire_render({ failStarts = 2 })
    local res = run_export("double start failure cleans up", r)
    check(res and res.error == true, "error returned", tostring(res and res.started))
    check(r.startCalls == 2, "StartRendering tried twice", "calls=" .. r.startCalls)
    check(#r.deletedJobs >= 1, "abandoned job deleted")
    check(has_value(r.loadedPresets, r.savedPresets[1] or ""), "user settings restored")
    check(has_value(r.deletedPresets, r.savedPresets[1] or ""), "backup preset deleted")
end

-- E6: cancel mid-export deletes the job and restores settings.
do
    local r = wire_render()
    local res = run_export("cancel cleans up", r)
    check(res and res.started == true, "export started", tostring(res and res.error))
    local pid = res and res.pid
    local cancel = CancelExport()
    check(cancel and cancel.success == true, "cancel succeeded", tostring(cancel and cancel.message))
    check(has_value(r.deletedJobs, pid), "job deleted on cancel")
    check(has_value(r.deletedPresets, r.savedPresets[1] or ""), "backup preset deleted")
end

-- E7: no 'Audio Only' preset and no temp-preset support — falls back to
-- format/codec restore plus a render-settings reset, still completes.
do
    local r = wire_render({ audioOnly = false, savePreset = false })
    local res = run_export("fallback restore without presets", r)
    check(res and res.started == true, "export started", tostring(res and res.error))
    r:finish_job(res and res.pid)
    local prog = GetExportProgress()
    check(prog and prog.completed == true, "completes", tostring(prog and prog.error))
    check(r.fmt == "quicktime:h264", "format/codec restored", tostring(r.fmt))
    check(r.mode == 0, "render mode restored", tostring(r.mode))
end

-- W1: Moving a word marker before the preceding word's stored end survives
-- marker application and timing normalization, with and without lead-in.
do
    local macro_file = assert(io.open("../Resolve-Integration/autosubs-macro.setting", "r"))
    local macro_source = macro_file:read("*a")
    macro_file:close()

    local function macro_script(name)
        local key = name .. " = [["
        local start = assert(macro_source:find(key, 1, true), name) + #key
        local finish = assert(macro_source:find("]],", start, true), name)
        return macro_source:sub(start, finish - 1)
    end

    local apply_word_markers = assert(loadstring(macro_script("ApplyWordMarkers")))()
    local scale_word_timing = macro_script("ScaleWordTiming")

    local function check_marker_move(animation_mode, stored_end, expected_start, label)
        local markers = {
            [110] = { customData = "AutoSubs", note = tostring(stored_end) },
            [126] = { customData = "AutoSubs" },
        }
        local item = {}
        function item:GetMarkers() return markers end
        function item:DeleteMarkerByCustomData(custom_data)
            for frame, marker in pairs(markers) do
                if marker.customData == custom_data then
                    markers[frame] = nil
                    return true
                end
            end
            return false
        end

        local comp = { __timelineItem = item }
        function comp:GetAttrs(name)
            if name == "COMPN_RenderStart" then return 100 end
            if name == "COMPN_RenderEnd" then return 500 end
        end
        function comp:GetPrefs(name)
            if name == "Comp.FrameFormat.Rate" then return "24" end
        end

        local tool = {
            _inputs = { Text = "one two", AnimationLength = 1, AnimationMode = animation_mode },
            _data = {
                GetTimelineItem = "return function(comp) return comp.__timelineItem end",
                GetDelaySpline = "return function() return {} end",
                ScaleWordTiming = scale_word_timing,
                ApplyWordTiming = "return function(comp, tool, timing) tool._wordTiming = timing end",
            },
        }
        function tool:GetInput(name) return self._inputs[name] end
        function tool:GetData(name) return self._data[name] end

        apply_word_markers(comp, tool)
        check(tool._wordTiming and tool._wordTiming[2].startFrame == expected_start,
            label .. " keeps the moved start",
            tostring(tool._wordTiming and tool._wordTiming[2].startFrame))
        check(tool._wordTiming and tool._wordTiming[1].endFrame == expected_start,
            label .. " caps the preceding end",
            tostring(tool._wordTiming and tool._wordTiming[1].endFrame))
    end

    check_marker_move(1, 38, 26, "marker move without lead-in")
    check_marker_move(2, 50, 38, "marker move with lead-in")
end

-- W2: The word highlight covers the words of the caption text, and it follows
-- a corrected caption: a word that keeps its spelling keeps its time.
do
    local style = AutoSubs_require("caption_style")
    -- "[first character..last character] start ms-end ms" for a frame rate of 1000
    local function placed(timing)
        local out = {}
        for _, word in ipairs(timing) do
            out[#out + 1] = string.format("[%d..%d] %d-%d", word.startIndex, word.endIndex, word.startFrame, word.endFrame)
        end
        return table.concat(out, " ")
    end
    local function word(spelling, start, finish)
        return { word = spelling, start = start, ["end"] = finish }
    end
    local function same(actual, expected, label)
        check(actual == expected, label, actual)
    end
    local function timing(words, text, origin)
        return placed(style.word_timing(words, 1000, origin or 0, text))
    end

    -- Each word owns the space before it, and the spelled words give the same result.
    local example = { word("Subtitle", 0, 0.7), word(" Example", 0.8, 1.5), word(" Text", 1.6, 2.3) }
    same(timing(example, "Subtitle Example Text"), "[0..7] 0-700 [8..15] 800-1500 [16..20] 1600-2300", "words own the space before them")
    same(placed(style.word_timing(example, 1000, 0)), "[0..7] 0-700 [8..15] 800-1500 [16..20] 1600-2300", "words without text are laid out by their spelling")

    -- The first word of a caption split from a longer segment keeps a leading
    -- space that the text does not show.
    local split = { word(" core", 21.249, 21.729), word(" that", 21.729, 21.889), word(" checks", 21.889, 22.289) }
    same(timing(split, "core that checks", 21.249), "[0..3] 0-480 [4..8] 480-640 [9..15] 640-1040", "a split caption is placed by its text")
    same(timing(split, "core", 21.249), "[0..3] 0-480", "a caption that lost words keeps the time of the ones it kept")

    -- A corrected caption: the words it kept keep their time, and a word that
    -- replaces one other word takes that word's time.
    local corrected = { word("One", 0, 0.5), word(" full", 0.5, 1), word(" elimin", 1, 1.5), word(" you'll", 1.5, 2) }
    same(timing(corrected, "One faulty lemma you'll"), "[0..2] 0-500 [3..9] 500-1000 [10..15] 1000-1500 [16..22] 1500-2000", "a corrected caption keeps the time of its words")
    local greeted = { word("Hello", 0, 0.4), word(" world", 2, 2.4) }
    same(timing(greeted, "Hello world!"), "[0..4] 0-400 [5..11] 2000-2400", "punctuation does not move a word")

    -- A word that was added shares the time with its neighbour, in proportion to its length.
    local inserted = { word("Hello", 0, 1), word(" fantastic", 1, 2), word(" world!", 2, 3) }
    same(timing(inserted, "Hello brave fantastic world!"), "[0..4] 0-1000 [5..10] 1000-1357 [11..20] 1357-2000 [21..27] 2000-3000", "an added word takes time from its neighbour")

    -- A word that was deleted takes its time with it.
    local deleted = { word("We", 0, 1), word(" visited", 1, 2), word(" Paris", 2, 3), word(" yesterday.", 3, 4) }
    same(timing(deleted, "We visited yesterday."), "[0..1] 0-1000 [2..9] 1000-2000 [10..20] 3000-4000", "a deleted word takes its time with it")

    -- A special space separates words, and an accented letter is one character.
    local accented = { word("Alpöge's", 0, 0.6), word(" feat", 0.6, 0.9), word(" lean", 0.9, 1.3), word(" on", 1.3, 1.7) }
    same(timing(accented, "Alpöge's feat lean\194\160on"), "[0..7] 0-600 [8..12] 600-900 [13..17] 900-1300 [18..20] 1300-1700", "a special space separates words")

    -- A script with one timed word per character has no word boundaries in the text: the spelling stays the guide.
    local han = { word("你好", 0, 0.5), word("世界", 0.5, 1) }
    same(timing(han, "你好世界"), "[0..1] 0-500 [2..3] 500-1000", "Chinese words are laid out by their spelling")
    local kana = { word("こ", 0, 0.1), word("ん", 0.1, 0.2), word("に", 0.2, 0.3), word("ち", 0.3, 0.4), word("は", 0.4, 0.5),
        word(" 世", 0.5, 0.6), word("界", 0.6, 0.7), word("で", 0.7, 0.8), word("す", 0.8, 0.9) }
    same(timing(kana, "こんにちは 世界です"), "[0..0] 0-100 [1..1] 100-200 [2..2] 200-300 [3..3] 300-400 [4..4] 400-500 [5..6] 500-600 [7..7] 600-700 [8..8] 700-800 [9..9] 800-900", "Japanese keeps one word per character, with a space in the text")
    same(timing(kana, "こんにちは世界ですね"), "[0..0] 0-100 [1..1] 100-200 [2..2] 200-300 [3..3] 300-400 [4..4] 400-500 [5..5] 500-600 [6..6] 600-700 [7..7] 700-800 [8..8] 800-900", "a corrected Japanese caption follows the characters of its text")
    local leading = { word(" こ", 0, 0.1), word("ん", 0.1, 0.2), word("に", 0.2, 0.3), word("ち", 0.3, 0.4), word("は", 0.4, 0.5),
        word(" 世", 0.5, 0.6), word("界", 0.6, 0.7), word("で", 0.7, 0.8), word("す", 0.8, 0.9) }
    same(timing(leading, "こんにちは 世界です"), "[0..0] 0-100 [1..1] 100-200 [2..2] 200-300 [3..3] 300-400 [4..4] 400-500 [5..6] 500-600 [7..7] 600-700 [8..8] 700-800 [9..9] 800-900", "a Japanese caption whose words have leading spaces is placed by its text")
    same(timing(han, "你好朋友们"), "[0..1] 0-500 [2..3] 500-1000", "a corrected Chinese caption with words of two characters keeps one entry per word")
    local thai = { word("สวัสดี", 0, 0.6), word("ครับ", 0.6, 1) }
    same(timing(thai, "สวัสดีครับ"), "[0..5] 0-600 [6..9] 600-1000", "Thai words are laid out by their spelling")
    same(#style.word_timing(kana, 1000, 0, ""), 0, "an empty text has no entry for a script with one word per character")

    -- A script without spaces as the formatter gives it: one timed word per grapheme cluster, some with
    -- a combining mark, and a leading space on the first grapheme of a later token.
    local thai_graphemes = { word("ส", 0, 0.25), word("วั", 0.25, 0.5), word("ส", 0.5, 0.75), word("ดี", 0.75, 1),
        word(" ค", 1, 1.25), word("รั", 1.25, 1.5), word("บ", 1.5, 1.75) }
    local thai_placed = "[0..0] 0-250 [1..2] 250-500 [3..3] 500-750 [4..5] 750-1000 [6..6] 1000-1250 [7..8] 1250-1500 [9..9] 1500-1750"
    same(timing(thai_graphemes, "สวัสดีครับ"), thai_placed, "a Thai caption is laid over its text by the length of its timed words")
    same(timing(thai_graphemes, "สวัสดีครับพี่"), thai_placed, "a corrected Thai caption that grew keeps one entry per timed word")
    same(timing(kana, "こんにちは\227\128\128世界ですね"),
        "[0..0] 0-100 [1..1] 100-200 [2..2] 200-300 [3..3] 300-400 [4..4] 400-500 [5..6] 500-600 [7..7] 600-700 [8..8] 700-800 [9..9] 800-900",
        "a full-width space in the text counts as one character and belongs to the word after it")
    same(timing(han, "你好"), "[0..1] 0-500", "a corrected Chinese caption that lost a word")
    -- A full-width space that is its own timed word (the formatter gives a space of such a script one),
    -- with a leading space on the first word.
    local with_space_word = { word(" こ", 0, 0.1), word("ん", 0.1, 0.2), word("に", 0.2, 0.3), word("ち", 0.3, 0.4),
        word("は", 0.4, 0.5), word("\227\128\128", 0.5, 0.6), word("世", 0.6, 0.7), word("界", 0.7, 0.8) }
    same(timing(with_space_word, "こんにちは\227\128\128世界"),
        "[0..0] 0-100 [1..1] 100-200 [2..2] 200-300 [3..3] 300-400 [4..4] 400-500 [5..5] 500-600 [6..6] 600-700 [7..7] 700-800",
        "a full-width space that is its own timed word takes the space in the text")
    -- A caption of two lines in a script without spaces: the line break is not in the timed words.
    local thai_two_lines = { word("ส", 0, 0.25), word("วั", 0.25, 0.5), word("ส", 0.5, 0.75), word("ดี", 0.75, 1),
        word(" ค", 1, 1.25), word("รั", 1.25, 1.5), word("บ", 1.5, 1.75) }
    same(timing(thai_two_lines, "สวัสดี\nครับ"),
        "[0..0] 0-250 [1..2] 250-500 [3..3] 500-750 [4..5] 750-1000 [6..7] 1000-1250 [8..9] 1250-1500 [10..10] 1500-1750",
        "a Thai caption of two lines keeps one entry per timed word, and the first word of the second line owns the line break")
    -- The user deleted the space that was its own timed word: that word gets no entry, the others stay on their characters.
    local space_removed = { word(" こ", 0, 0.1), word("ん", 0.1, 0.2), word("に", 0.2, 0.3), word("ち", 0.3, 0.4), word("は", 0.4, 0.5),
        word("\227\128\128", 0.5, 0.6), word("世", 0.6, 0.7), word("界", 0.7, 0.8) }
    same(timing(space_removed, "こんにちは世界"), "[0..0] 0-100 [1..1] 100-200 [2..2] 200-300 [3..3] 300-400 [4..4] 400-500 [5..5] 600-700 [6..6] 700-800",
        "a timed word that is only whitespace gets no entry when the text has no whitespace for it")
    -- Timed words without any character get no entry.
    local empty_words = { word("a", 0, 1), word("", 1, 1), word("", 1, 1), word(" b", 2, 3) }
    same(timing(empty_words, "a b"), "[0..0] 0-1000 [1..2] 2000-3000", "timed words without characters get no entry")
    local unspaced = { word("dog", 0, 0.5), word("a", 0.5, 1) }
    same(timing(unspaced, "a"), "[0..0] 500-1000", "timed words without leading spaces follow the text")
    -- Spaces in the text, lines, and times that are not numbers.
    local pair = { word("a", 0, 0.5), word(" b", 0.5, 1) }
    same(timing(pair, "a  b"), "[0..1] 0-500 [2..3] 500-1000", "with two spaces between words, the first one belongs to the word before it")
    same(timing(pair, " a b"), "[0..1] 0-500 [2..3] 500-1000", "a text that starts with a space")
    local lines = { word("We", 0, 0.5), word(" visited", 0.5, 1), word("Paris", 1, 1.5), word(" yesterday.", 1.5, 2) }
    same(timing(lines, "We visited\nParis yesterday."), "[0..1] 0-500 [2..9] 500-1000 [10..15] 1000-1500 [16..26] 1500-2000", "a caption of two lines")
    local vanished = { word("a", 0, 1), word("b", 1, 1), word("c", 1, 2) }
    same(timing(vanished, "a X c"), "[0..0] 0-1000 [1..2] 1000-1500 [3..4] 1500-2000", "a word that replaces a word without time shares the time with its neighbour")
    local strings = { word("a", "0", "1"), word(" b", "1", "2") }
    same(timing(strings, "a b c"), "[0..0] 0-1000 [1..2] 1000-1500 [3..4] 1500-2000", "times given as strings")
    local stuck = { word("a", 1, 1), word(" b", 1, 1), word(" c", 1, 1) }
    same(#style.word_timing(stuck, 1000, 0, "a b c d"), 4, "every word with the same time gives one entry per word")
    local ideographic = { word("Hello", 0, 0.4), word("\227\128\128world", 2, 2.4) }
    same(timing(ideographic, "Hello brave world"), "[0..4] 0-400 [5..10] 400-2000 [11..16] 2000-2400", "a timed word with a leading special space keeps its time")

    -- An empty caption has no word timing.
    check(#style.word_timing(split, 1000, 0, "") == 0, "an empty caption has no word timing")

    -- AddSubtitles hands the caption's text to word_timing.
    local comp = make_comp()
    style.apply(comp, { templateName = "AutoSubs Caption 2026-09-17", text = "core that checks",
        words = split, start = 21.249 })
    local applied = comp.tools.AutoSubs:GetData("WordTiming")
    check(applied[1].startIndex == 0 and applied[2].startIndex == 4 and applied[3].endIndex == 15,
        "AddSubtitles places words by the caption text", placed(applied))
end

print(string.format("\n%d passed, %d failed", PASS, FAIL))
os.exit(FAIL == 0 and 0 or 1)
