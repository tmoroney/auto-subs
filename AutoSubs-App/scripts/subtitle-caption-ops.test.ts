import assert from 'node:assert/strict';
import {
    deleteCaptionAt,
    insertCaptionAfter,
    MIN_INSERTED_DURATION,
    TAIL_INSERTED_DURATION,
} from '../src/utils/subtitle-caption-ops.ts';
import { preserveSubtitleEdits } from '../src/utils/subtitle-edits.ts';
import type { Subtitle } from '../src/types.ts';

/** A cue whose words each last one second from `wordsFrom`, spanning [start, end]. */
function cue(text: string, start: number, end: number, wordsFrom = start, speaker_id = '1'): Subtitle {
    const tokens = text.split(' ').filter(Boolean);
    return { id: 0, start, end, text, speaker_id,
        words: tokens.map((word, index) => ({ word: index ? ` ${word}` : word,
            start: wordsFrom + index, end: wordsFrom + index + 1, line_number: 0 })) };
}
const words = (segments: Subtitle[]) => segments.flatMap(segment => segment.words.map(word => word.word.trim()));
const spans = (segments: Subtitle[]) => segments.map(segment => [segment.start, segment.end]);

function assertOrdered(segments: Subtitle[]) {
    segments.forEach((segment, index) => {
        assert.equal(segment.id, index);
        assert.ok(segment.end > segment.start, `cue ${index} has no duration`);
        if (index) assert.ok(segment.start >= segments[index - 1].end, `cue ${index} overlaps the previous cue`);
    });
}

// A long enough gap holds the new caption; neighbours and words are untouched.
const gapped = [cue('one', 0, 1), cue('two', 5, 6)];
const intoGap = insertCaptionAfter(gapped, 0);
assert.deepEqual(spans(intoGap), [[0, 1], [1, 5], [5, 6]]);
assert.equal(intoGap[1].text, '');
assert.deepEqual(intoGap[1].words, []);
assert.deepEqual(words(intoGap), ['one', 'two']);
assertOrdered(intoGap);

// Touching captions: the new caption takes the silence between their words,
// trimming the current caption's end and the next caption's start.
const touching = [cue('a', 0, 2), cue('b', 2, 4, 3)];
const intoSilence = insertCaptionAfter(touching, 0);
assert.deepEqual(spans(intoSilence), [[0, 1], [1, 3], [3, 4]]);
assert.deepEqual(intoSilence[0].words, touching[0].words);
assert.deepEqual(intoSilence[2].words, touching[1].words);
assertOrdered(intoSilence);

// A gap shorter than the minimum widens into the silence around it.
const narrow = [cue('a', 0, 1.9), cue('b', 2, 4, 3)];
assert.deepEqual(spans(insertCaptionAfter(narrow, 0)), [[0, 1], [1, 3], [3, 4]]);

// Touching captions with no silence between their words: the new caption
// takes the second half of the current one and ends where the next starts.
const packed = [cue('a b', 0, 2), cue('c d', 2, 4)];
const halved = insertCaptionAfter(packed, 0);
assert.deepEqual(spans(halved), [[0, 1], [1, 2], [2, 4]]);
assert.ok(halved[1].end - halved[1].start >= MIN_INSERTED_DURATION);
assert.deepEqual(words(halved), ['a', 'b', 'c', 'd']);
assertOrdered(halved);

// Overlapping captions end up ordered, with the new caption between them.
const overlapping = [cue('a b c', 0, 3), cue('d e', 2, 5, 2.5)];
const unoverlapped = insertCaptionAfter(overlapping, 0);
assert.deepEqual(spans(unoverlapped), [[0, 1], [1, 2], [2, 5]]);
assertOrdered(unoverlapped);

// A caption added after the last one gets a readable fixed duration.
const tail = insertCaptionAfter([cue('solo', 0, 1)], 0);
assert.deepEqual(spans(tail), [[0, 1], [1, 1 + TAIL_INSERTED_DURATION]]);
assertOrdered(tail);

// The new caption takes the current caption's speaker.
const speakers = [cue('hi', 0, 1, 0, 'A'), cue('yo', 5, 6, 5, 'B')];
assert.equal(insertCaptionAfter(speakers, 0)[1].speaker_id, 'A');

// No room when the next caption starts with the current one; out of range is a no-op.
const sameStart = [cue('a', 0, 2), cue('b', 0, 3)];
assert.equal(insertCaptionAfter(sameStart, 0), sameStart);
assert.equal(insertCaptionAfter(gapped, 5), gapped);
assert.equal(insertCaptionAfter(gapped, -1), gapped);

// Inputs are never mutated.
const snapshot = JSON.stringify(packed);
insertCaptionAfter(packed, 0);
deleteCaptionAt(packed, 1);
assert.equal(JSON.stringify(packed), snapshot);

// Deleting an empty caption drops it and selects the caption above.
const emptyDeleted = deleteCaptionAt(intoGap, 1);
assert.ok(emptyDeleted.ok);
assert.deepEqual(spans(emptyDeleted.subtitles), [[0, 1], [5, 6]]);
assert.equal(emptyDeleted.selectedIndex, 0);

// Deleting the last caption joins its words, timing and span to the one above.
const lastDeleted = deleteCaptionAt(gapped, 1);
assert.ok(lastDeleted.ok);
assert.equal(lastDeleted.subtitles.length, 1);
assert.equal(lastDeleted.subtitles[0].text, 'one two');
assert.deepEqual(lastDeleted.subtitles[0].words.map(word => [word.word, word.start, word.end]), [['one', 0, 1], [' two', 5, 6]]);
assert.deepEqual(spans(lastDeleted.subtitles), [[0, 6]]);
assert.equal(lastDeleted.selectedIndex, 0);

// Deleting the first caption joins it to the one below.
const firstDeleted = deleteCaptionAt(gapped, 0);
assert.ok(firstDeleted.ok);
assert.equal(firstDeleted.subtitles[0].text, 'one two');
assert.deepEqual(spans(firstDeleted.subtitles), [[0, 6]]);
assert.equal(firstDeleted.selectedIndex, 0);

// Overlapping neighbours merge without dropping or duplicating a word.
const overlapDeleted = deleteCaptionAt(overlapping, 1);
assert.ok(overlapDeleted.ok);
assert.deepEqual(words(overlapDeleted.subtitles), ['a', 'b', 'c', 'd', 'e']);
assert.deepEqual(spans(overlapDeleted.subtitles), [[0, 5]]);

// The merged caption keeps the receiving caption's speaker.
const speakerDeleted = deleteCaptionAt(speakers, 1);
assert.ok(speakerDeleted.ok);
assert.equal(speakerDeleted.subtitles[0].speaker_id, 'A');

// The only caption cannot be deleted, and out of range is rejected.
assert.deepEqual(deleteCaptionAt([cue('solo', 0, 1)], 0), { ok: false, reason: 'only_caption' });
assert.deepEqual(deleteCaptionAt(gapped, 2), { ok: false, reason: 'out_of_range' });

// The join follows the transcript language's spacing, the same rule that
// reformatting uses, so it is never read as a correction that would collapse
// the two captions' timed words into one.
function oneWordCues(texts: string[], word = (text: string) => text): Subtitle[] {
    return texts.map((text, index) => ({ id: index, start: index, end: index + 1, text, speaker_id: '1',
        words: [{ word: word(text), start: index, end: index + 1, line_number: 0 }] }));
}
function assertJoin(source: Subtitle[], language: string | undefined, text: string) {
    const merged = deleteCaptionAt(source, 1, language);
    assert.ok(merged.ok);
    assert.equal(merged.subtitles[0].text, text);
    assert.deepEqual(merged.subtitles[0].words.map(word => [word.word.trim(), word.start, word.end]),
        source.flatMap(segment => segment.words.map(word => [word.word.trim(), word.start, word.end])));
    const reformatted = preserveSubtitleEdits(source, merged.subtitles, language);
    assert.equal(reformatted.changed, false, `${language}: ${text} was read as an edit`);
}

// A Chinese or Japanese word inside an English transcript keeps its space.
assertJoin(oneWordCues(['Visit', '東京'], text => text === '東京' ? ' 東京' : text), 'en', 'Visit 東京');
assertJoin(oneWordCues(['Visit', '東京']), 'en', 'Visit 東京');
assertJoin(oneWordCues(['東京', 'Visit']), 'en', '東京 Visit');
// Without a stored language reformatting assumes English spacing, and so does the join.
assertJoin(oneWordCues(['Visit', '東京']), undefined, 'Visit 東京');
// Chinese and Japanese transcripts join without a space, including Latin words.
assertJoin(oneWordCues(['你好', '世界']), 'zh', '你好世界');
assertJoin(oneWordCues(['東京', 'Tokyo']), 'ja', '東京Tokyo');
assertJoin(oneWordCues(['東京', 'Tokyo']), 'ja-JP', '東京Tokyo');
// Auto mode infers spacing from the transcript, as reformatting does.
assertJoin(oneWordCues(['你好', '世界']), 'auto', '你好世界');
assertJoin([cue('Visit the', 0, 2), ...oneWordCues(['東京']).map(segment => ({ ...segment, start: 2, end: 3 }))], 'auto', 'Visit the 東京');

// A merged caption renders exactly as its words, so reformatting does not
// read the delete as a text edit, even when the joining word had no space.
const unspaced = [cue('Hello', 0, 1), cue('world', 1, 2)];
const unspacedDeleted = deleteCaptionAt(unspaced, 1);
assert.ok(unspacedDeleted.ok);
assert.equal(unspacedDeleted.subtitles[0].words[1].word, ' world');
assert.equal(preserveSubtitleEdits(unspaced, unspacedDeleted.subtitles).changed, false);

// Text typed into an added caption survives reformatting, timed inside the
// caption's span and placed between its neighbours' words.
const typedSource = [cue('Hello', 0, 1), cue('world', 4, 5)];
const typedSlot = insertCaptionAfter(typedSource, 0);
const typed = preserveSubtitleEdits(typedSource, [typedSlot[0], { ...typedSlot[1], text: 'brave new' }, typedSlot[2]]);
assert.equal(typed.changed, true);
assert.deepEqual(words(typed.segments), ['Hello', 'brave', 'new', 'world']);
const [brave, newWord] = typed.segments.flatMap(segment => segment.words).slice(1, 3);
assert.ok(brave.start >= typedSlot[1].start && newWord.end <= typedSlot[1].end);

// So does text typed into a caption added after the last one.
const tailTyped = preserveSubtitleEdits([cue('solo', 0, 1)], [tail[0], { ...tail[1], text: 'there' }]);
assert.deepEqual(words(tailTyped.segments), ['solo', 'there']);
assert.deepEqual(tailTyped.segments.flatMap(segment => segment.words).map(word => [word.start, word.end]).at(-1), [1, 1 + TAIL_INSERTED_DURATION]);

// An added caption left empty changes nothing on reformat.
assert.equal(preserveSubtitleEdits(typedSource, typedSlot).changed, false);

console.log('Subtitle caption ops checks passed.');
