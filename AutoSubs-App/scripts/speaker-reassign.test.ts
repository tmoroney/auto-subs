import assert from "node:assert/strict";
import test from "node:test";
import { preserveSubtitleEdits } from "../src/utils/subtitle-edits.ts";
import { nextSpeakerOption, reassignCaptionSpeaker } from "../src/utils/speaker-reassign.ts";
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

test("removing the last zero-based caption keeps every speaker in place", () => {
  const subtitles = [cue("a", "0", 0), cue("b", "1", 1), cue("c", "2", 2)];
  const moved = reassignCaptionSpeaker(subtitles, 0, 1, 0);
  assert.ok(moved);
  assert.deepEqual(moved.map(segment => segment.speaker_id), ["2", "2", "3"]);
  assert.equal(moved[0].text, "a");
  assert.deepEqual(reassignCaptionSpeaker([cue("a", "0"), cue("b", "0", 1)], 0, 1, 0)?.map(segment => segment.speaker_id), ["1", "0"]);
  assert.equal(reassignCaptionSpeaker(subtitles, 1, 1, 0), null);
});

test("arrow keys move within the speaker list", () => {
  assert.equal(nextSpeakerOption(0, 3, "ArrowDown"), 1);
  assert.equal(nextSpeakerOption(0, 3, "ArrowUp"), 0);
  assert.equal(nextSpeakerOption(0, 3, "End"), 2);
  assert.equal(nextSpeakerOption(1, 3, "Home"), 0);
  assert.equal(nextSpeakerOption(1, 3, "Enter"), null);
});

test("Reformat keeps a speaker correction when the token counts differ", () => {
  const source = [cue("c d", "1", 2)];
  const legacy = [{ ...source[0], speaker_id: "2", words: [{ word: "c d", start: 2, end: 4, line_number: 0 }] }];
  const kept = preserveSubtitleEdits(source, legacy);
  assert.equal(kept.changed, true);
  assert.equal(kept.segments[0].speaker_id, "2");
  assert.equal(kept.segments[0].text, "c d");
  assert.equal(preserveSubtitleEdits(source, [{ ...legacy[0], speaker_id: "1" }]).changed, false);
});

test("a legacy caption that overlaps the next speaker does not replace it", () => {
  const source = [cue("a b", "1", 0), cue("c d", "2", 2)];
  const overlapping = [{ ...source[0], words: [{ word: "a b", start: 0, end: 2.1, line_number: 0 }] }, source[1]];
  assert.equal(preserveSubtitleEdits(source, overlapping).changed, false);

  const changed = preserveSubtitleEdits(source, [{ ...overlapping[0], speaker_id: "3" }, source[1]]);
  assert.equal(changed.changed, true);
  assert.equal(changed.segments[0].speaker_id, "3");
  assert.equal(changed.segments[1].text, "c d");
  assert.equal(changed.segments[1].speaker_id, "2");
});

test("a legacy correction replaces a word that runs past the caption", () => {
  const source = [cue("a b", "1", 0)];
  const displayed = [{ ...source[0], text: "a x", end: 1.4, words: [{ word: "a b", start: 0, end: 1.4, line_number: 0 }] }];
  const kept = preserveSubtitleEdits(source, displayed);
  assert.deepEqual(kept.segments.flatMap(segment => segment.words.map(word => word.word.trim())), ["a", "x"]);
});

test("a legacy correction removes a word that starts before the saved caption", () => {
  const source = [cue("old extra", "1", 1)];
  const displayed = [{ ...source[0], text: "new", words: [{ word: "old extra", start: 1.4, end: 2, line_number: 0 }] }];
  const kept = preserveSubtitleEdits(source, displayed);
  assert.deepEqual(kept.segments.flatMap(segment => segment.words.map(word => word.word.trim())), ["new", "extra"]);
});

test("a legacy correction does not replace the previous caption's overlapping word", () => {
  const source = [
    { ...cue("keep", "1", 0), end: 2.6, words: [{ word: "keep", start: 0, end: 2.6, line_number: 0 }] },
    cue("change me", "2", 1.2),
  ];
  const displayed = [
    { ...source[0], end: 1.6, words: [{ word: "keep", start: 0, end: 1.6, line_number: 0 }] },
    { ...source[1], text: "changed", words: [{ word: "change me", start: 1.2, end: 3.2, line_number: 0 }] },
  ];
  const kept = preserveSubtitleEdits(source, displayed);
  assert.deepEqual(kept.segments.map(segment => [segment.text, segment.speaker_id]), [["keep", "1"], ["changed", "2"]]);
});

test("a speaker change keeps a text correction on the same caption", () => {
  const source = [cue("a b", "1", 0), cue("c d", "1", 2)];
  const kept = preserveSubtitleEdits(source, [source[0], { ...source[1], speaker_id: "2", text: "c e" }]);
  assert.deepEqual(kept.segments[1].words.map(word => [word.word.trim(), word.start, word.end]), [["c", 2, 3], ["e", 3, 4]]);
  assert.equal(kept.segments[1].speaker_id, "2");
  assert.equal(kept.segments[0].speaker_id, "1");
});
