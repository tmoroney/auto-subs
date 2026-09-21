#!/usr/bin/env node

// Generates the Resolve bridge launcher shipped inside the Linux deb/rpm
// packages (installed to /opt/resolve/Fusion/Scripts via tauri.conf.json's
// `files` map). The templates in src-tauri/resources carry
// [[__AUTOSUBS_*__]] placeholders that the app substitutes at startup; the
// packages need the same substitution done at build time with the fixed
// Linux install paths so the bridge exists before the app first runs.
//
// Runs as part of `npm run build:tauri-prep`. Output goes to
// src-tauri/gen-resolve-linux/ (gitignored).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcTauri = path.join(__dirname, '..', 'src-tauri');
const outDir = path.join(srcTauri, 'gen-resolve-linux');

// Fixed locations used by the deb/rpm packages (see the `files` map in
// tauri.conf.json and the binary name in Cargo.toml).
const REPLACEMENTS = {
  '[[__AUTOSUBS_RESOURCES_FOLDER__]]': '[[/usr/lib/autosubs/resources]]',
  '[[__AUTOSUBS_APP_EXECUTABLE__]]': '[[/usr/bin/autosubs]]',
};

// Start clean so files no longer generated (e.g. the old AutoSubs.scriptlib)
// can't linger in the output.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const name of ['AutoSubs.lua']) {
  const template = fs.readFileSync(path.join(srcTauri, 'resources', name), 'utf8');
  const out = Object.entries(REPLACEMENTS).reduce(
    (text, [token, value]) => text.split(token).join(value),
    template,
  );
  fs.writeFileSync(path.join(outDir, name), out);
}

console.log(`generated Resolve scripts in ${path.relative(process.cwd(), outDir)}`);
