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

    const tokenize = (text: string) => usesSpaces
        ? text.split(/\s+/).filter(Boolean)
        : Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
            .filter(token => token.trim());

    // Flatten the displayed words and find which cues the user edited. A cue
    // renders its tokens the same way the formatter does; any difference is an
    // edit, and a word move shows up as a pair of adjacent edited cues.
    const displayCues = displayed.map((cue, cueIndex) => {
        const words = cue.words ?? [];
        let rendered = '';
        const tokens = words.map((word, index) => {
            const token = word.word.trim();
            if (rendered && token && usesSpaces &&
                (/^\s/.test(word.word) || word.line_number !== words[index - 1].line_number)) {
                rendered += ' ';
            }
            rendered += token;
            return token;
        });
        return { cueIndex, cue, words, tokens, from: 0, to: 0, changed: rendered !== normalize(cue.text) };
    });
    let flat = 0;
    for (const entry of displayCues) {
        entry.from = flat;
        flat += entry.tokens.length;
        entry.to = flat;
    }
    const aligned = sourceWords.length === flat;

    // A word moved together with its timing leaves text and words in step, so
    // the move shows up as a caption holding words from two source groups.
    // Formatted captions never span groups on their own.
    const groupsOf = (entry: typeof displayCues[number]) =>
        sourceWords.slice(entry.from, entry.to).map(word => word.group);
    if (aligned) {
        for (const entry of displayCues) {
            const groups = groupsOf(entry);
            if (groups.some(group => group !== groups[0])) entry.changed = true;
        }
    }
    // The source group a caption belongs to. For a caption that gained words
    // from its neighbours, that is a group neither neighbour shares.
    const homeGroup = (cueIndex: number) => {
        const groups = groupsOf(displayCues[cueIndex]);
        if (groups.every(group => group === groups[0])) return groups[0];
        const previous = displayCues.slice(0, cueIndex).reverse().find(entry => entry.to > entry.from);
        const following = displayCues.slice(cueIndex + 1).find(entry => entry.to > entry.from);
        const shared = new Set<number>();
        if (previous) shared.add(sourceWords[previous.to - 1].group);
        if (following) shared.add(sourceWords[following.from].group);
        const own = groups.filter(group => !shared.has(group));
        const candidates = own.length ? own : groups;
        const count = (group: number) => candidates.filter(value => value === group).length;
        return candidates.reduce((best, group) => (count(group) > count(best) ? group : best));
    };

    // Maximal runs of consecutive edited cues get patched as one unit so a word
    // moved between cues keeps its timing.
    const runs: typeof displayCues[] = [];
    for (const entry of displayCues) {
        if (!entry.changed) continue;
        const run = runs[runs.length - 1];
        if (run && run[run.length - 1].cueIndex === entry.cueIndex - 1) {
            run.push(entry);
        } else {
            runs.push([entry]);
        }
    }
    if (!runs.length) return { segments: source, changed: false };

    type Entry = { word: Word; group: number; speaker: string | undefined };
    const patches: { start: number; count: number; words: Entry[] }[] = [];

    for (const run of runs) {
        const a = run[0].from;
        const b = run[run.length - 1].to;
        // Edited tokens remember their displayed cue for the speaker, its
        // destination source group so moved words stay where they were put,
        // and whether they lead it for the spacing rule. The display-to-source
        // index mapping only exists when the token counts align.
        let lastGroup: number | undefined;
        const edited = run.flatMap(entry => {
            const destGroup = aligned
                ? entry.to > entry.from
                    ? homeGroup(entry.cueIndex)
                    : (lastGroup ?? sourceWords[a]?.group ?? sourceWords[a - 1]?.group ?? 0)
                : 0;
            lastGroup = destGroup;
            return tokenize(normalize(entry.cue.text)).map((token, index) => ({
                text: token,
                speaker: entry.cue.speaker_id,
                destGroup,
                firstOfCue: index === 0,
            }));
        });
        const runWords = run.flatMap(entry => entry.words);
        const runFrom = runWords.length ? Number(runWords[0].start) : Number(run[0].cue.start);
        const runTo = runWords.length ? Number(runWords[runWords.length - 1].end) : Number(run[run.length - 1].cue.end);

        if (aligned) {
            const displayTokens = run.flatMap(entry => entry.tokens);
            const matches = matchWords(displayTokens, edited.map(token => token.text));
            const anchors = Array.from(matches, ([next, previous]) => ({ next, previous: a + previous }));
            // When an insertion has no silence available, borrow the neighbouring
            // word's span. Preserve its source spelling, but estimate the new timing.
            for (let index = 0; index <= anchors.length;) {
                const left = anchors[index - 1];
                const right = anchors[index];
                const nextStart = left ? left.next + 1 : 0;
                const nextEnd = right ? right.next : edited.length;
                const from = left ? Number(sourceWords[left.previous].word.end) : runFrom;
                const to = right ? Number(sourceWords[right.previous].word.start) : runTo;
                if (nextEnd > nextStart && to <= from && anchors.length) {
                    anchors.splice(right ? index : index - 1, 1);
                    index = Math.max(0, index - 1);
                } else {
                    index++;
                }
            }
            const replacements: Entry[] = [];
            for (let index = 0; index < edited.length; index++) {
                const token = edited[index];
                const matched = matches.get(index);
                if (matched !== undefined) {
                    const source = sourceWords[a + matched];
                    const word = { ...source.word };
                    if (usesSpaces && !token.firstOfCue && !/^\s/.test(word.word)) {
                        word.word = ` ${word.word}`;
                    }
                    replacements.push({ word, group: token.destGroup, speaker: token.speaker });
                } else {
                    replacements.push({
                        word: { word: `${usesSpaces ? ' ' : ''}${token.text}`, start: runFrom, end: runFrom, line_number: 0 } as Word,
                        group: token.destGroup,
                        speaker: token.speaker,
                    });
                }
            }
            for (let index = 0; index <= anchors.length; index++) {
                const left = anchors[index - 1];
                const right = anchors[index];
                const fromIndex = left ? left.next + 1 : 0;
                const toIndex = right ? right.next : edited.length;
                const fromTime = left ? Number(sourceWords[left.previous].word.end) : runFrom;
                const toTime = right ? Number(sourceWords[right.previous].word.start) : runTo;
                const weight = edited.slice(fromIndex, toIndex).reduce((sum, token) => sum + Array.from(token.text).length, 0);
                let consumed = 0;
                for (let next = fromIndex; next < toIndex; next++) {
                    replacements[next].word.start = fromTime + (toTime - fromTime) * consumed / weight;
                    consumed += Array.from(edited[next].text).length;
                    replacements[next].word.end = fromTime + (toTime - fromTime) * consumed / weight;
                }
                if (right) {
                    const original = sourceWords[right.previous].word;
                    replacements[right.next].word.start = original.start;
                    replacements[right.next].word.end = original.end;
                }
            }
            patches.push({ start: a, count: b - a, words: replacements });
        } else {
            // Older formatter versions may have used a different token count.
            // Limit the replacement to the run's timed source range.
            let start = sourceWords.findIndex(entry => Number(entry.word.end) > runFrom + 0.0001);
            let count = 0;
            if (start >= 0) {
                let end = start;
                while (end < sourceWords.length && Number(sourceWords[end].word.start) < runTo - 0.0001) end++;
                count = end - start;
            } else {
                const insertAt = sourceWords.findIndex(entry => Number(entry.word.start) >= runFrom);
                start = insertAt >= 0 ? insertAt : sourceWords.length;
            }
            const group = sourceWords[start]?.group ?? sourceWords[start - 1]?.group ?? 0;
            const weight = edited.reduce((sum, token) => sum + Array.from(token.text).length, 0);
            let consumed = 0;
            const replacements = edited.map(token => {
                const word = {
                    word: `${usesSpaces ? ' ' : ''}${token.text}`,
                    start: weight ? runFrom + (runTo - runFrom) * consumed / weight : runFrom,
                    end: runFrom,
                    line_number: 0,
                } as Word;
                consumed += Array.from(token.text).length;
                word.end = weight ? runFrom + (runTo - runFrom) * consumed / weight : runFrom;
                return { word, group, speaker: token.speaker };
            });
            patches.push({ start, count, words: replacements });
        }
    }

    for (const patch of patches.sort((x, y) => y.start - x.start)) {
        sourceWords.splice(patch.start, patch.count, ...patch.words);
    }
    const segments: Subtitle[] = [];
    let previousGroup: number | undefined;
    let previousSpeaker: string | undefined;
    for (const entry of sourceWords) {
        const previous = segments[segments.length - 1];
        if (previous && entry.group === previousGroup && entry.speaker === previousSpeaker) {
            previous.words.push(entry.word);
            previous.end = entry.word.end;
        } else {
            segments.push({ id: segments.length, start: entry.word.start, end: entry.word.end,
                text: '', words: [entry.word], speaker_id: entry.speaker });
        }
        previousGroup = entry.group;
        previousSpeaker = entry.speaker;
    }
    for (const cue of segments) {
        cue.text = cue.words.map((word, index) =>
            `${index > 0 && usesSpaces && /^\s/.test(word.word) ? ' ' : ''}${word.word.trim()}`,
        ).join('');
    }
    return { segments, changed: true };
}
