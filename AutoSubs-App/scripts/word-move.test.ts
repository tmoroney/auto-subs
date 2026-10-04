import assert from "node:assert/strict";
import { test } from "node:test";
import type { Subtitle } from "../src/types.ts";
import { moveEdgeWord } from "../src/utils/word-move.ts";

/** A caption whose words are `[text, start, end]`, rendered like the formatter. */
function cue(id: number, words: Array<[string, number, number]>, speaker_id = "1"): Subtitle {
  return {
    id,
    start: words[0]?.[1] ?? 0,
    end: words[words.length - 1]?.[2] ?? 0,
    text: words.map(([word]) => word).join(" "),
    speaker_id,
    words: words.map(([word, start, end]) => ({ word: ` ${word}`, start, end, line_number: 0 })),
  };
}

const spans = (subtitle: Subtitle) => subtitle.words.map((word) => [word.word.trim(), word.start, word.end]);

test("the last word takes its timing to the next caption", () => {
  const subtitles = [cue(0, [["one", 0, 1], ["two", 1.2, 2]]), cue(1, [["three", 2.1, 3]])];
  const snapshot = JSON.stringify(subtitles);
  const result = moveEdgeWord(subtitles, 0, "next", "one two");
  assert.ok(result);
  const [first, second] = result.subtitles;
  assert.equal(first.text, "one");
  assert.deepEqual(spans(first), [["one", 0, 1]]);
  assert.equal(first.end, 1);
  assert.equal(second.text, "two three");
  assert.deepEqual(spans(second), [["two", 1.2, 2], ["three", 2.1, 3]]);
  assert.equal(second.start, 1.2);
  assert.equal(second.end, 3);
  assert.equal(result.selectedIndex, 0);
  assert.equal(JSON.stringify(subtitles), snapshot, "the input is not mutated");
});

test("the first word takes its timing to the previous caption", () => {
  const subtitles = [cue(0, [["one", 0, 1]]), cue(1, [["two", 1.2, 2], ["three", 2.1, 3]])];
  const result = moveEdgeWord(subtitles, 1, "previous", "two three");
  assert.ok(result);
  const [first, second] = result.subtitles;
  assert.equal(first.text, "one two");
  assert.equal(first.end, 2);
  assert.deepEqual(spans(first), [["one", 0, 1], ["two", 1.2, 2]]);
  assert.equal(second.text, "three");
  assert.equal(second.start, 2.1);
  assert.equal(second.end, 3);
});

test("a caption is not stretched across the silence the word leaves", () => {
  const subtitles = [cue(0, [["one", 0, 1], ["two", 5, 6]]), cue(1, [["three", 6.1, 7]])];
  const down = moveEdgeWord(subtitles, 0, "next", "one two");
  assert.ok(down);
  assert.equal(down.subtitles[0].end, 1, "the caption ends with its own last word");
  assert.equal(down.subtitles[1].start, 5);

  const reverse = [cue(0, [["zero", 0, 1]]), cue(1, [["one", 1.1, 2], ["two", 8, 9]])];
  const up = moveEdgeWord(reverse, 1, "previous", "one two");
  assert.ok(up);
  assert.equal(up.subtitles[0].end, 2);
  assert.equal(up.subtitles[1].start, 8, "the caption starts with its own first word");
});

test("captions keep their padding and never overlap", () => {
  const padded = [cue(0, [["one", 0, 0.3]]), cue(1, [["two", 0.4, 0.6], ["three", 0.7, 0.9]])];
  padded[0].end = 0.4;
  padded[1].end = 1.6;
  const result = moveEdgeWord(padded, 1, "previous", "two three");
  assert.ok(result);
  assert.equal(result.subtitles[0].end, 0.6);
  assert.equal(result.subtitles[1].start, 0.7);
  assert.equal(result.subtitles[1].end, 1.6, "a padded end stays in place");
  assert.ok(result.subtitles[0].end <= result.subtitles[1].start);
});

test("a caption emptied by a move is removed and the selection follows the word", () => {
  const subtitles = [cue(0, [["one", 0, 1]]), cue(1, [["two", 1.2, 2]]), cue(2, [["three", 2.1, 3]])];
  const up = moveEdgeWord(subtitles, 1, "previous", "two");
  assert.ok(up);
  assert.deepEqual(up.subtitles.map((subtitle) => subtitle.text), ["one two", "three"]);
  assert.deepEqual(up.subtitles.map((subtitle) => subtitle.id), [0, 2]);
  assert.equal(up.selectedIndex, 0);

  const down = moveEdgeWord(subtitles, 1, "next", "two");
  assert.ok(down);
  assert.deepEqual(down.subtitles.map((subtitle) => subtitle.text), ["one", "two three"]);
  assert.equal(down.subtitles[1].start, 1.2);
  assert.equal(down.selectedIndex, 1);
});

test("moving into another speaker's caption keeps that caption's speaker", () => {
  const subtitles = [cue(0, [["hi", 0, 1], ["there", 1.1, 2]], "1"), cue(1, [["yes", 2.5, 3]], "2")];
  const result = moveEdgeWord(subtitles, 0, "next", "hi there");
  assert.ok(result);
  assert.equal(result.subtitles[1].speaker_id, "2");
  assert.equal(result.subtitles[1].text, "there yes");
  assert.equal(result.subtitles[0].speaker_id, "1");
});

test("edited text that no longer matches its words moves only the text", () => {
  const subtitles = [cue(0, [["one", 0, 1], ["two", 1.2, 2]]), cue(1, [["three", 2.1, 3]])];
  const result = moveEdgeWord(subtitles, 0, "next", "one too");
  assert.ok(result);
  assert.equal(result.subtitles[0].text, "one");
  assert.equal(result.subtitles[1].text, "too three");
  assert.deepEqual(result.subtitles[0].words, subtitles[0].words);
  assert.deepEqual(result.subtitles[1].words, subtitles[1].words);
  assert.equal(result.subtitles[0].end, 2);
  assert.equal(result.subtitles[1].start, 2.1);
});

test("a correction anywhere in the caption keeps the move text-only", () => {
  const subtitles = [cue(0, [["one", 0, 1], ["two", 1.2, 2], ["three", 2.2, 3]]), cue(1, [["four", 3.5, 4]])];
  for (const edited of ["one eleven three", "one three"]) {
    const result = moveEdgeWord(subtitles, 0, "next", edited);
    assert.ok(result);
    assert.equal(result.subtitles[1].text, "three four");
    assert.deepEqual(result.subtitles[0].words, subtitles[0].words, `${edited}: words stay with their caption`);
    assert.deepEqual(result.subtitles[1].words, subtitles[1].words);
    assert.deepEqual([result.subtitles[0].start, result.subtitles[0].end], [0, 3]);
    assert.equal(result.subtitles[1].start, 3.5);
  }
});

test("typed words without timings stay text-only instead of losing their caption", () => {
  const subtitles = [cue(0, [["one", 0, 1]]), cue(1, [["two", 1.2, 2]])];
  const result = moveEdgeWord(subtitles, 1, "previous", "two extra");
  assert.ok(result);
  assert.equal(result.subtitles.length, 2);
  assert.equal(result.subtitles[1].text, "extra");
  assert.deepEqual(result.subtitles[1].words, subtitles[1].words);
  assert.equal(result.subtitles[1].start, 1.2);
});

test("captions without word timings, like imported SRT, move only the text", () => {
  const subtitles: Subtitle[] = [
    { id: 0, start: 0, end: 2, text: "Hello there", words: [] },
    { id: 1, start: 3, end: 5, text: "world", words: [] },
  ];
  const result = moveEdgeWord(subtitles, 1, "previous", "world");
  assert.ok(result);
  assert.equal(result.subtitles.length, 2, "an emptied caption is kept when only text moved");
  assert.deepEqual(result.subtitles.map((subtitle) => [subtitle.text, subtitle.start, subtitle.end]), [
    ["Hello there world", 0, 2],
    ["", 3, 5],
  ]);
});

test("a token covering several word pieces moves all of them", () => {
  const subtitles = [cue(0, [["one", 0, 1]]), cue(1, [["don", 1.2, 1.5], ["'t", 1.5, 1.7], ["go", 2, 3]])];
  subtitles[1].words[1].word = "'t";
  subtitles[1].text = "don't go";
  const result = moveEdgeWord(subtitles, 1, "previous", "don't go");
  assert.ok(result);
  assert.deepEqual(spans(result.subtitles[0]), [["one", 0, 1], ["don", 1.2, 1.5], ["'t", 1.5, 1.7]]);
  assert.equal(result.subtitles[0].end, 1.7);
  assert.equal(result.subtitles[1].start, 2);
});

test("legacy string timings still move with the word", () => {
  const subtitles = [cue(0, [["one", 0, 1], ["two", 1.2, 2]]), cue(1, [["three", 2.1, 3]])];
  for (const subtitle of subtitles) {
    for (const word of subtitle.words) {
      (word as any).start = String(word.start);
      (word as any).end = String(word.end);
    }
  }
  const result = moveEdgeWord(subtitles, 0, "next", "one two");
  assert.ok(result);
  assert.equal(result.subtitles[0].end, 1);
  assert.equal(result.subtitles[1].start, 1.2);
});

test("there is nothing to move at the edges or from an empty caption", () => {
  const subtitles = [cue(0, [["one", 0, 1]]), cue(1, [["two", 1.2, 2]])];
  assert.equal(moveEdgeWord(subtitles, 0, "previous", "one"), null);
  assert.equal(moveEdgeWord(subtitles, 1, "next", "two"), null);
  assert.equal(moveEdgeWord(subtitles, 0, "next", "   "), null);
});
