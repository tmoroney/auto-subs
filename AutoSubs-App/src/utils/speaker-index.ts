import type { Speaker, Subtitle } from "@/types";
import { DEFAULT_COLORS } from "./speaker-colors.ts";

export function getSpeakerIdBase(subtitles: Pick<Subtitle, "speaker_id">[]) {
  const hasZero = subtitles.some((subtitle) => subtitle.speaker_id === "0");
  return hasZero ? 0 : 1;
}

export function getSpeakerIndexForId(
  speakerId: string | undefined,
  speakerIdBase: number,
  speakerCount: number,
) {
  if (!speakerId) return 0;
  const numberId = Number(speakerId);
  if (!Number.isFinite(numberId)) return 0;

  const index = numberId - speakerIdBase;
  if (index >= 0 && index < speakerCount) return index;

  if (numberId >= 0 && numberId < speakerCount) return numberId;
  if (numberId - 1 >= 0 && numberId - 1 < speakerCount) return numberId - 1;
  return 0;
}

export function speakerDisplayColor(
  speaker: Pick<Speaker, "style" | "color">,
  index: number,
) {
  if (
    (speaker.style === "Fill" || speaker.style === "Outline") &&
    speaker.color
  ) {
    return speaker.color;
  }
  const paletteIndex = ((index % DEFAULT_COLORS.length) + DEFAULT_COLORS.length) %
    DEFAULT_COLORS.length;
  return DEFAULT_COLORS[paletteIndex] ?? DEFAULT_COLORS[0];
}
