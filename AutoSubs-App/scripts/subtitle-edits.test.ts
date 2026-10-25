import assert from 'node:assert/strict';
import { preserveSubtitleEdits } from '../src/utils/subtitle-edits.ts';
import { moveEdgeWord } from '../src/utils/word-move.ts';
import type { Subtitle } from '../src/types.ts';

function cue(text: string, tokens = text.split(' '), start = 0): Subtitle {
    return { id: start, start, end: start + tokens.length, text, speaker_id: '1',
        words: tokens.map((word, index) => ({ word: index ? ` ${word}` : word,
            start: start + index, end: start + index + 1, line_number: 0 })) };
}
const words = (segments: Subtitle[]) => segments.flatMap(segment => segment.words.map(word => word.word.trim()));

// #512: preserve a correction, untouched timing, and the raw transcription.
const original = [cue('We visited Paris yesterday.')];
const snapshot = JSON.stringify(original);
const first = preserveSubtitleEdits(original, [{ ...original[0], text: 'We visited London yesterday.' }]);
assert.equal(first.changed, true);
assert.deepEqual(words(first.segments), ['We', 'visited', 'London', 'yesterday.']);
assert.equal(first.segments[0].words[2].start, 2);
assert.equal(first.segments[0].words[2].end, 3);
assert.deepEqual(first.segments[0].words[0], original[0].words[0]);
assert.deepEqual(first.segments[0].words[3], original[0].words[3]);
assert.equal(JSON.stringify(original), snapshot);

// Repeated reformatting and reopening retain corrections after cue splits.
const splitDisplay = [
    { ...cue('We visited'), words: first.segments[0].words.slice(0, 2) },
    { ...cue('London today.', ['London', 'yesterday.'], 2), words: first.segments[0].words.slice(2) },
];
const second = preserveSubtitleEdits(first.segments, splitDisplay);
assert.deepEqual(words(second.segments), ['We', 'visited', 'London', 'today.']);
const reopened = JSON.parse(JSON.stringify(second.segments));
assert.equal(preserveSubtitleEdits(reopened, reopened).changed, false);

// Unchanged words keep reversible casing, censoring and punctuation.
const raw = [cue('Hello fantastic world!')];
const styled = cue('HELLO F*******C WORLD', ['HELLO', 'F*******C', 'WORLD']);
assert.deepEqual(words(preserveSubtitleEdits(raw, [{ ...styled, text: 'HELLO F*******C friends' }]).segments), ['Hello', 'fantastic', 'friends']);
assert.equal(preserveSubtitleEdits(raw, [styled]).changed, false);
const twoCorrections = preserveSubtitleEdits(raw, [{ ...styled, text: 'Hi F*******C friends' }]);
assert.deepEqual(words(twoCorrections.segments), ['Hi', 'fantastic', 'friends']);
assert.deepEqual(twoCorrections.segments[0].words[1], raw[0].words[1]);

// Insertions/deletions estimate timing within the affected span only.
const inserted = preserveSubtitleEdits(raw, [{ ...styled, text: 'HELLO brave F*******C WORLD' }]);
assert.deepEqual(words(inserted.segments), ['Hello', 'brave', 'fantastic', 'world!']);
assert.equal(inserted.segments[0].words[0].start, 0);
assert.equal(inserted.segments[0].words[3].start, 2);
assert.ok(inserted.segments[0].words[1].end <= inserted.segments[0].words[2].start);
assert.equal(preserveSubtitleEdits(raw, [{ ...styled, text: 'Today HELLO F*******C WORLD' }]).segments[0].text, 'Today Hello fantastic world!');
assert.equal(preserveSubtitleEdits(raw, [{ ...styled, text: 'HELLO F*******C WORLD today' }]).segments[0].text, 'Hello fantastic world! today');
assert.deepEqual(words(preserveSubtitleEdits(original, [{ ...original[0], text: 'We Paris yesterday.' }]).segments), ['We', 'Paris', 'yesterday.']);
assert.deepEqual(preserveSubtitleEdits(original, [{ ...original[0], text: '' }]).segments, []);

// Line wrapping is not an edit; an inserted space inside a word is.
const multiline = cue('We visited\nParis yesterday.', ['We', 'visited', 'Paris', 'yesterday.']);
multiline.words[2].line_number = multiline.words[3].line_number = 1;
assert.equal(preserveSubtitleEdits(original, [multiline]).changed, false);
const joined = [cue('the1000 pounds')];
assert.deepEqual(words(preserveSubtitleEdits(joined, [{ ...joined[0], text: 'the 1000 pounds' }]).segments), ['the', '1000', 'pounds']);
const joinedTokens = [cue('the1000 pounds', ['the', '1000', 'pounds'])];
joinedTokens[0].words[1].word = '1000';
assert.equal(preserveSubtitleEdits(joinedTokens, [{ ...joinedTokens[0], text: 'the 1000 pounds' }]).segments[0].text, 'the 1000 pounds');

// CJK corrections do not acquire spaces.
const cjk = [cue('你好世界', ['你', '好', '世', '界'])];
cjk[0].words.forEach(word => { word.word = word.word.trim(); });
assert.equal(preserveSubtitleEdits(cjk, cjk, 'zh').changed, false);
assert.equal(preserveSubtitleEdits(cjk, [{ ...cjk[0], text: '你好朋友' }], 'zh').segments.map(segment => segment.text).join(''), '你好朋友');

// Legacy tokenization changes affect only the edited cue's timed range.
const legacySource = [cue('We visited Paris.'), cue('Goodbye!', ['Goodbye!'], 4)];
const legacyDisplay = [cue('We visited London.', ['Wevisited', 'Paris.']), cue('Goodbye!', ['Goodbye!'], 4)];
legacyDisplay[0].words[0].end = 2;
legacyDisplay[0].words[1].start = 2;
legacyDisplay[0].words[1].end = 3;
const legacy = preserveSubtitleEdits(legacySource, legacyDisplay);
assert.deepEqual(words(legacy.segments), ['We', 'visited', 'London.', 'Goodbye!']);
assert.equal(legacy.segments.at(-1)?.words[0].start, 4);

// Joining words merges their timed span instead of corrupting the suffix.
const joinable = [cue('one two three')];
const joinedEdit = preserveSubtitleEdits(joinable, [{ ...joinable[0], text: 'one twothree' }]);
assert.deepEqual(words(joinedEdit.segments), ['one', 'twothree']);
assert.equal(joinedEdit.segments[0].text, 'one twothree');
assert.deepEqual(joinedEdit.segments[0].words[0], joinable[0].words[0]);
assert.equal(joinedEdit.segments[0].words[1].start, 1);
assert.equal(joinedEdit.segments[0].words[1].end, 3);

// Moving a first word to the previous cue only edits text, so timings survive.
const movePrevSource = [cue('Hello', ['Hello'], 0), cue('world', ['world'], 1)];
const movePrev = preserveSubtitleEdits(movePrevSource, [
    { ...movePrevSource[0], text: 'Hello world' },
    { ...movePrevSource[1], text: '' },
]);
assert.deepEqual(words(movePrev.segments), ['Hello', 'world']);
assert.deepEqual(movePrev.segments[0].words[0], movePrevSource[0].words[0]);
assert.deepEqual(movePrev.segments.flatMap(segment => segment.words.map(word => [word.start, word.end])), [[0, 1], [1, 2]]);

const movePrevMultiSource = [cue('a b', ['a', 'b'], 0), cue('c d', ['c', 'd'], 2)];
const movePrevMulti = preserveSubtitleEdits(movePrevMultiSource, [
    { ...movePrevMultiSource[0], text: 'a b c' },
    { ...movePrevMultiSource[1], text: 'd' },
]);
assert.deepEqual(movePrevMulti.segments.flatMap(segment => segment.words.map(word => [word.word.trim(), word.start, word.end])), [
    ['a', 0, 1], ['b', 1, 2], ['c', 2, 3], ['d', 3, 4],
]);

// Moving a last word to the next cue keeps its timing too.
const moveNextSource = [cue('Hello', ['Hello'], 0), cue('world', ['world'], 1)];
const moveNext = preserveSubtitleEdits(moveNextSource, [
    { ...moveNextSource[0], text: '' },
    { ...moveNextSource[1], text: 'Hello world' },
]);
assert.deepEqual(words(moveNext.segments), ['Hello', 'world']);
assert.deepEqual(moveNext.segments.flatMap(segment => segment.words.map(word => [word.start, word.end])), [[0, 1], [1, 2]]);

const moveNextMultiSource = [cue('a b', ['a', 'b'], 0), cue('c d', ['c', 'd'], 2)];
const moveNextMulti = preserveSubtitleEdits(moveNextMultiSource, [
    { ...moveNextMultiSource[0], text: 'a' },
    { ...moveNextMultiSource[1], text: 'b c d' },
]);
assert.deepEqual(moveNextMulti.segments.flatMap(segment => segment.words.map(word => [word.word.trim(), word.start, word.end])), [
    ['a', 0, 1], ['b', 1, 2], ['c', 2, 3], ['d', 3, 4],
]);

// A cue with no word tokens still honours an edit inside its timed range.
const wordless = { id: 0, start: 5, end: 7, text: 'Old line', words: [], speaker_id: '1' } as Subtitle;
const wordlessEdit = preserveSubtitleEdits([wordless], [{ ...wordless, text: 'New line here' }]);
assert.deepEqual(words(wordlessEdit.segments), ['New', 'line', 'here']);
assert.equal(wordlessEdit.segments[0].text, 'New line here');
assert.equal(wordlessEdit.segments[0].words[0].start, 5);
assert.equal(wordlessEdit.segments[0].words[2].end, 7);

// Edits in two non-adjacent cues apply independently; untouched cues keep
// their source words.
const spaced = [cue('one'), cue('two', ['two'], 4), cue('three', ['three'], 8)];
const spacedEdit = preserveSubtitleEdits(spaced, [
    { ...spaced[0], text: 'uno' },
    spaced[1],
    { ...spaced[2], text: 'tres' },
]);
assert.deepEqual(words(spacedEdit.segments), ['uno', 'two', 'tres']);
assert.deepEqual(spacedEdit.segments[1].words[0], spaced[1].words[0]);

// A word moved into another speaker's caption takes that caption's speaker
// and group, so the next reformat does not split it back out.
const speakerA = { id: 0, start: 0, end: 1, text: 'Hello', speaker_id: 'A',
    words: [{ word: 'Hello', start: 0, end: 1, line_number: 0 }] } as Subtitle;
const speakerB = { id: 1, start: 1, end: 2, text: 'world', speaker_id: 'B',
    words: [{ word: 'world', start: 1, end: 2, line_number: 0 }] } as Subtitle;
const movedUp = preserveSubtitleEdits([speakerA, speakerB], [
    { ...speakerA, text: 'Hello world' },
    { ...speakerB, text: '' },
]);
assert.equal(movedUp.segments.length, 1);
assert.equal(movedUp.segments[0].speaker_id, 'A');
assert.equal(movedUp.segments[0].text, 'Hello world');
assert.deepEqual(movedUp.segments[0].words.map(word => [word.start, word.end]), [[0, 1], [1, 2]]);

const movedDown = preserveSubtitleEdits([speakerA, speakerB], [
    { ...speakerA, text: '' },
    { ...speakerB, text: 'Hello world' },
]);
assert.equal(movedDown.segments.length, 1);
assert.equal(movedDown.segments[0].speaker_id, 'B');
assert.equal(movedDown.segments[0].text, 'Hello world');
assert.deepEqual(movedDown.segments[0].words.map(word => [word.start, word.end]), [[0, 1], [1, 2]]);

// The same regrouping applies when the move only crosses source groups.
const groupsSource = [cue('a b', ['a', 'b'], 0), cue('c d', ['c', 'd'], 2)];
const regrouped = preserveSubtitleEdits(groupsSource, [
    { ...groupsSource[0], text: 'a b c' },
    { ...groupsSource[1], text: 'd' },
]);
assert.deepEqual(regrouped.segments.map(segment => segment.text), ['a b c', 'd']);
assert.deepEqual(regrouped.segments.flatMap(segment => segment.words.map(word => [word.start, word.end])), [[0, 1], [1, 2], [2, 3], [3, 4]]);

// Legacy tokenization finds each edit's group by time, not display index, so
// a later caption's edit cannot merge into an earlier caption.
const legacyGroups = [cue('one two three'), cue('four five', ['four', 'five'], 4)];
const legacyRegrouped = preserveSubtitleEdits(legacyGroups, [
    { ...legacyGroups[0], words: [{ word: 'one two three', start: 0, end: 3, line_number: 0 }] },
    { ...legacyGroups[1], text: 'four six' },
]);
assert.equal(legacyRegrouped.segments.length, 2);
assert.deepEqual(legacyRegrouped.segments[0].words, legacyGroups[0].words);
assert.deepEqual(legacyRegrouped.segments[1].words.map(word => word.word.trim()), ['four', 'six']);
assert.equal(legacyRegrouped.segments[1].words[0].start, 4);
assert.equal(legacyRegrouped.segments[1].words[1].end, 6);

// Clearing a cue removes only its own words.
const partial = [cue('one'), cue('two', ['two'], 4)];
const cleared = preserveSubtitleEdits(partial, [partial[0], { ...partial[1], text: '' }]);
assert.deepEqual(words(cleared.segments), ['one']);
assert.deepEqual(cleared.segments[0].words[0], partial[0].words[0]);

// #445: a word moved with its timing still lands in its destination caption
// on Reformat, although the moved captions' text matches their words.
const timedSource = [cue('a b', ['a', 'b'], 0), cue('c d', ['c', 'd'], 2)];
const timedDown = moveEdgeWord(timedSource, 0, 'next', 'a b');
assert.ok(timedDown);
const reformattedDown = preserveSubtitleEdits(timedSource, timedDown.subtitles);
assert.equal(reformattedDown.changed, true);
assert.deepEqual(reformattedDown.segments.map(segment => segment.text), ['a', 'b c d']);
assert.deepEqual(reformattedDown.segments.flatMap(segment => segment.words.map(word => [word.start, word.end])), [[0, 1], [1, 2], [2, 3], [3, 4]]);

const timedUp = moveEdgeWord(timedSource, 1, 'previous', 'c d');
assert.ok(timedUp);
assert.deepEqual(preserveSubtitleEdits(timedSource, timedUp.subtitles).segments.map(segment => segment.text), ['a b c', 'd']);

// Several moved words outnumbering the destination's own still join it.
const longSource = [cue('a b c d', ['a', 'b', 'c', 'd'], 0), cue('e', ['e'], 4)];
let longDisplay = longSource;
for (let moves = 0; moves < 3; moves++) {
    const result = moveEdgeWord(longDisplay, 0, 'next', longDisplay[0].text);
    assert.ok(result);
    longDisplay = result.subtitles;
}
assert.deepEqual(longDisplay.map(segment => segment.text), ['a', 'b c d e']);
assert.deepEqual(preserveSubtitleEdits(longSource, longDisplay).segments.map(segment => segment.text), ['a', 'b c d e']);

// A caption that took a word from each neighbour keeps its own group, so
// Reformat does not merge it into either neighbour.
const bothSides = [cue('x y', ['x', 'y'], 0), cue('b c', ['b', 'c'], 2), cue('d e', ['d', 'e'], 4)];
const tookLeft = moveEdgeWord(bothSides, 2, 'previous', 'd e');
assert.ok(tookLeft);
const tookBoth = moveEdgeWord(tookLeft.subtitles, 0, 'next', 'x y');
assert.ok(tookBoth);
assert.deepEqual(tookBoth.subtitles.map(segment => segment.text), ['x', 'y b c d', 'e']);
assert.deepEqual(preserveSubtitleEdits(bothSides, tookBoth.subtitles).segments.map(segment => segment.text), ['x', 'y b c d', 'e']);

// Emptying a caption removes it, and the words join their new speaker.
const timedSpeakers = moveEdgeWord([speakerA, speakerB], 0, 'next', 'Hello');
assert.ok(timedSpeakers);
assert.equal(timedSpeakers.subtitles.length, 1);
const reformattedSpeakers = preserveSubtitleEdits([speakerA, speakerB], timedSpeakers.subtitles);
assert.equal(reformattedSpeakers.segments.length, 1);
assert.equal(reformattedSpeakers.segments[0].speaker_id, 'B');
assert.equal(reformattedSpeakers.segments[0].text, 'Hello world');

// A move between captions of one source group needs no correction, and
// reopening an already preserved move finds nothing new.
const oneGroup = [cue('a b c d', ['a', 'b', 'c', 'd'])];
const oneGroupDisplay = [
    { ...cue('a b'), words: oneGroup[0].words.slice(0, 2) },
    { ...cue('c d', ['c', 'd'], 2), words: oneGroup[0].words.slice(2) },
];
const withinGroup = moveEdgeWord(oneGroupDisplay, 0, 'next', 'a b');
assert.ok(withinGroup);
assert.equal(preserveSubtitleEdits(oneGroup, withinGroup.subtitles).changed, false);
assert.equal(preserveSubtitleEdits(reformattedDown.segments, timedDown.subtitles).changed, false);

console.log('Subtitle edit regression checks passed.');
