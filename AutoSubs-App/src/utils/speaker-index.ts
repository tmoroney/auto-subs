import type { Subtitle } from "@/types";

export function getSpeakerIdBase(subtitles: Pick<Subtitle, "speaker_id">[]) {
  const hasZero = subtitles.some((subtitle) => {
    const speakerId = subtitle.speaker_id;
    if (speakerId === undefined || speakerId === null) return false;
    return String(speakerId) === "0";
  });
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
