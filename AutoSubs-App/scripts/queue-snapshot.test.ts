import assert from "node:assert/strict";
import test from "node:test";
import { createOptionsSnapshot } from "../src/queue/snapshot.ts";
import type { Settings } from "../src/types.ts";

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    language: "en", translate: false, targetLanguage: "zh", enableDTW: true,
    enableForcedAlignment: true, enableGpu: true, enableVad: true,
    enableDiarize: true, maxSpeakers: 2, diarizeBackend: "pyannote",
    textDensity: "custom", maxLinesPerSubtitle: 2, customDensityUnit: "words",
    customMaxWordsPerLine: 5, customMaxCharsPerLine: 40, textCase: "none",
    removePunctuation: false, enableCensor: true, censorStyle: "middle",
    customPrompt: " prompt ", ...overrides,
  } as Settings;
}

test("queued jobs retain their settings and censor words independently", () => {
  const form = settings();
  const words = ["first"];
  const first = createOptionsSnapshot(form, "model-a", "first.mp4", words);
  form.language = "ja";
  form.maxSpeakers = 4;
  words.push("later");
  const second = createOptionsSnapshot(form, "model-b", "second.mp4", words);

  assert.equal(first.model, "model-a");
  assert.equal(first.lang, "en");
  assert.equal(first.maxSpeakers, 2);
  assert.deepEqual(first.censoredWords, ["first"]);
  assert.equal(first.customMaxWordsPerLine, 5);
  assert.equal(first.customMaxCharsPerLine, undefined);
  assert.equal(second.model, "model-b");
  assert.equal(second.lang, "ja");
  assert.deepEqual(second.censoredWords, ["first", "later"]);
});

test("translation disables alignment and rejects identical explicit languages", () => {
  const translated = createOptionsSnapshot(settings({ translate: true }), "model", "clip.mp4", []);
  assert.equal(translated.enableForcedAlignment, false);
  assert.throws(() => createOptionsSnapshot(
    settings({ translate: true, targetLanguage: "en" }), "model", "clip.mp4", [],
  ), /same/);
  const draft = createOptionsSnapshot(
    settings({ translate: true, targetLanguage: "en" }), "model", "clip.mp4", [], true,
  );
  assert.equal(draft.lang, draft.targetLanguage);
  assert.doesNotThrow(() => createOptionsSnapshot(
    settings({ translate: true, language: "auto" }), "model", "clip.mp4", [],
  ));
});

test("disabled censorship never carries words into a queued job", () => {
  const job = createOptionsSnapshot(settings({ enableCensor: false }), "model", "clip.mp4", ["secret"]);
  assert.deepEqual(job.censoredWords, []);
});
