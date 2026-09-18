import { invoke } from '@tauri-apps/api/core';
import { getSubtitleDocumentPath, getAudioExportDir } from '@/utils/file-utils';
import { Speaker, Template, TimelineInfo } from '@/types';

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
 * The bridge is a file mailbox, not HTTP: Resolve 21.1 sandboxes the Lua
 * scripting state (no io/ffi/package/require), so the Rust backend writes a
 * `request.lua` chunk that the Lua server picks up with `loadfile`, and the
 * Lua server answers by writing to `Fusion.prefs` via `SavePrefs()`, which
 * Rust polls. See `src-tauri/src/resolve_bridge.rs`.
 */
async function callResolve(
  payload: Record<string, unknown>,
  timeoutSecs?: number,
): Promise<any> {
  const invokePromise = invoke<string>('resolve_bridge', {
    args: { payload, timeoutSecs },
  });

  let text: string;
  if (timeoutSecs && timeoutSecs > 0) {
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Resolve did not respond within ${timeoutSecs} seconds`)),
        timeoutSecs * 1000,
      ),
    );
    text = await Promise.race([invokePromise, timeoutPromise]);
  } else {
    text = await invokePromise;
  }

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

export async function exportAudio(inputTracks: Array<string>, exportRange: 'entire' | 'inout' = 'entire') {
  const outputDir = await getAudioExportDir();
  const data = await callResolve({
    func: 'ExportAudio',
    outputDir,
    inputTracks,
    exportRange,
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
  return data as TimelineInfo;
}

export async function getTemplates(force = false): Promise<Template[]> {
  // The Lua side caches the template list per project and only re-scans the
  // media pool when its shape changes, but a cold scan of a large pool still
  // costs one marshaled API call per clip — allow a full minute for it.
  const data = await callResolve({ func: 'GetTemplates', force }, 60);
  throwIfError(data, 'GetTemplates');
  return Array.isArray(data) ? data : [];
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

export interface BatchApplyStyleResult {
  ok: boolean;
  matched: number;
  updated: number;
  skipped: number;
  failed: number;
  scanned: number;
  inspectionFailed: number;
  migrated: number;
  warning?: string;
  detail?: string;
  fontSwap?: FontSwapInfo | null;
}

export interface GeneratePreviewResult {
  path: string;
  fontSwap?: FontSwapInfo | null;
}

export async function checkTrackConflicts(
  filename: string,
  outputTrack: string,
): Promise<ConflictInfo> {
  const filePath = await getSubtitleDocumentPath(filename);
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
  const filePath = await getSubtitleDocumentPath(filename);
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

export async function applyStylesToTimeline(
  filename: string,
  targetSpeakerId?: string,
  presetSettings?: Record<string, unknown>,
): Promise<BatchApplyStyleResult> {
  const filePath = await getSubtitleDocumentPath(filename);
  const data = await callResolve({
    func: 'BatchApplyStyle',
    filePath,
    targetSpeakerId,
    presetSettings,
  });
  throwIfError(data, 'BatchApplyStyle');
  return data;
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
  templateName: string,
  exportDir: string,
  presetSettings?: Record<string, unknown>,
  speaker?: Speaker,
  language?: string,
): Promise<GeneratePreviewResult> {
  const data = await callResolve({
    func: 'GeneratePreview',
    speaker,
    templateName,
    exportDir,
    presetSettings,
    language,
  });
  throwIfError(data, 'GeneratePreview');
  return data;
}

export interface PresetEditSaveResult {
  settings?: Record<string, unknown>;
  previewPath?: string;
  previewError?: string;
  error?: string;
}

/**
 * Opens a caption for editing in Resolve: adds a temporary video track, drops
 * an AutoSubs Caption clip on it, seeds it with `initialSettings` and parks the
 * playhead over the middle of the clip. Resolve stays on whichever page the
 * user was on; the inspector shows the macro's controls either way.
 *
 * The clip stays on the timeline until `savePresetEdit` or `cancelPresetEdit`,
 * so the user can tweak the macro's inspector for as long as they like and
 * watch the animation play in Resolve's viewer.
 */
export async function openPresetEdit(
  initialSettings?: Record<string, unknown>,
): Promise<{ ok?: true; error?: string }> {
  return callResolve({ func: 'OpenPresetEdit', initialSettings });
}

/**
 * Reads the open caption's current input values, renders its thumbnail and
 * closes the session. Always closes, so the caller can assume the temporary
 * clip is gone whichever way this returns.
 */
export async function savePresetEdit(
  exportDir?: string,
): Promise<PresetEditSaveResult> {
  return callResolve({ func: 'SavePresetEdit', exportDir });
}

/** Closes the session without reading anything. Safe with no session open. */
export async function cancelPresetEdit(): Promise<{ ok?: true; error?: string }> {
  return callResolve({ func: 'CancelPresetEdit' });
}

export async function ensureCaptionPreviewDir(): Promise<string> {
  return invoke<string>('ensure_caption_preview_dir');
}
