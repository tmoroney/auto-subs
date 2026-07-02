import React, { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Settings } from "@/types";
import { initI18n } from "@/i18n";
import { loadFontForLanguage } from "@/lib/font-loader";
import {
  useSettingsStore,
  hydrateSettingsStore,
  DEFAULT_SETTINGS,
} from "@/stores/settings-store";

// Re-export so existing `import { DEFAULT_SETTINGS } from "@/contexts/SettingsContext"`
// continues to work, and the constant has a single source of truth in the store.
export { DEFAULT_SETTINGS };
export type { Settings };

interface SettingsContextType {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  isHydrated: boolean;
}

/**
 * Drop-in replacement for the previous Context-based `useSettings` hook.
 *
 * Backed by the global zustand store (`useSettingsStore`). The `settings`
 * object is selected with `useShallow` so a component only re-renders when
 * one of the actual settings fields changes — not when `isHydrated` or the
 * action references change. This is a marginal improvement over the old
 * Context which re-rendered all 22 consumers on any settings change.
 *
 * Consumers can later opt into fine-grained selectors by importing
 * `useSettingsStore` directly, e.g.:
 *   const model = useSettingsStore((s) => s.model);
 */
export function useSettings(): SettingsContextType {
  const settings = useSettingsStore(
    useShallow((s) => {
      const {
        isHydrated: _h,
        updateSetting: _u,
        resetSettings: _r,
        setHydrated: _sh,
        ...rest
      } = s;
      return rest as Settings;
    }),
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const isHydrated = useSettingsStore((s) => s.isHydrated);

  return { settings, updateSetting, resetSettings, isHydrated };
}

/**
 * SettingsProvider — handles store rehydration on mount and gates the
 * rendering of children until settings are loaded from disk. Also runs
 * i18n and font-loading side-effects in response to settings changes.
 *
 * No longer wraps children in a React Context Provider; the zustand store
 * is global and accessible via `useSettingsStore` / `useSettings()` from
 * anywhere in the tree.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const isHydrated = useSettingsStore((s) => s.isHydrated);
  const [shouldShowChildren, setShouldShowChildren] = useState(false);

  // Trigger manual rehydration from the Tauri store on mount. This handles
  // platform detection (for first-run enableDTW default) and field-level
  // migrations before marking the store as hydrated.
  useEffect(() => {
    hydrateSettingsStore();
  }, []);

  // Fade in children after hydration (matches previous opacity transition).
  useEffect(() => {
    if (!isHydrated) return;
    requestAnimationFrame(() => setShouldShowChildren(true));
  }, [isHydrated]);

  // Re-initialise i18n when the UI language changes.
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  useEffect(() => {
    if (!isHydrated) return;
    initI18n(uiLanguage);
  }, [uiLanguage, isHydrated]);

  // Lazy-load the appropriate font for the currently selected languages so
  // non-Latin text (CJK, Arabic, Devanagari, Thai, etc.) renders correctly.
  const language = useSettingsStore((s) => s.language);
  const translate = useSettingsStore((s) => s.translate);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
  useEffect(() => {
    if (!isHydrated) return;
    loadFontForLanguage(uiLanguage);
    loadFontForLanguage(language);
    if (translate) loadFontForLanguage(targetLanguage);
  }, [isHydrated, uiLanguage, language, translate, targetLanguage]);

  if (!isHydrated) return null;

  return (
    <div
      className="h-screen w-screen bg-background transition-opacity duration-200"
      style={{ opacity: shouldShowChildren ? 1 : 0 }}
    >
      {children}
    </div>
  );
}
