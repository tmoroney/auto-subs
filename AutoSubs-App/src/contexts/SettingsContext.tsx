import React, { createContext, useContext, useState, useEffect } from 'react';
import { load, Store } from '@tauri-apps/plugin-store';
import { Settings } from '@/types/interfaces';
import { initI18n, normalizeUiLanguage } from '@/i18n';

export const DEFAULT_SETTINGS: Settings = {
  // Mode
  isStandaloneMode: false,

  // UI settings
  uiLanguage: "en",
  uiLanguagePromptCompleted: false,
  showEnglishOnlyModels: false,

  // Survey notification settings
  timesDismissedSurvey: 0,
  lastSurveyDate: new Date().toISOString(),

  // Processing settings
  model: 0,
  language: "auto",
  translate: false,
  targetLanguage: "en",
  enableDTW: true,
  enableGpu: true, // gpu enabled by default on mac and linux, disabled by default on windows
  enableDiarize: false,
  maxSpeakers: null,

  // Text settings
  maxCharsPerLine: 0,
  maxLinesPerSubtitle: 1,
  splitOnPunctuation: true,
  textCase: "none",
  removePunctuation: false,
  enableCensor: false,
  censoredWords: [],

  // Resolve settings
  selectedInputTracks: ["1"],
  selectedOutputTrack: "1",
  selectedTemplate: { value: "Default Template", label: "Default Template" },

  // Animation settings
  animationType: "none",
  highlightType: "none",
  highlightColor: "#000000",
};

interface SettingsContextType {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  isHydrated: boolean;
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [store, setStore] = useState<Store | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [shouldShowChildren, setShouldShowChildren] = useState(false);

  async function initializeStore() {
    try {
      const loadedStore = await load('autosubs-store.json', { autoSave: false });
      setStore(loadedStore);

      // If you store settings as a single object, you can get it all at once
      // Alternatively, if they are stored individually, you can reconstruct the object here.
      const storedSettings = await loadedStore.get<any>('settings');
      const hydratedSettings = storedSettings
        ? ({ ...DEFAULT_SETTINGS, ...storedSettings, uiLanguage: normalizeUiLanguage(storedSettings.uiLanguage) } as Settings)
        : DEFAULT_SETTINGS;

      initI18n(hydratedSettings.uiLanguage);
      setSettings(hydratedSettings);
    } catch (error) {
      console.error('Error initializing store:', error);
    } finally {
      setIsHydrated(true);
    }
  }

  // Initialization useEffect
  useEffect(() => {
    initializeStore();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const id = requestAnimationFrame(() => setShouldShowChildren(true));
    return () => cancelAnimationFrame(id);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    initI18n(settings.uiLanguage);
  }, [settings.uiLanguage, isHydrated]);

  // Whenever settings change, persist them
  useEffect(() => {
    async function saveState() {
      if (!store) return;
      try {
        await store.set('settings', settings);
        await store.save();
      } catch (error) {
        console.error('Error saving state:', error);
      }
    }

    saveState();
  }, [settings, store]);

  // A handy reset function
  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
  }

  // Update a setting
  // This enforces that key is a valid Settings property, and value must match its type
  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => ({
      ...prev,
      [key]: key === 'uiLanguage' ? normalizeUiLanguage(value as string) : value
    }));
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSetting,
      resetSettings,
      isHydrated,
    }}>
      {!isHydrated ? (
        <div className="h-screen w-screen bg-background" />
      ) : (
        <div
          className="h-screen w-screen bg-background transition-opacity duration-200"
          style={{ opacity: shouldShowChildren ? 1 : 0 }}
        >
          {children}
        </div>
      )}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export type { Settings };
