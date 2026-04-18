import { fetch } from '@tauri-apps/plugin-http';
import { downloadDir } from '@tauri-apps/api/path';
import { getTranscriptPath } from '@/utils/file-utils';
import { Speaker } from '@/types';

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

export interface ConflictInfo {
  hasConflicts: boolean;
  conflictingClips?: Array<{ start: number; end: number; name: string }>;
  trackName?: string;
  subtitleRange?: { start: number; end: number };
  totalConflicts?: number;
  trackExists?: boolean;
  message?: string;
  error?: string;
}

export type ConflictMode = 'replace' | 'skip' | 'new_track' | null;

export async function checkTrackConflicts(filename: string, outputTrack: string): Promise<ConflictInfo> {
  const filePath = await getTranscriptPath(filename);
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      func: "CheckTrackConflicts",
      filePath,
      trackIndex: outputTrack,
    }),
  });
  return response.json();
}

export async function addSubtitlesToTimeline(
  filename: string,
  currentTemplate: string,
  outputTrack: string,
  conflictMode: ConflictMode = null,
  presetSettings?: Record<string, unknown>,
) {
  const filePath = await getTranscriptPath(filename);
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      func: "AddSubtitles",
      filePath,
      templateName: currentTemplate,
      trackIndex: outputTrack,
      conflictMode,
      presetSettings,
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

export async function generatePreview(
  speaker: Speaker,
  templateName: string,
  exportPath: string,
  presetSettings?: Record<string, unknown>,
) {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "GeneratePreview", speaker, templateName, exportPath, presetSettings }),
  });
  return response.json();
}

// Starts an interactive caption-preset edit session in Resolve. Adds a new
// video track, drops an AutoSubs Caption clip, opens the Fusion page and
// (optionally) applies existing preset settings to the tool so the user can
// tweak them in the Fusion inspector.
export async function startPresetEdit(
  initialSettings?: Record<string, unknown>,
): Promise<{ ok?: true; error?: string }> {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: 'StartPresetEdit', initialSettings }),
  });
  return response.json();
}

// Reads the AutoSubs tool's current input values via the macro's GetInputValues
// helper, then tears down the preset-edit clip/track.
export async function capturePresetSettings(): Promise<{ settings?: Record<string, unknown>; error?: string }> {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: 'CapturePresetSettings' }),
  });
  return response.json();
}

// Tears down the preset-edit clip/track without capturing. Safe to call with
// no active session.
export async function cancelPresetEdit(): Promise<{ ok?: true; error?: string }> {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: 'CancelPresetEdit' }),
  });
  return response.json();
}
