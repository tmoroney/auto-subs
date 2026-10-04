import type { Speaker } from "../types";

/** Engine ids are 1-based unless a cue is explicitly numbered from 0. */
export function speakerIdBase(
  subtitles: ReadonlyArray<{ speaker_id?: string | null }>,
): number {
  return subtitles.some((subtitle) => subtitle.speaker_id?.trim() === "0") ? 0 : 1;
}

/**
 * Display name for a speaker id. Custom names win. Otherwise the label is
 * `Speaker N`, matching the plain-text transcript export.
 */
export function resolveSpeakerLabel(
  speakerId: string,
  speakers: Speaker[],
  idBase: number,
): string {
  const numericSpeakerId = Number(speakerId);
  const speakerIndex = Number.isFinite(numericSpeakerId)
    ? numericSpeakerId - idBase
    : -1;
  // Renamed speakers are user input: collapse embedded whitespace so a name
  // cannot inject extra lines into SRT cues or transcript blocks.
  const speakerName =
    speakerIndex >= 0
      ? speakers[speakerIndex]?.name?.replace(/\s+/g, " ").trim()
      : "";

  if (speakerName) {
    return speakerName;
  }

  if (Number.isFinite(numericSpeakerId)) {
    return `Speaker ${numericSpeakerId}`;
  }

  return `Speaker ${speakerId.replace(/\s+/g, " ").trim()}`;
}

/**
 * Speaker prefix for one SRT cue. Missing and unknown (`?`) speakers stay
 * unlabeled so a caption file is not filled with placeholder names.
 */
export function srtCueSpeakerLabel(
  speakerId: string | undefined,
  speakers: Speaker[],
  idBase: number,
): string | null {
  const id = speakerId?.trim();
  if (!id || id === "?") return null;
  return resolveSpeakerLabel(id, speakers, idBase);
}
