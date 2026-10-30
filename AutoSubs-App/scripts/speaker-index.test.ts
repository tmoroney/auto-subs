import assert from "node:assert/strict";
import test from "node:test";
import {
  getSpeakerIdBase,
  getSpeakerIndexForId,
} from "../src/utils/speaker-index.ts";

test("maps 0-based speaker ids to their corresponding speaker", () => {
  const subtitles = [{ speaker_id: "0" }, { speaker_id: "1" }];
  const speakerIdBase = getSpeakerIdBase(subtitles);

  assert.equal(speakerIdBase, 0);
  assert.equal(getSpeakerIndexForId("0", speakerIdBase, 2), 0);
  assert.equal(getSpeakerIndexForId("1", speakerIdBase, 2), 1);
});

test("maps 1-based speaker ids to their corresponding speaker", () => {
  const subtitles = [{ speaker_id: "1" }, { speaker_id: "2" }];
  const speakerIdBase = getSpeakerIdBase(subtitles);

  assert.equal(speakerIdBase, 1);
  assert.equal(getSpeakerIndexForId("1", speakerIdBase, 2), 0);
  assert.equal(getSpeakerIndexForId("2", speakerIdBase, 2), 1);
});

test("maps speaker ids by number even when Speaker 2 talks first", () => {
  const subtitles = [{ speaker_id: "2" }, { speaker_id: "1" }];
  const speakerIdBase = getSpeakerIdBase(subtitles);

  assert.equal(getSpeakerIndexForId(subtitles[0].speaker_id, speakerIdBase, 2), 1);
  assert.equal(getSpeakerIndexForId(subtitles[1].speaker_id, speakerIdBase, 2), 0);
});

test("maps non-numeric speaker ids to the first speaker", () => {
  const speakerIdBase = getSpeakerIdBase([{ speaker_id: "host" }]);

  assert.equal(getSpeakerIndexForId("host", speakerIdBase, 2), 0);
});

test("falls back to the first speaker for out-of-range ids", () => {
  assert.equal(getSpeakerIndexForId("3", 1, 2), 0);
});
