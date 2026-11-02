import assert from "node:assert/strict";
import test from "node:test";
import { getQueueSettingIssues } from "../src/queue/model-compatibility.ts";

const models = [
  { value: "english-only", languages: ["en"] },
  { value: "multilingual", languages: ["auto", "en", "zh"] },
];
const supports = (model: (typeof models)[number], language: string) => model.languages.includes(language);
const targets = ["en", "zh", "ja"];
const options = { model: "english-only", lang: "en", translate: false, targetLanguage: "zh" };

test("validates the source language against the selected model", () => {
  assert.deepEqual(getQueueSettingIssues(options, models, supports, targets), []);
  assert.deepEqual(getQueueSettingIssues({ ...options, lang: "zh" }, models, supports, targets), ["unsupported_source_language"]);
  assert.deepEqual(getQueueSettingIssues({ ...options, lang: "auto" }, models, supports, targets), ["unsupported_source_language"]);
  assert.deepEqual(getQueueSettingIssues({ ...options, model: "multilingual", lang: "auto" }, models, supports, targets), []);
});

test("permits an external translation target outside the model's source languages", () => {
  assert.deepEqual(getQueueSettingIssues({ ...options, translate: true }, models, supports, targets), []);
});

test("detects missing models and invalid translation configurations", () => {
  assert.deepEqual(getQueueSettingIssues({ ...options, model: "removed" }, models, supports, targets), ["missing_model"]);
  assert.deepEqual(getQueueSettingIssues({ ...options, lang: "" }, models, supports, targets), ["missing_source_language"]);
  assert.deepEqual(getQueueSettingIssues({ ...options, translate: true, targetLanguage: "" }, models, supports, targets), ["missing_translation_target"]);
  assert.deepEqual(getQueueSettingIssues({ ...options, translate: true, targetLanguage: "xx" }, models, supports, targets), ["unsupported_translation_target"]);
  assert.deepEqual(getQueueSettingIssues({ ...options, translate: true, targetLanguage: "en" }, models, supports, targets), ["same_source_and_target"]);
});
