import assert from "node:assert/strict";
import test from "node:test";
import { restoreQueueSettings } from "../src/queue/restore-settings.ts";
import { createOptionsSnapshot } from "../src/queue/snapshot.ts";
import type { Settings } from "../src/types.ts";

const settings = {
  language: "ja", translate: false, targetLanguage: "zh", enableDTW: true,
  enableForcedAlignment: true, enableGpu: false, enableVad: true,
  enableDiarize: true, maxSpeakers: 3, diarizeBackend: "pyannote",
  textDensity: "custom", maxLinesPerSubtitle: 2, customDensityUnit: "words",
  customMaxWordsPerLine: 4, customMaxCharsPerLine: 50, textCase: "uppercase",
  removePunctuation: true, enableCensor: true, censorStyle: "whole",
  censoredWords: ["private custom"], activeCensorLists: ["builtin:a"],
  customPrompt: "speaker names",
} as Settings;

test("restores settings by stable model id and preserves unrelated global lists", () => {
  const options = createOptionsSnapshot(settings, "saved-model", "clip.mp4", ["one", "two"]);
  const result = restoreQueueSettings(options, [{ value: "other" }, { value: "saved-model" }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.model, 1);
  assert.equal(result.patch.language, "ja");
  assert.equal(result.patch.customDensityUnit, "words");
  assert.equal(result.patch.customMaxWordsPerLine, 4);
  assert.equal(result.patch.customMaxCharsPerLine, undefined);
  assert.equal(result.patch.censoredWords, undefined);
  assert.equal(result.patch.activeCensorLists, undefined);
  assert.deepEqual(result.censoredWordsOverride, ["one", "two"]);
  result.censoredWordsOverride.push("changed");
  assert.deepEqual(options.censoredWords, ["one", "two"]);
});

test("round trips effective options when the censor override is retained", () => {
  const options = createOptionsSnapshot(settings, "saved-model", "clip.mp4", ["one", "two"]);
  const result = restoreQueueSettings(options, [{ value: "saved-model" }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const form = { ...settings, ...result.patch };
  const actual = createOptionsSnapshot(form, "saved-model", "clip.mp4", result.censoredWordsOverride);
  assert.deepEqual(actual, options);
});

test("reports a missing saved model instead of selecting the wrong index", () => {
  const options = createOptionsSnapshot(settings, "removed", "clip.mp4", []);
  assert.deepEqual(restoreQueueSettings(options, [{ value: "new" }]),
    { ok: false, reason: "missing_model", modelId: "removed" });
});

test("restores a character limit and leaves the inactive word limit alone", () => {
  const source = { ...settings, customDensityUnit: "chars" } as Settings;
  const options = createOptionsSnapshot(source, "model", "clip.mp4", []);
  const result = restoreQueueSettings(options, [{ value: "model" }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.customDensityUnit, "chars");
  assert.equal(result.patch.customMaxCharsPerLine, 50);
  assert.equal(result.patch.customMaxWordsPerLine, undefined);
  assert.equal(result.patch.enableCensor, false);
});
