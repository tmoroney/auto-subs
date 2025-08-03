import { Subtitle, Word } from "@/types/interfaces";

// Simple regex for punctuation removal
const PUNCTUATION_REGEX = /[\p{P}$+<=>^`|~]/gu;

function applyCaseToWord(word: string, mode: 'lowercase' | 'uppercase' | 'none'): string {
    if (!mode || mode === 'none') return word;
    return mode === 'lowercase' ? word.toLocaleLowerCase() : word.toLocaleUpperCase();
}

function removePunctuationFromWord(word: string): string {
    return word.replace(PUNCTUATION_REGEX, "");
}

function createCensorWord(censoredWords: string[]): (word: string) => string {
    if (!censoredWords || censoredWords.length === 0) return (word) => word;
    const censoredWordsSet = new Set(censoredWords.map(w => w.toLowerCase()));
    return (word: string) => {
        const cleanWord = word.replace(PUNCTUATION_REGEX, '').toLowerCase();
        if (censoredWordsSet.has(cleanWord)) {
            if (word.length > 3) {
                return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
            } else {
                return '*'.repeat(word.length);
            }
        }
        return word;
    };
}

/**
 * Helper to join a words array into a normalized text string.
 */
function joinWordsToText(words: Word[]): string {
    return words.map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
}

function splitSubtitleIntoLines(subtitle: Subtitle, options: {
    maxWordsPerLine: number;
    maxLinesPerSubtitle: number;
}): Subtitle[] {
    // return early if we don't need to split
    if (subtitle.words.length <= options.maxWordsPerLine) {
        return [subtitle];
    }

    // split words into lines
    let result: Subtitle[] = [];
    let words = subtitle.words;

    let lineIndex = 0;
    let currentWords: Word[] = [];
    for (let i = 0; i < words.length; i++) {
        // increment line index if we have reached the max words per line
        if (currentWords.length > options.maxWordsPerLine) {
            lineIndex++;
        }
        words[i].line = lineIndex;
        currentWords.push(words[i]);

        // check if we have reached the max words per line or the end of the subtitle or current word ends with a period, question mark, or exclamation point
        if (currentWords.length >= options.maxWordsPerLine * options.maxLinesPerSubtitle || i === words.length - 1 || words[i].word === '.' || words[i].word === '?' || words[i].word === '!') {
            // create a new subtitle object
            let newSubtitle: Subtitle = { ...subtitle };
            // set the subtitle text to the joined words
            newSubtitle.text = joinWordsToText(currentWords);
            // set the subtitle id to the current index
            newSubtitle.id = result.length;
            // set the subtitle words to the current words
            newSubtitle.words = currentWords;
            // set the subtitle start and end to the first and last word in the subtitle
            newSubtitle.start = currentWords[0].start;
            newSubtitle.end = currentWords[currentWords.length - 1].end;

            result.push(newSubtitle);
            currentWords = [];
            lineIndex = 0;
        }
    }
    return result;
}

/**
 * Applies all subtitle formatting operations in a single pass for efficiency.
 * @param subtitle The subtitle object to format.
 * @param options Formatting options including case, punctuation removal, and word censoring.
 * @returns A new Subtitle with all formatting applied.
 */
export function formatSubtitle(
    subtitle: Subtitle,
    options: {
        case: 'lowercase' | 'uppercase' | 'none';
        removePunctuation: boolean;
        censoredWords: string[];
    }
): Subtitle {
    // Process words array
    let result = subtitle.words.map(wordObj => {
        let w = wordObj.word;
        w = applyCaseToWord(w, options.case);
        if (options.removePunctuation) w = removePunctuationFromWord(w);
        w = createCensorWord(options.censoredWords)(w);
        return { ...wordObj, word: w };
    });

    return {
        ...subtitle,
        words: result
    };
}

export function formatSubtitles(
    subtitles: Subtitle[],
    options: {
        case: 'lowercase' | 'uppercase' | 'none';
        removePunctuation: boolean;
        censoredWords: string[];
        maxWordsPerLine: number;
        maxLinesPerSubtitle: number;
    }
): Subtitle[] {
    // split subtitles into lines
    let processedSubtitles: Subtitle[] = [];
    for (let subtitle of subtitles) {
        processedSubtitles.push(...splitSubtitleIntoLines(subtitle, options));
    }

    // Process words array
    let result: Subtitle[] = [];
    for (let subtitle of processedSubtitles) {
        result.push(formatSubtitle(subtitle, options));
    }

    return result;
}

