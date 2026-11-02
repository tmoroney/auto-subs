import type { TranscriptionOptions } from "../types.ts";

/** Stable issue codes; the UI translates and presents these to the user. */
export type QueueSettingIssue =
  | "missing_model"
  | "missing_source_language"
  | "unsupported_source_language"
  | "missing_translation_target"
  | "unsupported_translation_target"
  | "same_source_and_target";

type LanguageOptions = Pick<TranscriptionOptions, "model" | "lang" | "translate" | "targetLanguage">;

/**
 * Validate the saved settings using the application's model support predicate.
 *
 * Models must support the spoken/source language. Translation can be provided
 * by another service, so an English-only model can still produce Chinese
 * subtitles from English speech. The model's transcription-language list must
 * not be used to reject the translation target.
 *
 * Injecting the existing predicate avoids a second model compatibility table;
 * the caller should pass `modelSupportsLanguage` from `lib/models` and the
 * values from `translateLanguages` in `lib/languages`.
 */
export function getQueueSettingIssues<T extends { value: string }>(
  options: LanguageOptions,
  models: readonly T[],
  supportsSourceLanguage: (model: T, language: string) => boolean,
  translationTargets: readonly string[],
): QueueSettingIssue[] {
  const issues: QueueSettingIssue[] = [];
  const model = models.find((item) => item.value === options.model);

  if (!model) issues.push("missing_model");
  if (!options.lang) {
    issues.push("missing_source_language");
  } else if (model && !supportsSourceLanguage(model, options.lang)) {
    issues.push("unsupported_source_language");
  }

  if (options.translate) {
    if (!options.targetLanguage) {
      issues.push("missing_translation_target");
    } else {
      if (!translationTargets.includes(options.targetLanguage)) {
        issues.push("unsupported_translation_target");
      }
      if (options.lang !== "auto" && options.lang === options.targetLanguage) {
        issues.push("same_source_and_target");
      }
    }
  }
  return issues;
}
