/// <reference lib="es2022.intl" />
import type { Subtitle, Word } from '../types';

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

// Match unchanged words inside a correction, including repeated words. This
// keeps corrections on both sides of a word from baking its display formatting
// into the editable source.
function matchWords(before: string[], after: string[]): Map<number, number> {
    const lengths = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            lengths[i][j] = before[i] === after[j]
                ? lengths[i + 1][j + 1] + 1
                : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
        }
    }
    const matches = new Map<number, number>();
    let i = 0;
    let j = 0;
    while (i < before.length && j < after.length) {
        if (before[i] === after[j]) {
            matches.set(j++, i++);
        } else if (lengths[i + 1][j] > lengths[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return matches;
}

/** Apply edits against the displayed word tokens, keeping the unformatted
 * source of unchanged words. Both inputs have been normalized by the Rust
 * formatter, so their flattened word order is independent of cue density. */
export function preserveSubtitleEdits(
    source: Subtitle[],
    displayed: Subtitle[],
    language = 'en',
): { segments: Subtitle[]; changed: boolean } {
    const sourceWords = source.flatMap((cue, group) =>
        (cue.words ?? []).map(word => ({ word, group, speaker: cue.speaker_id })),
    );
    const primaryLanguage = language.toLowerCase().split(/[-_]/)[0];
    const renderedWithSpaces = source.some(cue =>
        normalize(cue.text) !== cue.words.map(word => word.word.trim()).join(''),
    );
    // Explicit languages follow the formatter's spacing profile. In auto mode,
    // use its rendered source rather than guessing from the edited text.
    const usesSpaces = primaryLanguage === 'auto'
        ? renderedWithSpaces || !source.some(cue => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cue.text))
        : primaryLanguage !== 'zh' && primaryLanguage !== 'ja';
    const aligned = sourceWords.length === displayed.reduce((sum, cue) => sum + (cue.words?.length ?? 0), 0);
    const patches: { start: number; count: number; words: typeof sourceWords }[] = [];
    let offset = 0;

    for (const cue of displayed) {
        const words = cue.words ?? [];
        let before = '';
        const spans = words.map((word, index) => {
            const token = normalize(word.word);
            if (before && token && usesSpaces &&
                (/^\s/.test(word.word) || word.line_number !== words[index - 1].line_number)) {
                before += ' ';
            }
            const start = before.length;
            before += token;
            return { start, end: before.length };
        });
        const after = normalize(cue.text);
        if (before === after || words.length === 0) {
            offset += words.length;
            continue;
        }

        let prefix = 0;
        while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
        let suffix = 0;
        while (suffix < before.length - prefix && suffix < after.length - prefix &&
            before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;

        // Expand the changed characters to word boundaries. An insertion at a
        // boundary shares its neighbour's duration; its true timing is unknown.
        let first = spans.findIndex(span => span.end > prefix);
        if (first < 0) first = words.length - 1;
        let last = spans.length - 1;
        while (last > first && spans[last].start >= before.length - suffix) last--;
        let start = offset + first;
        let count = last - first + 1;
        let replacementSlice = after.slice(spans[first].start,
            Math.max(spans[first].start, after.length - (before.length - spans[last].end)));
        let replacementText = replacementSlice.trim();

        if (!aligned) {
            // Older formatter versions may have used a different token count.
            // Limit their replacement to this cue's timed source range.
            const from = Number(words[0].start);
            const to = Number(words[words.length - 1].end);
            start = sourceWords.findIndex(entry => Number(entry.word.end) > from + 0.0001);
            let end = start;
            while (end >= 0 && end < sourceWords.length && Number(sourceWords[end].word.start) < to - 0.0001) end++;
            count = end - start;
            replacementText = after;
            replacementSlice = after;
            first = 0;
            last = words.length - 1;
        }
        if (start < 0 || count <= 0 || start + count > sourceWords.length) {
            throw new Error('Cannot match edited captions to their source word timings');
        }

        const old = sourceWords.slice(start, start + count);
        const tokens = usesSpaces
            ? replacementText.split(/\s+/).filter(Boolean)
            : Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(replacementText), part => part.segment)
                .filter(token => token.trim());
        const durationStart = Number(old[0].word.start);
        const durationEnd = Number(old[old.length - 1].word.end);
        const matches = aligned ? matchWords(words.slice(first, last + 1).map(word => word.word.trim()), tokens) : new Map<number, number>();
        const anchors = Array.from(matches, ([next, previous]) => ({ next, previous }));
        // When an insertion has no silence available, borrow the neighbouring
        // word's span. Preserve its source spelling, but estimate the new timing.
        for (let index = 0; index <= anchors.length;) {
            const left = anchors[index - 1];
            const right = anchors[index];
            const nextStart = left ? left.next + 1 : 0;
            const nextEnd = right ? right.next : tokens.length;
            const from = left ? Number(old[left.previous].word.end) : durationStart;
            const to = right ? Number(old[right.previous].word.start) : durationEnd;
            if (nextEnd > nextStart && to <= from && anchors.length) {
                anchors.splice(right ? index : index - 1, 1);
                index = Math.max(0, index - 1);
            } else {
                index++;
            }
        }
        const replacements = tokens.map((token, index) => {
            const matched = matches.get(index);
            return {
                group: old[0].group,
                speaker: cue.speaker_id,
                word: {
                    word: `${usesSpaces && (index > 0 || /^\s/.test(old[0].word.word) || /^\s/.test(replacementSlice)) ? ' ' : ''}${matched === undefined ? token : old[matched].word.word.trim()}`,
                    start: durationStart,
                    end: durationStart,
                    line_number: 0,
                } as Word,
            };
        });
        for (let index = 0; index <= anchors.length; index++) {
            const left = anchors[index - 1];
            const right = anchors[index];
            const fromIndex = left ? left.next + 1 : 0;
            const toIndex = right ? right.next : tokens.length;
            const fromTime = left ? Number(old[left.previous].word.end) : durationStart;
            const toTime = right ? Number(old[right.previous].word.start) : durationEnd;
            const weight = tokens.slice(fromIndex, toIndex).reduce((sum, token) => sum + Array.from(token).length, 0);
            let consumed = 0;
            for (let next = fromIndex; next < toIndex; next++) {
                replacements[next].word.start = fromTime + (toTime - fromTime) * consumed / weight;
                consumed += Array.from(tokens[next]).length;
                replacements[next].word.end = fromTime + (toTime - fromTime) * consumed / weight;
            }
            if (right) {
                const original = old[right.previous].word;
                replacements[right.next].word.start = original.start;
                replacements[right.next].word.end = original.end;
                if (original.probability !== undefined) {
                    replacements[right.next].word.probability = original.probability;
                }
            }
        }
        patches.push({ start, count, words: replacements });
        offset += words.length;
    }
    if (!patches.length) return { segments: source, changed: false };

    for (const patch of patches.sort((a, b) => b.start - a.start)) {
        sourceWords.splice(patch.start, patch.count, ...patch.words);
    }
    const segments: Subtitle[] = [];
    for (const entry of sourceWords) {
        const previous = segments[segments.length - 1];
        if (previous && previous.id === entry.group && previous.speaker_id === entry.speaker) {
            previous.words.push(entry.word);
            previous.end = entry.word.end;
        } else {
            segments.push({ id: entry.group, start: entry.word.start, end: entry.word.end,
                text: '', words: [entry.word], speaker_id: entry.speaker });
        }
    }
    for (const cue of segments) {
        cue.text = cue.words.map((word, index) =>
            `${index > 0 && usesSpaces && /^\s/.test(word.word) ? ' ' : ''}${word.word.trim()}`,
        ).join('');
    }
    return { segments, changed: true };
}
