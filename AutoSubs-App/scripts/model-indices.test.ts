import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "../models.json" with { type: "json" };

// Persisted settings refer to these models by their array index.
const existingModelIds = [
  "orukeet",
  "parakeet",
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large-v3-turbo",
  "large-v3",
  "moonshine-tiny",
  "moonshine-tiny-ar",
  "moonshine-tiny-zh",
  "moonshine-tiny-ja",
  "moonshine-tiny-ko",
  "moonshine-tiny-uk",
  "moonshine-tiny-vi",
  "moonshine-base",
  "sense-voice",
  "canary",
  "cohere",
  "gigaam-v3",
  "gigaam-multilingual",
  "omni-asr-1b-ctc",
];

test("preserves model selections saved by earlier versions", () => {
  const modelIds = manifest.models.map((model) => model.id);
  assert.deepEqual(modelIds.slice(0, existingModelIds.length), existingModelIds);
});
