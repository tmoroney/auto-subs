import assert from "node:assert/strict";
import { test } from "node:test";
import type { Speaker, Subtitle } from "../src/types.ts";
import {
  buildRawTranscriptExport,
  canExportSubtitles,
  serializeRawTranscriptExport,
  subtitleExportBaseName,
  subtitleExportDialogOptions,
  subtitleExportWritePath,
  writeJsonTranscriptExport,
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

test("visible cues and speakers win over a stale saved document", async () => {
  const savedCue = { ...current, text: "stale cue", end: 9 };
  const savedSpeakers = [{ ...speakers[0], name: "Old name" }];
  const visibleCue = { ...current, text: "Hello there friend", end: 3 };
  const visibleSpeakers = [{ ...speakers[0], name: "Alex" }];
  const calls: string[] = [];
  let written = "";

  const outcome = await writeJsonTranscriptExport({
    chosenPath: "/tmp/interview.json",
    hasSavedDocument: true,
    flush: async () => {
      calls.push("flush");
      throw new Error("disk full");
    },
    readDocument: async () => {
      calls.push("read");
      return {
        ...document,
        segments: [savedCue],
        speakers: savedSpeakers,
      };
    },
    write: async (_path, contents) => {
      calls.push("write");
      written = contents;
    },
    visibleSubtitles: () => [visibleCue],
    visibleSpeakers: () => visibleSpeakers,
  });

  assert.equal(outcome, "written");
  assert.deepEqual(calls, ["flush", "read", "write"]);
  const parsed = JSON.parse(written);
  assert.equal(parsed.segments[0].text, "Hello there friend");
  assert.equal(parsed.segments[0].words[0].start, 1.25);
  assert.equal(parsed.speakers[0].name, "Alex");
  assert.equal(parsed.originalSegments[0].text, "hello there");
  assert.equal(parsed.editedSegments[0].text, "Hello there");
  assert.equal(parsed.language, "en");
  assert.equal(parsed.metadata.displayName, "interview");
});

test("a missing saved transcript does not write a partial JSON file", async () => {
  const writes: string[] = [];
  await assert.rejects(
    () => writeJsonTranscriptExport({
      chosenPath: "/tmp/interview.json",
      hasSavedDocument: true,
      flush: async () => {},
      readDocument: async () => null,
      write: async () => {
        writes.push("write");
      },
      visibleSubtitles: () => [current],
      visibleSpeakers: () => speakers,
    }),
    /Could not read the saved transcript/,
  );
  await assert.rejects(
    () => writeJsonTranscriptExport({
      chosenPath: "/tmp/interview.json",
      hasSavedDocument: true,
      flush: async () => {},
      readDocument: async () => {
        throw new Error("permission denied");
      },
      write: async () => {
        writes.push("write");
      },
      visibleSubtitles: () => [current],
      visibleSpeakers: () => speakers,
    }),
    /permission denied/,
  );
  assert.deepEqual(writes, []);
});

test("cancelling the save dialog skips the flush, read, and write", async () => {
  let called = false;
  const outcome = await writeJsonTranscriptExport({
    chosenPath: null,
    hasSavedDocument: true,
    flush: async () => {
      called = true;
    },
    readDocument: async () => {
      called = true;
      return document;
    },
    write: async () => {
      called = true;
    },
    visibleSubtitles: () => [current],
    visibleSpeakers: () => speakers,
  });
  assert.equal(outcome, "cancelled");
  assert.equal(called, false);
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

test("the suggested export name uses the readable source, not the storage id", () => {
  assert.equal(
    subtitleExportBaseName("interview.mp4", "interview__tr_20261001120000_ab12cd34.json"),
    "interview",
  );
  assert.equal(
    subtitleExportBaseName("Timeline: One", "timeline-one__tr_20261001120000_ab12cd34.json"),
    "Timeline One",
  );
  assert.equal(
    subtitleExportBaseName(null, "my__tr_show__tr_20261001120000_ab12cd34.json"),
    "my__tr_show",
  );
  assert.equal(subtitleExportBaseName(null, null), "subtitles");
  assert.deepEqual(subtitleExportDialogOptions("json", "interview"), {
    defaultPath: "interview.json",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });
});

test("export dialog names and filters stay specific to each format", () => {
  assert.deepEqual(subtitleExportDialogOptions("srt", "interview"), {
    defaultPath: "interview.srt",
    filters: [{ name: "SRT Files", extensions: ["srt"] }],
  });
  assert.deepEqual(subtitleExportDialogOptions("txt", "interview"), {
    defaultPath: "interview.txt",
    filters: [{ name: "Text Files", extensions: ["txt"] }],
  });
  assert.deepEqual(subtitleExportDialogOptions("json", "interview"), {
    defaultPath: "interview.json",
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
