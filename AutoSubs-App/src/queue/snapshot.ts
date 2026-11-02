import type { Settings, TranscriptionOptions } from "../types.ts";

/** Create a self-contained snapshot from effective standalone settings. */
export function createOptionsSnapshot(
  settings: Settings,
  modelId: string,
  sourcePath: string,
  censorWords: string[],
  allowInvalid = false,
): TranscriptionOptions {
  if (!modelId || !sourcePath) throw new Error("A source and model are required");
  if (!allowInvalid && settings.translate && settings.language !== "auto" && settings.language === settings.targetLanguage) {
    throw new Error("Source and target language are the same");
  }
  const maxSpeakers = typeof settings.maxSpeakers === "number" && Number.isFinite(settings.maxSpeakers)
    ? Math.floor(settings.maxSpeakers) || null
    : null;
  return {
    audioPath: sourcePath,
    offset: 0,
    model: modelId,
    lang: settings.language,
    translate: settings.translate,
    targetLanguage: settings.targetLanguage,
    enableDtw: settings.enableDTW,
    enableForcedAlignment: settings.enableForcedAlignment && !settings.translate,
    enableGpu: settings.enableGpu,
    enableVad: settings.enableVad,
    enableDiarize: settings.enableDiarize,
    maxSpeakers,
    diarizeBackend: settings.diarizeBackend,
    density: settings.textDensity,
    maxLines: Math.max(1, Math.floor(settings.maxLinesPerSubtitle ?? 1)),
    customMaxCharsPerLine: settings.textDensity === "custom" && settings.customDensityUnit !== "words"
      ? Math.max(1, Math.floor(settings.customMaxCharsPerLine ?? 1)) : undefined,
    customMaxWordsPerLine: settings.textDensity === "custom" && settings.customDensityUnit === "words"
      ? Math.max(1, Math.floor(settings.customMaxWordsPerLine ?? 1)) : undefined,
    textCase: settings.textCase,
    removePunctuation: settings.removePunctuation,
    censoredWords: settings.enableCensor ? [...censorWords] : [],
    censorStyle: settings.censorStyle,
    customPrompt: settings.customPrompt.trim() || undefined,
  };
}
