import assert from "node:assert/strict";
import {
  isValidTranscriptFilename,
  getSubtitleDocumentPath,
  saveSubtitleDocument,
  loadSubtitleDocumentSubtitles,
} from "../src/utils/file-utils.ts";

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

// 4. Boundary length and whitespace checks
for (const filename of ["\nvalid.json", "valid.json\t", "bad\x7fname.json", "a".repeat(251) + ".json"]) {
  assert.equal(isValidTranscriptFilename(filename), false);
}
assert.equal(isValidTranscriptFilename("a".repeat(250) + ".json"), true);
assert.equal(isValidTranscriptFilename(".json"), false);

// 5. Operations attempting directory traversal must throw [file-security] error
await assert.rejects(
  async () => {
    await getSubtitleDocumentPath("../traversal.json");
  },
  {
    message: '[file-security] Invalid transcript filename: "../traversal.json"',
  },
);

await assert.rejects(
  async () => {
    await saveSubtitleDocument({ segments: [] }, "../evil-path.json");
  },
  {
    message: /\[file-security\] Invalid transcript filename/,
  },
);

await assert.rejects(
  async () => {
    await loadSubtitleDocumentSubtitles("../../etc/passwd.json");
  },
  {
    message: /\[file-security\] Invalid transcript filename/,
  },
);

console.log("file-utils security tests passed");
