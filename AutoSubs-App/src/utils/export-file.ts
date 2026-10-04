import type { Speaker, Subtitle } from "../types";
import { generateSrt } from "./srt-utils.ts";
import { generateTranscriptTxt } from "./transcript-txt.ts";

/** Export formats offered by the subtitle export menu. */
export type SubtitleExportFormat = "srt" | "srt-speakers" | "txt";

export interface SubtitleExportFile {
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
  content: string;
}

/**
 * Turns an export-menu selection into the file the save dialog should write.
 * Only `srt-speakers` prefixes cues with speaker names; plain `srt` stays
 * caption text only, and `txt` is the speaker-grouped transcript.
 */
export function buildSubtitleExportFile(
  format: SubtitleExportFormat,
  baseName: string,
  subtitles: Subtitle[],
  speakers: Speaker[],
): SubtitleExportFile {
  const isSrt = format === "srt" || format === "srt-speakers";

  return {
    defaultPath: `${baseName}.${isSrt ? "srt" : "txt"}`,
    filters: [
      isSrt
        ? { name: "SRT Files", extensions: ["srt"] }
        : { name: "Text Files", extensions: ["txt"] },
    ],
    content: isSrt
      ? generateSrt(subtitles, {
          includeSpeakerLabels: format === "srt-speakers",
          speakers,
        })
      : generateTranscriptTxt(subtitles, speakers),
  };
}
