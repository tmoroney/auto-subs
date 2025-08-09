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

function applyCaseToWord(word: string, mode: 'lowercase' | 'uppercase' | 'none'): string {
    if (mode === 'lowercase') return word.toLocaleLowerCase();
    if (mode === 'uppercase') return word.toLocaleUpperCase();
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
        case: 'lowercase' | 'uppercase' | 'none';
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

function splitSubtitles(subtitles: Subtitle[], options: {
    splitOnPunctuation: boolean;
    maxLinesPerSubtitle: number;
    maxCharsPerLine?: number;
    maxWordsPerLine?: number;
}): Subtitle[] {
    const result: Subtitle[] = [];

    // Ensure none of the options are set to 0 (not allowed)
    options.maxWordsPerLine = options.maxWordsPerLine ? (options.maxWordsPerLine === 0 ? undefined : options.maxWordsPerLine) : undefined;
    options.maxCharsPerLine = options.maxCharsPerLine ? (options.maxCharsPerLine === 0 ? undefined : options.maxCharsPerLine) : undefined;
    options.maxLinesPerSubtitle = options.maxLinesPerSubtitle && options.maxLinesPerSubtitle !== 0 ? options.maxLinesPerSubtitle : 1;

    for (const subtitle of subtitles) {
        const words = subtitle.words;

        // 1. Split words into lines, assigning line_number
        let lines: Word[][] = [];
        let currentLine: Word[] = [];
        let lineNumber = 0;
        let currentLineCharCount = 0;
        for (let i = 0; i < words.length; i++) {
            const word: Word = { ...words[i], line_number: lineNumber };
            const wordText = word.word;
            // Calculate char count if we add this word (including space if not first word)
            const space = currentLine.length > 0 ? 1 : 0;
            const prospectiveCharCount = currentLineCharCount + wordText.length + space;
            const wouldExceedCharLimit = options.maxCharsPerLine !== undefined && prospectiveCharCount > options.maxCharsPerLine;
            const isLineFull = options.maxWordsPerLine !== undefined && currentLine.length === options.maxWordsPerLine;
            const isLastWord = i === words.length - 1;

            // Check if we must split due to hard limits
            if ((isLineFull || wouldExceedCharLimit) && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = [];
                lineNumber++;
                currentLineCharCount = 0;
            }
            
            // Add the current word to the line
            currentLine.push({ ...word, line_number: lineNumber });
            currentLineCharCount += (currentLine.length > 1 ? 1 : 0) + wordText.length;
            
            // Check if we should split on punctuation after adding the word
            const shouldSplitOnPunctuation = options.splitOnPunctuation && 
                /[.!?;:]$/.test(wordText.trim());

            if (shouldSplitOnPunctuation) {
                lines.push(currentLine);
                currentLine = [];
                lineNumber++;
                currentLineCharCount = 0;
            }

            if (isLastWord && currentLine.length > 0) {
                lines.push(currentLine);
            }
        }

        let subtitleIndex = 0

        // 2. Group lines into subtitles (each subtitle has up to maxLinesPerSubtitle lines)
        for (let i = 0; i < lines.length; i += options.maxLinesPerSubtitle) {
            const subtitleLines = lines.slice(i, i + options.maxLinesPerSubtitle);
            const subtitleWords = subtitleLines.flat();
            result.push({
                ...subtitle,
                id: subtitleIndex,
                words: subtitleWords,
                text: joinWordsToText(subtitleWords),
                start: subtitleWords[0].start,
                end: subtitleWords[subtitleWords.length - 1].end,
            });
            subtitleIndex++
        }
    }

    return result;
}

export function splitAndFormatSubtitles(
    subtitles: Subtitle[],
    options: {
        case: 'lowercase' | 'uppercase' | 'none';
        removePunctuation: boolean;
        splitOnPunctuation: boolean;
        censoredWords: string[];
        maxLinesPerSubtitle: number;
        maxWordsPerLine?: number;
        maxCharsPerLine?: number;
    }
): Subtitle[] {
    console.log("Splitting and formatting subtitles with options:", options);
    // split subtitles into lines
    let processedSubtitles: Subtitle[] = splitSubtitles(subtitles, options);

    // Process words array
    let result: Subtitle[] = [];

    // Always apply text formatting to reconstruct text with proper line breaks
    for (let subtitle of processedSubtitles) {
        result.push(applyTextFormattingToSubtitle(subtitle, options));
    }

    // Finally reset ids
    result.forEach((subtitle, index) => {
        subtitle.id = index;
    });

    return result;
}

