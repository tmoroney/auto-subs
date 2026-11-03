import test from "node:test";
import assert from "node:assert/strict";
import { generateTranscriptTxt } from "../src/utils/transcript-txt.ts";
import type { Subtitle, Speaker } from "../src/types.ts";

test("generateTranscriptTxt returns empty string for empty input or whitespace cues", () => {
  assert.equal(generateTranscriptTxt([]), "");
  assert.equal(
    generateTranscriptTxt([
      { id: 0, start: 0, end: 1, text: "", words: [] },
      { id: 1, start: 1, end: 2, text: "   \t\n  ", words: [] },
    ]),
    "",
  );
});

test("generateTranscriptTxt formats single continuous text when no speakers present", () => {
  const subtitles: Subtitle[] = [
    { id: 0, start: 0, end: 2, text: "  Hello   world!  ", words: [] },
    { id: 1, start: 2, end: 4, text: "This is AutoSubs.", words: [] },
  ];
  assert.equal(
    generateTranscriptTxt(subtitles),
    "Hello world! This is AutoSubs.",
  );
});

test("generateTranscriptTxt groups consecutive cues by speaker", () => {
  const subtitles: Subtitle[] = [
    { id: 0, start: 0, end: 2, text: "Hello", speaker_id: "0", words: [] },
    { id: 1, start: 2, end: 4, text: "everyone", speaker_id: "0", words: [] },
    { id: 2, start: 4, end: 6, text: "Hi Alice!", speaker_id: "1", words: [] },
    { id: 3, start: 6, end: 8, text: "How are you?", speaker_id: "1", words: [] },
    { id: 4, start: 8, end: 10, text: "I am good.", speaker_id: "0", words: [] },
  ];
  const speakers: Speaker[] = [
    { id: "0", name: "Alice" },
    { id: "1", name: "Bob" },
  ];

  const expected = [
    "Alice:\nHello everyone",
    "Bob:\nHi Alice! How are you?",
    "Alice:\nI am good.",
  ].join("\n\n");

  assert.equal(generateTranscriptTxt(subtitles, speakers), expected);
});

test("generateTranscriptTxt handles mixed speaker IDs and unassigned cues", () => {
  const subtitles: Subtitle[] = [
    { id: 0, start: 0, end: 2, text: "Speaker cue", speaker_id: "1", words: [] },
    { id: 1, start: 2, end: 4, text: "Unassigned cue", words: [] },
    { id: 2, start: 4, end: 6, text: "Back to speaker", speaker_id: "1", words: [] },
  ];
  const speakers: Speaker[] = [{ id: "1", name: "Bob" }];

  const expected = [
    "Bob:\nSpeaker cue",
    "Transcript:\nUnassigned cue",
    "Bob:\nBack to speaker",
  ].join("\n\n");

  assert.equal(generateTranscriptTxt(subtitles, speakers), expected);
});

test("generateTranscriptTxt detects 0-based and 1-based speaker IDs correctly", () => {
  // 1-based: speaker_id "1" maps to speakers[0]
  const subtitles1: Subtitle[] = [
    { id: 0, start: 0, end: 2, text: "First cue", speaker_id: "1", words: [] },
  ];
  const speakers: Speaker[] = [{ id: "0", name: "First Person" }];
  assert.equal(
    generateTranscriptTxt(subtitles1, speakers),
    "First Person:\nFirst cue",
  );

  // 0-based: speaker_id "0" causes base to be 0
  const subtitles0: Subtitle[] = [
    { id: 0, start: 0, end: 2, text: "Cue 0", speaker_id: "0", words: [] },
    { id: 1, start: 2, end: 4, text: "Cue 1", speaker_id: "1", words: [] },
  ];
  const speakers0: Speaker[] = [
    { id: "0", name: "Zero Person" },
    { id: "1", name: "One Person" },
  ];
  assert.equal(
    generateTranscriptTxt(subtitles0, speakers0),
    "Zero Person:\nCue 0\n\nOne Person:\nCue 1",
  );
});
