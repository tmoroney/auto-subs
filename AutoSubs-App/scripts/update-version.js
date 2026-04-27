#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const filesToUpdate = [
  {
    path: path.join(rootDir, 'package.json'),
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (version) => `"version": "${version}"`
  },
  {
    path: path.join(rootDir, 'package-lock.json'),
    pattern: /  "name": "autosubs",\n  "version": "[\d.]+",/,
    replacement: (version) => `  "name": "autosubs",\n  "version": "${version}",`
  },
  {
    path: path.join(rootDir, 'package-lock.json'),
    pattern: /      "name": "autosubs",\n      "version": "[\d.]+",/,
    replacement: (version) => `      "name": "autosubs",\n      "version": "${version}",`
  },
  {
    path: path.join(rootDir, 'src-tauri', 'Cargo.toml'),
    pattern: /^version = "[\d.]+"/m,
    replacement: (version) => `version = "${version}"`
  },
  {
    path: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (version) => `"version": "${version}"`
  },
  {
    path: path.join(rootDir, 'src-tauri', 'Cargo.lock'),
    pattern: /^name = "autosubs"\nversion = "[\d.]+"/m,
    replacement: (version) => `name = "autosubs"\nversion = "${version}"`
  }
];

function getVersionFromPackageJson() {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

function updateFile(filePath, pattern, replacement, version) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const newContent = content.replace(pattern, replacement(version));
  
  if (content === newContent) {
    console.log(`⚠️  No changes made to ${filePath}`);
    return false;
  }
  
  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`✓ Updated ${filePath}`);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  let version;

  if (args.length === 0) {
    // No version provided, use package.json as source of truth
    version = getVersionFromPackageJson();
    console.log(`Using version from package.json: ${version}`);
  } else if (args.length === 1) {
    // Version provided as argument
    version = args[0];
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(version)) {
      console.error('❌ Invalid version format. Use semantic versioning (e.g., 3.5.0)');
      process.exit(1);
    }
    console.log(`Using provided version: ${version}`);
  } else {
    console.log('Usage:');
    console.log('  node scripts/update-version.js              # Update all files from package.json');
    console.log('  node scripts/update-version.js <version>     # Update all files to specific version');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/update-version.js 3.6.0');
    process.exit(1);
  }

  console.log('\nUpdating version to ' + version + '...\n');
  
  let updatedCount = 0;
  for (const file of filesToUpdate) {
    if (updateFile(file.path, file.pattern, file.replacement, version)) {
      updatedCount++;
    }
  }

  console.log(`\n✅ Updated ${updatedCount} file(s) to version ${version}`);
}

main();
