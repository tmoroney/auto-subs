// Inlines the Lua modules into the Resolve launcher template. Resolve 21.1.2
// has no loadfile, so the installed script carries its modules as strings and
// runs them with load().
//
// Strings, not one concatenated source: every module keeps its own chunk, and
// with it Lua's limits on locals and upvalues per function. autosubs_core.lua
// alone comes close to them.

import fs from 'fs';
import path from 'path';

const BUNDLE_PLACEHOLDER = '__AUTOSUBS_MODULE_BUNDLE__';

// Wrap source in the lowest long-bracket level it doesn't close. The newline
// after the opening bracket is dropped by Lua, so the text stays byte-exact.
export function luaLongString(source) {
  let level = 1;
  while (source.includes(`]${'='.repeat(level)}]`)) {
    level += 1;
  }
  const eq = '='.repeat(level);
  return `[${eq}[\n${source}]${eq}]`;
}

// A Lua table expression of { module_name = source } for every file in dir.
export function bundleModules(modulesDir) {
  const entries = fs
    .readdirSync(modulesDir)
    .filter((name) => name.endsWith('.lua'))
    .sort()
    .map((name) => {
      const source = fs.readFileSync(path.join(modulesDir, name), 'utf8');
      return `[${JSON.stringify(path.basename(name, '.lua'))}] = ${luaLongString(source)}`;
    });
  return `{\n${entries.join(',\n')}\n}`;
}

export function bundleLauncher(template, modulesDir) {
  if (!template.includes(BUNDLE_PLACEHOLDER)) {
    throw new Error(`launcher template has no ${BUNDLE_PLACEHOLDER}`);
  }
  return template.split(BUNDLE_PLACEHOLDER).join(bundleModules(modulesDir));
}
