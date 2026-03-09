import { Model } from "@/types/interfaces";

/**
 * Centralized model definitions for AutoSubs
 * These model definitions are used throughout the application
 * to ensure consistency in model information display
 */

/**
 * Predefined filter orders for models
 * Each array defines the optimal order for that filter type
 */
export const modelFilterOrders = {
  weight: [
    "moonshine-tiny", "tiny", "tiny.en", "base", "base.en", 
    "moonshine-tiny-ar", "moonshine-tiny-zh", "moonshine-tiny-ja", 
    "moonshine-tiny-ko", "moonshine-tiny-uk", "moonshine-tiny-vi", 
    "moonshine-base", "moonshine-base-es", "small.en", "small", 
    "large-v3-turbo", "parakeet", "medium", "medium.en", "large-v3"
  ],
  accuracy: [
    "large-v3", "large-v3-turbo", "parakeet", "moonshine-tiny-vi", "moonshine-tiny-ar", "moonshine-tiny-zh", "moonshine-tiny-ja", "moonshine-tiny-ko", "medium.en", "medium",
    "moonshine-base", "small.en", "small", "moonshine-tiny-uk", 
    "moonshine-base-es",
    "tiny", "tiny.en", "base", "base.en", "moonshine-tiny"
  ],
  recommended: [
    "parakeet", "large-v3-turbo", "large-v3", "moonshine-tiny-ar", "moonshine-tiny-zh", "moonshine-tiny-ja", 
    "moonshine-tiny-ko", "moonshine-tiny-uk", "moonshine-tiny-vi", "moonshine-base", "moonshine-base-es", "small.en", "small",
    "medium", "medium.en",
    "tiny", "tiny.en", "base", "base.en", "moonshine-tiny"
  ]
};

export const models: Model[] = [
  {
    value: "parakeet",
    label: "models.parakeet.label",
    description: "models.parakeet.description",
    size: "700MB",
    ram: "2GB",
    image: "/parakeet.png",
    details: "models.parakeet.details",
    badge: "models.parakeet.badge",
    languageSupport: {
      kind: "restricted",
      languages: [
        "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk"
      ],
    },
    accuracy: 3,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "tiny",
    label: "models.tiny.label",
    description: "models.tiny.description",
    size: "80MB",
    ram: "1GB",
    image: "/hummingbird.png",
    details: "models.tiny.details",
    badge: "models.tiny.badge",
    languageSupport: { kind: "multilingual" },
    accuracy: 1,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "tiny.en",
    label: "models.tiny_en.label",
    description: "models.tiny_en.description",
    size: "80MB",
    ram: "1GB",
    image: "/hummingbird.png",
    details: "models.tiny_en.details",
    badge: "models.tiny_en.badge",
    languageSupport: { kind: "single_language", language: "en" },
    accuracy: 1,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "base",
    label: "models.base.label",
    description: "models.base.description",
    size: "150MB",
    ram: "1GB",
    image: "/otter.png",
    details: "models.base.details",
    badge: "models.base.badge",
    languageSupport: { kind: "multilingual" },
    accuracy: 1,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "base.en",
    label: "models.base_en.label",
    description: "models.base_en.description",
    size: "150MB",
    ram: "1GB",
    image: "/otter.png",
    details: "models.base_en.details",
    badge: "models.base_en.badge",
    languageSupport: { kind: "single_language", language: "en" },
    accuracy: 1,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "small",
    label: "models.small.label",
    description: "models.small.description",
    size: "480MB",
    ram: "2GB",
    image: "/fox.png",
    details: "models.small.details",
    badge: "models.small.badge",
    languageSupport: { kind: "multilingual" },
    accuracy: 2,
    weight: 2,
    isDownloaded: false,
  },
  {
    value: "small.en",
    label: "models.small_en.label",
    description: "models.small_en.description",
    size: "480MB",
    ram: "2GB",
    image: "/fox.png",
    details: "models.small_en.details",
    badge: "models.small_en.badge",
    languageSupport: { kind: "single_language", language: "en" },
    accuracy: 2,
    weight: 2,
    isDownloaded: false,
  },
  {
    value: "medium",
    label: "models.medium.label",
    description: "models.medium.description",
    size: "1.5GB",
    ram: "5GB",
    image: "/bear.png",
    details: "models.medium.details",
    badge: "models.medium.badge",
    languageSupport: { kind: "multilingual" },
    accuracy: 3,
    weight: 1,
    isDownloaded: false,
  },
  {
    value: "medium.en",
    label: "models.medium_en.label",
    description: "models.medium_en.description",
    size: "1.5GB",
    ram: "5GB",
    image: "/bear.png",
    details: "models.medium_en.details",
    badge: "models.medium_en.badge",
    languageSupport: { kind: "single_language", language: "en" },
    accuracy: 3,
    weight: 1,
    isDownloaded: false,
  },
  {
    value: "large-v3-turbo",
    label: "models.large_v3_turbo.label",
    description: "models.large_v3_turbo.description",
    size: "1.6GB",
    ram: "6GB",
    image: "/phoenix.png",
    details: "models.large_v3_turbo.details",
    badge: "models.large_v3_turbo.badge",
    languageSupport: { kind: "multilingual" },
    accuracy: 3,
    weight: 2,
    isDownloaded: false,
  },
  {
    value: "large-v3",
    label: "models.large_v3.label",
    description: "models.large_v3.description",
    size: "3.1GB",
    ram: "10GB",
    image: "/elephant.png",
    details: "models.large_v3.details",
    badge: "models.large_v3.badge",
    languageSupport: { kind: "multilingual" },
    accuracy: 3,
    weight: 1,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny",
    label: "models.moonshine_tiny.label",
    description: "models.moonshine_tiny.description",
    size: "60MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny.details",
    badge: "models.moonshine_tiny.badge",
    languageSupport: { kind: "single_language", language: "en" },
    accuracy: 1,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny-ar",
    label: "models.moonshine_tiny_ar.label",
    description: "models.moonshine_tiny_ar.description",
    size: "120MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny_ar.details",
    badge: "models.moonshine_tiny_ar.badge",
    languageSupport: { kind: "single_language", language: "ar" },
    accuracy: 3,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny-zh",
    label: "models.moonshine_tiny_zh.label",
    description: "models.moonshine_tiny_zh.description",
    size: "120MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny_zh.details",
    badge: "models.moonshine_tiny_zh.badge",
    languageSupport: { kind: "single_language", language: "zh" },
    accuracy: 3,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny-ja",
    label: "models.moonshine_tiny_ja.label",
    description: "models.moonshine_tiny_ja.description",
    size: "120MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny_ja.details",
    badge: "models.moonshine_tiny_ja.badge",
    languageSupport: { kind: "single_language", language: "ja" },
    accuracy: 3,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny-ko",
    label: "models.moonshine_tiny_ko.label",
    description: "models.moonshine_tiny_ko.description",
    size: "120MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny_ko.details",
    badge: "models.moonshine_tiny_ko.badge",
    languageSupport: { kind: "single_language", language: "ko" },
    accuracy: 3,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny-uk",
    label: "models.moonshine_tiny_uk.label",
    description: "models.moonshine_tiny_uk.description",
    size: "120MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny_uk.details",
    badge: "models.moonshine_tiny_uk.badge",
    languageSupport: { kind: "single_language", language: "uk" },
    accuracy: 2,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-tiny-vi",
    label: "models.moonshine_tiny_vi.label",
    description: "models.moonshine_tiny_vi.description",
    size: "120MB",
    ram: "1GB",
    image: "/bat.png",
    details: "models.moonshine_tiny_vi.details",
    badge: "models.moonshine_tiny_vi.badge",
    languageSupport: { kind: "single_language", language: "vi" },
    accuracy: 3,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-base",
    label: "models.moonshine_base.label",
    description: "models.moonshine_base.description",
    size: "200MB",
    ram: "1GB",
    image: "/owl.png",
    details: "models.moonshine_base.details",
    badge: "models.moonshine_base.badge",
    languageSupport: { kind: "single_language", language: "en" },
    accuracy: 2,
    weight: 3,
    isDownloaded: false,
  },
  {
    value: "moonshine-base-es",
    label: "models.moonshine_base_es.label",
    description: "models.moonshine_base_es.description",
    size: "350MB",
    ram: "2GB",
    image: "/owl.png",
    details: "models.moonshine_base_es.details",
    badge: "models.moonshine_base_es.badge",
    languageSupport: { kind: "single_language", language: "es" },
    accuracy: 2,
    weight: 3,
    isDownloaded: false,
  },
];

/**
 * Diarization model definition
 * This is handled separately from transcription models
 */
export const diarizeModel: Model = {
  value: "speaker-diarize",
  label: "models.diarize.label",
  description: "models.diarize.description",
  size: "40MB",
  ram: "",
  image: "/diarize.png",
  details: "models.diarize.details",
  badge: "models.diarize.badge",
  languageSupport: { kind: "multilingual" },
  accuracy: 3,
  weight: 2,
  isDownloaded: false, // Will be set to true when actually downloaded
};

/**
 * Check if a model supports a specific language
 */
export function modelSupportsLanguage(model: Model, language: string): boolean {
  if (language === "auto") return true

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
