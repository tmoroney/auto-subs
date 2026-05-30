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

const CUSTOM_PROMPT_TERMS_HEADER = "Key terms and preferred spellings:";
const CUSTOM_PROMPT_CONTEXT_HEADER = "Context / style note:";
const CUSTOM_PROMPT_EXAMPLE_TERMS = "OpenAI, DaVinci Resolve, SubSlate, FFmpeg";
const CUSTOM_PROMPT_EXAMPLE_CONTEXT =
  "This is a tutorial about editing subtitles in DaVinci Resolve. Prefer “AutoSubs”, not “Auto Subs”.";

function normalizeExampleText(value: string): string {
  return value.replace(/"/g, "“");
}

function scrubExampleValue(value: string, example: string): string {
  return normalizeExampleText(value) === normalizeExampleText(example)
    ? ""
    : value;
}

export function parseCustomPrompt(value: string): {
  terms: string;
  context: string;
} {
  const prompt = value;
  if (!prompt.trim()) return { terms: "", context: "" };

  const termsIndex = prompt.indexOf(CUSTOM_PROMPT_TERMS_HEADER);
  const contextIndex = prompt.indexOf(CUSTOM_PROMPT_CONTEXT_HEADER);

  if (termsIndex === -1 && contextIndex === -1) {
    return { terms: prompt, context: "" };
  }

  let terms = "";
  let context = "";

  if (termsIndex !== -1) {
    const termsStart = termsIndex + CUSTOM_PROMPT_TERMS_HEADER.length;
    let termsEnd = contextIndex === -1 ? prompt.length : contextIndex;
    if (contextIndex !== -1) {
      const doubleNewlineBeforeContext = prompt.lastIndexOf(
        "\n\n",
        contextIndex,
      );
      if (doubleNewlineBeforeContext > termsStart) {
        termsEnd = doubleNewlineBeforeContext;
      }
    }
    terms = prompt.slice(termsStart, termsEnd);
    if (terms.startsWith("\n")) {
      terms = terms.slice(1);
    }
  }

  if (contextIndex !== -1) {
    const contextStart = contextIndex + CUSTOM_PROMPT_CONTEXT_HEADER.length;
    context = prompt.slice(contextStart);
    if (context.startsWith("\n")) {
      context = context.slice(1);
    }
  }

  return {
    terms: scrubExampleValue(terms, CUSTOM_PROMPT_EXAMPLE_TERMS),
    context: scrubExampleValue(context, CUSTOM_PROMPT_EXAMPLE_CONTEXT),
  };
}

export function composeCustomPrompt(terms: string, context: string): string {
  const sections: string[] = [];

  if (terms.length > 0) {
    sections.push(`${CUSTOM_PROMPT_TERMS_HEADER}\n${terms}`);
  }

  if (context.length > 0) {
    sections.push(`${CUSTOM_PROMPT_CONTEXT_HEADER}\n${context}`);
  }

  return sections.join("\n\n");
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
