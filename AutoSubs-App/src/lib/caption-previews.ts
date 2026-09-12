import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { ensureCaptionPreviewDir } from "@/api/resolve-api";
import { exists, remove, rename } from "@tauri-apps/plugin-fs";

export const CAPTION_PREVIEW_DIR = "caption-previews";

export async function storePresetPreview(
  presetId: string,
  renderedPath: string,
): Promise<string> {
  const dir = await ensureCaptionPreviewDir();
  const filename = `${presetId}.png`;
  const target = await join(dir, filename);
  if (await exists(target)) {
    await remove(target);
  }
  await rename(renderedPath, target);
  return filename;
}

export async function deletePresetPreview(filename: string): Promise<void> {
  try {
    const dir = await ensureCaptionPreviewDir();
    await remove(await join(dir, filename));
  } catch {
    // Preview cleanup is best-effort.
  }
}

export async function previewSrc(
  filename: string,
  cacheKey: string,
): Promise<string> {
  const dir = await ensureCaptionPreviewDir();
  const path = await join(dir, filename);
  return `${convertFileSrc(path)}?v=${encodeURIComponent(cacheKey)}`;
}
