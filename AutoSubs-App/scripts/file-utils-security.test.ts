import assert from "node:assert/strict";
import { isSafeTranscriptFilename } from "../src/utils/file-utils.ts";

// 1. Safe transcript filenames must be accepted
assert.equal(isSafeTranscriptFilename("transcript.json"), true);
assert.equal(isSafeTranscriptFilename("my-video__tr_20261102_abcd.json"), true);
assert.equal(isSafeTranscriptFilename("audio_export_123.json"), true);

// 2. Directory traversal sequences must be rejected
assert.equal(isSafeTranscriptFilename("../test.json"), false);
assert.equal(isSafeTranscriptFilename("..\\test.json"), false);
assert.equal(isSafeTranscriptFilename("subfolder/transcript.json"), false);
assert.equal(isSafeTranscriptFilename("subfolder\\transcript.json"), false);
assert.equal(isSafeTranscriptFilename("../../../etc/passwd.json"), false);
assert.equal(isSafeTranscriptFilename(".."), false);
assert.equal(isSafeTranscriptFilename("../"), false);

// 3. Control characters and invalid extensions must be rejected
assert.equal(isSafeTranscriptFilename("evil\0file.json"), false);
assert.equal(isSafeTranscriptFilename("transcript.txt"), false);
assert.equal(isSafeTranscriptFilename("transcript.json.exe"), false);
assert.equal(isSafeTranscriptFilename(""), false);
assert.equal(isSafeTranscriptFilename("   "), false);
assert.equal(isSafeTranscriptFilename(undefined), false);
assert.equal(isSafeTranscriptFilename(null), false);

console.log("file-utils security tests passed");
