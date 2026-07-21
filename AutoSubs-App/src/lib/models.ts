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
  ram: string;
  image: string;
  accuracy: number;
  weight: number;
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

/** Build a UI `Model` from a manifest entry and its i18n key base. */
function toModel(id: string, engine: string, ui: ManifestUi, keyBase: string): Model {
  return {
    value: id,
    label: `models.${keyBase}.label`,
    description: `models.${keyBase}.description`,
    size: ui.size,
    ram: ui.ram,
    image: `/${ui.image}`,
    details: `models.${keyBase}.details`,
    badge: `models.${keyBase}.badge`,
    engine,
    languageSupport: ui.languageSupport,
    accuracy: ui.accuracy as Model["accuracy"],
    weight: ui.weight as Model["weight"],
    isDownloaded: false,
  };
}

/**
 * Predefined filter orders for models
 * Each array defines the optimal order for that filter type
 */
export const modelFilterOrders = {
  weight: [
    // 1GB RAM
    "moonshine-tiny", "tiny", "tiny.en", "base", "base.en",
    "moonshine-tiny-ar", "moonshine-tiny-zh", "moonshine-tiny-ja",
    "moonshine-tiny-ko", "moonshine-tiny-uk", "moonshine-tiny-vi",
    "moonshine-base", "sense-voice",
    // 2GB RAM
    "small.en", "small", "parakeet", "omni-asr-300m-ctc",
    // 3-4GB RAM
    "canary", "cohere", "omni-asr-1b-ctc",
    // 5-6GB RAM
    "medium.en", "medium", "large-v3-turbo",
    // 10GB RAM
    "large-v3"
  ],
  accuracy: [
    "cohere", "parakeet", "canary", "large-v3", "large-v3-turbo",
    "moonshine-tiny-vi", "moonshine-tiny-ar", "moonshine-tiny-zh", "moonshine-tiny-ja", "moonshine-tiny-ko", "medium.en", "medium",
    "sense-voice", "moonshine-base", "small.en", "small", "moonshine-tiny-uk",
    "omni-asr-1b-ctc",
    "omni-asr-300m-ctc",
    "tiny", "tiny.en", "base", "base.en", "moonshine-tiny"
  ],
  recommended: [
    "parakeet", "canary", "sense-voice", "omni-asr-1b-ctc", "omni-asr-300m-ctc", "cohere", "large-v3-turbo", "large-v3",
    "moonshine-tiny-ar", "moonshine-tiny-zh", "moonshine-tiny-ja", "moonshine-tiny-ko", "moonshine-tiny-uk", "moonshine-tiny-vi",
    "moonshine-base", "small.en", "small",
    "medium", "medium.en",
    "tiny", "tiny.en", "base", "base.en", "moonshine-tiny"
  ]
};

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
 * Get the first recommended model that supports the given language
 */
export function getFirstRecommendedModelForLanguage(language: string): Model | null {
  // Use the general recommended order for all languages
  const order = modelFilterOrders.recommended
  
  for (const modelValue of order) {
    const model = models.find(m => m.value === modelValue)
    if (model && modelSupportsLanguage(model, language)) {
      return model
    }
  }
  
  return null
}
