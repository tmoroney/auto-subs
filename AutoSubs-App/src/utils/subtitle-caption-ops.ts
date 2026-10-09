import type { Subtitle } from '../types';
import { usesWordSpaces } from './subtitle-edits.ts';

/** Shortest span an added caption gets before it borrows time from a neighbour. */
export const MIN_INSERTED_DURATION = 0.5;
/** Span of a caption added after the last one, where no neighbour bounds it. */
export const TAIL_INSERTED_DURATION = 2;

const reindex = (subtitles: Subtitle[]) => subtitles.map((cue, id) => ({ ...cue, id }));

/**
 * Choose the span for a caption added after `current`:
 * 1. the gap before `next`, when it lasts at least MIN_INSERTED_DURATION;
 * 2. otherwise the silence between `current`'s last word and `next`'s first
 *    word, trimming both cues to it, when that lasts long enough;
 * 3. otherwise the second half of `current`, up to where `next` starts.
 * Returns null when `next` starts no later than `current`, leaving no room.
 */
function insertedSpan(current: Subtitle, next: Subtitle | undefined) {
    const start = Number(current.start);
    const end = Number(current.end);
    if (!next) {
        return { start: end, end: end + TAIL_INSERTED_DURATION, currentEnd: end, nextStart: undefined };
    }
    const nextStart = Number(next.start);
    if (nextStart - end >= MIN_INSERTED_DURATION) {
        return { start: end, end: nextStart, currentEnd: end, nextStart };
    }

    const lastWord = current.words?.[current.words.length - 1];
    const firstWord = next.words?.[0];
    const from = Math.min(end, Math.max(start, lastWord ? Number(lastWord.end) : end));
    const to = Math.max(nextStart, Math.min(Number(next.end), firstWord ? Number(firstWord.start) : nextStart));
    if (to - from >= MIN_INSERTED_DURATION) {
        return { start: from, end: to, currentEnd: from, nextStart: to };
    }

    const limit = Math.min(end, nextStart);
    if (limit <= start) return null;
    const middle = (start + limit) / 2;
    return { start: middle, end: limit, currentEnd: middle, nextStart };
}

/**
 * Insert an empty caption after `index`, following `insertedSpan`. Words stay
 * on the captions that own them. Returns the input unchanged when there is
 * no room for a caption.
 */
export function insertCaptionAfter(subtitles: Subtitle[], index: number): Subtitle[] {
    const current = subtitles[index];
    if (!current) return subtitles;
    const next = subtitles[index + 1];
    const span = insertedSpan(current, next);
    if (!span) return subtitles;

    const result = [...subtitles];
    result[index] = { ...current, end: span.currentEnd };
    if (next && span.nextStart !== undefined) {
        result[index + 1] = { ...next, start: span.nextStart };
    }
    result.splice(index + 1, 0, {
        id: 0,
        start: span.start,
        end: span.end,
        text: '',
        words: [],
        speaker_id: current.speaker_id ?? next?.speaker_id,
    });
    return reindex(result);
}

export type DeleteCaptionResult =
    | { ok: true; subtitles: Subtitle[]; selectedIndex: number }
    | { ok: false; reason: 'out_of_range' | 'only_caption' };

/**
 * Remove the caption at `index`. An empty caption is dropped. A caption with
 * text joins the previous caption (the next one when it is first), keeping
 * its words and their timings so none are lost; the merged caption keeps the
 * receiving caption's speaker. The only caption cannot be removed.
 * `selectedIndex` is the caption that received the text. `language` is the
 * transcript's, so the join uses the same spacing as reformatting does.
 */
export function deleteCaptionAt(subtitles: Subtitle[], index: number, language?: string): DeleteCaptionResult {
    const target = subtitles[index];
    if (!target) return { ok: false, reason: 'out_of_range' };
    if (subtitles.length === 1) return { ok: false, reason: 'only_caption' };

    const result = [...subtitles];
    result.splice(index, 1);
    const receiver = index > 0 ? index - 1 : 0;
    if (!(target.text ?? '').trim() && !target.words?.length) {
        return { ok: true, subtitles: reindex(result), selectedIndex: receiver };
    }

    const [first, second] = index > 0 ? [subtitles[index - 1], target] : [target, subtitles[1]];
    const firstWords = first.words ?? [];
    const left = (first.text ?? '').trimEnd();
    const right = (second.text ?? '').trimStart();
    const separator = left && right && usesWordSpaces(subtitles, language) ? ' ' : '';
    // The formatter separates words that lack a leading space only across a
    // line change, so give the joining word one to render the same text.
    const secondWords = (second.words ?? []).map((word, wordIndex) =>
        wordIndex === 0 && separator && firstWords.length && !/^\s/.test(word.word)
            && word.line_number === firstWords[firstWords.length - 1].line_number
            ? { ...word, word: ` ${word.word}` }
            : word,
    );
    result[receiver] = {
        ...subtitles[index > 0 ? index - 1 : 1],
        start: Math.min(Number(first.start), Number(second.start)),
        end: Math.max(Number(first.end), Number(second.end)),
        text: `${left}${separator}${right}`,
        words: [...firstWords, ...secondWords],
    };
    return { ok: true, subtitles: reindex(result), selectedIndex: receiver };
}
