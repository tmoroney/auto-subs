import type { Speaker, Subtitle } from "../types";
import { generateSrt } from "./srt-utils.ts";
import { generateTranscriptTxt } from "./transcript-txt.ts";

/** Export formats offered by the subtitle export menu. */
export type SubtitleExportFormat = "srt" | "srt-speakers" | "txt" | "json";

/**
 * Formats whose file body is built straight from cues and speakers. `json`
 * also needs the saved document, so it is written by
 * `writeJsonTranscriptExport` in `./subtitle-export.ts` instead.
 */
export type SubtitleExportTextFormat = Exclude<SubtitleExportFormat, "json">;

export interface SubtitleExportDialogOptions {
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}

/** Save-dialog options for one export format. */
export function subtitleExportDialogOptions(
  format: SubtitleExportFormat,
  baseName: string,
): SubtitleExportDialogOptions {
  switch (format) {
    case "srt":
    case "srt-speakers":
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

/**
 * Builds the file body for an srt or txt export. Only `srt-speakers` prefixes
 * cues with speaker names; plain `srt` stays caption text only, and `txt` is
 * the speaker-grouped transcript.
 */
export function buildSubtitleExportContent(
  format: SubtitleExportTextFormat,
  subtitles: Subtitle[],
  speakers: Speaker[],
): string {
  return format === "txt"
    ? generateTranscriptTxt(subtitles, speakers)
    : generateSrt(subtitles, {
        includeSpeakerLabels: format === "srt-speakers",
        speakers,
      });
}
