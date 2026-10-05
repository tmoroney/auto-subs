import type { Subtitle } from "../types";

/** Next highlighted row for a speaker list, or null when the key does not move. */
export function nextSpeakerOption(current: number, count: number, key: string): number | null {
    if (count <= 0) return null;
    if (key === "ArrowDown") return Math.min(count - 1, current + 1);
    if (key === "ArrowUp") return Math.max(0, current - 1);
    if (key === "Home") return 0;
    if (key === "End") return count - 1;
    return null;
}

/**
 * Give one caption another speaker. Speaker ids are 0-based only while some
 * caption is still "0". Removing that last "0" would make the rest of the ids
 * name the previous speaker, so the whole caption list moves up to 1-based
 * ids and every caption keeps the speaker it already had.
 */
export function reassignCaptionSpeaker(
    subtitles: Subtitle[],
    index: number,
    speakerIndex: number,
    idBase: number,
): Subtitle[] | null {
    const current = subtitles[index];
    const speakerId = String(speakerIndex + idBase);
    if (!current || current.speaker_id === speakerId || speakerIndex < 0) return null;

    const next = subtitles.map((subtitle, subtitleIndex) =>
        subtitleIndex === index ? { ...subtitle, speaker_id: speakerId } : subtitle,
    );
    if (idBase !== 0 || next.some(subtitle => String(subtitle.speaker_id) === "0")) return next;

    return next.map(subtitle => {
        const raw = subtitle.speaker_id?.trim() ?? "";
        return /^\d+$/.test(raw) ? { ...subtitle, speaker_id: String(Number(raw) + 1) } : subtitle;
    });
}
