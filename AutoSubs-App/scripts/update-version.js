#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

function getVersionFromPackageJson() {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

function updateJsonFile(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    
    let updated = false;
    
    // Update root version
    if (json.version && json.version !== version) {
      json.version = version;
      updated = true;
    }
    
    // Update packages[""] version (for package-lock.json)
    if (json.packages && json.packages[""] && json.packages[""].version !== version) {
      json.packages[""].version = version;
      updated = true;
    }
    
    if (updated) {
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
      console.log(`✓ Updated ${filePath}`);
      return true;
    } else {
      console.log(`⚠️  No changes needed for ${filePath} (already at version ${version})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error updating ${filePath}: ${error.message}`);
    return false;
  }
}

function updateCargoFile(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // More flexible pattern for Cargo.toml - matches version = "x.x.x" with any whitespace
    const pattern = /^version\s*=\s*"[\d.]+"/m;
    const newContent = content.replace(pattern, `version = "${version}"`);
    
    if (content === newContent) {
      console.log(`⚠️  No changes needed for ${filePath} (already at version ${version} or pattern not found)`);
      return false;
    }
    
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✓ Updated ${filePath}`);
    return true;
  } catch (error) {
    console.log(`❌ Error updating ${filePath}: ${error.message}`);
    return false;
  }
}

function updateCargoLockFile(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // More flexible pattern for Cargo.lock - matches the autosubs package section
    // This pattern looks for the autosubs package and updates its version
    const pattern = /(\[\[package\]\]\nname\s*=\s*"autosubs"\n)version\s*=\s*"[\d.]+"/;
    const newContent = content.replace(pattern, `$1version = "${version}"`);
    
    if (content === newContent) {
      console.log(`⚠️  No changes needed for ${filePath} (already at version ${version} or pattern not found)`);
      return false;
    }
    
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✓ Updated ${filePath}`);
    return true;
  } catch (error) {
    console.log(`❌ Error updating ${filePath}: ${error.message}`);
    return false;
  }
}

function updateTauriConfFile(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    
    if (json.version && json.version !== version) {
      json.version = version;
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
      console.log(`✓ Updated ${filePath}`);
      return true;
    } else {
      console.log(`⚠️  No changes needed for ${filePath} (already at version ${version})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error updating ${filePath}: ${error.message}`);
    return false;
  }
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
  
  // Update package.json
  if (updateJsonFile(path.join(rootDir, 'package.json'), version)) {
    updatedCount++;
  }
  
  // Update package-lock.json
  if (updateJsonFile(path.join(rootDir, 'package-lock.json'), version)) {
    updatedCount++;
  }
  
  // Update Cargo.toml
  if (updateCargoFile(path.join(rootDir, 'src-tauri', 'Cargo.toml'), version)) {
    updatedCount++;
  }
  
  // Update tauri.conf.json
  if (updateTauriConfFile(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), version)) {
    updatedCount++;
  }
  
  // Update Cargo.lock
  if (updateCargoLockFile(path.join(rootDir, 'src-tauri', 'Cargo.lock'), version)) {
    updatedCount++;
  }

  console.log(`\n✅ Updated ${updatedCount} file(s) to version ${version}`);
}

main();
