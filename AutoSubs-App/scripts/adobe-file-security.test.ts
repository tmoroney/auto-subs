import assert from "node:assert/strict";
import {
  isValidSrtFilePath,
  isValidExportFolderPath,
  isValidPresetFilePath,
} from "../../Adobe-Extension/src/js/lib/utils/file-security.ts";

// --- isValidSrtFilePath tests ---
// 1. Valid SRT file paths (POSIX and Windows absolute / relative)
assert.equal(isValidSrtFilePath("/home/user/captions/subtitles.srt"), true);
assert.equal(isValidSrtFilePath("C:\\Users\\User\\Videos\\captions.srt"), true);
assert.equal(isValidSrtFilePath("C:/Users/User/Videos/captions.srt"), true);
assert.equal(isValidSrtFilePath("/var/data/my-subtitles.SRT"), true);
assert.equal(isValidSrtFilePath("  /path/to/subtitles.srt  "), true);
assert.equal(isValidSrtFilePath("relative/folder/file.srt"), true);

// 2. Path traversal sequences must be rejected
assert.equal(isValidSrtFilePath("../subtitles.srt"), false);
assert.equal(isValidSrtFilePath("/home/user/../../etc/shadow.srt"), false);
assert.equal(isValidSrtFilePath("C:\\Users\\..\\Windows\\System32\\file.srt"), false);
assert.equal(isValidSrtFilePath("folder/../file.srt"), false);

// 3. Non-SRT extensions must be rejected
assert.equal(isValidSrtFilePath("/path/to/script.jsx"), false);
assert.equal(isValidSrtFilePath("/path/to/payload.exe"), false);
assert.equal(isValidSrtFilePath("/path/to/subtitles.json"), false);
assert.equal(isValidSrtFilePath("/path/to/subtitles.srt.exe"), false);
assert.equal(isValidSrtFilePath(".srt"), false);

// 4. Control characters and null bytes must be rejected
assert.equal(isValidSrtFilePath("/path/to/subtitles\0.srt"), false);
assert.equal(isValidSrtFilePath("/path/to/subtitles\r.srt"), false);
assert.equal(isValidSrtFilePath("/path/to/subtitles\n.srt"), false);
assert.equal(isValidSrtFilePath("/path/to/subtitles\x07.srt"), false);

// 5. Empty or non-string inputs must be rejected
assert.equal(isValidSrtFilePath(""), false);
assert.equal(isValidSrtFilePath("   "), false);
assert.equal(isValidSrtFilePath(null), false);
assert.equal(isValidSrtFilePath(undefined), false);
assert.equal(isValidSrtFilePath(12345), false);
assert.equal(isValidSrtFilePath({}), false);

// 6. Path length limits (> 4096 characters)
assert.equal(isValidSrtFilePath("/a/".repeat(1500) + "file.srt"), false);

// --- isValidExportFolderPath tests ---
// 1. Valid folder paths
assert.equal(isValidExportFolderPath("/home/user/Videos/AutoSubs"), true);
assert.equal(isValidExportFolderPath("C:\\Users\\User\\AppData\\Local\\AutoSubs\\Audio"), true);
assert.equal(isValidExportFolderPath("C:/Users/User/Documents/Exports"), true);
assert.equal(isValidExportFolderPath("relative/export/folder"), true);
assert.equal(isValidExportFolderPath("  /trimmed/folder  "), true);

// 2. Path traversal must be rejected
assert.equal(isValidExportFolderPath("../exports"), false);
assert.equal(isValidExportFolderPath("/var/log/../../etc"), false);
assert.equal(isValidExportFolderPath("C:\\Users\\..\\Windows"), false);
assert.equal(isValidExportFolderPath("folder/../other"), false);

// 3. Control characters and null bytes must be rejected
assert.equal(isValidExportFolderPath("/path/to/folder\0"), false);
assert.equal(isValidExportFolderPath("/path/to/folder\r"), false);
assert.equal(isValidExportFolderPath("/path/to/folder\n"), false);
assert.equal(isValidExportFolderPath("/path/to/folder\x1b"), false);

// 4. Empty or non-string inputs must be rejected
assert.equal(isValidExportFolderPath(""), false);
assert.equal(isValidExportFolderPath("   "), false);
assert.equal(isValidExportFolderPath(null), false);
assert.equal(isValidExportFolderPath(undefined), false);
assert.equal(isValidExportFolderPath(123), false);
assert.equal(isValidExportFolderPath({}), false);

// 5. Length limit
assert.equal(isValidExportFolderPath("/dir/".repeat(1500)), false);

// --- isValidPresetFilePath tests ---
// 1. Valid preset paths
assert.equal(isValidPresetFilePath(""), true); // empty string = no external preset (default)
assert.equal(isValidPresetFilePath("   "), true);
assert.equal(isValidPresetFilePath("/path/to/preset.epr"), true);
assert.equal(isValidPresetFilePath("C:\\Presets\\custom.EPR"), true);
assert.equal(isValidPresetFilePath("C:/Presets/custom.epr"), true);
assert.equal(isValidPresetFilePath("presets/custom.epr"), true);

// 2. Traversal must be rejected
assert.equal(isValidPresetFilePath("../preset.epr"), false);
assert.equal(isValidPresetFilePath("/home/user/../../etc/preset.epr"), false);
assert.equal(isValidPresetFilePath("C:\\Presets\\..\\Windows\\file.epr"), false);

// 3. Invalid extensions or invalid filenames
assert.equal(isValidPresetFilePath("/path/to/preset.json"), false);
assert.equal(isValidPresetFilePath("/path/to/preset.jsx"), false);
assert.equal(isValidPresetFilePath("/path/to/preset.epr.exe"), false);
assert.equal(isValidPresetFilePath(".epr"), false);

// 4. Control characters and null bytes
assert.equal(isValidPresetFilePath("/path/to/preset\0.epr"), false);
assert.equal(isValidPresetFilePath("/path/to/preset\n.epr"), false);

// 5. Non-string inputs
assert.equal(isValidPresetFilePath(null), false);
assert.equal(isValidPresetFilePath(undefined), false);
assert.equal(isValidPresetFilePath(123), false);
assert.equal(isValidPresetFilePath({}), false);

console.log("adobe-file-security tests passed");
