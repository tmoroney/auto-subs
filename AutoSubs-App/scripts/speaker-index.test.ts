import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpeakerIndexMap,
  getSpeakerIndexForId,
} from "../src/utils/speaker-index.ts";

test("maps preserved engine ids in first-seen speaker order", () => {
  const subtitles = [
    { speaker_id: "speaker-1" },
    { speaker_id: "speaker-1" },
    { speaker_id: "speaker-2" },
  ];
  const speakerIndices = buildSpeakerIndexMap(subtitles);

  assert.equal(getSpeakerIndexForId("speaker-1", speakerIndices, 2), 0);
  assert.equal(getSpeakerIndexForId("speaker-2", speakerIndices, 2), 1);
});

test("normalizes Rust Speaker prefixes and ignores unknown ids", () => {
  const speakerIndices = buildSpeakerIndexMap([
    { speaker_id: "Speaker 2" },
    { speaker_id: "Speaker 1" },
    { speaker_id: "?" },
  ]);

  assert.equal(getSpeakerIndexForId("2", speakerIndices, 2), 0);
  assert.equal(getSpeakerIndexForId("Speaker 1", speakerIndices, 2), 1);
  assert.equal(getSpeakerIndexForId(undefined, speakerIndices, 2), 0);
  assert.equal(getSpeakerIndexForId("unknown", speakerIndices, 2), 0);
});
