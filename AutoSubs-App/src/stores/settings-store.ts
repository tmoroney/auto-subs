import { create } from "zustand";
import { persist } from "zustand/middleware";
import { platform } from "@tauri-apps/plugin-os";
import { CaptionStyle, ImportedModel, Settings } from "@/types";
import { getPreferredUiLanguage, normalizeUiLanguage, initI18n } from "@/i18n";
import {
  models,
  withImportedModels,
  modelSupportsLanguage,
  getFirstRecommendedModelForLanguage,
} from "@/lib/models";
import {
  clampModelIndex,
  sanitizeImportedModels,
  selectionAfterRemoval,
} from "@/lib/imported-models";
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
  lastSeenVersion: "",
  showEnglishOnlyModels: false,
  subtitlePanelWidth: 340,

  // Survey notification settings
  timesDismissedSurvey: 0,
  lastSurveyDate: new Date().toISOString(),

  // Milestone tracking
  transcriptionsCompleted: 0,
  subSlateMilestoneShown: false,

  // Processing settings
  model: 0,
  importedModels: [],
  language: "auto",
  translate: false,
  targetLanguage: "en",
  enableDTW: true, // gpu enabled by default on mac and linux, disabled by default on windows
  enableForcedAlignment: false,
  enableGpu: true,
  enableVad: true,
  enableDiarize: false,
  maxSpeakers: null,
  diarizeBackend: "sortformer",
  exportRange: "inout",

  // Text settings
  textDensity: "standard",
  maxLinesPerSubtitle: 1,
  splitOnPunctuation: true,
  textCase: "none",
  removePunctuation: false,
  enableCensor: false,
  censoredWords: [],
  censorStyle: "middle",
  activeCensorLists: [],
  customPrompt: "",
  customMaxCharsPerLine: 38,
  customMaxWordsPerLine: 3,
  customDensityUnit: "words",

  // Resolve settings
  selectedInputTracksByApp: {
    davinci: ["1"],
    premiere: [],
    aftereffects: [],
    standalone: [],
  },
  selectedOutputTrack: "1",

  // Caption style
  captionStyle: { source: "autosubs", presetId: DEFAULT_PRESET_ID },
};

// ─── Persisted-shape normalisation ────────────────────────────────────────
/**
 * Reshape settings loaded from disk into the current schema.
 *
 * Before the `captionStyle` union, the caption selection lived in three
 * fields (`captionMode`, `selectedTemplate`, `presetId`) that callers had to
 * keep in agreement. Older settings files still carry them, so map them onto
 * the union and drop them.
 *
 * The Tauri storage adapter has no version field (it stores the bare settings
 * object so the on-disk format stays readable), so this runs on every load and
 * must be idempotent: already-migrated settings pass straight through.
 */
export function normalizePersistedSettings(persisted: unknown): Partial<Settings> {
  if (!persisted || typeof persisted !== "object") return {};
  const {
    captionMode,
    selectedTemplate,
    presetId,
    captionStyle,
    ...rest
  } = persisted as Record<string, unknown>;

  const next = rest as Partial<Settings>;

  // Imported models arrived after the index format, so older files have none.
  next.importedModels = sanitizeImportedModels(next.importedModels);
  if ("model" in next) {
    next.model = clampModelIndex(
      next.model,
      models.length + next.importedModels.length,
      DEFAULT_SETTINGS.model,
    );
  }

  if (isCaptionStyle(captionStyle)) {
    next.captionStyle = captionStyle;
    return next;
  }

  const templateName =
    selectedTemplate && typeof selectedTemplate === "object"
      ? (selectedTemplate as { value?: unknown }).value
      : undefined;

  if (captionMode === "regular" && typeof templateName === "string" && templateName) {
    next.captionStyle = { source: "resolve", templateName };
  } else {
    // Anything else (including a missing mode) lands on the animated default,
    // which is what every install has shipped with.
    next.captionStyle = {
      source: "autosubs",
      presetId: typeof presetId === "string" && presetId ? presetId : DEFAULT_PRESET_ID,
    };
  }

  return next;
}

function isCaptionStyle(value: unknown): value is CaptionStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as Partial<CaptionStyle> & { source?: string };
  if (style.source === "autosubs") {
    return typeof (style as { presetId?: unknown }).presetId === "string";
  }
  if (style.source === "resolve") {
    return typeof (style as { templateName?: unknown }).templateName === "string";
  }
  return false;
}

// ─── Store type ───────────────────────────────────────────────────────────
interface SettingsStore extends Settings {
  /** Whether the store has finished loading from disk. */
  isHydrated: boolean;

  // Actions
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  /** Append an imported model; it lands after every existing model. */
  addImportedModel: (model: ImportedModel) => void;
  renameImportedModel: (id: string, name: string) => void;
  /** Forget an imported model (its file stays) and keep the selection valid. */
  removeImportedModel: (id: string) => void;
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
            const currentModel = withImportedModels(state.importedModels)[state.model];
            if (currentModel && !modelSupportsLanguage(currentModel, value as string)) {
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
          // Imported models are the user's files, not preferences.
          importedModels: state.importedModels,
        })),

      addImportedModel: (model) =>
        set((state) => ({ importedModels: [...state.importedModels, model] })),

      renameImportedModel: (id, name) =>
        set((state) => ({
          importedModels: state.importedModels.map((m) => (m.id === id ? { ...m, name } : m)),
        })),

      removeImportedModel: (id) =>
        set((state) => ({
          model: selectionAfterRemoval(
            state.model,
            state.importedModels,
            id,
            models.length,
            DEFAULT_SETTINGS.model,
          ),
          importedModels: state.importedModels.filter((m) => m.id !== id),
        })),

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: STORE_KEY,
      storage: createTauriStorage<Settings>(STORE_FILE, STORE_KEY),
      merge: (persisted, current) => ({
        ...current,
        ...normalizePersistedSettings(persisted),
      }),
      // Only persist the settings fields — never the hydration flag or actions.
      partialize: (state) => {
        const {
          isHydrated,
          updateSetting,
          resetSettings,
          addImportedModel,
          renameImportedModel,
          removeImportedModel,
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
