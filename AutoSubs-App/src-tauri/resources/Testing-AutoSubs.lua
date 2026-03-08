---These are global variables given to us by the Resolve embedded LuaJIT environment
---I disable the undefined global warnings for them to stop my editor from complaining
---@diagnostic disable: undefined-global
local source = debug.getinfo(1, "S").source
local script_path = source:sub(1, 1) == "@" and source:sub(2) or source
local sep = package.config:sub(1, 1)
local script_dir = script_path:match("^(.*" .. sep .. ")") or ""

_G.AUTOSUBS_DEV_MODE = true

return dofile(script_dir .. "AutoSubs.lua")

