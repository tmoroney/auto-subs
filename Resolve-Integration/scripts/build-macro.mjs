#!/usr/bin/env node
// build-macro.mjs — assemble the AutoSubs caption macro logic.
//
// macro-src/ is the SOURCE OF TRUTH for all of the macro's embedded Lua logic.
// This script bundles it into two places:
//
//   1. AutoSubs-App/src-tauri/resources/modules/macro_logic.lua
//      A Lua module ({ version, blocks, data }) shipped as a Tauri resource and
//      injected into the live macro at runtime by autosubs_core.lua. This is a
//      dev-iteration convenience that patches a running macro instance so logic
//      edits take effect in-session. It does NOT replace re-exporting the bin.
//
//   2. Resolve-Integration/autosubs-macro.setting
//      The same blocks are written back between `-- @macro-src:begin/end`
//      sentinel markers in CustomData, so the standalone .setting stays runnable
//      for in-Fusion editing.
//
// NOTE: this script does NOT touch the binary caption-bin.drb. The .drb is the
// canonical macro shipped to users — it carries the node graph and the controls
// exposed on the timeline clip's Inspector — so it must be re-exported by hand
// as part of any PR that changes the macro. See Resolve-Integration/README.md
// "Updating the Macro Bin for PRs".
//
// The script is idempotent: running it twice produces no git diff.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "macro-src");
const SETTING = join(ROOT, "autosubs-macro.setting");
const BUNDLE = join(
  ROOT,
  "..",
  "AutoSubs-App",
  "src-tauri",
  "resources",
  "modules",
  "macro_logic.lua"
);

// Bump when the injected logic contract changes in a way the app should detect.
const MACRO_LOGIC_VERSION = 1;

const BEGIN = "-- @macro-src:begin";
const END = "-- @macro-src:end";

// --- helpers ---------------------------------------------------------------

// snake_case file name -> PascalCase CustomData key (get_input_values -> GetInputValues)
const pascal = (name) =>
  name
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

// Read a .lua source fragment, normalise EOLs, strip trailing whitespace.
function readSrc(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

// Pick a Lua long-bracket level ([[ ]], [=[ ]=], ...) that won't collide with
// the content, then wrap it (leading newline is ignored by Lua long strings).
function longString(content) {
  let level = 0;
  while (content.includes("]" + "=".repeat(level) + "]")) level++;
  const eq = "=".repeat(level);
  return `[${eq}[\n${content}\n]${eq}]`;
}

// Render a `Key = <longstring>,` entry indented with `indent` on the key line.
function renderEntry(key, content, indent) {
  return `${indent}${key} = ${longString(content)},`;
}

// --- assemble blocks -------------------------------------------------------

// 1. Top-level logic blocks: every logic/*.lua becomes a CustomData string key.
function collectLogicBlocks() {
  const dir = join(SRC, "logic");
  const files = readdirSync(dir).filter((f) => f.endsWith(".lua")).sort();
  return files.map((f) => ({
    key: pascal(basename(f, ".lua")),
    src: readSrc(join(dir, f)),
  }));
}

// 2. AnimationRegistry: a single self-contained chunk that returns the ordered
//    list of animation descriptors, with shared helpers (`helpers`,
//    `fade_helper`) inlined as locals the descriptors close over.
function buildAnimationRegistry() {
  const animDir = join(SRC, "animations");
  const order = evalLuaStringList(join(animDir, "_registry.lua"));

  const inlineModule = (varName, path) => {
    const body = readSrc(path)
      .split("\n")
      .map((l) => (l.length ? "\t" + l : l))
      .join("\n");
    return `\tlocal ${varName} = (function()\n${body}\n\tend)()`;
  };

  const parts = [];
  // Shared helpers MUST come before the descriptors that close over them.
  parts.push(inlineModule("helpers", join(animDir, "_helpers.lua")));
  parts.push(inlineModule("fade_helper", join(ROOT, "macro-src", "fade_helper.lua")));
  for (const name of order) {
    parts.push(inlineModule(name, join(animDir, `${name}.lua`)));
  }
  parts.push(`\treturn { ${order.join(", ")} }`);
  return parts.join("\n\n");
}

// Minimal parser for `return { "a", "b" }` style files (no Lua runtime needed).
function evalLuaStringList(path) {
  const text = readSrc(path);
  return [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// 3. InputKeys data table.
function collectInputKeys() {
  return evalLuaStringList(join(SRC, "data", "input_keys.lua"));
}

// --- render outputs --------------------------------------------------------

function buildModel() {
  const blocks = collectLogicBlocks();
  blocks.push({ key: "AnimationRegistry", src: buildAnimationRegistry() });
  const inputKeys = collectInputKeys();
  return { blocks, inputKeys };
}

function renderBundle({ blocks, inputKeys }) {
  const lines = [];
  lines.push("-- AUTO-GENERATED by Resolve-Integration/scripts/build-macro.mjs");
  lines.push("-- Source of truth: Resolve-Integration/macro-src/. DO NOT EDIT BY HAND.");
  lines.push("return {");
  lines.push(`\tversion = ${MACRO_LOGIC_VERSION},`);
  lines.push("\tblocks = {");
  for (const { key, src } of blocks) {
    lines.push(renderEntry(key, src, "\t\t"));
  }
  lines.push("\t},");
  lines.push("\tdata = {");
  lines.push("\t\tInputKeys = {");
  for (const k of inputKeys) lines.push(`\t\t\t"${k}",`);
  lines.push("\t\t},");
  lines.push("\t},");
  lines.push("}");
  return lines.join("\n") + "\n";
}

// The CustomData region between the sentinel markers (indent = 4 tabs).
function renderSettingRegion({ blocks, inputKeys }) {
  const indent = "\t\t\t\t";
  const lines = [];
  lines.push(`${indent}-- (generated by build-macro.mjs from macro-src/ — do not edit between markers)`);
  lines.push(`${indent}InputKeys = {`);
  for (const k of inputKeys) lines.push(`${indent}\t"${k}",`);
  lines.push(`${indent}},`);
  for (const { key, src } of blocks) {
    lines.push(renderEntry(key, src, indent));
  }
  return lines.join("\n");
}

function injectIntoSetting(regionBody) {
  let text = readFileSync(SETTING, "utf8");
  const beginIdx = text.indexOf(BEGIN);
  const endIdx = text.indexOf(END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(
      `Sentinel markers not found in ${SETTING}.\n` +
        `Add a line containing "${BEGIN}" and a later line containing "${END}" ` +
        `inside CustomData (see Resolve-Integration/macro-src/README.md).`
    );
  }
  // Keep the marker lines themselves (and their indentation); replace between.
  const beginLineEnd = text.indexOf("\n", beginIdx);
  const endLineStart = text.lastIndexOf("\n", endIdx);
  const before = text.slice(0, beginLineEnd);
  const after = text.slice(endLineStart);
  const next = `${before}\n${regionBody}${after}`;
  writeFileSync(SETTING, next);
}

// --- validation ------------------------------------------------------------

function luajitPath() {
  try {
    execFileSync("luajit", ["-v"], { stdio: "ignore" });
    return "luajit";
  } catch {
    return null;
  }
}

// Byte-compile the bundle and verify the animation registry contract using a
// real Lua runtime when luajit is available; fall back to a regex check.
function validate(model) {
  const lj = luajitPath();
  if (lj) {
    const tmp = mkdtempSync(join(tmpdir(), "autosubs-macro-"));
    const checker = join(tmp, "check.lua");
    writeFileSync(
      checker,
      `local ml = dofile(arg[1])
assert(type(ml) == "table", "bundle did not return a table")
assert(type(ml.blocks) == "table", "missing blocks")
assert(ml.blocks.AnimationRegistry, "missing AnimationRegistry block")
-- Byte-compile every block (catches syntax errors in the fragments).
for k, v in pairs(ml.blocks) do
  local fn, err = loadstring(v, k)
  assert(fn, "block '" .. k .. "' failed to parse: " .. tostring(err))
end
local inputKeys = {}
for _, k in ipairs(ml.data.InputKeys) do inputKeys[k] = true end
local registry = loadstring(ml.blocks.AnimationRegistry)()
assert(type(registry) == "table" and #registry > 0, "registry is empty")
local seen = {}
for _, a in ipairs(registry) do
  assert(a.id and a.id ~= "", "animation missing id")
  assert(not seen[a.id], "duplicate animation id: " .. tostring(a.id))
  seen[a.id] = true
  assert(type(a.apply) == "function", "animation '" .. a.id .. "' missing apply()")
  if a.controlKey then
    assert(inputKeys[a.controlKey],
      "animation '" .. a.id .. "' controlKey '" .. a.controlKey .. "' is not in InputKeys")
  end
end
print(string.format("validated %d animation(s), %d logic block(s)", #registry, (function() local n=0 for _ in pairs(ml.blocks) do n=n+1 end return n end)()))
`
    );
    try {
      const out = execFileSync(lj, [checker, BUNDLE], { encoding: "utf8" });
      process.stdout.write("[build-macro] luajit: " + out.trim() + "\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    // Fallback: best-effort regex validation without a Lua runtime.
    const animDir = join(SRC, "animations");
    const order = evalLuaStringList(join(animDir, "_registry.lua"));
    const inputKeys = new Set(model.inputKeys);
    const seen = new Set();
    for (const name of order) {
      const src = readSrc(join(animDir, `${name}.lua`));
      const id = (src.match(/id\s*=\s*"([^"]+)"/) || [])[1];
      const controlKey = (src.match(/controlKey\s*=\s*"([^"]+)"/) || [])[1];
      if (!id) throw new Error(`animations/${name}.lua missing id`);
      if (seen.has(id)) throw new Error(`duplicate animation id: ${id}`);
      seen.add(id);
      if (controlKey && !inputKeys.has(controlKey)) {
        throw new Error(`animations/${name}.lua controlKey '${controlKey}' not in InputKeys`);
      }
    }
    process.stdout.write(
      "[build-macro] luajit not found — ran regex validation only (install luajit for full checks)\n"
    );
  }
}

// --- main ------------------------------------------------------------------

function main() {
  if (!existsSync(SRC)) throw new Error(`macro-src not found at ${SRC}`);
  const model = buildModel();

  writeFileSync(BUNDLE, renderBundle(model));
  process.stdout.write(`[build-macro] wrote ${BUNDLE}\n`);

  injectIntoSetting(renderSettingRegion(model));
  process.stdout.write(`[build-macro] injected ${model.blocks.length} block(s) into autosubs-macro.setting\n`);

  validate(model);
  process.stdout.write("[build-macro] done\n");
}

main();
