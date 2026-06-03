import { ResolveApiError } from "@/api/resolve-api";

export const SUPPORTED_MEDIA_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "aac",
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "mpeg",
  "mpg",
  "m4v",
  "3gp",
  "aiff",
  "opus",
  "alac",
];

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "mpeg",
  "mpg",
  "m4v",
  "3gp",
]);

export function isVideoExtension(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext ? VIDEO_EXTENSIONS.has(ext) : false;
}

export function isSupportedMediaFile(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension ? SUPPORTED_MEDIA_EXTENSIONS.includes(extension) : false;
}

const LEGACY_TERMS_HEADER = "Key terms and preferred spellings:";
const LEGACY_CONTEXT_HEADER = "Context / style note:";

// Strips old two-section headers from prompts saved before the UI was simplified.
export function migrateCustomPrompt(value: string): string {
  return value
    .replace(new RegExp(`${LEGACY_TERMS_HEADER}\\n?`, "g"), "")
    .replace(new RegExp(`${LEGACY_CONTEXT_HEADER}\\n?`, "g"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ProcessingStep {
  id?: string;
  title: string;
  description: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

/**
 * Normalise any thrown value (native `Error`, `ResolveApiError`, plain
 * strings from Tauri `invoke`, unknown) into the fields the error dialog
 * expects. `ResolveApiError` carries a richer `detail` from Resolve which
 * we surface in the dialog's collapsible "Show details" section.
 */
export function describeError(
  error: unknown,
  fallbackTitle: string,
): { title: string; message: string; detail?: string } {
  if (error instanceof ResolveApiError) {
    return {
      title: fallbackTitle,
      message: error.message,
      detail: error.detail,
    };
  }
  if (error instanceof Error) {
    return { title: fallbackTitle, message: error.message || fallbackTitle };
  }
  if (typeof error === "string") {
    return { title: fallbackTitle, message: error };
  }
  return { title: fallbackTitle, message: fallbackTitle };
}
