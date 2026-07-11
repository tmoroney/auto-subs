---
name: davinci-resolve-fusion
description: Scripting and automating DaVinci Resolve and building Fusion compositions, macros, and animations. Covers the Resolve scripting API (projects, timelines, media pool, rendering), the Fusion object model, building/editing .setting macros, exposing macro controls, and animating with BezierSpline keyframes, handles, easing, and StyledTextFollower. Use this skill for any DaVinci Resolve Lua/Python script, Fusion macro authoring, or Fusion keyframe/animation work.
---

# DaVinci Resolve & Fusion

This skill helps you write DaVinci Resolve automation scripts (Lua/Python) and build or edit
Fusion compositions, macros (`.setting` files), and animations. It bundles a reference set
and helper scripts so you can build new things, not just modify existing ones.

## Source of truth — read this first

When sources disagree, trust them in this order:

1. **`references/resolve-api.txt`** — the official Resolve scripting `README.txt`, kept as
   plain text (it is monospace column-aligned and unreadable rendered as Markdown). This is
   **authoritative for the DaVinci Resolve API**. It is a snapshot; if a Resolve install is
   present, the live file at
   `…/Blackmagic Design/DaVinci Resolve/Developer/Scripting/README.txt` is the very latest
   and supersedes the snapshot. Re-sync it after a Resolve update with
   `scripts/update-resolve-api.sh` (macOS/Linux) or `scripts/update-resolve-api.bat`
   (Windows).
2. **Tested, working code** — a real script that runs correctly beats any doc for usage
   details (exact parameter shapes, return values, ordering).
3. **`references/fusion-manual/`** — the Fusion 8 scripting manual. Use it for Fusion-specific
   concepts the Resolve API doc does not cover (object model, splines, tools, GUIs). It was
   converted from a PDF and is an **older snapshot that can be outdated or inaccurate**, so
   defer to (1) and (2) on anything they also describe.

Every manual file carries a banner repeating this, so the warning travels with the content
even when only one file is open.

## What's here

```
references/
  resolve-api.txt           # Resolve scripting API — SOURCE OF TRUTH (plain text; view monospace)
  animation.md              # Fusion animation: keyframes, handles, easing, connecting props
  macro-authoring.md        # Building .setting macros, exposing/hiding controls
  fusion-templates.md       # Transitions, generators, titles, effects as macros
  fusion-manual/
    00-index.md             # START HERE for the manual — map of every section & class
    01-introduction.md … 06-class-hierarchy.md
    classes/<ClassName>.md  # one file per Fusion class (46 of them)
scripts/
  run-script.sh / .bat          # run a script via fuscript (Studio only)
  update-resolve-api.sh / .bat  # re-sync resolve-api.txt from your Resolve install
  split-fusion-manual.py        # regenerate fusion-manual/ from a converted manual PDF
```

## How to use it

**Writing a Resolve automation script** (timelines, media pool, rendering, project
management): start from `references/resolve-api.txt`. For working examples, see "Example
scripts" below. See "Running a script" below for how to actually run it.

## Example scripts

DaVinci Resolve ships representative example scripts. They are not bundled into this skill (to
avoid redistributing Blackmagic's code); read them from your local install instead, in the
`Examples` subfolder of the Scripting folder:

- **macOS:** `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Examples`
- **Windows:** `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Examples`
- **Linux:** `/opt/resolve/Developer/Scripting/Examples` (or `/home/resolve/...`)

For **real, working** Resolve API usage (not just illustrative examples), the most reliable
reference is the AutoSubs Lua server, `autosubs_core.lua`, in the AutoSubs project. It shows
the API used in production for timelines, the media pool, rendering, and driving the Fusion
macro.

## Running a script

There are two ways to run a script, depending on the Resolve edition:

**Menu method (works on every edition, free and Studio).** Place the `.lua`/`.py` file in
Resolve's Fusion Scripts folder, then in Resolve go to **Workspace → Scripts** (top menu) and
pick it from the list. Put it under the `Utility` subfolder to have it listed on all pages.
The Scripts folder (from `references/resolve-api.txt`) is:

- **macOS:** `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts`
  (or `/Library/...` for all users)
- **Windows:** `%APPDATA%\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`
  (or `%PROGRAMDATA%\...` for all users)
- **Linux:** `$HOME/.local/share/DaVinciResolve/Fusion/Scripts` (or `/opt/resolve/Fusion/Scripts`)

**External runner (DaVinci Resolve Studio only).** `scripts/run-script.sh <file.lua>`
(macOS/Linux) or `scripts/run-script.bat` (Windows) invoke Resolve's `fuscript` directly, so
you can run a script from anywhere without going through the menu. This is often more
convenient, especially for AI agents, but external/`fuscript` invocation of the scripting API
requires Resolve **Studio** — it does not work on the free edition. The menu method above works
on both, so it's the reliable fallback.

**Building or editing a Fusion macro** (`.setting`): read `references/macro-authoring.md`
for the two-layer control model (UserControls vs published InstanceInputs) and the common
gotchas. For tool/class details, open `references/fusion-manual/00-index.md` and jump to the
specific class file.

**Animating** (keyframes, easing, character/word effects): read `references/animation.md`.
The single biggest gotcha: `SetKeyFrames()` handle coordinates are **relative**, but
`.setting` files store them **absolute**.

**Making a reusable template** (transition/generator/title/effect for the Edit & Cut
pages): read `references/fusion-templates.md`.

## Navigating the Fusion manual efficiently

The manual is large, so it is split into one file per topic and per class. **Do not read it
whole.** Open `references/fusion-manual/00-index.md`, find the section or class you need from
its one-line summaries, then open only that file. To locate something by keyword, grep across
`references/fusion-manual/` rather than scrolling.

To regenerate the split (e.g. from a newer manual), convert Blackmagic's Fusion scripting PDF
to Markdown for free with Mistral Document AI
(<https://console.mistral.ai/build/document-ai/ocr-playground>), then run
`python3 scripts/split-fusion-manual.py <converted.md>`.

## Tips

- Lua and Python are both supported by Resolve/Fusion; the object model is the same across
  both — see `fusion-manual/02-scripting-languages.md`.
- Connect an input to a modifier with `tool.Input = modifier.Result`; disconnect with
  `tool.Input = nil` then `tool:SetInput(...)` for a static value.
- After changing a macro's published controls, reload the comp or drop a fresh node
  instance — the Inspector layout is cached per instance.
- For editing `.setting` files, the Fusion Setting Highlighter VS Code extension adds proper
  highlighting (incl. embedded Lua). See `references/macro-authoring.md` for the install
  command, or <https://github.com/tmoroney/fusion-setting-highlighter>.
