import { Subtitle, Word } from "@/types/interfaces";

const PUNCTUATION_REGEX = /[\p{P}$+<=>^`|~]/gu;

/**
 * Helper to join a words array into a normalized text string.
 */
export function joinWordsToText(words: Word[]): string {
    if (!words.length) return '';
    let result = '';
    let prevLine = words[0].line_number ?? 0;
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const currLine = word.line_number ?? 0;
        if (i > 0) {
            if (currLine !== prevLine) {
                result += '\n';
            } else {
                result += ' ';
            }
        }
        result += word.word;
        prevLine = currLine;
    }
    return result.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function applyCaseToWord(word: string, mode: 'lowercase' | 'uppercase' | 'titlecase' | 'none'): string {
    if (mode === 'lowercase') return word.toLocaleLowerCase();
    if (mode === 'uppercase') return word.toLocaleUpperCase();
    if (mode === 'titlecase') return word.toLocaleLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return word;
}

function removePunctuationFromWord(word: string): string {
    return word.replace(PUNCTUATION_REGEX, "");
}

function hasCensoredWord(word: string, censoredSet: Set<string>): boolean {
    const clean = word.replace(PUNCTUATION_REGEX, '').trim().toLowerCase();
    return censoredSet.has(clean);
}

function getCensoredVersion(word: string): string {
    const clean = word.replace(PUNCTUATION_REGEX, '').trim();
    if (clean.length > 3) {
        return clean[0] + '*'.repeat(clean.length - 2) + clean[clean.length - 1];
    }
    return '*'.repeat(clean.length);
}

/**
 * Creates a function that censors a given word if it is in the list of censored words.
 */
function createCensorWord(censoredWords: string[]) {
    if (!censoredWords || censoredWords.length === 0) {
        return (word: string) => word;
    }
    const censoredSet = new Set(censoredWords.map(w => w.toLowerCase()));
    return (word: string) => {
        if (!hasCensoredWord(word, censoredSet)) return word;
        const clean = word.replace(PUNCTUATION_REGEX, '').trim();
        const censored = getCensoredVersion(word);
        // Replace only the clean part, preserving punctuation
        return word.replace(clean, censored);
    };
}

/**
 * Applies all subtitle formatting operations in a single pass for efficiency.
 */
export function applyTextFormattingToSubtitle(
    subtitle: Subtitle,
    options: {
        case: 'lowercase' | 'uppercase' | 'titlecase' | 'none';
        removePunctuation: boolean;
        censoredWords: string[];
    }
): Subtitle {
    const censorWord = createCensorWord(options.censoredWords);
    const result = subtitle.words.map(wordObj => {
        let w = censorWord(wordObj.word);
        if (options.removePunctuation) w = removePunctuationFromWord(w);
        w = applyCaseToWord(w, options.case);
        return { ...wordObj, word: w };
    });
    subtitle.text = joinWordsToText(result);
    subtitle.words = result;
    return subtitle;
}


