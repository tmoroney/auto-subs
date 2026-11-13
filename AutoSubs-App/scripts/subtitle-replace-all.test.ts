import assert from "node:assert/strict";
import { test } from "node:test";
import type { Subtitle } from "../src/types.ts";

function replaceAllSubtitles(
  subtitles: Subtitle[],
  searchQuery: string,
  replaceValue: string,
  options: { searchCaseSensitive?: boolean; searchWholeWord?: boolean } = {},
): { next: Subtitle[]; hasChanges: boolean } {
  const q = (searchQuery ?? "").trim();
  if (!q) {
    return { next: subtitles, hasChanges: false };
  }

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escaped = escapeRegExp(q);
  const pattern = options.searchWholeWord ? `\\b${escaped}\\b` : escaped;
  const flags = options.searchCaseSensitive ? "g" : "gi";
  const re = new RegExp(pattern, flags);

  const count = subtitles.length;
  const next = new Array(count);
  let hasChanges = false;

  for (let i = 0; i < count; i++) {
    const s = subtitles[i];
    const text = s.text ?? "";
    re.lastIndex = 0;
    if (re.test(text)) {
      re.lastIndex = 0;
      next[i] = {
        ...s,
        text: text.replace(re, replaceValue),
      };
      hasChanges = true;
    } else {
      next[i] = s;
    }
  }

  return { next: hasChanges ? next : subtitles, hasChanges };
}

test("replaceAllSubtitles replaces matching text and preserves references of non-matching cues", () => {
  const cue1: Subtitle = { id: 0, start: 0, end: 1, text: "Hello world!", words: [] };
  const cue2: Subtitle = { id: 1, start: 1, end: 2, text: "Unchanged line.", words: [] };
  const cue3: Subtitle = { id: 2, start: 2, end: 3, text: "Another world here.", words: [] };
  const subtitles: Subtitle[] = [cue1, cue2, cue3];

  const result = replaceAllSubtitles(subtitles, "world", "planet");

  assert.equal(result.hasChanges, true);
  assert.equal(result.next.length, 3);
  assert.equal(result.next[0].text, "Hello planet!");
  assert.notEqual(result.next[0], cue1, "matching cue was cloned");
  assert.equal(result.next[1], cue2, "non-matching cue retained exact object reference");
  assert.equal(result.next[2].text, "Another planet here.");
  assert.notEqual(result.next[2], cue3, "matching cue was cloned");
});

test("replaceAllSubtitles returns hasChanges false and does not clone array when query is not found", () => {
  const cue1: Subtitle = { id: 0, start: 0, end: 1, text: "Hello world!", words: [] };
  const cue2: Subtitle = { id: 1, start: 1, end: 2, text: "Another line.", words: [] };
  const subtitles: Subtitle[] = [cue1, cue2];

  const result = replaceAllSubtitles(subtitles, "nonexistent", "replacement");

  assert.equal(result.hasChanges, false);
  assert.equal(result.next, subtitles, "returns original array when no changes occurred");
  assert.equal(result.next[0], cue1);
  assert.equal(result.next[1], cue2);
});

test("replaceAllSubtitles respects searchCaseSensitive option", () => {
  const cue1: Subtitle = { id: 0, start: 0, end: 1, text: "Hello World and world", words: [] };
  const subtitles: Subtitle[] = [cue1];

  // Case-sensitive: only lowercase "world" matches
  const resultCase = replaceAllSubtitles(subtitles, "world", "earth", { searchCaseSensitive: true });
  assert.equal(resultCase.hasChanges, true);
  assert.equal(resultCase.next[0].text, "Hello World and earth");

  // Case-insensitive: both match
  const resultInsensitive = replaceAllSubtitles(subtitles, "world", "earth", { searchCaseSensitive: false });
  assert.equal(resultInsensitive.hasChanges, true);
  assert.equal(resultInsensitive.next[0].text, "Hello earth and earth");
});

test("replaceAllSubtitles respects searchWholeWord option", () => {
  const cue1: Subtitle = { id: 0, start: 0, end: 1, text: "cat catalog scatter", words: [] };
  const subtitles: Subtitle[] = [cue1];

  const resultWhole = replaceAllSubtitles(subtitles, "cat", "dog", { searchWholeWord: true });
  assert.equal(resultWhole.hasChanges, true);
  assert.equal(resultWhole.next[0].text, "dog catalog scatter");

  const resultPartial = replaceAllSubtitles(subtitles, "cat", "dog", { searchWholeWord: false });
  assert.equal(resultPartial.hasChanges, true);
  assert.equal(resultPartial.next[0].text, "dog dogalog sdogter");
});
