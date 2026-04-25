import { invoke } from '@tauri-apps/api/core';
import { getTranscriptPath, getAudioExportDir } from '@/utils/file-utils';
import { Speaker } from '@/types';

/**
 * Error thrown when the AutoSubs Lua server (inside Resolve) reports a failure
 * in its response body. Carries both the short user-facing message and the
 * underlying Resolve error so the frontend error dialog can surface both.
 */
export class ResolveApiError extends Error {
  public detail?: string;
  public func?: string;

  constructor(message: string, detail?: string, func?: string) {
    super(message);
    this.name = "ResolveApiError";
    this.detail = detail;
    this.func = func;
  }
}

/**
 * Inspect a Lua-server JSON response and throw if it indicates failure. The
 * Lua server returns `{ error: "<short>", detail: "<raw>" }` (or
 * `{ error: true, message, detail }` for legacy handlers) on failure; on
 * success it returns handler-specific shapes that never have a non-empty
 * `error` field.
 */
function throwIfError(data: any, fallbackFunc?: string): void {
  if (data == null || typeof data !== "object") return;
  const err = (data as { error?: unknown }).error;
  if (!err) return;

  // Two supported shapes:
  //   { error: "short reason", detail?: "..." }
  //   { error: true, message: "short reason", detail?: "..." }
  const shortMessage =
    typeof err === "string"
      ? err
      : typeof (data as any).message === "string"
      ? (data as any).message
      : "Resolve reported an error";
  const detail =
    typeof (data as any).detail === "string"
      ? (data as any).detail
      : undefined;
  const func =
    typeof (data as any).func === "string"
      ? (data as any).func
      : fallbackFunc;

  throw new ResolveApiError(shortMessage, detail, func);
}

/**
 * Posts `payload` to the AutoSubs Lua server via a small Rust shim
 * (`resolve_bridge`) and returns the parsed JSON body.
 *
 * We used to call `@tauri-apps/plugin-http` directly, but its response-body
 * stream was observed to hang indefinitely against this specific server's
 * short `Connection: close` responses (headers would arrive with `200 OK`
 * but neither `.json()` nor `.text()` would ever resolve). Routing through
 * Rust/reqwest bypasses that plugin entirely.
 */
async function callResolve(
  payload: Record<string, unknown>,
  timeoutSecs?: number,
): Promise<any> {
  const text = await invoke<string>('resolve_bridge', {
    args: { payload, timeoutSecs },
  });
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('[resolve-api] Failed to parse JSON response:', err, text);
    throw new Error(
      `Invalid JSON response from AutoSubs server: ${text.slice(0, 200)}`,
    );
  }
}

export async function exportAudio(inputTracks: Array<string>) {
  const outputDir = await getAudioExportDir();
  const data = await callResolve({
    func: 'ExportAudio',
    outputDir,
    inputTracks,
  });

  // Surface any Resolve-side error with underlying detail so the frontend
  // error dialog can show it to the user.
  throwIfError(data, 'ExportAudio');

  // New non-blocking API returns started: true instead of timeline data.
  if (!data.started) {
    throw new ResolveApiError(
      'Export did not start successfully',
      typeof data.detail === 'string' ? data.detail : undefined,
      'ExportAudio',
    );
  }

  return data;
}

export async function jumpToTime(seconds: number) {
  return callResolve({ func: 'JumpToTime', seconds });
}

export async function getTimelineInfo() {
  const data = await callResolve({ func: 'GetTimelineInfo' });
  if (!data.timelineId) {
    throw new Error('No timeline detected in Resolve.');
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

// Emitted by the Resolve Lua server when the AutoSubs Caption macro's default
// font was auto-swapped to something that supports the transcript's script
// (e.g. Japanese). `to` is null when the script is known but no candidate font
// is installed on the host (`missing: true`) so the UI can warn the user.
export interface FontSwapInfo {
  from: string;
  to: string | null;
  language: string;
  script: string;
  missing: boolean;
}

export interface AddSubtitlesResult {
  message?: string;
  result?: {
    ok?: boolean;
    fontSwap?: FontSwapInfo | null;
  } | false;
}

export interface GeneratePreviewResult {
  path: string;
  fontSwap?: FontSwapInfo | null;
}

export async function checkTrackConflicts(
  filename: string,
  outputTrack: string,
): Promise<ConflictInfo> {
  const filePath = await getTranscriptPath(filename);
  return callResolve({
    func: 'CheckTrackConflicts',
    filePath,
    trackIndex: outputTrack,
  });
}

export async function addSubtitlesToTimeline(
  filename: string,
  currentTemplate: string,
  outputTrack: string,
  conflictMode: ConflictMode = null,
  presetSettings?: Record<string, unknown>,
): Promise<AddSubtitlesResult> {
  const filePath = await getTranscriptPath(filename);
  const data = await callResolve({
    func: 'AddSubtitles',
    filePath,
    templateName: currentTemplate,
    trackIndex: outputTrack,
    conflictMode,
    presetSettings,
  });
  // Top-level failure (e.g. the server-side handler's pcall caught an error).
  throwIfError(data, 'AddSubtitles');
  // Nested failure: `AddSubtitles()` returns `{ error, detail }` inside `result`.
  if (data && typeof data === 'object' && data.result) {
    throwIfError(data.result, 'AddSubtitles');
  }
  return data;
}

export async function closeResolveLink() {
  return callResolve({ func: 'Exit' });
}

export async function getExportProgress() {
  return callResolve({ func: 'GetExportProgress' });
}

export async function cancelExport() {
  return callResolve({ func: 'CancelExport' });
}

export async function getRenderJobStatus() {
  return callResolve({ func: 'GetRenderJobStatus' });
}

export async function generatePreview(
  speaker: Speaker,
  templateName: string,
  exportPath: string,
  presetSettings?: Record<string, unknown>,
  language?: string,
): Promise<GeneratePreviewResult> {
  const data = await callResolve({
    func: 'GeneratePreview',
    speaker,
    templateName,
    exportPath,
    presetSettings,
    language,
  });
  throwIfError(data, 'GeneratePreview');
  return data;
}

// Starts an interactive caption-preset edit session in Resolve. Adds a new
// video track, drops an AutoSubs Caption clip, opens the Fusion page and
// (optionally) applies existing preset settings to the tool so the user can
// tweak them in the Fusion inspector.
export async function startPresetEdit(
  initialSettings?: Record<string, unknown>,
): Promise<{ ok?: true; error?: string }> {
  return callResolve({ func: 'StartPresetEdit', initialSettings });
}

// Reads the AutoSubs tool's current input values via the macro's GetInputValues
// helper, then tears down the preset-edit clip/track.
export async function capturePresetSettings(): Promise<{
  settings?: Record<string, unknown>;
  error?: string;
}> {
  return callResolve({ func: 'CapturePresetSettings' });
}

// Tears down the preset-edit clip/track without capturing. Safe to call with
// no active session.
export async function cancelPresetEdit(): Promise<{ ok?: true; error?: string }> {
  return callResolve({ func: 'CancelPresetEdit' });
}
