import assert from "node:assert/strict";
import { isValidTranscriptFilename } from "../src/utils/file-utils.ts";

// 1. Safe transcript filenames must be accepted
assert.equal(isValidTranscriptFilename("transcript.json"), true);
assert.equal(isValidTranscriptFilename("my-video__tr_20261102_abcd.json"), true);
assert.equal(isValidTranscriptFilename("audio_export_123.json"), true);

// 2. Directory traversal sequences must be rejected
assert.equal(isValidTranscriptFilename("../test.json"), false);
assert.equal(isValidTranscriptFilename("..\\test.json"), false);
assert.equal(isValidTranscriptFilename("subfolder/transcript.json"), false);
assert.equal(isValidTranscriptFilename("subfolder\\transcript.json"), false);
assert.equal(isValidTranscriptFilename("../../../etc/passwd.json"), false);
assert.equal(isValidTranscriptFilename(".."), false);
assert.equal(isValidTranscriptFilename("../"), false);

// 3. Control characters and invalid extensions must be rejected
assert.equal(isValidTranscriptFilename("evil\0file.json"), false);
assert.equal(isValidTranscriptFilename("transcript.txt"), false);
assert.equal(isValidTranscriptFilename("transcript.json.exe"), false);
assert.equal(isValidTranscriptFilename(""), false);
assert.equal(isValidTranscriptFilename("   "), false);
assert.equal(isValidTranscriptFilename(undefined), false);
assert.equal(isValidTranscriptFilename(null), false);

console.log("file-utils security tests passed");

// Preserve the existing validator contract while covering the new boundaries.
for (const filename of ["\nvalid.json", "valid.json\t", "bad\x7fname.json", "a".repeat(251) + ".json"]) {
  assert.equal(isValidTranscriptFilename(filename), false);
}
assert.equal(isValidTranscriptFilename("a".repeat(250) + ".json"), true);
assert.equal(isValidTranscriptFilename(".json"), false);
