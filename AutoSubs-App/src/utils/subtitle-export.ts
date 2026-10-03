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
 * The cues and speakers are the ones on screen. The saved document supplies
 * language, processing time, the original and edited sources, and source
 * metadata. App-storage details stay out: the on-disk filename, the transcript
 * id, and the absolute source path.
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

/** Extensions the file picker accepts, plus `aif` and `wma`. Longer names stay first. */
const EXPORT_MEDIA_EXTENSIONS = [
  "aiff",
  "alac",
  "flac",
  "mpeg",
  "webm",
  "3gp",
  "aac",
  "aif",
  "avi",
  "m4a",
  "m4v",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "mpg",
  "ogg",
  "opus",
  "wav",
  "wma",
  "wmv",
];

const MEDIA_EXTENSION = new RegExp(
  `\\.(?:${[...EXPORT_MEDIA_EXTENSIONS].sort((a, b) => b.length - a.length).join("|")})$`,
  "i",
);

/**
 * Suggested save name. Prefer the source file or timeline name. The stored
 * document name ends in `__tr_<id>`, which is only a fallback and is removed.
 */
export function subtitleExportBaseName(
  sourceName: string | null | undefined,
  storageFilename: string | null | undefined,
): string {
  const fromSource = readableExportStem(sourceName, true);
  if (fromSource) return fromSource;
  return readableExportStem(stripTranscriptId(storageFilename), false) || "subtitles";
}

/**
 * Human name for a stored transcript: the source file, otherwise the timeline.
 * `displayName` is intentionally unused because it falls back to the storage id.
 */
export function subtitleDocumentSourceName(
  document: {
    metadata?: { sourceFileName?: string; timelineName?: string } | null;
    sourceFileName?: string;
    timelineName?: string;
  } | null | undefined,
): string | null {
  if (!document) return null;
  return (
    cleanString(document.metadata?.sourceFileName) ||
    cleanString(document.metadata?.timelineName) ||
    cleanString(document.sourceFileName) ||
    cleanString(document.timelineName) ||
    null
  );
}

/**
 * Write one transcript. Edits made while the save dialog is open are included
 * only when that same document is still open. If another transcript loads
 * during the dialog, the file keeps the cues and saved metadata from the
 * transcript the export started with. A missing saved document writes nothing.
 */
export async function writeJsonTranscriptExport(input: {
  chosenPath: string | null | undefined;
  hasSavedDocument: boolean;
  flush: () => Promise<void>;
  readDocument: () => Promise<RawTranscriptSource | null>;
  write: (path: string, contents: string) => Promise<void>;
  startedFilename: string | null;
  currentFilename: () => string | null;
  startedSubtitles: Subtitle[];
  startedSpeakers: Speaker[];
  liveSubtitles: () => Subtitle[];
  liveSpeakers: () => Speaker[];
}): Promise<"cancelled" | "written"> {
  const path = subtitleExportWritePath(input.chosenPath);
  if (!path) return "cancelled";

  let document: RawTranscriptSource | null = null;
  if (input.hasSavedDocument) {
    try {
      await input.flush();
    } catch {
      // The open cues are still exported. A failed flush must not substitute
      // the older saved cues.
    }
    try {
      document = await input.readDocument();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read the saved transcript: ${detail}`);
    }
    if (!document) {
      throw new Error("Could not read the saved transcript");
    }
  }

  const sameDocument = input.currentFilename() === input.startedFilename;
  await input.write(
    path,
    serializeRawTranscriptExport({
      document,
      subtitles: sameDocument ? input.liveSubtitles() : input.startedSubtitles,
      speakers: sameDocument ? input.liveSpeakers() : input.startedSpeakers,
    }),
  );
  return "written";
}

function stripTranscriptId(filename: string | null | undefined): string | undefined {
  if (!filename) return undefined;
  return stripTranscriptIdSuffix(filename.replace(/\.json$/i, ""));
}

/** Removes a trailing `__tr_<id>` that names stored documents. */
function stripTranscriptIdSuffix(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const match = name.match(/^(.+)__tr_[A-Za-z0-9_]+$/);
  return match ? match[1] : name;
}

function readableExportStem(
  value: string | null | undefined,
  stripMediaExtension: boolean,
): string | undefined {
  if (typeof value !== "string") return undefined;
  let name = value.trim();
  if (!name) return undefined;
  if (stripMediaExtension) name = name.replace(MEDIA_EXTENSION, "");
  name = name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return name || undefined;
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
  const transcriptId = cleanString(meta.transcriptId ?? document.transcriptId);
  const savedDisplayName = cleanString(meta.displayName);
  // A display name holding the transcript id is the storage-name fallback.
  const displayName =
    savedDisplayName && transcriptId
      ? cleanString(savedDisplayName.replace(`__${transcriptId}`, ""))
      : savedDisplayName;
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
