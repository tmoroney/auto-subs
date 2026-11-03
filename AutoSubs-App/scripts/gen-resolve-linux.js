#!/usr/bin/env node

// Generates the Resolve launchers. resources/AutoSubs.bundled.lua (gitignored)
// is the template with the Lua modules inlined; it ships in every bundle, and
// the app (resolve_scripts.rs, also behind the NSIS hook) and the macOS
// postinstall fill in its install paths.
//
// Also generates the launcher shipped inside the Linux deb/rpm packages
// (installed to /opt/resolve/Fusion/Scripts via tauri.conf.json's `files` map).
// The templates in src-tauri/resources carry [[__AUTOSUBS_*__]] placeholders
// that the app substitutes at startup; the packages need the same substitution
// done at build time with the fixed Linux install paths so the bridge exists
// before the app first runs.
//
// Runs as part of `npm run build:tauri-prep`. The Linux output goes to
// src-tauri/gen-resolve-linux/ (gitignored).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bundleLauncher } from './resolve-bundle.js';

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

const bundled = bundleLauncher(
  fs.readFileSync(path.join(srcTauri, 'resources', 'AutoSubs.lua'), 'utf8'),
  path.join(srcTauri, 'resources', 'modules'),
);
fs.writeFileSync(path.join(srcTauri, 'resources', 'AutoSubs.bundled.lua'), bundled);

const linuxLauncher = Object.entries(REPLACEMENTS).reduce(
  (text, [token, value]) => text.split(token).join(value),
  bundled,
);
fs.writeFileSync(path.join(outDir, 'AutoSubs.lua'), linuxLauncher);

// "Open from Resolve" login item (resolve_launcher.rs), installed to
// /etc/xdg/autostart so the watcher starts at the next login even before the
// app is first opened. Must match `autostart_entry` for /usr/bin/autosubs: a
// unit test there reads this block back. The app turns it off per user with a
// Hidden=true copy in ~/.config/autostart.
const AUTOSTART_ENTRY = `[Desktop Entry]
Type=Application
Name=AutoSubs
Comment=Opens AutoSubs when you run it from DaVinci Resolve
Exec="/usr/bin/autosubs" --resolve-watcher
Icon=autosubs
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
`;
fs.writeFileSync(path.join(outDir, 'com.autosubs.resolve-launcher.desktop'), AUTOSTART_ENTRY);

console.log(`generated Resolve scripts in ${path.relative(process.cwd(), outDir)}`);
