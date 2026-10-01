import assert from "node:assert/strict";
import { test } from "node:test";
import type { Speaker, Subtitle } from "../src/types.ts";
import {
  buildRawTranscriptExport,
  canExportSubtitles,
  cuesForRawTranscriptExport,
  serializeRawTranscriptExport,
  subtitleExportDialogOptions,
  subtitleExportWritePath,
  type RawTranscriptSource,
} from "../src/utils/subtitle-export.ts";

const current: Subtitle = {
  id: 0,
  start: 1.25,
  end: 2.5,
  text: "Hello there",
  speaker_id: "1",
  words: [
    { word: "Hello", start: 1.25, end: 1.7, line_number: 0, probability: 0.98 },
    { word: "there", start: 1.7, end: 2.5, line_number: 0, probability: 0.91 },
  ],
};

const original: Subtitle = {
  id: 0,
  start: 1.25,
  end: 2.5,
  text: "hello there",
  speaker_id: "1",
  words: [
    { word: "hello", start: 1.25, end: 1.7, line_number: 0 },
    { word: "there", start: 1.7, end: 2.5, line_number: 0 },
  ],
};

const edited: Subtitle = {
  ...original,
  text: "Hello there",
};

const speakers = [
  {
    name: "Alex",
    style: "None",
    color: "#ffffff",
    sample: { start: 1.25, end: 2.5 },
    fill: { enabled: false, color: "" },
  },
] as unknown as Speaker[];

const document: RawTranscriptSource = {
  filename: "interview__tr_abc.json",
  transcriptId: "tr_abc",
  sourceFilePath: "/Users/me/Movies/interview.mp4",
  language: "en",
  processingTime: 12,
  mark_in: 0,
  mark_out: 9.5,
  segments: [{ ...current, text: "stale cue" }],
  originalSegments: [original],
  editedSegments: [edited],
  metadata: {
    displayName: "interview",
    sourceType: "standalone",
    sourceFileName: "interview.mp4",
    sourceFilePath: "/Users/me/Movies/interview.mp4",
    transcriptId: "tr_abc",
    createdAt: "2026-10-01T00:00:00.000Z",
    timelineName: "Timeline 1",
  },
};

test("raw JSON keeps word timings, edits, and source metadata", () => {
  const exported = buildRawTranscriptExport({
    document,
    subtitles: [current],
    speakers,
  });

  assert.equal(exported.language, "en");
  assert.equal(exported.processingTime, 12);
  assert.equal(exported.segments[0].text, "Hello there");
  assert.deepEqual(exported.segments[0].words, current.words);
  assert.deepEqual(exported.originalSegments, [original]);
  assert.deepEqual(exported.editedSegments, [edited]);
  assert.equal(exported.speakers[0].name, "Alex");
  assert.deepEqual(
    (exported.speakers[0] as Speaker & { fill?: { enabled: boolean } }).fill,
    { enabled: false, color: "" },
  );
  assert.deepEqual(exported.metadata, {
    displayName: "interview",
    sourceType: "standalone",
    sourceFileName: "interview.mp4",
    timelineName: "Timeline 1",
    createdAt: "2026-10-01T00:00:00.000Z",
    markIn: 0,
    markOut: 9.5,
  });

  const serialized = serializeRawTranscriptExport({
    document,
    subtitles: [current],
    speakers,
  });
  assert.equal(serialized.endsWith("\n"), true);
  assert.match(serialized, /\n {2}"segments"/);
  const roundTrip = JSON.parse(serialized);
  assert.equal(roundTrip.filename, undefined);
  assert.equal(roundTrip.transcriptId, undefined);
  assert.equal(roundTrip.sourceFilePath, undefined);
  assert.equal(roundTrip.metadata.sourceFilePath, undefined);
  assert.equal(roundTrip.metadata.transcriptId, undefined);
  assert.equal(roundTrip.processing_time_sec, undefined);
  assert.equal(roundTrip.segments[0].words[0].start, 1.25);
  assert.equal(roundTrip.segments[0].words[1].probability, 0.91);
});

test("raw JSON omits source arrays and metadata that were never stored", () => {
  const exported = buildRawTranscriptExport({
    subtitles: [{ ...current, speaker_id: undefined, words: [] }],
    speakers: [],
  });

  assert.deepEqual(Object.keys(exported), ["speakers", "segments"]);
  assert.equal(exported.segments[0].speaker_id, undefined);
  assert.deepEqual(exported.segments[0].words, []);
});

test("flushed saved cues replace the copy captured when export started", () => {
  const saved = { ...current, text: "Hello there friend", end: 3 };
  const cues = cuesForRawTranscriptExport(
    { segments: [saved], speakers },
    [current],
    [],
  );

  assert.equal(cues.subtitles[0].text, "Hello there friend");
  assert.equal(cues.speakers[0].name, "Alex");

  const fallback = cuesForRawTranscriptExport(null, [current], speakers);
  assert.equal(fallback.subtitles[0].text, "Hello there");
  assert.equal(fallback.speakers[0].name, "Alex");

  const emptySaved = cuesForRawTranscriptExport(
    { segments: [] },
    [current],
    speakers,
  );
  assert.equal(emptySaved.subtitles[0].text, "Hello there");
  assert.equal(emptySaved.speakers[0].name, "Alex");
});

test("mark in and out fall back to the saved document fields", () => {
  const exported = buildRawTranscriptExport({
    document: { mark_in: 3, mark_out: 8, metadata: { displayName: "clip" } },
    subtitles: [current],
  });

  assert.deepEqual(exported.metadata, {
    displayName: "clip",
    markIn: 3,
    markOut: 8,
  });
});

test("export dialog names and filters stay specific to each format", () => {
  assert.deepEqual(subtitleExportDialogOptions("srt", "interview__tr_abc"), {
    defaultPath: "interview__tr_abc.srt",
    filters: [{ name: "SRT Files", extensions: ["srt"] }],
  });
  assert.deepEqual(subtitleExportDialogOptions("txt", "interview__tr_abc"), {
    defaultPath: "interview__tr_abc.txt",
    filters: [{ name: "Text Files", extensions: ["txt"] }],
  });
  assert.deepEqual(subtitleExportDialogOptions("json", "interview__tr_abc"), {
    defaultPath: "interview__tr_abc.json",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });
});

test("a cancelled save dialog does not produce a write path", () => {
  assert.equal(subtitleExportWritePath(null), null);
  assert.equal(subtitleExportWritePath(undefined), null);
  assert.equal(subtitleExportWritePath("   "), null);
  assert.equal(
    subtitleExportWritePath("/tmp/interview.json"),
    "/tmp/interview.json",
  );
  assert.equal(canExportSubtitles([]), false);
  assert.equal(canExportSubtitles(null), false);
  assert.equal(canExportSubtitles([current]), true);
});
