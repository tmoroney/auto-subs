import { invoke } from "@tauri-apps/api/core";
import { Subtitle, FormattingOptions, BackendSegment } from "@/types/interfaces";

/**
 * Convert frontend Subtitle format to backend segment format.
 */
function subtitleToBackendSegment(subtitle: Subtitle): BackendSegment {
    return {
        start: subtitle.start,
        end: subtitle.end,
        text: subtitle.text,
        speaker_id: subtitle.speaker_id,
        words: subtitle.words?.map(w => ({
            word: w.word,
            start: w.start,
            end: w.end,
            probability: w.probability,
        })),
    };
}

/**
 * Convert backend segment format to frontend Subtitle format.
 */
function backendSegmentToSubtitle(segment: BackendSegment, id: number): Subtitle {
    // Compute line_number for each word based on newlines in the segment text.
    // The Rust backend joins multi-line cues with '\n', so we walk the text to
    // figure out which line each word belongs to.
    const lines = segment.text.split('\n');
    const wordLineMap: number[] = [];
    if (segment.words) {
        let wordIdx = 0;
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineWords = lines[lineNum].trim().split(/\s+/).filter(Boolean);
            for (let i = 0; i < lineWords.length && wordIdx < segment.words.length; i++) {
                wordLineMap.push(lineNum);
                wordIdx++;
            }
        }
        // If there are remaining words (edge case), assign them to the last line
        while (wordLineMap.length < segment.words.length) {
            wordLineMap.push(lines.length - 1);
        }
    }

    return {
        id,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        speaker_id: segment.speaker_id,
        words: segment.words?.map((w, i) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            probability: w.probability,
            line_number: wordLineMap[i] ?? 0,
        })) ?? [],
    };
}

/**
 * Reformat subtitles using the Rust formatting engine.
 * This allows changing formatting options (CPL, max lines, etc.) without re-transcribing.
 * 
 * @param subtitles - The subtitles to reformat
 * @param options - Formatting options to apply
 * @returns Reformatted subtitles
 */
export async function reformatSubtitles(
    subtitles: Subtitle[],
    options: FormattingOptions
): Promise<Subtitle[]> {
    // Convert to backend format
    const segments: BackendSegment[] = subtitles.map(subtitleToBackendSegment);

    // Call the Rust backend
    const reformatted = await invoke<BackendSegment[]>("reformat_subtitles", {
        segments,
        options,
    });

    // Convert back to frontend format
    return reformatted.map((seg, idx) => backendSegmentToSubtitle(seg, idx));
}

/**
 * Get default formatting options based on current settings.
 */
export function getDefaultFormattingOptions(settings: {
    maxLinesPerSubtitle: number;
    language: string;
}): FormattingOptions {
    return {
        maxLines: settings.maxLinesPerSubtitle,
        textDensity: "standard",
        language: settings.language,
    };
}
