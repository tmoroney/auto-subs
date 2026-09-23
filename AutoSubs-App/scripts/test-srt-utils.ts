import assert from "node:assert/strict";
import { parseSrt, generateSrt } from "../src/utils/srt-utils.ts";

const lfSrt = `1
00:00:00,000 --> 00:00:02,000
Hello

2
00:00:03,000 --> 00:00:05,000
This is a test.
`;

const crlfTwoLineSrt = [
  "1",
  "00:00:00,000 --> 00:00:02,000",
  "Hello",
  "world",
  "",
  "2",
  "00:00:03,000 --> 00:00:05,000",
  "Second cue",
  "",
].join("\r\n");

const lfCues = parseSrt(lfSrt);
assert.equal(lfCues.length, 2, "LF SRT should parse two cues");
assert.equal(lfCues[0].text, "Hello");
assert.equal(lfCues[1].text, "This is a test.");
assert.equal(lfCues[0].start, 0);
assert.equal(lfCues[1].start, 3);

const crlfCues = parseSrt(crlfTwoLineSrt);
assert.equal(crlfCues.length, 2, "CRLF SRT should parse two cues");
assert.equal(crlfCues[0].text, "Hello\nworld", "in-cue line breaks should be preserved");
assert.equal(crlfCues[1].text, "Second cue");

const bomCues = parseSrt(`\uFEFF${lfSrt}`);
assert.equal(bomCues.length, 2, "UTF-8 BOM should not break parsing");

const roundTrip = parseSrt(generateSrt([
  { id: 0, start: 0, end: 2, text: "Hello\nworld", words: [] },
  { id: 1, start: 3, end: 5, text: "Second cue", words: [] },
]));
assert.equal(roundTrip.length, 2);
assert.equal(roundTrip[0].text, "Hello\nworld");

console.log("srt-utils tests passed");
