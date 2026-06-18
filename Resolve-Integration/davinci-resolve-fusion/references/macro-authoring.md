# Fusion Macro Authoring (.setting files)

General rules for building `MacroOperator` `.setting` files and exposing controls in the
macro Inspector. Applies to any Fusion macro, not a specific app. For the scripting API see
`fusion-manual/00-index.md` and `resolve-api.txt`.

## Tooling: syntax highlighting for .setting files

`.setting` files are a Lua-like table format with embedded Lua in script blocks, which most
editors don't highlight well. The **Fusion Setting Highlighter** VS Code extension provides
proper syntax highlighting for Fusion objects (macros, tools, modifiers) with full embedded
Lua support inside script blocks, which makes editing macros far easier:
<https://github.com/tmoroney/fusion-setting-highlighter>

Install:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/tmoroney/fusion-setting-highlighter/master/scripts/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/tmoroney/fusion-setting-highlighter/master/scripts/install.ps1 | iex
```

## Two separate control layers

A `MacroOperator` `.setting` has two layers that must stay in sync:

1. `Tools.<Tool>.UserControls` — controls defined on the inner tool.
2. `MacroOperator.Inputs = { InstanceInput ... }` — controls actually exposed in the macro
   Inspector.

### 1. Defining a UserControl does NOT show it in the macro Inspector

A control added only under `UserControls` can exist but stay invisible. You must also
publish it in `MacroOperator.Inputs`:

```lua
-- On the inner tool (UserControls):
MyColorRed = {
    INPID_InputControl = "ColorControl",
    IC_ControlID = 0,
    IC_ControlGroup = 21,
}

-- Separately, in MacroOperator.Inputs:
MyPublishedColorRed = InstanceInput {
    SourceOp = "Template",
    Source   = "MyColorRed",
    Page     = "Style",
}
```

### 2. Hide controls by removing InstanceInput entries, not `IC_Visible = false`

`IC_Visible = false` on an `InstanceInput` is not reliably respected in macro UIs. The
dependable way to hide a control is to remove its `InstanceInput` from
`MacroOperator.Inputs` entirely.

### 3. Don't reuse native channel names for custom control IDs

Custom IDs like `Red1/Green1/Blue1` collide with built-in TextPlus channels and behave
unreliably. Use unique IDs (e.g. `FillRed/FillGreen/FillBlue`) and map them to the real
channels in `INPS_ExecuteOnChange`:

```lua
local r = tool:GetInput("FillRed")
local g = tool:GetInput("FillGreen")
local b = tool:GetInput("FillBlue")
tool:SetInput("Red1", r)
tool:SetInput("Green1", g)
tool:SetInput("Blue1", b)
```

### 4. Keep behavior scripts on the UserControl, not on InstanceInput

`InstanceInput` is for publishing UI only. Behavioral logic (`INPS_ExecuteOnChange`,
`BTNCS_Execute`) belongs on the source control on the inner tool.

### 5. Existing macro instances may not pick up layout changes

After changing published inputs or UserControls, reload the comp/tool. If the Inspector
still looks stale, delete and re-add a fresh macro node instance — layout can be cached per
instance.

## Embedding logic in CustomData

Macro behaviour can be stored as Lua long-bracket strings in the macro's `CustomData`
field and executed at runtime with `loadstring`. A common, reusable pattern is a registry
of named operations plus an orchestrator that loops over it, so new behaviours can be added
as data without changing the orchestration code. (For a worked example of this pattern, see
the app-specific animation-system doc that ships with your project.)

## Checklist for adding a new exposed control

1. Add the `UserControl` definition on the inner tool.
2. Publish it as an `InstanceInput` in `MacroOperator.Inputs` (set its `Page`).
3. If presets capture values, register the control key wherever your preset list lives.
4. Reload, or use a fresh node instance, to see the change.
