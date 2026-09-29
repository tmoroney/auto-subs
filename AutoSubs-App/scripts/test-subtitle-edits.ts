import assert from 'node:assert/strict';
import { preserveSubtitleEdits } from '../src/utils/subtitle-edits.ts';
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
console.log('Subtitle edit regression checks passed.');
