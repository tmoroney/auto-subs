// src/utils/fileUtils.ts
import { join, documentDir } from '@tauri-apps/api/path';
import { readTextFile, exists, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { Speaker, Subtitle, TopSpeaker } from '@/types/interfaces';

export async function getFullTranscriptPath(timelineId: string): Promise<string> {
  const dir = await getTranscriptsDir();
  return await join(dir, `${timelineId}.json`);
}

export async function readTranscript(timelineId: string): Promise<any | null> {
  const filePath = await getFullTranscriptPath(timelineId);
  if (!(await exists(filePath))) {
    console.log("Transcript file not found.");
    return null;
  }
  const contents = await readTextFile(filePath);
  return JSON.parse(contents);
}

// Update the transcript file for the specified timeline with new speakers or subtitles
export async function updateTranscript(timelineId: string, speakers?: Speaker[], topSpeaker?: TopSpeaker, subtitles?: Subtitle[]) {
  if (!speakers && !subtitles) {
    return;
  }
  // read current file
  let transcript = await readTranscript(timelineId);
  if (!transcript) transcript = {};
  if (topSpeaker) {
    transcript.topSpeaker = topSpeaker;
  }
  if (speakers) {
    transcript.speakers = speakers;
  }
  if (subtitles) {
    transcript.segments = subtitles;
  }

  // write to file
  const filePath = await getFullTranscriptPath(timelineId);
  return await writeTextFile(filePath, JSON.stringify(transcript, null, 2));
}

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

// Generate a filename for the transcript based on mode and input
export function generateTranscriptFilename(isStandaloneMode: boolean, selectedFile: string | null, timelineName?: string): string {
  if (isStandaloneMode && selectedFile) {
    // For standalone mode, use the audio file name without extension
    const fileName = selectedFile.split('/').pop() || 'unknown';
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    return `${nameWithoutExt}.json`;
  } else if (!isStandaloneMode && timelineName) {
    // For resolve mode, use the timeline name
    return `${timelineName}.json`;
  } else {
    // Fallback
    return `transcript_${Date.now()}.json`;
  }
}

// Save a new transcript to JSON file
export async function saveTranscript(transcript: any, filename: string): Promise<void> {
  try {
    const storageDir = await getTranscriptsDir();
    const filePath = await join(storageDir, filename);
    
    console.log('Saving transcript to:', filePath);
    
    // Transform transcript segments to subtitle format
    const subtitles: Subtitle[] = transcript.segments.map((segment: any, index: number) => ({
      id: index.toString(),
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
      speaker: segment.speaker || undefined,
      words: segment.words || []
    }));

    const transcriptData = {
      filename,
      createdAt: new Date().toISOString(),
      processingTime: transcript.processing_time_sec,
      segments: subtitles,
      speakers: [], // Will be populated when speakers are edited
      topSpeaker: null // Will be populated when speakers are analyzed
    };

    await writeTextFile(filePath, JSON.stringify(transcriptData, null, 2));
    console.log('Successfully saved transcript to:', filePath);
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

// Update a specific caption in the transcript file
export async function updateCaptionInTranscript(filename: string, updatedCaption: { id: number; start: number; end: number; text: string; speaker?: string; words?: any[] }): Promise<void> {
  try {
    const storageDir = await getTranscriptsDir();
    const filePath = await join(storageDir, filename);
    
    console.log('Updating caption in file:', filePath);
    
    if (!(await exists(filePath))) {
      console.log("Transcript file not found:", filename);
      return;
    }
  
  const contents = await readTextFile(filePath);
  const transcript = JSON.parse(contents);
  
  if (!transcript.segments) {
    console.log("No segments found in transcript");
    return;
  }
  
  // Find and update the specific caption
  const captionIndex = transcript.segments.findIndex((segment: any) => segment.id === updatedCaption.id.toString());
  if (captionIndex !== -1) {
    transcript.segments[captionIndex] = {
      ...transcript.segments[captionIndex],
      // Update with the new caption data
      id: updatedCaption.id.toString(),
      start: updatedCaption.start,
      end: updatedCaption.end,
      text: updatedCaption.text,
      speaker: updatedCaption.speaker,
      words: updatedCaption.words || []
    };
    
    // Update the modification timestamp
    transcript.lastModified = new Date().toISOString();
    
    // Save the updated transcript
    await writeTextFile(filePath, JSON.stringify(transcript, null, 2));
    console.log("Caption updated in transcript file:", filename);
  } else {
    console.log("Caption not found in transcript:", updatedCaption.id);
  }
  } catch (error) {
    console.error('Failed to update caption in transcript:', error);
    throw new Error(`Failed to update caption: ${error}`);
  }
}

// Get the current transcript filename based on mode and context
export async function getCurrentTranscriptFilename(isStandaloneMode: boolean, selectedFile: string | null, timelineName?: string): Promise<string | null> {
  if (isStandaloneMode && selectedFile) {
    return generateTranscriptFilename(isStandaloneMode, selectedFile, timelineName);
  } else if (!isStandaloneMode && timelineName) {
    return generateTranscriptFilename(isStandaloneMode, selectedFile, timelineName);
  }
  return null;
}