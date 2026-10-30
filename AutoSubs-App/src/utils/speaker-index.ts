import type { Subtitle } from "@/types";

function normalizeSpeakerId(speakerId: string | undefined) {
  const trimmed = speakerId?.trim();
  if (!trimmed || trimmed === "?") return null;
  return trimmed.startsWith("Speaker ") ? trimmed.slice("Speaker ".length).trim() : trimmed;
}

export function buildSpeakerIndexMap(subtitles: Pick<Subtitle, "speaker_id">[]) {
  const speakerIndices = new Map<string, number>();

  for (const subtitle of subtitles) {
    const speakerId = normalizeSpeakerId(subtitle.speaker_id);
    if (speakerId && !speakerIndices.has(speakerId)) {
      speakerIndices.set(speakerId, speakerIndices.size);
    }
  }

  return speakerIndices;
}

export function getSpeakerIndexForId(
  speakerId: string | undefined,
  speakerIndices: ReadonlyMap<string, number>,
  speakerCount: number,
) {
  const normalizedId = normalizeSpeakerId(speakerId);
  const index = normalizedId ? speakerIndices.get(normalizedId) : undefined;
  return index !== undefined && index < speakerCount ? index : 0;
}
