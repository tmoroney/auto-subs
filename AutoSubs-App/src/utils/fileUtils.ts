// src/utils/fileUtils.ts
import { join, appCacheDir, cacheDir } from '@tauri-apps/api/path';
import { readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { Speaker, Subtitle, TopSpeaker } from '@/types/interfaces';

export async function getFullTranscriptPath(timelineId: string, storageDir: string) {
  return await join(storageDir, `${timelineId}.json`);
}

export async function readTranscript(timelineId: string, storageDir: string) {
  const filePath = await join(storageDir, `${timelineId}.json`);
  if (!(await exists(filePath))) {
    console.log("Transcript file not found.");
    return null;
  }
  const contents = await readTextFile(filePath);
  return JSON.parse(contents);
}

// Update the transcript file for the specified timeline with new speakers or subtitles
export async function updateTranscript(storageDir: string, timelineId: string, speakers?: Speaker[], topSpeaker?: TopSpeaker, subtitles?: Subtitle[]) {
  if (!speakers && !subtitles) {
    return;
  }
  // read current file
  let transcript = await readTranscript(timelineId, storageDir);
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
  const filePath = await join(storageDir, `${timelineId}.json`);
  return await writeTextFile(filePath, JSON.stringify(transcript, null, 2));
}