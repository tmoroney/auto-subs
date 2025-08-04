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
        if (options.maxWordsPerLine && words.length <= options.maxWordsPerLine) {
            result.push(subtitle);
            continue;
        }

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

        // 2. Group lines into subtitles (each subtitle has up to maxLinesPerSubtitle lines)
        for (let i = 0; i < lines.length; i += options.maxLinesPerSubtitle) {
            const subtitleLines = lines.slice(i, i + options.maxLinesPerSubtitle);
            const subtitleWords = subtitleLines.flat();
            result.push({
                ...subtitle,
                words: subtitleWords,
                text: joinWordsToText(subtitleWords),
                start: subtitleWords[0].start,
                end: subtitleWords[subtitleWords.length - 1].end,
            });
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
export function applyTextFormattingToSubtitle(
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

    subtitle.text = joinWordsToText(result);
    subtitle.words = result;

    return subtitle;
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
    for (let subtitle of processedSubtitles) {
        result.push(applyTextFormattingToSubtitle(subtitle, options));
    }

    return result;
}

