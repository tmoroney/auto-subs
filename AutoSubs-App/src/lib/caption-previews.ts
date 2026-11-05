import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { exists, remove, rename } from "@tauri-apps/plugin-fs";

export async function ensureCaptionPreviewDir(): Promise<string> {
  return invoke<string>("ensure_caption_preview_dir");
}

export const CAPTION_PREVIEW_DIR = "caption-previews";

/**
 * Validates that a preset ID is safe to use in file paths.
 * Rejects path traversal sequences, directory separators, control chars, or unexpected formats.
 */
export function isValidPresetId(presetId: string | null | undefined): boolean {
  if (!presetId || typeof presetId !== "string") return false;
  const trimmed = presetId.trim();
  if (!trimmed || trimmed.length > 128) return false;
  // Disallow traversal, slashes, null bytes or control characters
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || /[\x00-\x1f\x7f]/.test(trimmed)) {
    return false;
  }
  // Preset IDs are alphanumeric with hyphens/underscores
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Validates that a preset preview filename is safe and points strictly to a PNG file.
 */
export function isValidPresetPreviewFilename(filename: string | null | undefined): boolean {
  if (!filename || typeof filename !== "string") return false;
  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 132 || !trimmed.endsWith(".png") || trimmed === ".png") {
    return false;
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\") || /[\x00-\x1f\x7f]/.test(trimmed)) {
    return false;
  }
  const stem = trimmed.slice(0, -4);
  return isValidPresetId(stem);
}

export async function storePresetPreview(
  presetId: string,
  renderedPath: string,
): Promise<string> {
  // Sentinel Security: Prevent path traversal in presetId
  if (!isValidPresetId(presetId)) {
    throw new Error(`[file-security] Invalid preset id: "${presetId}"`);
  }

  const dir = await ensureCaptionPreviewDir();
  const filename = `${presetId.trim()}.png`;
  const target = await join(dir, filename);
  if (await exists(target)) {
    await remove(target);
  }
  await rename(renderedPath, target);
  return filename;
}

export async function deletePresetPreview(filename: string): Promise<void> {
  // Sentinel Security: Reject invalid preview filenames to prevent path traversal
  if (!isValidPresetPreviewFilename(filename)) {
    return;
  }

  try {
    const dir = await ensureCaptionPreviewDir();
    await remove(await join(dir, filename.trim()));
  } catch {
    // Preview cleanup is best-effort.
  }
}

export async function previewSrc(
  filename: string,
  cacheKey: string,
): Promise<string> {
  // Sentinel Security: Validate preview filename before reading/converting file src
  if (!isValidPresetPreviewFilename(filename)) {
    throw new Error(`[file-security] Invalid preset preview filename: "${filename}"`);
  }

  const dir = await ensureCaptionPreviewDir();
  const path = await join(dir, filename.trim());
  return `${convertFileSrc(path)}?v=${encodeURIComponent(cacheKey)}`;
}
