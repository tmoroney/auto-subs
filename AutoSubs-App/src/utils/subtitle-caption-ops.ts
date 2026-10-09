import type { Subtitle, Word } from '../types';

const MIN_CUE_DURATION = 0.001;
const GAP_EPSILON = 0.0001;

function nextSubtitleId(subtitles: Subtitle[]): number {
    let max = -1;
    for (const cue of subtitles) {
        if (cue.id > max) max = cue.id;
    }
    return max + 1;
}

function reindexIds(subtitles: Subtitle[]): Subtitle[] {
    return subtitles.map((cue, index) => ({ ...cue, id: index }));
}

function joinCaptionText(a: string, b: string): string {
    const left = (a ?? '').trim();
    const right = (b ?? '').trim();
    if (!left) return right;
    if (!right) return left;
    return `${left} ${right}`;
}

function mergeWords(left: Word[], right: Word[]): Word[] {
    if (!left.length) return [...right];
    if (!right.length) return [...left];
    const merged = [...left, ...right];
    const lastLine = left[left.length - 1]?.line_number ?? 0;
    return merged.map((word, index) => {
        if (index < left.length) return word;
        if (index === left.length && right[0] && word.line_number === right[0].line_number) {
            return word;
        }
        return { ...word, line_number: lastLine };
    });
}

function emptyCaption(start: number, end: number, speaker_id?: string, id = 0): Subtitle {
    const safeEnd = end > start ? end : start + MIN_CUE_DURATION;
    return {
        id,
        start,
        end: safeEnd,
        text: '',
        words: [],
        speaker_id,
    };
}

/** Insert an empty caption immediately after `index`. */
export function insertCaptionAfter(subtitles: Subtitle[], index: number): Subtitle[] {
    if (index < 0 || index >= subtitles.length) return subtitles;

    const current = subtitles[index];
    const next = subtitles[index + 1];
    const updated = subtitles.map(cue => ({ ...cue }));

    let newStart: number;
    let newEnd: number;

    if (next) {
        const gap = Number(next.start) - Number(current.end);
        if (gap > GAP_EPSILON) {
            newStart = Number(current.end);
            newEnd = Number(next.start);
        } else {
            const boundary = (Number(current.end) + Number(next.start)) / 2;
            newStart = boundary;
            newEnd = Number(next.start) > boundary ? Number(next.start) : boundary + MIN_CUE_DURATION;
            updated[index] = { ...current, end: boundary };
        }
    } else {
        newStart = Number(current.end);
        newEnd = newStart + MIN_CUE_DURATION;
    }

    const inserted = emptyCaption(
        newStart,
        newEnd,
        current.speaker_id ?? next?.speaker_id,
        nextSubtitleId(subtitles),
    );

    const result = [
        ...updated.slice(0, index + 1),
        inserted,
        ...updated.slice(index + 1),
    ];
    return reindexIds(result);
}

export type DeleteCaptionResult =
    | { ok: true; subtitles: Subtitle[] }
    | { ok: false; reason: 'out_of_range' | 'only_caption' };

/** Remove the caption at `index`, merging any words into a neighbor. */
export function deleteCaptionAt(subtitles: Subtitle[], index: number): DeleteCaptionResult {
    if (index < 0 || index >= subtitles.length) {
        return { ok: false, reason: 'out_of_range' };
    }
    if (subtitles.length === 1) {
        return { ok: false, reason: 'only_caption' };
    }

    const target = subtitles[index];
    const hasWords = (target.words?.length ?? 0) > 0 || (target.text ?? '').trim().length > 0;
    const next = [...subtitles];

    if (!hasWords) {
        next.splice(index, 1);
        return { ok: true, subtitles: reindexIds(next) };
    }

    if (index > 0) {
        const prev = next[index - 1];
        next[index - 1] = {
            ...prev,
            text: joinCaptionText(prev.text, target.text),
            words: mergeWords(prev.words ?? [], target.words ?? []),
            end: Math.max(Number(prev.end), Number(target.end)),
        };
        next.splice(index, 1);
        return { ok: true, subtitles: reindexIds(next) };
    }

    const neighbor = next[1];
    next[1] = {
        ...neighbor,
        text: joinCaptionText(target.text, neighbor.text),
        words: mergeWords(target.words ?? [], neighbor.words ?? []),
        start: Math.min(Number(target.start), Number(neighbor.start)),
    };
    next.splice(index, 1);
    return { ok: true, subtitles: reindexIds(next) };
}
