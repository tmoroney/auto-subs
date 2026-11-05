import assert from "node:assert/strict";
import {
  isValidPresetId,
  isValidPresetPreviewFilename,
} from "../src/lib/caption-previews.ts";

// 1. Valid preset IDs and preview filenames
assert.equal(isValidPresetId("preset-1234"), true);
assert.equal(isValidPresetId("default"), true);
assert.equal(isValidPresetId("preset_123_abc"), true);
assert.equal(isValidPresetId("550e8400-e29b-41d4-a716-446655440000"), true);
assert.equal(isValidPresetId("  preset-with-spaces  "), true);

assert.equal(isValidPresetPreviewFilename("preset-1234.png"), true);
assert.equal(isValidPresetPreviewFilename("default.png"), true);
assert.equal(isValidPresetPreviewFilename("550e8400-e29b-41d4-a716-446655440000.png"), true);
assert.equal(isValidPresetPreviewFilename("  preset-1234.png  "), true);

// 2. Directory traversal sequences in preset ID must be rejected
assert.equal(isValidPresetId("../evil"), false);
assert.equal(isValidPresetId("..\\evil"), false);
assert.equal(isValidPresetId("sub/id"), false);
assert.equal(isValidPresetId("sub\\id"), false);
assert.equal(isValidPresetId(".."), false);
assert.equal(isValidPresetId("/etc/passwd"), false);

// 3. Directory traversal sequences in preview filenames must be rejected
assert.equal(isValidPresetPreviewFilename("../evil.png"), false);
assert.equal(isValidPresetPreviewFilename("..\\evil.png"), false);
assert.equal(isValidPresetPreviewFilename("../../etc/shadow.png"), false);
assert.equal(isValidPresetPreviewFilename("sub/dir.png"), false);
assert.equal(isValidPresetPreviewFilename("sub\\dir.png"), false);
assert.equal(isValidPresetPreviewFilename(".."), false);
assert.equal(isValidPresetPreviewFilename(".png"), false);

// 4. Invalid extensions, control characters, or non-png files
assert.equal(isValidPresetPreviewFilename("preset.jpg"), false);
assert.equal(isValidPresetPreviewFilename("preset.json"), false);
assert.equal(isValidPresetPreviewFilename("preset.png.exe"), false);
assert.equal(isValidPresetPreviewFilename("evil\0.png"), false);
assert.equal(isValidPresetId("evil\0id"), false);
assert.equal(isValidPresetId(""), false);
assert.equal(isValidPresetId(null), false);
assert.equal(isValidPresetId(undefined), false);
assert.equal(isValidPresetPreviewFilename(""), false);
assert.equal(isValidPresetPreviewFilename(null), false);
assert.equal(isValidPresetPreviewFilename(undefined), false);

console.log("caption-previews security tests passed");
