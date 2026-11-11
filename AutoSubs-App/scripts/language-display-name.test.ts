import assert from "node:assert/strict";
import test from "node:test";
import { languageDisplayName } from "../src/utils/language-display-name.ts";

test("omits automatic and empty language codes", () => {
  assert.equal(languageDisplayName("auto", "en"), "");
  assert.equal(languageDisplayName("", "en"), "");
});

test("falls back to the raw code when Intl rejects it", () => {
  assert.equal(languageDisplayName("xx-invalid!", "en"), "xx-invalid!");
});

test("localizes a valid language code", () => {
  assert.equal(languageDisplayName("en", "en"), "English");
});
