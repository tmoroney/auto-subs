import { create } from "zustand";
import { persist } from "zustand/middleware";
import { platform } from "@tauri-apps/plugin-os";
import { Settings } from "@/types";
import { getPreferredUiLanguage, normalizeUiLanguage, initI18n } from "@/i18n";
import {
  models,
  modelSupportsLanguage,
  getFirstRecommendedModelForLanguage,
} from "@/lib/models";
import { DEFAULT_PRESET_ID } from "@/presets/built-in-presets";
import { createTauriStorage, hasStoredValue } from "@/lib/tauri-storage";

// ─── Store file config ────────────────────────────────────────────────────
// Same file + key as the previous SettingsContext so existing user data
// continues to load without migration.
const STORE_FILE = "autosubs-store.json";
const STORE_KEY = "settings";

// ─── Default settings ─────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: Settings = {
  // Mode
  audioInputMode: "timeline",
  preferredEditorIntegration: "davinci",

  // UI settings
  uiLanguage: "en",
  onboardingCompleted: false,
  tourCompleted: false,
  lastSeenVersion: "",
  showEnglishOnlyModels: false,

  // Survey notification settings
  timesDismissedSurvey: 0,
  lastSurveyDate: new Date().toISOString(),

  // Milestone tracking
  transcriptionsCompleted: 0,
  subSlateMilestoneShown: false,

  // Processing settings
  model: 0,
  language: "auto",
  translate: false,
  targetLanguage: "en",
  enableDTW: true, // gpu enabled by default on mac and linux, disabled by default on windows
  enableGpu: true,
  enableDiarize: false,
  maxSpeakers: null,
  exportRange: "inout",

  // Text settings
  textDensity: "standard",
  maxLinesPerSubtitle: 1,
  splitOnPunctuation: true,
  textCase: "none",
  removePunctuation: false,
  enableCensor: false,
  censoredWords: [],
  activeCensorLists: [],
  customPrompt: "",
  customMaxCharsPerLine: 38,

  // Resolve settings
  selectedInputTracksByApp: {
    davinci: ["1"],
    premiere: [],
    aftereffects: [],
  },
  selectedOutputTrack: "1",
  selectedTemplate: { value: "Default Template", label: "Default Template" },

  // AutoSubs Caption settings
  presetId: DEFAULT_PRESET_ID,
  captionMode: "animated",

  // Animation settings
  animationType: "none",
  highlightType: "none",
  highlightColor: "#000000",
};

// ─── Store type ───────────────────────────────────────────────────────────
interface SettingsStore extends Settings {
  /** Whether the store has finished loading from disk. */
  isHydrated: boolean;

  // Actions
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  /** Mark the store as hydrated. */
  setHydrated: () => void;
}

// ─── Store creation ───────────────────────────────────────────────────────
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      isHydrated: false,

      updateSetting: (key, value) =>
        set((state) => {
          const patch: Partial<Settings> = {
            [key]:
              key === "uiLanguage"
                ? (normalizeUiLanguage(value as string) as Settings[typeof key])
                : value,
          };

          // If language changed and the current model doesn't support it,
          // auto-switch to the first recommended model that does.
          if (key === "language" && value !== state.language) {
            const currentModel = models[state.model];
            if (!modelSupportsLanguage(currentModel, value as string)) {
              const recommended = getFirstRecommendedModelForLanguage(value as string);
              if (recommended) {
                const idx = models.findIndex((m) => m.value === recommended.value);
                if (idx !== -1) patch.model = idx;
              }
            }
          }

          return patch;
        }),

      resetSettings: () =>
        set((state) => ({
          ...DEFAULT_SETTINGS,
          uiLanguage: getPreferredUiLanguage(),
          onboardingCompleted: true,
          // Preserve milestone tracking and usage data
          transcriptionsCompleted: state.transcriptionsCompleted,
          subSlateMilestoneShown: state.subSlateMilestoneShown,
          timesDismissedSurvey: state.timesDismissedSurvey,
          lastSurveyDate: state.lastSurveyDate,
          lastSeenVersion: state.lastSeenVersion,
        })),

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: STORE_KEY,
      storage: createTauriStorage<Settings>(STORE_FILE, STORE_KEY),
      // Only persist the settings fields — never the hydration flag or actions.
      partialize: (state) => {
        const {
          isHydrated,
          updateSetting,
          resetSettings,
          setHydrated,
          ...settings
        } = state;
        return settings;
      },
      // We handle rehydration manually in SettingsProvider so we can detect
      // first-run (for platform-specific enableDTW default) before loading.
      skipHydration: true,
    },
  ),
);

// ─── Manual rehydration ───────────────────────────────────────────────────
/**
 * Load settings from the Tauri store, applying platform-specific defaults
 * on first run. This mirrors the previous SettingsContext init flow:
 *
 * 1. Detect platform (for Windows enableDTW default on first run).
 * 2. Check whether persisted data exists.
 * 3. If first run, apply platform-specific defaults before rehydration.
 * 4. Rehydrate from storage (zustand's default merge spreads persisted
 *    fields over the in-memory defaults).
 * 5. Mark as hydrated.
 */
export async function hydrateSettingsStore(): Promise<void> {
  try {
    const currentPlatform = await platform();
    const isWindows = currentPlatform === "windows";

    const hasData = await hasStoredValue(STORE_FILE, STORE_KEY);

    if (!hasData) {
      // First run — apply platform-specific defaults that differ from
      // DEFAULT_SETTINGS. With no persisted data, zustand's default merge
      // keeps these values as-is.
      useSettingsStore.setState({
        enableDTW: !isWindows,
        uiLanguage: getPreferredUiLanguage(),
      });
    }

    // Trigger persist's rehydration (zustand merges persisted state over
    // the current in-memory state).
    await useSettingsStore.persist.rehydrate();

    // Initialise i18n with the hydrated UI language *before* marking the
    // store as hydrated. SettingsProvider gates children on isHydrated, so
    // this guarantees the first render of children uses the correct language
    // and avoids a one-frame flash of the default (en) UI for returning
    // non-English users.
    initI18n(useSettingsStore.getState().uiLanguage);
  } catch (error) {
    console.error("Error initializing settings store:", error);
  } finally {
    useSettingsStore.getState().setHydrated();
  }
}
