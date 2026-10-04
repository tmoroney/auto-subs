import assert from "node:assert/strict";
import test from "node:test";
import { formatEditableTime, parseEditableTime, retimeSubtitle } from "../src/utils/caption-timing.ts";
import { preserveSubtitleEdits } from "../src/utils/subtitle-edits.ts";
import type { Subtitle } from "../src/types.ts";

function cue(id: number, words: [string, number, number][]): Subtitle {
  return {
    id,
    start: words[0][1],
    end: words[words.length - 1][2],
    text: words.map(([word]) => word).join(" "),
    speaker_id: "1",
    words: words.map(([word, start, end], index) => ({ word: index ? ` ${word}` : word, start, end, line_number: 0 })),
  };
}

const captions = () => [cue(0, [["a", 0, 1], ["b", 1, 2]]), cue(1, [["c", 3, 4], ["d", 4, 5]])];

function retimed(subtitles: Subtitle[], index: number, start: number, end: number) {
  const result = retimeSubtitle(subtitles, index, start, end);
  assert.ok("subtitles" in result, `expected ${start}..${end} to be accepted`);
  return result.subtitles;
}

test("typed times accept seconds, MM:SS and HH:MM:SS with either decimal mark", () => {
  assert.equal(parseEditableTime("83.45"), 83.45);
  assert.equal(parseEditableTime("1:23.45"), 83.45);
  assert.equal(parseEditableTime(" 00:01:23,450 "), 83.45);
  assert.equal(parseEditableTime("1:02:03"), 3723);
  for (const invalid of ["", "abc", "1:75", "1:60:00", "1:2:3:4", "-1", "1.2.3", "1::2"]) {
    assert.equal(parseEditableTime(invalid), null, invalid);
  }
});

test("times are shown to the millisecond and round-trip through parsing", () => {
  assert.equal(formatEditableTime(83.45), "00:01:23.450");
  assert.equal(formatEditableTime(59.9996), "00:01:00.000");
  assert.equal(formatEditableTime(-2), "00:00:00.000");
  assert.equal(parseEditableTime(formatEditableTime(3723.25)), 3723.25);
});

test("retiming stretches the caption's word timings onto the new range", () => {
  const subtitles = captions();
  const snapshot = JSON.stringify(subtitles);
  const next = retimed(subtitles, 0, 0.5, 1.5);
  assert.deepEqual([next[0].start, next[0].end], [0.5, 1.5]);
  assert.deepEqual(next[0].words.map(word => [word.start, word.end]), [[0.5, 1], [1, 1.5]]);
  assert.deepEqual(next[0].words.map(word => word.word), ["a", " b"]);
  assert.equal(next[1], subtitles[1]);
  assert.equal(JSON.stringify(subtitles), snapshot);

  const shifted = retimed(subtitles, 1, 2.5, 4.5);
  assert.deepEqual(shifted[1].words.map(word => [word.start, word.end]), [[2.5, 3.5], [3.5, 4.5]]);
});

test("a caption without word timings only changes its own times", () => {
  const subtitles: Subtitle[] = [{ id: 0, start: 0, end: 2, text: "imported", words: [] }];
  const next = retimed(subtitles, 0, 1, 3);
  assert.deepEqual([next[0].start, next[0].end, next[0].words], [1, 3, []]);
});

test("invalid, reversed and overlapping times are rejected", () => {
  const subtitles = captions();
  assert.deepEqual(retimeSubtitle(subtitles, 0, -1, 1), { error: "invalid" });
  assert.deepEqual(retimeSubtitle(subtitles, 0, 1, 1), { error: "order" });
  assert.deepEqual(retimeSubtitle(subtitles, 0, 1.5, 1), { error: "order" });
  assert.deepEqual(retimeSubtitle(subtitles, 0, 0, 3.2), { error: "overlap" });
  assert.deepEqual(retimeSubtitle(subtitles, 1, 1.9, 5), { error: "overlap" });
  retimed(subtitles, 0, 0, 3);
  retimed(subtitles, 1, 2, 6);
});

test("Reformat keeps a retimed caption's new times", () => {
  const source = captions();
  assert.equal(preserveSubtitleEdits(source, source).changed, false);

  const kept = preserveSubtitleEdits(source, retimed(source, 1, 2.5, 4.5));
  assert.equal(kept.changed, true);
  assert.deepEqual(kept.segments.map(segment => [segment.text, segment.start, segment.end]), [["a b", 0, 2], ["c d", 2.5, 4.5]]);
  assert.deepEqual(kept.segments[0].words, source[0].words);

  const display = retimed(source, 1, 2.5, 4.5);
  display[1] = { ...display[1], text: "c e" };
  const corrected = preserveSubtitleEdits(source, display);
  assert.deepEqual(corrected.segments[1].words.map(word => [word.word.trim(), word.start, word.end]), [["c", 2.5, 3.5], ["e", 3.5, 4.5]]);
});

test("word ends clamped by the formatter are not mistaken for a retime", () => {
  const source = captions();
  const clamped = [{ ...source[0], end: 1.8, words: [source[0].words[0], { ...source[0].words[1], end: 1.8 }] }, source[1]];
  assert.equal(preserveSubtitleEdits(source, clamped).changed, false);
});
