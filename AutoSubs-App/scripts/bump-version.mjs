#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const BUMP_TYPES = ['patch', 'minor', 'major'];

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeJson(filePath, data) {
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, content, 'utf-8');
}

function getVersionFromPackageJson() {
  const packageJson = readJson(path.join(rootDir, 'package.json'));
  return packageJson.version;
}

function bumpSemver(version, bump) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function resolveVersion(arg) {
  const current = getVersionFromPackageJson();

  if (!arg) {
    return { version: current, mode: 'sync' };
  }

  if (BUMP_TYPES.includes(arg)) {
    return { version: bumpSemver(current, arg), mode: arg };
  }

  if (SEMVER_REGEX.test(arg)) {
    return { version: arg, mode: 'explicit' };
  }

  console.error(`❌ Invalid argument: "${arg}"`);
  console.error(`   Use one of: patch, minor, major, or an explicit version like 3.7.0`);
  process.exit(1);
}

function updateJsonFileVersion(filePath, version, description) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${description} not found: ${filePath}`);
    return false;
  }

  const data = readJson(filePath);
  let updated = false;

  if (data.version && data.version !== version) {
    data.version = version;
    updated = true;
  }

  if (data.packages && data.packages[''] && data.packages[''].version !== version) {
    data.packages[''].version = version;
    updated = true;
  }

  if (updated) {
    writeJson(filePath, data);
    console.log(`✓ Updated ${description}: ${path.relative(rootDir, filePath)}`);
    return true;
  }

  console.log(`⚠️  No changes needed for ${description} (already at ${version})`);
  return false;
}

function updateCargoTomlVersion(filePath, version, description) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${description} not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const packageVersionPattern = /^(version\s*=\s*")[\d.]+(")/m;
  const newContent = content.replace(packageVersionPattern, `$1${version}$2`);

  if (content === newContent) {
    console.log(`⚠️  No changes needed for ${description} (already at ${version} or package version not found)`);
    return false;
  }

  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`✓ Updated ${description}: ${path.relative(rootDir, filePath)}`);
  return true;
}

function updateCargoLockVersion(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Cargo.lock not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const pattern = /(\[\[package\]\]\nname\s*=\s*"autosubs"\n)version\s*=\s*"[\d.]+"/;
  const newContent = content.replace(pattern, `$1version = "${version}"`);

  if (content === newContent) {
    console.log(`⚠️  No changes needed for Cargo.lock (already at ${version} or autosubs entry not found)`);
    return false;
  }

  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`✓ Updated Cargo.lock: ${path.relative(rootDir, filePath)}`);
  return true;
}

function updateVersionLua(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  version.lua not found: ${filePath}`);
    return false;
  }

  const expected = `return "${version}"\n`;
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content === expected) {
    console.log(`⚠️  No changes needed for version.lua (already at ${version})`);
    return false;
  }

  fs.writeFileSync(filePath, expected, 'utf-8');
  console.log(`✓ Updated version.lua: ${path.relative(rootDir, filePath)}`);
  return true;
}

function verifyFiles(version) {
  const checks = [
    { path: path.join(rootDir, 'package.json'), field: 'version' },
    { path: path.join(rootDir, 'src-tauri', 'tauri.conf.json'), field: 'version' },
    { path: path.join(rootDir, 'src-tauri', 'Cargo.toml'), pattern: new RegExp(`^version\\s*=\\s*"${version}"`, 'm') },
  ];

  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    checks.push({ path: path.join(rootDir, 'package-lock.json'), field: 'version' });
    checks.push({ path: path.join(rootDir, 'package-lock.json'), nested: ['packages', '', 'version'] });
  }

  let ok = true;
  for (const check of checks) {
    const content = fs.readFileSync(check.path, 'utf-8');

    if (check.pattern) {
      if (!check.pattern.test(content)) {
        console.error(`❌ Verification failed: ${path.relative(rootDir, check.path)} does not contain version ${version}`);
        ok = false;
      }
    } else if (check.field) {
      const data = readJson(check.path);
      const value = check.nested ? check.nested.reduce((obj, key) => obj?.[key], data) : data[check.field];
      if (value !== version) {
        console.error(`❌ Verification failed: ${path.relative(rootDir, check.path)} has version ${value}, expected ${version}`);
        ok = false;
      }
    }
  }

  // Cargo.lock uses a different check because it is not JSON
  const cargoLockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock');
  if (fs.existsSync(cargoLockPath)) {
    const cargoLock = fs.readFileSync(cargoLockPath, 'utf-8');
    const lockPattern = new RegExp(`\\[\\[package\\]\\]\\nname\\s*=\\s*"autosubs"\\nversion\\s*=\\s*"${version}"`);
    if (!lockPattern.test(cargoLock)) {
      console.error(`❌ Verification failed: ${path.relative(rootDir, cargoLockPath)} autosubs entry does not have version ${version}`);
      ok = false;
    }
  }

  return ok;
}

function main() {
  const args = process.argv.slice(2);
  const arg = args[0];

  if (args.length > 1) {
    console.error('❌ Too many arguments');
    console.error('Usage: npm run bump-version [patch|minor|major|<version>|-h|--help]');
    process.exit(1);
  }

  if (arg === '-h' || arg === '--help') {
    console.log('Usage:');
    console.log('  npm run bump-version              # Sync all files from package.json');
    console.log('  npm run bump-version patch        # Bump patch version');
    console.log('  npm run bump-version minor        # Bump minor version');
    console.log('  npm run bump-version major        # Bump major version');
    console.log('  npm run bump-version 3.7.0        # Set exact version');
    process.exit(0);
  }

  const currentVersion = getVersionFromPackageJson();
  const { version, mode } = resolveVersion(arg);

  if (mode === 'sync') {
    console.log(`Syncing all version files to ${version} (from package.json)...\n`);
  } else {
    console.log(`Bumping version: ${currentVersion} → ${version} (${mode})\n`);
  }

  let updatedCount = 0;

  if (updateJsonFileVersion(path.join(rootDir, 'package.json'), version, 'package.json')) {
    updatedCount++;
  }

  if (updateJsonFileVersion(path.join(rootDir, 'package-lock.json'), version, 'package-lock.json')) {
    updatedCount++;
  }

  if (updateCargoTomlVersion(path.join(rootDir, 'src-tauri', 'Cargo.toml'), version, 'Cargo.toml')) {
    updatedCount++;
  }

  if (updateJsonFileVersion(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), version, 'tauri.conf.json')) {
    updatedCount++;
  }

  if (updateCargoLockVersion(path.join(rootDir, 'src-tauri', 'Cargo.lock'), version)) {
    updatedCount++;
  }

  if (updateVersionLua(path.join(rootDir, 'src-tauri', 'resources', 'modules', 'version.lua'), version)) {
    updatedCount++;
  }

  console.log(`\nVerifying all files are at version ${version}...`);
  if (!verifyFiles(version)) {
    console.error('\n❌ Version bump failed verification. Please check the files manually.');
    process.exit(1);
  }

  console.log(`\n✅ Updated ${updatedCount} file(s) to version ${version}`);
  console.log(`   All version files are consistent.`);
}

main();
