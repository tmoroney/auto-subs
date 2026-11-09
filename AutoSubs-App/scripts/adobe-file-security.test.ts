import assert from "node:assert/strict";
import { isValidSrtFilePath } from "../../Adobe-Extension/src/js/lib/utils/file-security.ts";

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

console.log("adobe-file-security tests passed");
