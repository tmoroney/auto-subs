// src/api/resolveApi.ts
import { fetch } from '@tauri-apps/plugin-http';
import { downloadDir } from '@tauri-apps/api/path';

const resolveAPI = "http://localhost:56002/";

export async function exportAudio(inputTracks: Array<string>) {
  const outputDir = await downloadDir();
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      func: "ExportAudio",
      outputDir,
      inputTracks,
    }),
  });
  const data = await response.json();
  if (!data.timeline) {
    throw new Error("No timeline detected in Resolve.");
  }
  return data;
}

export async function jumpToTime(start: number, markIn: number) {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "JumpToTime", start, markIn }),
  });
  return response.json();
}

export async function getTimelineInfo() {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "GetTimelineInfo" }),
  });
  const data = await response.json();
  if (!data.timelineId) {
    throw new Error("No timeline detected in Resolve.");
  }
  return data;
}

export async function addSubtitles(filePath: string, currentTemplate: string, outputTrack: string) {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      func: "AddSubtitles",
      filePath,
      templateName: currentTemplate,
      trackIndex: outputTrack,
    }),
  });
  return response.json();
}

export async function closeResolveLink() {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "Exit" }),
  });
  return response.json();
}