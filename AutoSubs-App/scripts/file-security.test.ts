import assert from "node:assert/strict";
import { isValidTranscriptFilename } from "../src/utils/file-utils.ts";

// 1. Valid transcript filenames must be accepted
assert.equal(isValidTranscriptFilename("transcript.json"), true);
assert.equal(isValidTranscriptFilename("my-clip__tr_20261103_abcdef.json"), true);
assert.equal(isValidTranscriptFilename("timeline_1.json"), true);
assert.equal(isValidTranscriptFilename("  spaced-name.json  "), true);

// 2. Path traversal attempts must be rejected
assert.equal(isValidTranscriptFilename("../secret.json"), false);
assert.equal(isValidTranscriptFilename("../../etc/passwd"), false);
assert.equal(isValidTranscriptFilename("..\\..\\windows\\win.ini"), false);
assert.equal(isValidTranscriptFilename("subfolder/transcript.json"), false);
assert.equal(isValidTranscriptFilename("subfolder\\transcript.json"), false);
assert.equal(isValidTranscriptFilename("./transcript.json"), false);
assert.equal(isValidTranscriptFilename("nested/../transcript.json"), false);

// 3. Non-json or missing extensions must be rejected
assert.equal(isValidTranscriptFilename("transcript.txt"), false);
assert.equal(isValidTranscriptFilename("transcript.exe"), false);
assert.equal(isValidTranscriptFilename("transcript"), false);
assert.equal(isValidTranscriptFilename(".json"), false);

// 4. Invalid or empty inputs must be rejected
assert.equal(isValidTranscriptFilename(""), false);
assert.equal(isValidTranscriptFilename("   "), false);
assert.equal(isValidTranscriptFilename(null), false);
assert.equal(isValidTranscriptFilename(undefined), false);

console.log("file-security tests passed");
