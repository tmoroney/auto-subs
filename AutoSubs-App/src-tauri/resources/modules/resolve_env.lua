-- Shared access to the DaVinci Resolve / Fusion scripting environment.
--
-- When a script runs from Resolve's Workspace > Scripts menu, the embedded
-- LuaJIT injects `resolve` and `fusion` as lowercase globals. Run another way
-- (e.g. the standalone interpreter) those globals can be missing and we have to
-- ask for the objects explicitly. Reaching them is fiddly enough -- and easy to
-- get subtly wrong -- that every module should go through this one helper.
--
---@diagnostic disable: undefined-global
local M = {}

-- Read a global by name without tripping LuaJIT's strict-global checks.
local function global(name)
    return rawget(_G, name)
end

-- The running Resolve object, or nil if it can't be reached.
function M.get_resolve()
    local r = global("resolve")
    if r == nil and type(global("Resolve")) == "function" then
        r = Resolve()
    end
    return r
end

local cached_fusion

-- The Fusion object for the running Resolve instance, or nil if unavailable.
--
-- Tried in order of preference:
--   1. the `fusion`/`fu` global Resolve injects   (no side effects)
--   2. resolve:Fusion() on the running instance    (no side effects)
--   3. the bare Fusion() global                     (LAST resort)
--
-- Step 3 can spin up a *headless* Fusion instance, so it's only reached when
-- the first two fail. The result is cached so repeat callers don't re-probe;
-- a nil result is intentionally not cached so it can be retried once Fusion is
-- actually available.
function M.get_fusion()
    if cached_fusion ~= nil then
        return cached_fusion
    end

    local fu = global("fusion") or global("fu")

    if fu == nil then
        local r = M.get_resolve()
        if r and type(r.Fusion) == "function" then
            fu = r:Fusion()
        end
    end

    if fu == nil and type(global("Fusion")) == "function" then
        fu = Fusion()
    end

    cached_fusion = fu
    return fu
end

return M
