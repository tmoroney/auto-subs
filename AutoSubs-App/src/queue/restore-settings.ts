import type { Settings, TranscriptionOptions } from "../types.ts";

export type RestoredQueueSettings =
  | { ok: true; patch: Partial<Settings>; censoredWordsOverride: string[] }
  | { ok: false; reason: "missing_model"; modelId: string };

/**
 * Translate effective queued options back into the main form's settings.
 *
 * Censor list membership is not captured by TranscriptionOptions: only the
 * final merged words are saved. Keep those words in the returned per-item
 * override rather than replacing the user's persisted custom words or list
 * selections. The caller must use the override when saving an unchanged
 * censor configuration and discard it if those controls are edited.
 *
 * A queued item with no censored words may originally have had censorship
 * enabled with empty lists; the effective snapshot cannot distinguish that
 * from disabled censorship, so the restored form uses the latter.
 */
export function restoreQueueSettings(
  options: TranscriptionOptions,
  models: readonly { value: string }[],
): RestoredQueueSettings {
  const modelIndex = models.findIndex((model) => model.value === options.model);
  if (modelIndex < 0) return { ok: false, reason: "missing_model", modelId: options.model };

  const patch: Partial<Settings> = {
    audioInputMode: "file",
    model: modelIndex,
    language: options.lang,
    translate: options.translate,
    targetLanguage: options.targetLanguage,
    enableDTW: options.enableDtw,
    enableForcedAlignment: options.enableForcedAlignment,
    enableGpu: options.enableGpu,
    enableVad: options.enableVad,
    enableDiarize: options.enableDiarize,
    maxSpeakers: options.maxSpeakers,
    diarizeBackend: options.diarizeBackend,
    textDensity: options.density,
    maxLinesPerSubtitle: options.maxLines,
    textCase: options.textCase,
    removePunctuation: options.removePunctuation,
    enableCensor: options.censoredWords.length > 0,
    censorStyle: options.censorStyle,
    customPrompt: options.customPrompt ?? "",
  };

  // Preserve the inactive custom density value in the global settings; the
  // backend snapshot only contains the selected unit's effective limit.
  if (options.customMaxWordsPerLine !== undefined) {
    patch.customDensityUnit = "words";
    patch.customMaxWordsPerLine = options.customMaxWordsPerLine;
  } else if (options.customMaxCharsPerLine !== undefined) {
    patch.customDensityUnit = "chars";
    patch.customMaxCharsPerLine = options.customMaxCharsPerLine;
  }

  return { ok: true, patch, censoredWordsOverride: [...options.censoredWords] };
}
