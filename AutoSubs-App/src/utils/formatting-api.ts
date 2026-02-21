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
    return {
        id,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        speaker_id: segment.speaker_id,
        words: segment.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            probability: w.probability,
            line_number: 0, // Will be recalculated based on newlines in text
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
