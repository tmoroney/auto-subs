import assert from "node:assert/strict";
import test from "node:test";
import { preserveSubtitleEdits } from "../src/utils/subtitle-edits.ts";
import type { Subtitle } from "../src/types.ts";

function cue(text: string, speakerId = "1", start = 0): Subtitle {
  const tokens = text.split(" ");
  return {
    id: start,
    start,
    end: start + tokens.length,
    text,
    speaker_id: speakerId,
    words: tokens.map((word, index) => ({
      word: index ? ` ${word}` : word,
      start: start + index,
      end: start + index + 1,
      line_number: 0,
    })),
  };
}

const timed = (segment: Subtitle) => segment.words.map(word => [word.word.trim(), word.start, word.end]);

test("Reformat keeps a caption moved to another speaker", () => {
  const source = [cue("a b", "1", 0), cue("c d", "1", 2)];
  const snapshot = JSON.stringify(source);
  assert.equal(preserveSubtitleEdits(source, source).changed, false);

  const kept = preserveSubtitleEdits(source, [source[0], { ...source[1], speaker_id: "2" }]);
  assert.equal(kept.changed, true);
  assert.deepEqual(kept.segments.map(segment => [segment.text, segment.speaker_id]), [["a b", "1"], ["c d", "2"]]);
  assert.deepEqual(timed(kept.segments[0]), timed(source[0]));
  assert.deepEqual(timed(kept.segments[1]), timed(source[1]));
  assert.equal(JSON.stringify(source), snapshot);
});

test("a speaker change keeps a text correction on the same caption", () => {
  const source = [cue("a b", "1", 0), cue("c d", "1", 2)];
  const kept = preserveSubtitleEdits(source, [source[0], { ...source[1], speaker_id: "2", text: "c e" }]);
  assert.deepEqual(kept.segments[1].words.map(word => [word.word.trim(), word.start, word.end]), [["c", 2, 3], ["e", 3, 4]]);
  assert.equal(kept.segments[1].speaker_id, "2");
  assert.equal(kept.segments[0].speaker_id, "1");
});
