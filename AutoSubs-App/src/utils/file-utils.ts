// src/utils/fileUtils.ts
import { join, documentDir } from '@tauri-apps/api/path';
import { readTextFile, exists, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { Subtitle, Speaker } from '@/types/interfaces';
import { applyTextFormattingToSubtitle } from './subtitle-formatter';

// Get the transcripts storage directory
export async function getTranscriptsDir(): Promise<string> {
  // Store in user's Documents/AutoSubs-Transcripts for persistence across reinstalls
  const dir = await join(await documentDir(), "AutoSubs-Transcripts");

  // Ensure the directory exists
  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
      console.log('Created transcripts directory:', dir);
    }
  } catch (error) {
    console.error('Failed to create transcripts directory:', error);
    throw new Error(`Failed to create transcripts directory: ${error}`);
  }

  return dir;
}

export async function getTranscriptPath(filename: string): Promise<string> {
  const dir = await getTranscriptsDir();
  return await join(dir, filename);
}

export async function readTranscript(filename: string): Promise<any | null> {
  const filePath = await getTranscriptPath(filename);
  console.log("Reading transcript from:", filePath);
  if (!(await exists(filePath))) {
    console.log("Transcript file not found.");
    return null;
  }
  const contents = await readTextFile(filePath);
  return JSON.parse(contents);
}

// Generate a filename for the transcript based on mode and input
export function generateTranscriptFilename(isStandaloneMode: boolean, selectedFile: string | null, timelineId?: string): string {
  if (isStandaloneMode && selectedFile) {
    // For standalone mode, use the audio file name without extension (cross-platform)
    const fileName = selectedFile.split(/[/\\]/).pop() || 'unknown';
    const nameWithoutExt = fileName.replace(/\.[^/.\\]+$/, '');
    return `${nameWithoutExt}.json`;
  } else if (!isStandaloneMode && timelineId) {
    // For resolve mode, use the timeline name
    return `${timelineId}.json`;
  } else {
    // Fallback
    return `transcript_${Date.now()}.json`;
  }
}

// Helper to interpolate words with timings if missing
function interpolateWordsFromText(text: string, start: number, end: number) {
  // Use match to preserve whitespace as part of each word
  const wordTexts = text.match(/(\s*\S+)/g) || [];
  const wordCount = wordTexts.length;
  const segmentStart = typeof start === 'string' ? parseFloat(start) : start;
  const segmentEnd = typeof end === 'string' ? parseFloat(end) : end;
  const duration = segmentEnd - segmentStart;
  const wordDuration = wordCount > 0 ? duration / wordCount : 0;
  return wordTexts.map((word, idx) => ({
    word,
    start: (segmentStart + idx * wordDuration).toFixed(3),
    end: (segmentStart + (idx + 1) * wordDuration).toFixed(3),
    line_number: 0
  }));
}

// Save a new transcript to JSON file.
// Segments are assumed to already be structurally split by the Rust backend.
// This function only applies content formatting (case, punctuation, censoring).
export async function saveTranscript(
  transcript: any,
  filename: string,
  formatOptions?: {
    case: 'lowercase' | 'uppercase' | 'none' | 'titlecase';
    removePunctuation: boolean;
    censoredWords: string[];
  }
): Promise<{ segments: Subtitle[]; speakers: Speaker[] }> {
  try {
    const storageDir = await getTranscriptsDir();
    const filePath = await join(storageDir, filename);

    console.log('Saving transcript to:', filePath);

    if (transcript.originalSegments) {
      transcript.segments = transcript.originalSegments;
    }

    const originalSegments: Subtitle[] = transcript.segments.map((segment: any, index: number) => {
      let words = segment.words && segment.words.length > 0
        ? segment.words
        : interpolateWordsFromText(segment.text, segment.start, segment.end);
      return {
        id: index.toString(),
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
        speaker_id: segment.speaker_id || undefined,
        words
      };
    });

    // Apply content formatting only (case, punctuation, censoring).
    // Structural splitting (line breaks, cue boundaries) is already done by Rust.
    let segments: Subtitle[] = originalSegments;
    if (formatOptions) {
      segments = segments.map(sub =>
        applyTextFormattingToSubtitle(sub, {
          case: formatOptions.case,
          removePunctuation: formatOptions.removePunctuation,
          censoredWords: formatOptions.censoredWords,
        })
      );
    }

    // Speakers are now aggregated in the Rust backend and included in the transcript
    const speakers: Speaker[] = transcript.speakers || [];

    const transcriptData = {
      filename,
      createdAt: new Date().toISOString(),
      processingTime: transcript.processing_time_sec,
      speakers: speakers,
      originalSegments: originalSegments,
      segments: segments,
    };

    // Save transcript to file
    await writeTextFile(filePath, JSON.stringify(transcriptData, null, 2));
    console.log('Successfully saved transcript to:', filePath);
    return { segments, speakers };
  } catch (error) {
    console.error('Failed to save transcript:', error);
    throw new Error(`Failed to save transcript: ${error}`);
  }
}

// Load transcript and return subtitles
export async function loadTranscriptSubtitles(filename: string): Promise<Subtitle[]> {
  const storageDir = await getTranscriptsDir();
  const filePath = await join(storageDir, filename);

  if (!(await exists(filePath))) {
    console.log("Transcript file not found:", filename);
    return [];
  }

  const contents = await readTextFile(filePath);
  const transcript = JSON.parse(contents);
  return transcript.segments || [];
}

// Update the transcript file for the specified timeline with new speakers or subtitles
export async function updateTranscript(
  filename: string,
  opts: { subtitles?: Subtitle[]; speakers?: Speaker[] }
) {
  const { speakers, subtitles } = opts;

  // if no speakers or subtitles, do nothing
  if (!speakers && !subtitles) return;

  // read current file
  let transcript = await readTranscript(filename);

  // update speakers and subtitles
  if (speakers) {
    transcript.speakers = speakers;
  }
  if (subtitles) {
    transcript.segments = subtitles;
  }

  // write to file
  const filePath = await getTranscriptPath(filename);
  return await writeTextFile(filePath, JSON.stringify(transcript, null, 2));
}