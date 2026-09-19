#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get Resolve scripts folder path based on OS (user-specific paths)
function getResolveScriptsPath() {
  const platform = os.platform();
  
  switch (platform) {
    case 'win32':
      // Windows: %appdata%/Blackmagic Design/DaVinci Resolve/Support/Fusion/Scripts/Utility
      return path.join(os.homedir(), 'AppData', 'Roaming', 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Fusion', 'Scripts', 'Utility');
    
    case 'darwin':
      // macOS: User-specific path (no sudo required)
      return path.join(os.homedir(), 'Library', 'Application Support', 'Blackmagic Design', 'DaVinci Resolve', 'Fusion', 'Scripts', 'Utility');
    
    case 'linux':
      // Linux: the per-user tree. This matches fusion_support_dir() in
      // src-tauri/src/resolve_bridge.rs and the directory the release build
      // installs into via resolve_scripts.rs, so the dev launcher lands
      // alongside the paths the app already knows about.
      //
      // Deliberately NOT /opt/resolve/Fusion/Scripts/Utility: that tree is
      // where the deb/rpm packages install the production launcher, and it is
      // root-owned in a standard install, so writing there both needs sudo and
      // races the release launcher. Resolve scans the per-user tree as well,
      // so nothing is lost by staying out of /opt.
      return path.join(os.homedir(), '.local', 'share', 'DaVinciResolve', 'Fusion', 'Scripts', 'Utility');

    default:
      console.error(`❌ Unsupported platform: ${platform}`);
      process.exit(1);
  }
}

// Placeholders that templates expect to have replaced with absolute paths.
const RESOURCES_PLACEHOLDER = '[[__AUTOSUBS_RESOURCES_FOLDER__]]';
const REPO_PATH_PLACEHOLDER = '[[__AUTOSUBS_REPO_PATH__]]';

// Name of the dev launcher (also the label shown in Resolve's Scripts menu).
const LAUNCHER_NAME = 'AutoSubs (Dev).lua';
// Startup scriptlibs that 3.10.0-era setups installed into the Scripts ROOT
// (parent of Utility). They started the bridge via fusion:Execute, which holds
// Fusion's shared script executor for the whole Resolve session and breaks
// scripted macro controls, so they are removed rather than generated. See
// Resolve-Integration/docs/resident-bridge-fusion-regression.md.
const DEV_SCRIPTLIB_NAME = 'AutoSubs (Dev).scriptlib';
const PROD_SCRIPTLIB_NAME = 'AutoSubs.scriptlib';
const CAPTION_UPDATER_NAME = 'AutoSubs - Update Caption Template.lua';

// Older name this script used to generate; cleaned up so contributors don't end
// up with a duplicate, stale entry in the Resolve Scripts menu.
const LEGACY_LAUNCHER_NAME = 'Testing-AutoSubs.lua';

// On Windows, Resolve's Lua io.open, os.rename and bmd.readfile use narrow
// (ANSI) APIs, so a checkout under a non-ASCII path breaks the updater. Use
// the 8.3 short path for the repo root to keep the generated REPO_PATH ASCII.
function isAsciiSafe(p) {
  for (let i = 0; i < p.length; i += 1) {
    if (p.charCodeAt(i) > 127) return false;
  }
  return true;
}

function toWindowsShortPath(longPath) {
  if (process.platform !== 'win32') return longPath;

  const escaped = longPath.replace(/'/g, "''");
  const command = [
    `Add-Type -Name Win32 -Namespace Kernel32 -MemberDefinition '[DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern uint GetShortPathNameW(string lpszLongPath, System.Text.StringBuilder lpszShortPath, int cchBuffer);'`,
    `$short = New-Object System.Text.StringBuilder 260`,
    `[Kernel32.Win32]::GetShortPathNameW('${escaped}', $short, $short.Capacity) | Out-Null`,
    `$short.ToString()`,
  ].join('; ');

  let shortPath;
  try {
    shortPath = execFileSync('powershell', ['-Command', command], { encoding: 'utf8' }).trim();
  } catch {
    shortPath = '';
  }

  if (shortPath && isAsciiSafe(shortPath)) {
    return shortPath;
  }
  if (isAsciiSafe(longPath)) {
    return longPath;
  }

  console.error(`❌ Repository path contains non-ASCII characters and Windows 8.3 short names are disabled or unavailable.`);
  console.error(`   Move the checkout to an ASCII-only path (e.g. C:\\AutoSubs) or enable 8.3 short names.`);
  console.error(`   Path: ${longPath}`);
  process.exit(1);
}

function setupResolveDev() {
  console.log('Setting up Resolve integration for development...');

  const resolvePath = getResolveScriptsPath();
  const resourcesFolder = path.join(__dirname, '..', 'src-tauri', 'resources');
  const sourceFile = path.join(resourcesFolder, LAUNCHER_NAME);
  const destFile = path.join(resolvePath, LAUNCHER_NAME);
  const captionUpdaterSource = path.join(__dirname, '..', '..', 'Resolve-Integration', 'scripts', CAPTION_UPDATER_NAME);
  const captionUpdaterDest = path.join(resolvePath, CAPTION_UPDATER_NAME);

  // Check if source template exists
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Source file not found: ${sourceFile}`);
    console.error('   Make sure you are running this script from the AutoSubs-App directory.');
    process.exit(1);
  }

  // Sanity-check that the core module is present so the generated launcher will
  // actually be able to start the server (guards against a moved/partial checkout).
  const coreModule = path.join(resourcesFolder, 'modules', 'autosubs_core.lua');
  if (!fs.existsSync(coreModule)) {
    console.error(`❌ Could not find the AutoSubs Lua modules at: ${coreModule}`);
    console.error('   Make sure you are running this script from the AutoSubs-App directory.');
    process.exit(1);
  }

  // Read the template and bake the absolute resources path into it. Lua
  // long-bracket strings ([[...]]) need no escaping for Windows backslashes,
  // and filesystem paths will never contain the closing "]]" sequence.
  let launcher;
  try {
    launcher = fs.readFileSync(sourceFile, 'utf8');
  } catch (err) {
    console.error(`❌ Failed to read template: ${err.message}`);
    process.exit(1);
  }

  if (!launcher.includes(RESOURCES_PLACEHOLDER)) {
    console.error(`❌ Template is missing the expected placeholder ${RESOURCES_PLACEHOLDER}.`);
    console.error(`   File: ${sourceFile}`);
    process.exit(1);
  }

  launcher = launcher.replace(RESOURCES_PLACEHOLDER, `[[${resourcesFolder}]]`);

  // Create destination directory if it doesn't exist
  try {
    fs.mkdirSync(resolvePath, { recursive: true });
    console.log(`✓ Created directory: ${resolvePath}`);
  } catch (err) {
    console.error(`❌ Failed to create Resolve scripts directory: ${err.message}`);
    console.error(`   Path: ${resolvePath}`);
    process.exit(1);
  }

  // Write the generated launcher
  try {
    fs.writeFileSync(destFile, launcher);
    console.log(`✓ ${LAUNCHER_NAME} generated successfully`);
    console.log(`   Resources: ${resourcesFolder}`);
    console.log(`   Destination: ${destFile}`);
  } catch (err) {
    console.error(`❌ Failed to write ${LAUNCHER_NAME}: ${err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(captionUpdaterSource)) {
    console.error(`❌ Caption updater source file not found: ${captionUpdaterSource}`);
    process.exit(1);
  }

  // Bake the absolute repo path into the caption updater (same pattern as the
  // dev launcher). Generates a Resolve-side copy so every contributor's machine
  // points at their own checkout.
  const repoRoot = path.resolve(__dirname, '..', '..');
  let captionUpdater;
  try {
    captionUpdater = fs.readFileSync(captionUpdaterSource, 'utf8');
  } catch (err) {
    console.error(`❌ Failed to read caption updater template: ${err.message}`);
    process.exit(1);
  }

  if (!captionUpdater.includes(REPO_PATH_PLACEHOLDER)) {
    console.error(`❌ Caption updater is missing the expected placeholder ${REPO_PATH_PLACEHOLDER}.`);
    console.error(`   File: ${captionUpdaterSource}`);
    process.exit(1);
  }

  const repoPath = toWindowsShortPath(repoRoot);
  captionUpdater = captionUpdater.replace(REPO_PATH_PLACEHOLDER, `[[${repoPath}]]`);

  try {
    // Remove a previous symlink/copy first so writeFileSync always replaces it.
    fs.rmSync(captionUpdaterDest, { force: true });
    fs.writeFileSync(captionUpdaterDest, captionUpdater);
    console.log(`✓ ${CAPTION_UPDATER_NAME} generated successfully`);
    console.log(`   Repo: ${repoPath}`);
    console.log(`   Destination: ${captionUpdaterDest}`);
  } catch (err) {
    console.error(`❌ Failed to write ${CAPTION_UPDATER_NAME}: ${err.message}`);
    process.exit(1);
  }

  const scriptsRoot = path.dirname(resolvePath);

  // ── Stale artifact cleanup ────────────────────────────────────────────────
  // Resolve scans the per-user Scripts tree and, on Linux, the system one
  // (/opt/resolve/Fusion/Scripts) as independent locations, so an artifact
  // present in both is not shadowed — it is loaded twice.
  //
  // Before this script moved to the per-user tree it wrote to /opt, so a
  // checkout that ran it there, or ran it under sudo, still has a launcher
  // there. Any startup scriptlib (dev or production, either tree) is removed
  // too: it blocks Fusion's script executor for the whole session.
  const legacyRoots = process.platform === 'linux'
    ? [path.join('/opt', 'resolve', 'Fusion', 'Scripts')]
    : [];

  const staleArtifacts = [
    path.join(resolvePath, LEGACY_LAUNCHER_NAME),
    path.join(scriptsRoot, DEV_SCRIPTLIB_NAME),
    path.join(scriptsRoot, PROD_SCRIPTLIB_NAME),
  ];
  for (const root of legacyRoots) {
    staleArtifacts.push(
      path.join(root, 'Utility', LAUNCHER_NAME),
      path.join(root, DEV_SCRIPTLIB_NAME),
      path.join(root, PROD_SCRIPTLIB_NAME),
      path.join(root, 'Utility', CAPTION_UPDATER_NAME),
      path.join(root, 'Utility', LEGACY_LAUNCHER_NAME),
    );
  }

  // Removal is best-effort: /opt is root-owned in a standard install, so a
  // non-root run cannot clean it and has to say so instead.
  const blockedArtifacts = [];
  for (const artifact of staleArtifacts) {
    if (!fs.existsSync(artifact)) continue;
    try {
      fs.rmSync(artifact);
      console.log(`✓ Removed stale ${artifact}`);
    } catch {
      blockedArtifacts.push(artifact);
    }
  }

  if (blockedArtifacts.length > 0) {
    const quoted = blockedArtifacts.map((p) => `'${p}'`).join(' ');
    console.warn('\n⚠ Stale AutoSubs dev scripts could not be removed:');
    for (const artifact of blockedArtifacts) {
      console.warn(`    ${artifact}`);
    }
    console.warn('  Resolve scans that tree too; a stale launcher shows up twice in the');
    console.warn('  Scripts menu and a scriptlib there blocks Fusion scripts. Remove with:');
    console.warn(`    sudo rm -f ${quoted}`);
  }

  const menuLabel = LAUNCHER_NAME.replace(/\.lua$/, '');
  console.log(`\nStart the dev bridge once per Resolve session: Workspace → Scripts → ${menuLabel}`);
  console.log('\nEdits to the Lua modules take effect the next time you run the script.');
  console.log('Re-run `npm run setup-resolve` if you move this repository.');
}

// Run the setup
setupResolveDev();
