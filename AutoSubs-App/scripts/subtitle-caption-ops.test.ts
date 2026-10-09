import assert from 'node:assert/strict';
import { deleteCaptionAt, insertCaptionAfter } from '../src/utils/subtitle-caption-ops.ts';
import { preserveSubtitleEdits } from '../src/utils/subtitle-edits.ts';
import type { Subtitle } from '../src/types.ts';

function cue(
    text: string,
    tokens = text.split(/\s+/).filter(Boolean),
    start = 0,
    id = start,
): Subtitle {
    return {
        id,
        start,
        end: start + tokens.length,
        text,
        speaker_id: '1',
        words: tokens.map((word, index) => ({
            word: index ? ` ${word}` : word,
            start: start + index,
            end: start + index + 1,
            line_number: 0,
        })),
    };
}

// Insert uses the gap before the next caption when one exists.
const gapPair = [cue('one', ['one'], 0, 0), cue('two', ['two'], 5, 1)];
const withGap = insertCaptionAfter(gapPair, 0);
assert.equal(withGap.length, 3);
assert.equal(withGap[1].text, '');
assert.equal(withGap[1].words.length, 0);
assert.equal(withGap[1].start, 1);
assert.equal(withGap[1].end, 5);
assert.deepEqual(withGap[0].words, gapPair[0].words);
assert.deepEqual(withGap[2].words, gapPair[1].words);

// Back-to-back captions split the shared boundary without overlap.
const tight = [cue('a', ['a'], 0, 0), cue('b', ['b'], 2, 1)];
const split = insertCaptionAfter(tight, 0);
assert.equal(split.length, 3);
assert.equal(split[0].end, 1);
assert.equal(split[1].start, 1);
assert.ok(split[1].end >= split[1].start);
assert.ok(split[1].end <= split[2].start);

// Tail insert extends after the last caption.
const single = [cue('solo', ['solo'], 0, 0)];
const tail = insertCaptionAfter(single, 0);
assert.equal(tail.length, 2);
assert.equal(tail[1].start, 1);
assert.ok(tail[1].end > tail[1].start);

// Delete empty caption leaves words untouched.
const three = insertCaptionAfter(gapPair, 0);
const removedMiddle = deleteCaptionAt(three, 1);
assert.equal(removedMiddle.ok, true);
if (removedMiddle.ok) {
    assert.equal(removedMiddle.subtitles.length, 2);
    assert.deepEqual(
        removedMiddle.subtitles.flatMap(segment => segment.words.map(word => word.word.trim())),
        ['one', 'two'],
    );
}

// Delete merges words into the previous caption.
const mergePrev = deleteCaptionAt(gapPair, 1);
assert.equal(mergePrev.ok, true);
if (mergePrev.ok) {
    assert.equal(mergePrev.subtitles.length, 1);
    assert.equal(mergePrev.subtitles[0].text, 'one two');
    assert.deepEqual(
        mergePrev.subtitles[0].words.map(word => word.word.trim()),
        ['one', 'two'],
    );
}

// First caption merges into the next neighbor.
const mergeNext = deleteCaptionAt(gapPair, 0);
assert.equal(mergeNext.ok, true);
if (mergeNext.ok) {
    assert.equal(mergeNext.subtitles.length, 1);
    assert.equal(mergeNext.subtitles[0].text, 'one two');
}

// Cannot delete the only caption.
const only = deleteCaptionAt(single, 0);
assert.equal(only.ok, false);
if (!only.ok) assert.equal(only.reason, 'only_caption');

// Empty insert plus moving the last word into the new slot keeps word order.
const moveSource = [cue('Hello', ['Hello'], 0), cue('world', ['world'], 2)];
const withSlot = insertCaptionAfter(moveSource, 0);
const userMoved = [
    { ...withSlot[0], text: '' },
    { ...withSlot[1], text: 'Hello' },
    { ...withSlot[2], text: 'world' },
];
const preserved = preserveSubtitleEdits(moveSource, userMoved);
assert.deepEqual(
    preserved.segments.flatMap(segment => segment.words.map(word => word.word.trim())),
    ['Hello', 'world'],
);
assert.deepEqual(
    preserved.segments.flatMap(segment => segment.words.map(word => [word.start, word.end])),
    [[0, 1], [2, 3]],
);

console.log('Subtitle caption ops checks passed.');
