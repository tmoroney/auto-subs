// src/api/resolveApi.ts
import { fetch } from '@tauri-apps/plugin-http';
import { downloadDir } from '@tauri-apps/api/path';
import { getTranscriptPath } from '@/utils/fileUtils';
import { Speaker } from '@/types/interfaces';

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
  
  // Check for errors in starting export
  if (data.error) {
    throw new Error(data.message || "Failed to start audio export");
  }
  
  // New non-blocking API returns started: true instead of timeline data
  if (!data.started) {
    throw new Error("Export did not start successfully");
  }
  
  return data;
}

export async function jumpToTime(seconds: number) {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "JumpToTime", seconds }),
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

export async function addSubtitlesToTimeline(filename: string, currentTemplate: string, outputTrack: string) {
  const filePath = await getTranscriptPath(filename);
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

export async function getExportProgress() {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "GetExportProgress" }),
  });
  return response.json();
}

export async function cancelExport() {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "CancelExport" }),
  });
  return response.json();
}

export async function getRenderJobStatus() {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "GetRenderJobStatus" }),
  });
  return response.json();
}

export async function generatePreview(speaker: Speaker, templateName: string, exportPath: string) {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "GeneratePreview", speaker, templateName, exportPath }),
  });
  return response.json();
}
