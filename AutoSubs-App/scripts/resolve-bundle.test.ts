import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bundleLauncher, bundleModules, luaLongString } from './resolve-bundle.js';

function moduleDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosubs-bundle-'));
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), source);
  }
  return dir;
}

test('luaLongString picks a level the source does not close', () => {
  assert.equal(luaLongString('return 1\n'), '[=[\nreturn 1\n]=]');
  assert.equal(luaLongString('x]=]y'), '[==[\nx]=]y]==]');
  assert.equal(luaLongString('x]=]y]==]z'), '[===[\nx]=]y]==]z]===]');
});

test('bundleModules keys every .lua file by module name', () => {
  const dir = moduleDir({ 'b.lua': 'return 2\n', 'a.lua': 'return 1\n', 'notes.txt': 'skip' });
  assert.equal(bundleModules(dir), '{\n["a"] = [=[\nreturn 1\n]=],\n["b"] = [=[\nreturn 2\n]=]\n}');
});

test('bundleLauncher replaces the placeholder and rejects a template without it', () => {
  const dir = moduleDir({ 'a.lua': 'return 1\n' });
  const out = bundleLauncher('local module_bundle = __AUTOSUBS_MODULE_BUNDLE__\n', dir);
  assert.ok(out.startsWith('local module_bundle = {\n["a"] = [=['));
  assert.ok(!out.includes('__AUTOSUBS_MODULE_BUNDLE__'));
  assert.throws(() => bundleLauncher('local x = 1\n', dir));
});

test('the real template and modules bundle without leaving a placeholder behind', () => {
  const resources = path.join(import.meta.dirname, '..', 'src-tauri', 'resources');
  const template = fs.readFileSync(path.join(resources, 'AutoSubs.lua'), 'utf8');
  const out = bundleLauncher(template, path.join(resources, 'modules'));
  assert.ok(out.includes('["bootstrap"] = '));
  assert.ok(out.includes('["autosubs_core"] = '));
  // The app's own placeholders must only ever appear in the template part.
  const bundleStart = out.indexOf('["autosubs_core"]');
  assert.ok(!out.slice(bundleStart).includes('__AUTOSUBS_RESOURCES_FOLDER__'));
});
