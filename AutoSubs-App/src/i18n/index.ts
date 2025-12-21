import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import es from "./locales/es/translation.json";
import fr from "./locales/fr/translation.json";
import de from "./locales/de/translation.json";

export const DEFAULT_UI_LANGUAGE = "en";
export const SUPPORTED_UI_LANGUAGES = ["en", "es", "fr", "de"] as const;
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
          en: { translation: en },
          es: { translation: es },
          fr: { translation: fr },
          de: { translation: de },
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
