import { Model } from "@/types";
import manifestData from "../../models.json";

/**
 * Centralized model definitions for AutoSubs.
 *
 * The list of models — and where each is downloaded from — is defined once in
 * `AutoSubs-App/models.json`, which is also compiled into the Rust backend.
 * This module derives the UI `Model[]` from that manifest so the frontend and
 * backend can never drift. Display strings (label/description/details/badge)
 * remain i18n keys resolved at render time; only structural metadata lives in
 * the manifest.
 */

/** UI metadata block as stored per model in models.json. */
interface ManifestUi {
  size: string;
  ramMb?: number;
  image: string;
  accuracy: number;
  speed?: number;
  bestFor?: string[];
  languageSupport: Model["languageSupport"];
}

interface ManifestModel {
  id: string;
  engine: string;
  ui: ManifestUi;
}

interface ManifestLicense {
  spdx: string;
  url: string;
  attribution: string;
  commercialUse: boolean;
}

interface ManifestAuxiliaryModel {
  id: string;
  repo: string;
  ui: ManifestUi;
  license?: ManifestLicense;
}

interface ManifestFile {
  models: ManifestModel[];
  diarize: ManifestAuxiliaryModel;
  aligner: ManifestAuxiliaryModel;
}

const manifest = manifestData as unknown as ManifestFile;

/** Map a model id to its i18n key base (e.g. "tiny.en" -> "tiny_en"). */
function i18nBase(id: string): string {
  return id.replace(/[.-]/g, "_");
}

/**
 * Languages a model is a proven strong choice for, when `models.json` doesn't
 * say. A restricted or single-language model was trained on exactly the
 * languages it accepts, so all of them qualify; a multilingual model makes no
 * such claim and defaults to none, which makes it a fallback rather than a
 * recommendation. Narrow the default by setting `bestFor` in the manifest.
 */
function defaultBestFor(support: Model["languageSupport"]): string[] {
  switch (support.kind) {
    case "single_language":
      return [support.language];
    case "restricted":
      return support.languages;
    default:
      return [];
  }
}

/** Build a UI `Model` from a manifest entry and its i18n key base. */
function toModel(id: string, engine: string, ui: ManifestUi, keyBase: string): Model {
  return {
    value: id,
    label: `models.${keyBase}.label`,
    description: `models.${keyBase}.description`,
    size: ui.size,
    ramMb: ui.ramMb ?? 0,
    image: `/${ui.image}`,
    details: `models.${keyBase}.details`,
    badge: `models.${keyBase}.badge`,
    engine,
    languageSupport: ui.languageSupport,
    accuracy: ui.accuracy as Model["accuracy"],
    speed: (ui.speed ?? 1) as Model["speed"],
    bestFor: ui.bestFor ?? defaultBestFor(ui.languageSupport),
    isDownloaded: false,
  };
}

/** How the picker's model list is ordered. */
export type ModelSort = "recommended" | "accuracy" | "speed";

/**
 * Order models for display. Every sort is derived from the manifest — there is
 * no hand-maintained list to keep in step when a model is added.
 *
 * `recommended` reads as: the most accurate model wins; among equals, one
 * proven on the selected language wins; then the faster one; then the one that
 * costs less to run. That last tiebreak is why a 10GB model never outranks an
 * equally good 2GB one, and why a fallback like omni-asr rises to the top for
 * languages no specialist covers.
 *
 * `accuracy` and `speed` lead with the axis the user picked and fall back to
 * the same reasoning, so the list stays sensible rather than becoming an
 * arbitrary shuffle of everything sharing that score.
 */
export function compareModels(a: Model, b: Model, language: string, sort: ModelSort = "recommended"): number {
  const proven = (m: Model) => (language !== "auto" && m.bestFor.includes(language) ? 1 : 0);

  const keys: Array<(m: Model) => number> =
    sort === "speed"
      ? [(m) => -m.speed, (m) => -proven(m), (m) => -m.accuracy, (m) => m.ramMb]
      : sort === "accuracy"
        ? [(m) => -m.accuracy, (m) => -proven(m), (m) => -m.speed, (m) => m.ramMb]
        : [(m) => -m.accuracy, (m) => -proven(m), (m) => -m.speed, (m) => m.ramMb];

  for (const key of keys) {
    const diff = key(a) - key(b);
    if (diff !== 0) return diff;
  }
  // Keep the order total so it can't drift with engine sort stability.
  return a.value.localeCompare(b.value);
}

/** Models that can transcribe `language`, in display order. */
export function sortedModelsForLanguage(
  language: string,
  sort: ModelSort = "recommended",
  pool: Model[] = models,
): Model[] {
  return pool
    .filter((m) => modelSupportsLanguage(m, language))
    .sort((a, b) => compareModels(a, b, language, sort));
}

export const models: Model[] = manifest.models.map((m) =>
  toModel(m.id, m.engine, m.ui, i18nBase(m.id))
);

/**
 * Diarization model definition.
 * Handled separately from transcription models; its i18n keys use the
 * "diarize" base rather than being derived from its id ("speaker-diarize").
 */
export const diarizeModel: Model = toModel(
  manifest.diarize.id,
  "diarize",
  manifest.diarize.ui,
  "diarize"
);

export const alignerModel: Model = {
  ...toModel(
    manifest.aligner.id,
    "aligner",
    manifest.aligner.ui,
    "aligner"
  ),
  repositoryUrl: `https://huggingface.co/${manifest.aligner.repo}`,
  license: manifest.aligner.license,
};

/**
 * Check if a model's engine supports automatic language detection.
 * - Multilingual Whisper: yes (built-in auto-detection)
 * - Single-language models (Whisper .en, Moonshine variants): no
 * - Restricted models: depends on the engine — SenseVoice and Parakeet
 *   support auto; Canary and Cohere do not.
 */
export function modelSupportsAutoDetect(model: Model): boolean {
  switch (model.languageSupport.kind) {
    case "multilingual":
      return true
    case "single_language":
      return false
    case "restricted":
      return model.engine === "parakeet"
    default:
      return true
  }
}

/**
 * Check if a model supports a specific language
 */
export function modelSupportsLanguage(model: Model, language: string): boolean {
  if (language === "auto") return modelSupportsAutoDetect(model)

  switch (model.languageSupport.kind) {
    case "multilingual":
      return true
    case "single_language":
      return model.languageSupport.language === language
    case "restricted":
      return model.languageSupport.languages.includes(language)
    default:
      return true
  }
}

/**
 * Get the first recommended model that supports the given language — the same
 * model the picker shows at the top of its list.
 */
export function getFirstRecommendedModelForLanguage(language: string): Model | null {
  return sortedModelsForLanguage(language)[0] ?? null
}
