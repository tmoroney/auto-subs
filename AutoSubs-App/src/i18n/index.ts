import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./locales/de/translation.json";
import en from "./locales/en/translation.json";
import es from "./locales/es/translation.json";
import fr from "./locales/fr/translation.json";
import ja from "./locales/ja/translation.json";
import ko from "./locales/ko/translation.json";
import zh from "./locales/zh/translation.json";

export const DEFAULT_UI_LANGUAGE = "en";
export const SUPPORTED_UI_LANGUAGES = ["en", "de", "es", "fr", "ja", "ko", "zh"] as const;
export type SupportedUiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number];

export function normalizeUiLanguage(lang: string | null | undefined): SupportedUiLanguage {
  if (!lang) return DEFAULT_UI_LANGUAGE;
  const lc = lang.toLowerCase();

  if ((SUPPORTED_UI_LANGUAGES as readonly string[]).includes(lc)) {
    return lc as SupportedUiLanguage;
  }

  const base = lc.split("-")[0];
  if ((SUPPORTED_UI_LANGUAGES as readonly string[]).includes(base)) {
    return base as SupportedUiLanguage;
  }

  return DEFAULT_UI_LANGUAGE;
}

export function initI18n(uiLanguage: string) {
  const normalized = normalizeUiLanguage(uiLanguage);

  if (!i18n.isInitialized) {
    i18n
      .use(initReactI18next)
      .init({
        resources: {
          de: { translation: de },
          en: { translation: en },
          es: { translation: es },
          fr: { translation: fr },
          ja: { translation: ja },
          ko: { translation: ko },
          zh: { translation: zh },
        },
        lng: normalized,
        fallbackLng: DEFAULT_UI_LANGUAGE,
        interpolation: {
          escapeValue: false,
        },
      });
  } else {
    i18n.changeLanguage(normalized);
  }

  return i18n;
}

export default i18n;
