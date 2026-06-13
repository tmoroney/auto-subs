# `macro-src/` — source of truth for the caption macro's logic

All of the Lua logic that used to live as long-bracket strings inside the
`CustomData` section of [`autosubs-macro.setting`](../autosubs-macro.setting)
lives here as real `.lua` files. Edit these files (with syntax highlighting,
linting and diffs), then run the build step — **never** hand-edit the generated
output.

```
macro-src/
  README.md                 # this file
  fade_helper.lua           # the single shared fade implementation (apply + flat)
  data/
    input_keys.lua          # the list of macro input names presets capture
  logic/                    # one file per CustomData logic block (file -> PascalCase key)
    get_input_values.lua    #   -> GetInputValues
    set_input_values.lua    #   -> SetInputValues
    set_animations.lua      #   -> SetAnimations (registry-driven orchestrator)
    apply_highlight.lua      #   -> ApplyHighlight
    ...                      #   (and the rest: word timing, markers, style colors)
  animations/
    _registry.lua           # ORDERED list of animation modules (drives apply order)
    _helpers.lua            # shared animation helpers (skipped by the registry)
    fade.lua                # animation descriptor
    pop_in.lua              # animation descriptor
    slide_up.lua            # animation descriptor
```

> Files are authored as `.lua` for tooling, but they are **fragments**: each one
> is `loadstring`'d individually at runtime, so keep each as a single
> `return function(...) ... end` or `return { ... }`.

## How it reaches the macro

```
macro-src/*.lua
   │  build-macro.mjs
   ▼
AutoSubs-App/src-tauri/resources/modules/macro_logic.lua   (generated bundle)
   │  shipped as a Tauri resource, require()'d by autosubs_core.lua
   ▼
inject_macro_logic(tool)  ->  tool:SetData(key, src)         (runtime injection)
   ▼
the live "AutoSubs" macro instance on the timeline runs the fresh logic
```

The macro's helpers all run via `loadstring(tool:GetData("Name"))()`, so
injecting fresh strings under those keys patches a running macro instance with
this build's logic. **This is a dev-iteration convenience** — it lets logic
edits take effect in-session without re-importing the bin.

> **It is NOT a substitute for re-exporting the bin.** `caption-bin.drb` is the
> canonical macro shipped to users: it carries the node graph and the controls
> exposed on the **timeline clip's Inspector** (not just the Fusion page). Any
> PR that changes the macro must re-export `caption-bin.drb` — see the PR
> checklist in [Resolve-Integration/README.md](../README.md). Runtime injection
> only patches logic on a live instance during an AutoSubs session; it cannot
> change what controls a freshly imported template exposes.

`build-macro.mjs` also writes the same blocks back into
`autosubs-macro.setting` between `-- @macro-src:begin` / `-- @macro-src:end`
markers, so the standalone `.setting` stays runnable for in-Fusion editing.
`build-macro.mjs` does **not** touch the binary `.drb`.

## Build

```bash
# from AutoSubs-App/
npm run build:macro
```

This is also run automatically by `npm run build:tauri-prep`. The build is
idempotent (running it twice produces no git diff) and validates that:

- every generated block parses as Lua (via `luajit`, when installed),
- every animation has a unique `id` and an `apply()`,
- every animation `controlKey` exists in `input_keys.lua`.

## The animation registry

Each `animations/<name>.lua` returns a **descriptor**:

```lua
return {
  id         = "slideUp",        -- stable identifier
  label      = "Slide Up",        -- human label (docs / UI)
  controlKey = "SlideUpEnabled", -- the UserControl that toggles it (1/0)
  usesFade   = true,              -- declarative: include a companion fade-in
  apply = function(ctx) ... end,  -- ctx = { comp, tool, follower, animStretcher,
  reset = function(follower) ...  --         animSpline, animInEnd, animOutStart,
}                                  --         animationLevel, mode, fps }
```

`set_animations.lua` (the orchestrator) does **not** special-case individual
animations. It:

1. resets every animation,
2. computes `needsFade = FadeEnabled OR any enabled animation with usesFade`,
3. applies the shared fade (or flat opacity) **exactly once**,
4. applies each enabled animation's `apply(ctx)`.

This replaces the old implicit coupling where fade was silently applied whenever
pop-in/slide-up were enabled. The dependency is now visible as one boolean
(`usesFade`) on the animation that needs it, and the fade curve has a single
home in `fade_helper.lua`.

Inside the assembled registry chunk, descriptors can use two upvalues wired in
by the build: `fade_helper` (from `fade_helper.lua`) and `helpers` (from
`animations/_helpers.lua`).

## Add a new animation

If your animation reuses existing controls (opacity / size / offset) you don't
need to author anything in Fusion (no new nodes or `UserControl`s):

1. `cp animations/pop_in.lua animations/bounce.lua`
2. Edit `bounce.lua`: set `id`, `label`, `controlKey`, `usesFade`, and the
   `apply` / `reset` keyframe logic.
3. Add `"bounce"` to `animations/_registry.lua` (order = apply order).
4. If it needs a **new** toggle, add a `UserControl` + an `input_keys.lua` entry
   in Fusion (the only step that requires Fusion *authoring*). If it reuses an
   existing control, skip this.
5. `npm run build:macro`
6. Sanity-check offline: `luajit scripts/test-macro-logic.lua`
7. Render it live in Resolve: `fuscript scripts/test-macro.lua bounce`
8. **Re-export `caption-bin.drb`** so the shipped template carries the updated
   macro, then open a PR. This is required for every macro PR — the runtime
   injection only patches a live instance in-session and does not update the bin
   users receive. See the PR checklist in
   [Resolve-Integration/README.md](../README.md).

No edits to the orchestrator. No hunting through a 2,000-line file.
