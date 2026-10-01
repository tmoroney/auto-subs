import type { Speaker, Subtitle } from "@/types";

export type SubtitleExportFormat = "srt" | "txt" | "json";

export interface SubtitleExportDialogOptions {
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
}

/**
 * Word-level transcript written by the Export menu.
 *
 * CLI `--format json` is the engine snapshot from transcription time
 * (`processing_time_sec`, cues without ids). The app then stores a richer
 * document: the cues on screen (including later edits), per-word line numbers,
 * `originalSegments`, and `editedSegments` once captions have been corrected.
 * This export follows that saved document so the file matches the open
 * transcript. It leaves out app-storage details: the on-disk filename, the
 * transcript id, and the absolute source path.
 */
export interface RawTranscriptExport {
  language?: string;
  processingTime?: number;
  speakers: Speaker[];
  segments: Subtitle[];
  originalSegments?: Subtitle[];
  editedSegments?: Subtitle[];
  metadata?: RawTranscriptExportMetadata;
}

export interface RawTranscriptExportMetadata {
  displayName?: string;
  sourceType?: string;
  sourceFileName?: string;
  timelineId?: string;
  timelineName?: string;
  createdAt?: string;
  markIn?: number;
  markOut?: number;
}

/** Fields read from a saved subtitle document. Storage-only keys are ignored. */
export interface RawTranscriptSource {
  language?: string;
  processingTime?: number;
  createdAt?: string;
  speakers?: Speaker[];
  originalSegments?: Subtitle[];
  editedSegments?: Subtitle[];
  segments?: Subtitle[];
  sourceType?: string;
  sourceFileName?: string;
  sourceFilePath?: string;
  timelineId?: string;
  timelineName?: string;
  filename?: string;
  transcriptId?: string;
  mark_in?: number;
  mark_out?: number;
  metadata?: {
    displayName?: string;
    sourceType?: string;
    sourceFileName?: string;
    sourceFilePath?: string;
    timelineId?: string;
    timelineName?: string;
    createdAt?: string;
    markIn?: number;
    markOut?: number;
    transcriptId?: string;
  };
}

export function subtitleExportDialogOptions(
  format: SubtitleExportFormat,
  baseName: string,
): SubtitleExportDialogOptions {
  switch (format) {
    case "srt":
      return {
        defaultPath: `${baseName}.srt`,
        filters: [{ name: "SRT Files", extensions: ["srt"] }],
      };
    case "txt":
      return {
        defaultPath: `${baseName}.txt`,
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      };
    case "json":
      return {
        defaultPath: `${baseName}.json`,
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      };
  }
}

export function canExportSubtitles(
  subtitles: readonly Subtitle[] | null | undefined,
): boolean {
  return Array.isArray(subtitles) && subtitles.length > 0;
}

/** A dismissed save dialog yields no path, so nothing is written. */
export function subtitleExportWritePath(
  chosenPath: string | null | undefined,
): string | null {
  if (typeof chosenPath !== "string" || chosenPath.trim() === "") {
    return null;
  }
  return chosenPath;
}

/**
 * Cues to write after a pending save has been flushed.
 * Saved segments win when present, so edits made while the save dialog was
 * open are included. Otherwise the cues passed into export are used.
 */
export function cuesForRawTranscriptExport(
  document: RawTranscriptSource | null | undefined,
  subtitles: Subtitle[],
  speakers: Speaker[] = [],
): { subtitles: Subtitle[]; speakers: Speaker[] } {
  return {
    subtitles:
      Array.isArray(document?.segments) && document.segments.length > 0
        ? document.segments
        : subtitles,
    speakers: Array.isArray(document?.speakers) ? document.speakers : speakers,
  };
}

export function buildRawTranscriptExport(input: {
  subtitles: Subtitle[];
  speakers?: Speaker[];
  document?: RawTranscriptSource | null;
}): RawTranscriptExport {
  const document = input.document ?? undefined;
  const language = cleanString(document?.language);
  const processingTime = cleanNumber(document?.processingTime);
  const originalSegments = segmentList(document?.originalSegments);
  const editedSegments = segmentList(document?.editedSegments);
  const metadata = pickMetadata(document);

  return {
    ...(language ? { language } : {}),
    ...(processingTime !== undefined ? { processingTime } : {}),
    speakers: input.speakers ?? [],
    segments: input.subtitles ?? [],
    ...(originalSegments ? { originalSegments } : {}),
    ...(editedSegments ? { editedSegments } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function serializeRawTranscriptExport(input: {
  subtitles: Subtitle[];
  speakers?: Speaker[];
  document?: RawTranscriptSource | null;
}): string {
  return `${JSON.stringify(buildRawTranscriptExport(input), null, 2)}\n`;
}

function segmentList(segments: Subtitle[] | undefined): Subtitle[] | undefined {
  return Array.isArray(segments) && segments.length > 0 ? segments : undefined;
}

function pickMetadata(
  document: RawTranscriptSource | undefined,
): RawTranscriptExportMetadata | undefined {
  if (!document) return undefined;
  const meta = document.metadata ?? {};
  const picked: RawTranscriptExportMetadata = {};
  const displayName = cleanString(meta.displayName);
  const sourceType = cleanString(meta.sourceType ?? document.sourceType);
  const sourceFileName = cleanString(meta.sourceFileName ?? document.sourceFileName);
  const timelineId = cleanString(meta.timelineId ?? document.timelineId);
  const timelineName = cleanString(meta.timelineName ?? document.timelineName);
  const createdAt = cleanString(meta.createdAt ?? document.createdAt);
  const markIn = cleanNumber(meta.markIn ?? document.mark_in);
  const markOut = cleanNumber(meta.markOut ?? document.mark_out);

  if (displayName) picked.displayName = displayName;
  if (sourceType) picked.sourceType = sourceType;
  if (sourceFileName) picked.sourceFileName = sourceFileName;
  if (timelineId) picked.timelineId = timelineId;
  if (timelineName) picked.timelineName = timelineName;
  if (createdAt) picked.createdAt = createdAt;
  if (markIn !== undefined) picked.markIn = markIn;
  if (markOut !== undefined) picked.markOut = markOut;

  return Object.keys(picked).length > 0 ? picked : undefined;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
