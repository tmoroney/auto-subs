import type { Subtitle } from '../types';

export type RetimeError = 'invalid' | 'order' | 'overlap';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Format seconds as HH:MM:SS.mmm for editing. */
export function formatEditableTime(seconds: number | string): string {
    const parsed = Number(seconds);
    const total = Math.round((Number.isFinite(parsed) ? Math.max(0, parsed) : 0) * 1000);
    const pad = (value: number, size = 2) => String(value).padStart(size, '0');
    const hours = Math.floor(total / 3_600_000);
    const minutes = Math.floor(total / 60_000) % 60;
    const secs = Math.floor(total / 1000) % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(total % 1000, 3)}`;
}

/**
 * Parse a typed time: seconds ("83.45"), MM:SS(.mmm) or HH:MM:SS(.mmm). A
 * comma works as the decimal mark, as in SRT. Returns null when invalid.
 */
export function parseEditableTime(text: string): number | null {
    const parts = text.trim().replace(',', '.').split(':');
    if (parts.length > 3) return null;
    const seconds = parts.pop() ?? '';
    if (!/^\d+(\.\d+)?$/.test(seconds) || parts.some(part => !/^\d+$/.test(part))) return null;
    const [hours, minutes] = parts.length === 2 ? parts.map(Number) : [0, Number(parts[0] ?? 0)];
    const secs = Number(seconds);
    if (parts.length > 0 && secs >= 60) return null;
    if (parts.length === 2 && minutes >= 60) return null;
    return round3(hours * 3600 + minutes * 60 + secs);
}

/**
 * Give a caption new start and end times. Its word timings are stretched onto
 * the new range so word highlighting stays inside the caption and Reformat,
 * which rebuilds caption times from words, keeps the new times.
 */
export function retimeSubtitle(
    subtitles: Subtitle[],
    index: number,
    start: number,
    end: number,
): { subtitles: Subtitle[] } | { error: RetimeError } {
    const current = subtitles[index];
    if (!current || !Number.isFinite(start) || !Number.isFinite(end) || start < 0) return { error: 'invalid' };
    if (end <= start) return { error: 'order' };
    const previous = subtitles[index - 1];
    const following = subtitles[index + 1];
    if ((previous && start < Number(previous.end) - 0.0005) || (following && end > Number(following.start) + 0.0005)) {
        return { error: 'overlap' };
    }

    let words = current.words;
    const timed = (words ?? []).every(word => Number.isFinite(Number(word.start)) && Number.isFinite(Number(word.end)));
    if (words?.length && timed) {
        const from = Number(words[0].start);
        const span = Number(words[words.length - 1].end) - from;
        if (span > 0) {
            const map = (time: number) => round3(start + (time - from) * (end - start) / span);
            words = words.map(word => ({ ...word, start: map(Number(word.start)), end: map(Number(word.end)) }));
        } else {
            // Words with no duration (e.g. from an imported cue) are spread
            // across the new range by length, as typed words are on Reformat.
            const lengths = words.map(word => Math.max(1, Array.from(word.word.trim()).length));
            const total = lengths.reduce((sum, length) => sum + length, 0);
            let consumed = 0;
            words = words.map((word, index) => {
                const wordStart = round3(start + (end - start) * consumed / total);
                consumed += lengths[index];
                return { ...word, start: wordStart, end: round3(start + (end - start) * consumed / total) };
            });
        }
    }

    const next = [...subtitles];
    next[index] = { ...current, start, end, words };
    return { subtitles: next };
}
