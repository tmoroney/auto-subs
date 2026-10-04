import type { Speaker, Subtitle } from "../types";
import { resolveSpeakerLabel, speakerIdBase } from "./speaker-label.ts";

function normalizeTranscriptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function generateTranscriptTxt(
  subtitles: Subtitle[],
  speakers: Speaker[] = [],
): string {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return "";
  }

  const normalizedSubtitles = subtitles
    .map((subtitle) => ({
      ...subtitle,
      text: normalizeTranscriptText(subtitle.text ?? ""),
      speaker_id: subtitle.speaker_id?.trim() || undefined,
    }))
    .filter((subtitle) => subtitle.text.length > 0);

  if (normalizedSubtitles.length === 0) {
    return "";
  }

  const hasSpeakers = normalizedSubtitles.some(
    (subtitle) => subtitle.speaker_id,
  );

  if (!hasSpeakers) {
    return normalizedSubtitles
      .map((subtitle) => subtitle.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const idBase = speakerIdBase(normalizedSubtitles);
  const groupedBlocks: Array<{ speakerLabel: string; text: string }> = [];

  for (const subtitle of normalizedSubtitles) {
    const speakerLabel = subtitle.speaker_id
      ? resolveSpeakerLabel(subtitle.speaker_id, speakers, idBase)
      : "Transcript";
    const previousBlock = groupedBlocks[groupedBlocks.length - 1];

    if (previousBlock && previousBlock.speakerLabel === speakerLabel) {
      previousBlock.text = `${previousBlock.text} ${subtitle.text}`.trim();
      continue;
    }

    groupedBlocks.push({
      speakerLabel,
      text: subtitle.text,
    });
  }

  return groupedBlocks
    .map((block) => `${block.speakerLabel}:\n${block.text}`)
    .join("\n\n");
}
