import type { Subtitle, Word } from '../types';

export type WordMoveDirection = 'previous' | 'next';

export interface WordMoveResult {
    subtitles: Subtitle[];
    /** Caption to keep selected. It changes when the edited caption was emptied and removed. */
    selectedIndex: number;
}

const splitIntoWords = (text: string) => {
    const trimmed = (text ?? '').trim();
    return trimmed ? trimmed.split(/\s+/g) : [];
};

/**
 * How many words at one edge of a caption render exactly as `token`, or 0
 * when the edited text no longer matches its word timings there.
 */
function edgeWordCount(words: Word[], token: string, fromEnd: boolean): number {
    const separated = (index: number) =>
        /^\s/.test(words[index].word) || words[index].line_number !== words[index - 1].line_number;
    let text = '';
    for (let count = 1; count <= words.length; count++) {
        const index = fromEnd ? words.length - count : count - 1;
        if (count > 1 && separated(fromEnd ? index + 1 : index)) return 0;
        const piece = words[index].word.trim();
        text = fromEnd ? piece + text : text + piece;
        if (text === token) return count;
        if (text.length >= token.length) return 0;
    }
    return 0;
}

/**
 * Move the first word of a caption to the end of the previous one, or the last
 * word to the start of the next one. The word's timing goes with it, so both
 * captions start and end where their words are spoken. A caption left empty is
 * removed. When the text no longer matches the word timings, only the text
 * moves and both captions keep their times.
 */
export function moveEdgeWord(
    subtitles: Subtitle[],
    index: number,
    direction: WordMoveDirection,
    currentText: string,
): WordMoveResult | null {
    const toPrevious = direction === 'previous';
    const targetIndex = toPrevious ? index - 1 : index + 1;
    const current = subtitles[index];
    const target = subtitles[targetIndex];
    if (!current || !target) return null;

    const tokens = splitIntoWords(currentText);
    const token = toPrevious ? tokens.shift() : tokens.pop();
    if (!token) return null;

    const remainingText = tokens.join(' ');
    const targetTokens = splitIntoWords(target.text ?? '');
    const targetText = (toPrevious ? [...targetTokens, token] : [token, ...targetTokens]).join(' ');
    const next = [...subtitles];

    const words = current.words ?? [];
    const count = edgeWordCount(words, token, !toPrevious);
    const moved = toPrevious ? words.slice(0, count) : words.slice(words.length - count);
    const remaining = toPrevious ? words.slice(count) : words.slice(0, words.length - count);
    const movedStart = Number(moved[0]?.start);
    const movedEnd = Number(moved[moved.length - 1]?.end);
    const edge = Number(toPrevious ? remaining[0]?.start : remaining[remaining.length - 1]?.end);

    if (
        count === 0 ||
        (remaining.length === 0) !== (remainingText === '') ||
        !Number.isFinite(movedStart) ||
        !Number.isFinite(movedEnd) ||
        (remaining.length > 0 && !Number.isFinite(edge))
    ) {
        next[index] = { ...current, text: remainingText };
        next[targetIndex] = { ...target, text: targetText };
        return { subtitles: next, selectedIndex: index };
    }

    // Captions are joined with a space, so the word after the join needs one.
    const spaced = (word: Word) => (/^\s/.test(word.word) ? word : { ...word, word: ` ${word.word}` });
    const targetWords = target.words ?? [];
    const updatedTarget: Subtitle = toPrevious
        ? {
            ...target,
            text: targetText,
            words: [...targetWords, ...(targetWords.length ? [spaced(moved[0]), ...moved.slice(1)] : moved)],
            end: Math.max(Number(target.end), movedEnd),
        }
        : {
            ...target,
            text: targetText,
            words: [...moved, ...targetWords.map((word, wordIndex) => (wordIndex === 0 ? spaced(word) : word))],
            start: Math.min(Number(target.start), movedStart),
        };
    next[targetIndex] = updatedTarget;

    if (remaining.length === 0) {
        next.splice(index, 1);
        return { subtitles: next, selectedIndex: toPrevious ? index - 1 : index };
    }

    if (toPrevious) {
        const start = Math.max(edge, updatedTarget.end);
        next[index] = { ...current, text: remainingText, words: remaining, start, end: Math.max(Number(current.end), start) };
    } else {
        const start = Number(current.start);
        next[index] = { ...current, text: remainingText, words: remaining, end: Math.max(start, Math.min(edge, updatedTarget.start)) };
    }
    return { subtitles: next, selectedIndex: index };
}
