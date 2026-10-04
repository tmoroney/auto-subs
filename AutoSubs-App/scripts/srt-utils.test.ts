import assert from "node:assert/strict";
import { parseSrt, generateSrt } from "../src/utils/srt-utils.ts";
import { buildSubtitleExportFile } from "../src/utils/export-file.ts";
import { subtitleToBackendSegment } from "../src/api/formatting-api.ts";
import type { Speaker, Subtitle } from "../src/types.ts";

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

// Documents imported before the timing fix contain string-valued word times.
// Reformat must convert them before Tauri serializes the Rust command payload.
const legacySubtitle = {
  id: 0,
  start: 0,
  end: 2,
  text: "Hello\nworld",
  words: [
    { word: "Hello", start: "0.000", end: "1.000", line_number: 0 },
    { word: "\nworld", start: "1.000", end: "2.000", line_number: 1 },
  ],
} as unknown as Subtitle;
const backendSegment = subtitleToBackendSegment(legacySubtitle);
assert.deepEqual(backendSegment.words?.map(({ start, end }) => [start, end]), [
  [0, 1],
  [1, 2],
]);
assert.equal(backendSegment.text, "Hello\nworld");

const speaker = (name: string): Speaker => ({
  name,
  style: "None",
  color: "#ffffff",
  sample: { start: 0, end: 1 },
});

const spoken: Subtitle[] = [
  { id: 0, start: 0, end: 2, text: "Hello\nworld", words: [], speaker_id: "1" },
  { id: 1, start: 3, end: 5, text: "Second cue", words: [], speaker_id: "2" },
];

const plainSrt = generateSrt(spoken, {
  speakers: [speaker("Alex"), speaker("Blair")],
});
assert.equal(plainSrt.includes("Alex"), false, "plain SRT stays unlabeled");
assert.equal(plainSrt.includes("Speaker"), false);
assert.match(plainSrt, /Hello\nworld/);

const namedSrt = generateSrt(spoken, {
  includeSpeakerLabels: true,
  speakers: [speaker("Alex"), speaker("Blair")],
});
assert.match(namedSrt, /Alex: Hello\nworld/);
assert.match(namedSrt, /Blair: Second cue/);
assert.equal(namedSrt.includes("[Alex]"), false);

const fallbackSrt = generateSrt(spoken, { includeSpeakerLabels: true });
assert.match(fallbackSrt, /Speaker 1: Hello\nworld/);
assert.match(fallbackSrt, /Speaker 2: Second cue/);

const blankNameSrt = generateSrt(
  [{ id: 0, start: 0, end: 1, text: "Hi", words: [], speaker_id: "1" }],
  { includeSpeakerLabels: true, speakers: [speaker("  ")] },
);
assert.match(blankNameSrt, /Speaker 1: Hi/);

const zeroBasedSrt = generateSrt(
  [
    { id: 0, start: 0, end: 1, text: "A", words: [], speaker_id: "0" },
    { id: 1, start: 2, end: 3, text: "B", words: [], speaker_id: "1" },
  ],
  { includeSpeakerLabels: true, speakers: [speaker("Alex"), speaker("Blair")] },
);
assert.match(zeroBasedSrt, /Alex: A/);
assert.match(zeroBasedSrt, /Blair: B/);

const unlabeledSrt = generateSrt(
  [
    { id: 0, start: 0, end: 1, text: "Hi", words: [], speaker_id: "?" },
    { id: 1, start: 2, end: 3, text: "There", words: [], speaker_id: "  " },
    { id: 2, start: 4, end: 5, text: "Host", words: [], speaker_id: "host" },
  ],
  { includeSpeakerLabels: true, speakers: [speaker("Alex")] },
);
assert.match(unlabeledSrt, /Hi/);
assert.equal(unlabeledSrt.includes("Alex"), false);
assert.equal(unlabeledSrt.includes("Speaker ?"), false);
assert.match(unlabeledSrt, /Speaker host: Host/);

const paddedIdSrt = generateSrt(
  [{ id: 0, start: 0, end: 1, text: "Hi", words: [], speaker_id: " 1 " }],
  { includeSpeakerLabels: true, speakers: [speaker("Alex")] },
);
assert.match(paddedIdSrt, /Alex: Hi/);

// An empty cue for speaker 0 must not stop the transcript from being detected
// as zero-based: speaker 1 is Blair, not whatever sits at index 0.
const emptyCueSrt = generateSrt(
  [
    { id: 0, start: 0, end: 1, text: "  ", words: [], speaker_id: "0" },
    { id: 1, start: 2, end: 3, text: "Hi", words: [], speaker_id: "1" },
  ],
  { includeSpeakerLabels: true, speakers: [speaker("Alex"), speaker("Blair")] },
);
assert.match(emptyCueSrt, /Blair: Hi/);
assert.equal(emptyCueSrt.includes("Alex"), false);
assert.equal(emptyCueSrt.includes("Speaker 0"), false);

// A renamed speaker with embedded line breaks must not inject extra cues into
// the exported file: whitespace collapses to a single-line label.
const multilineNameSrt = generateSrt(
  [{ id: 0, start: 0, end: 1, text: "Hi", words: [], speaker_id: "1" }],
  { includeSpeakerLabels: true, speakers: [speaker("Host\n\nDJ")] },
);
assert.match(multilineNameSrt, /Host DJ: Hi/);
const multilineCues = parseSrt(multilineNameSrt);
assert.equal(multilineCues.length, 1, "label line breaks must not split the cue");
assert.equal(multilineCues[0].text, "Host DJ: Hi");

// The export menu's "SRT with speakers" entry must reach the provider as a
// labeled .srt, while plain "Subtitles (.srt)" stays unlabeled.
const speakerExport = buildSubtitleExportFile(
  "srt-speakers",
  "clip",
  spoken,
  [speaker("Alex"), speaker("Blair")],
);
assert.equal(speakerExport.defaultPath, "clip.srt");
assert.deepEqual(speakerExport.filters, [
  { name: "SRT Files", extensions: ["srt"] },
]);
assert.match(speakerExport.content, /Alex: Hello\nworld/);
assert.match(speakerExport.content, /Blair: Second cue/);

const plainExport = buildSubtitleExportFile(
  "srt",
  "clip",
  spoken,
  [speaker("Alex"), speaker("Blair")],
);
assert.equal(plainExport.defaultPath, "clip.srt");
assert.equal(plainExport.content.includes("Alex"), false);

const txtExport = buildSubtitleExportFile(
  "txt",
  "clip",
  spoken,
  [speaker("Alex"), speaker("Blair")],
);
assert.equal(txtExport.defaultPath, "clip.txt");
assert.deepEqual(txtExport.filters, [
  { name: "Text Files", extensions: ["txt"] },
]);
assert.match(txtExport.content, /Alex:\nHello world/);

console.log("srt-utils tests passed");
