import { ReactNode, createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Import the required APIs from Tauri
import { open, save } from '@tauri-apps/plugin-dialog';
import { load, Store } from '@tauri-apps/plugin-store';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { downloadDir } from '@tauri-apps/api/path';
import { listen } from '@tauri-apps/api/event';

// Import custom APIs and utilities
import { Subtitle, Speaker, ErrorMsg, TimelineInfo, Settings, Model, TranscriptionOptions } from "@/types/interfaces";
import { jumpToTime, getTimelineInfo, cancelExport, addSubtitlesToTimeline } from '@/api/resolveAPI';
import { generateTranscriptFilename, readTranscript, saveTranscript, updateTranscript } from '../utils/fileUtils';
import { generateSrt, parseSrt } from '@/utils/srtUtils';
import { models } from '@/lib/models';

interface GlobalContextType {
  settings: Settings;
  modelsState: Model[];
  isStandaloneMode: boolean;
  timelineInfo: TimelineInfo;
  markIn: number;
  subtitles: Subtitle[];
  speakers: Speaker[];
  error: ErrorMsg;
  fileInput: string | null;
  // Event listener states
  transcriptionProgress: number;
  downloadingModel: string | null;
  isModelDownloading: boolean;
  downloadProgress: number;
  diarizationProgress: number;
  isDiarizing: boolean;
  // Export state
  isExporting: boolean;
  setIsExporting: (isExporting: boolean) => void;
  exportProgress: number;
  setExportProgress: (progress: number) => void;
  cancelRequestedRef: React.MutableRefObject<boolean>;
  // Transcription utils
  validateTranscriptionInput: () => boolean;
  createTranscriptionOptions: (audioInfo: { path: string, offset: number }) => TranscriptionOptions;
  processTranscriptionResults: (transcript: any) => Promise<string>;
  pushToTimeline: () => Promise<void>;
  // UI state
  isTranscribing: boolean;
  setIsTranscribing: (isTranscribing: boolean) => void;
  isRefreshing: boolean;
  setIsRefreshing: (isRefreshing: boolean) => void;
  isUpdateAvailable: boolean;
  isUpdateDismissed: boolean;
  setIsUpdateDismissed: (isUpdateDismissed: boolean) => void;
  showMobileSubtitles: boolean;
  setShowMobileSubtitles: (showMobileSubtitles: boolean) => void;
  setTranscriptionProgress: (progress: number) => void;
  checkDownloadedModels: () => Promise<void>;
  setIsStandaloneMode: (isStandaloneMode: boolean) => void;
  setFileInput: (fileInput: string | null) => void;
  updateSetting: (key: keyof Settings, value: any) => void
  setError: (error: ErrorMsg) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  updateSpeakers: (speakers: Speaker[]) => void;
  refresh: () => Promise<void>;
  setModelsState: (models: Model[]) => void;
  updateSubtitle: (subtitleId: number, updatedSubtitle: Subtitle) => Promise<void>;
  exportSubtitles: () => Promise<void>;
  exportSubtitlesAs: (format: 'srt' | 'json') => Promise<void>;
  importSubtitles: () => Promise<void>;
  jumpToSpeaker: (start: number) => void;
  resetSettings: () => void;
  checkForUpdates: () => Promise<string | null>;
  setupEventListeners: () => () => void; // Return cleanup function
  handleDeleteModel: (modelValue: string) => Promise<void>;
  getSourceAudio: (isStandaloneMode: boolean, fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;
  cancelExport: () => Promise<any>;
}

export const GlobalContext = createContext<GlobalContextType | null>(null);

interface GlobalProviderProps {
  children: ReactNode;
}

const DEFAULT_SETTINGS: Settings = {
  // Processing settings
  model: 0,
  language: "auto",
  translate: false,
  enableDiarize: false,
  maxSpeakers: null,

  // Text settings
  maxWordsPerLine: 5,
  maxCharsPerLine: 32,
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

export function GlobalProvider({ children }: GlobalProviderProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [store, setStore] = useState<Store | null>(null);

  // App state
  const [modelsState, setModelsState] = useState(models)
  const [isStandaloneMode, setIsStandaloneMode] = useState(false)

  // State declarations
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [error, setError] = useState<ErrorMsg>({ title: "", desc: "" });
  const [fileInput, setFileInput] = useState<string | null>(null);

  // Event listener states
  const [transcriptionProgress, setTranscriptionProgress] = useState<number>(0);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [isModelDownloading, setIsModelDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [diarizationProgress, setDiarizationProgress] = useState<number>(0);
  const [isDiarizing, setIsDiarizing] = useState<boolean>(false);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const cancelRequestedRef = useRef<boolean>(false);

  // UI state
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isUpdateAvailable] = useState<boolean>(false);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState<boolean>(false);
  const [showMobileSubtitles, setShowMobileSubtitles] = useState<boolean>(false);

  // Davinci Resolve state
  const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>({ name: "", timelineId: "", templates: [], inputTracks: [], outputTracks: [] });
  const [markIn, setMarkIn] = useState(0);

  // Initialization useEffect
  useEffect(() => {
    initializeStore();
    checkDownloadedModels();

    // Initialize timeline info and load subtitles
    async function initializeTimeline() {
      try {
        console.log('Fetching timeline info...');
        const info = await getTimelineInfo().catch(() => {
          console.log('Link to Resolve is offline');
          return null;
        });

        if (info && info.timelineId) {
          console.log('Timeline info received:', info);
          setTimelineInfo(info);
        }
      } catch (error) {
        console.error('Error initializing timeline:', error);
      }
    }

    initializeTimeline();
  }, []);

  async function checkDownloadedModels() {
    try {
      const downloadedModels = await invoke("get_downloaded_models") as string[]
      console.log("Downloaded models:", downloadedModels)

      const updatedModels = models.map(model => ({
        ...model,
        isDownloaded: downloadedModels.some(downloadedModel =>
          downloadedModel.includes(model.value)
        )
      }))
      setModelsState(updatedModels)
    } catch (error) {
      console.error("Failed to check downloaded models:", error)
    }
  }

  async function initializeStore() {
    try {
      const loadedStore = await load('autosubs-store.json', { autoSave: false });
      setStore(loadedStore);

      // If you store settings as a single object, you can get it all at once
      // Alternatively, if they are stored individually, you can reconstruct the object here.
      const storedSettings = await loadedStore.get<any>('settings');
      if (storedSettings) {
        setSettings(prev => ({ ...prev, ...storedSettings }));
      }
    } catch (error) {
      console.error('Error initializing store:', error);
    }
  }

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
      [key]: value
    }));
  }

  // Load subtitles when timelineId changes
  useEffect(() => {
    async function loadSubtitles() {
      let filename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineInfo.timelineId);
      if (filename && filename.length > 0) {
        console.log("Loading subtitles:", filename);
        const transcript = await readTranscript(filename);
        if (transcript) {
          console.log("Transcript loaded:", transcript);
          setMarkIn(transcript.mark_in);
          setSubtitles(transcript.segments || []);
          setSpeakers(transcript.speakers || []);
          console.log("Speakers set:", speakers);
          console.log("Subtitles set:", subtitles);
        } else {
          console.warn("No transcript found for:", filename);
          setSubtitles([]);
        }
      } else {
        console.log("No timelineId, clearing subtitles");
        setSubtitles([]);
      }
    }

    loadSubtitles();
  }, [timelineInfo.timelineId, isStandaloneMode]);

  async function exportSubtitles() {
    // Default to SRT export for backward compatibility
    await exportSubtitlesAs('srt');
  }

  async function exportSubtitlesAs(format: 'srt' | 'json') {
    try {
      if (!subtitles || subtitles.length === 0) {
        throw new Error('No subtitles available to export');
      }

      const defaultPath = format === 'srt' ? 'subtitles.srt' : 'subtitles.json';
      const filters = format === 'srt'
        ? [{ name: 'SRT Files', extensions: ['srt'] }]
        : [{ name: 'JSON Files', extensions: ['json'] }];

      const filePath = await save({
        defaultPath,
        filters,
      });

      if (!filePath) {
        console.log('Save was canceled');
        return;
      }

      if (format === 'srt') {
        console.log('Generating SRT data from subtitles (first 3 items):', subtitles.slice(0, 3));
        console.log('Subtitles array length:', subtitles.length);

        // Log the structure of the first subtitle if it exists
        if (subtitles.length > 0) {
          console.log('First subtitle structure:', {
            keys: Object.keys(subtitles[0]),
            values: Object.entries(subtitles[0]).map(([key, value]) => ({
              key,
              type: typeof value,
              value: value
            }))
          });
        }

        let srtData = generateSrt(subtitles);
        console.log('Generated SRT data (first 100 chars):', srtData.substring(0, 100));

        if (!srtData || srtData.trim() === '') {
          console.error('Generated SRT data is empty');
          throw new Error('Generated SRT data is empty');
        }

        await writeTextFile(filePath, srtData);
        console.log('SRT file saved successfully to', filePath);
      } else {
        // Export as JSON
        console.log('Generating JSON data from subtitles (first 3 items):', subtitles.slice(0, 3));

        // Create a structured JSON object similar to what's used internally
        const jsonData = {
          createdAt: new Date().toISOString(),
          segments: subtitles.map((segment, index) => ({
            id: index.toString(),
            start: segment.start,
            end: segment.end,
            text: segment.text.trim(),
            speaker_id: segment.speaker_id || undefined,
            words: segment.words || []
          }))
        };

        const jsonString = JSON.stringify(jsonData, null, 2);
        await writeTextFile(filePath, jsonString);
        console.log('JSON file saved successfully to', filePath);
      }
    } catch (error) {
      console.error(`Failed to save ${format} file`, error);
    }
  }

  async function importSubtitles() {
    try {
      const transcriptPath = await open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'SRT Files',
          extensions: ['srt']
        }],
        defaultPath: await downloadDir()
      });

      if (!transcriptPath) {
        console.log('Open was canceled');
        return;
      }

      // read srt file and convert to json using robust parser
      const srtData = await readTextFile(transcriptPath);
      const subtitles = parseSrt(srtData);
      let transcript = { segments: subtitles };

      // Save transcript to file in Transcripts directory
      let filename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineInfo.timelineId);
      console.log("Saving transcript to:", filename);
      // No speakers for imported subtitles
      let { segments } = await saveTranscript(transcript, filename, {
        case: settings.textCase,
        removePunctuation: settings.removePunctuation,
        splitOnPunctuation: settings.splitOnPunctuation,
        censoredWords: settings.enableCensor ? settings.censoredWords : [],
        maxWordsPerLine: settings.maxWordsPerLine,
        maxCharsPerLine: settings.maxCharsPerLine,
        maxLinesPerSubtitle: settings.maxLinesPerSubtitle,
      });
      setSubtitles(segments)
    } catch (error) {
      console.error('Failed to open file', error);
      setError({
        title: "Error Opening SRT File",
        desc: "Failed to open the SRT file. Please try again."
      });
    }
  }

  async function updateSpeakers(newSpeakers: Speaker[]) {
    console.log("Updating speakers:", newSpeakers);
    setSpeakers(newSpeakers);
    let filename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineInfo.timelineId);
    await updateTranscript(filename, newSpeakers);
  }

  async function checkForUpdates() {
    try {
      // fetch latest release from GitHub
      const response = await fetch('https://api.github.com/repos/tmoroney/auto-subs/releases/latest');
      const data = await response.json();

      const latestVersion = data.tag_name.replace('V', '');

      // compare with current version
      const currentVersion = await getVersion();

      if (latestVersion !== currentVersion) {
        return data.body;
      }
      return null;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      return null;
    }
  }

  // Function to delete a model
  const handleDeleteModel = async (modelValue: string) => {
    try {
      // Call the backend to delete the model files
      await invoke('delete_model', { model: modelValue });

      // Update the models state
      await checkDownloadedModels();

      console.log(`Successfully deleted model: ${modelValue}`);
    } catch (error) {
      console.error(`Failed to delete model ${modelValue}:`, error);
      // You could add a toast notification here to inform the user of the error
    }
  };

  // Function to get source audio based on current mode
  const getSourceAudio = async (
    isStandaloneMode: boolean,
    fileInput: string | null,
    inputTracks: string[]
  ): Promise<{ path: string, offset: number } | null> => {
    if (timelineInfo && !isStandaloneMode) {
      // Reset cancellation flag at the start of export
      cancelRequestedRef.current = false;
      setIsExporting(true);
      setExportProgress(0);

      try {
        // Import the required functions directly
        const { exportAudio, getExportProgress } = await import('@/api/resolveAPI');

        // Start the export (non-blocking)
        const exportResult = await exportAudio(inputTracks);
        console.log("Export started:", exportResult);

        // Poll for export progress until completion
        let exportCompleted = false;
        let audioInfo = null;

        while (!exportCompleted && !cancelRequestedRef.current) {
          // Check if cancellation was requested before making the next API call
          if (cancelRequestedRef.current) {
            console.log("Export polling interrupted by cancellation request");
            break;
          }

          const progressResult = await getExportProgress();
          console.log("Export progress:", progressResult);

          // Update progress
          setExportProgress(progressResult.progress || 0);

          if (progressResult.completed) {
            exportCompleted = true;
            audioInfo = progressResult.audioInfo;
            console.log("Export completed:", audioInfo);
          } else if (progressResult.cancelled) {
            console.log("Export was cancelled");
            setIsExporting(false);
            setExportProgress(0);
            return null;
          } else if (progressResult.error) {
            console.error("Export error:", progressResult.message);
            setIsExporting(false);
            setExportProgress(0);
            throw new Error(progressResult.message || "Export failed");
          }

          // Wait before next poll (avoid overwhelming the server)
          if (!exportCompleted && !cancelRequestedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check again after timeout in case cancellation happened during the wait
            if (cancelRequestedRef.current) {
              console.log("Export polling interrupted during wait interval");
              break;
            }
          }
        }

        setIsExporting(false);
        setExportProgress(100);

        let audioPath = audioInfo["path"];
        let audioOffset = audioInfo["offset"];
        return { path: audioPath, offset: audioOffset };

      } catch (error) {
        setIsExporting(false);
        setExportProgress(0);
        throw error;
      }
    } else {
      return { path: fileInput || "", offset: 0 };
    }
  };

  // Set up event listeners for transcription and model download progress
  const setupEventListeners = useCallback(() => {
    let unlistenTranscription: (() => void) | null = null;
    let unlistenModelStart: (() => void) | null = null;
    let unlistenModelProgress: (() => void) | null = null;
    let unlistenModelComplete: (() => void) | null = null;
    let unlistenModelCache: (() => void) | null = null;
    let unlistenModelCancelled: (() => void) | null = null;
    let unlistenDiarization: (() => void) | null = null;
    let unlistenDiarizationStart: (() => void) | null = null;
    let unlistenDiarizationComplete: (() => void) | null = null;

    const setup = async () => {
      try {
        // Transcription progress listener
        unlistenTranscription = await listen<number>('transcription-progress', (event: { payload: number }) => {
          console.log('Received transcription progress:', event.payload);
          setTranscriptionProgress(event.payload);
        });

        // Model download start listener
        unlistenModelStart = await listen<[string, string, number]>('model-download-start', (event: { payload: [string, string, number] }) => {
          const [modelName] = event.payload;
          setDownloadingModel(modelName);
          setIsModelDownloading(true);
          setDownloadProgress(0);
        });

        // Model download progress listener
        unlistenModelProgress = await listen<number>('model-download-progress', (event: { payload: number }) => {
          setDownloadProgress(event.payload);
        });

        // Model download complete listener
        unlistenModelComplete = await listen<string>('model-download-complete', () => {
          setDownloadingModel(null);
          setIsModelDownloading(false);
          setDownloadProgress(0);
        });

        // Model found in cache listener
        unlistenModelCache = await listen<string>('model-found-in-cache', () => {
          // No action needed when model is found in cache
        });

        // Model download cancelled listener
        unlistenModelCancelled = await listen<string>('model-download-cancelled', (event: { payload: string }) => {
          console.log('Model download cancelled:', event.payload);
          setDownloadingModel(null);
          setIsModelDownloading(false);
          setDownloadProgress(0);
        });

        // Diarization progress listener
        unlistenDiarization = await listen<number>('diarization-progress', (event: { payload: number }) => {
          console.log('Received diarization progress:', event.payload);
          setDiarizationProgress(event.payload);
        });

        // Diarization start listener
        unlistenDiarizationStart = await listen('diarization-start', () => {
          console.log('Diarization started');
          setIsDiarizing(true);
          setDiarizationProgress(0);
        });

        // Diarization complete listener
        unlistenDiarizationComplete = await listen('diarization-complete', () => {
          console.log('Diarization completed');
          setIsDiarizing(false);
          setDiarizationProgress(100);
        });
      } catch (error) {
        console.error('Failed to setup event listeners:', error);
      }
    };

    setup();

    // Return cleanup function
    return () => {
      if (unlistenTranscription) unlistenTranscription();
      if (unlistenModelStart) unlistenModelStart();
      if (unlistenModelProgress) unlistenModelProgress();
      if (unlistenModelComplete) unlistenModelComplete();
      if (unlistenModelCache) unlistenModelCache();
      if (unlistenModelCancelled) unlistenModelCancelled();
      if (unlistenDiarization) unlistenDiarization();
      if (unlistenDiarizationStart) unlistenDiarizationStart();
      if (unlistenDiarizationComplete) unlistenDiarizationComplete();
    };
  }, []);

  async function jumpToSpeaker(start: number) {
    await jumpToTime(start, markIn);
  }

  async function refresh() {
    try {
      let newTimelineInfo = await getTimelineInfo();
      setTimelineInfo(newTimelineInfo);
    } catch (error) {
      setError({
        title: "Failed to get current timeline",
        desc: "Please open a timeline in Resolve, then try again."
      });
    }
  }

  // Function to update a specific subtitle
  const updateSubtitle = async (subtitleId: number, updatedSubtitle: Subtitle) => {
    // Update the local subtitles state
    setSubtitles(prevSubtitles =>
      prevSubtitles.map((subtitle: any) => {
        if (subtitle.id === subtitleId.toString()) {
          return {
            ...subtitle,
            start: updatedSubtitle.start.toString(),
            end: updatedSubtitle.end.toString(),
            text: updatedSubtitle.text,
            speaker_id: updatedSubtitle.speaker_id,
            words: updatedSubtitle.words
          };
        }
        return subtitle;
      })
    );

    // Save to JSON file if we have the necessary context
    try {
      const { updateSubtitleInTranscript } = await import('@/utils/fileUtils');

      // Determine the current transcript filename
      let filename: string | null = null;

      if (timelineInfo?.timelineId) {
        // In resolve mode, use timeline name
        filename = `${timelineInfo.timelineId}.json`;
      } else {
        // In standalone mode, we need to find the most recent transcript
        const currentFilename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineInfo.timelineId);
        filename = currentFilename;
      }

      if (filename) {
        await updateSubtitleInTranscript(filename, updatedSubtitle);
        console.log('Subtitle updated in both UI and file');
      }
    } catch (error) {
      console.error('Failed to update subtitle in file:', error);
    }
  };

  /**
       * Validates input requirements before starting transcription
       * @returns {boolean} True if validation passes, false otherwise
       */
  const validateTranscriptionInput = (): boolean => {
    if (!fileInput && isStandaloneMode) {
      console.error("No file selected")
      return false
    }
    if (!timelineInfo && !isStandaloneMode) {
      console.error("No timeline selected")
      return false
    }
    return true
  }

  /**
   * Creates transcription options object
   * @param {string} audioPath Path to audio file
   * @returns {object} Options for transcription
   */
  const createTranscriptionOptions = (audioInfo: { path: string, offset: number }): TranscriptionOptions => ({
    audioPath: audioInfo.path,
    offset: Math.round(audioInfo.offset * 1000) / 1000,
    model: modelsState[settings.model].value,
    lang: settings.language,
    translate: settings.translate,
    enableDiarize: settings.enableDiarize,
    maxSpeakers: settings.maxSpeakers,
  })

  /**
   * Processes transcription results
   * @param {any} transcript Raw transcript data
   * @returns {Promise<string>} Filename where transcript was saved
   */
  const processTranscriptionResults = async (transcript: any): Promise<string> => {
    // Generate filename for new transcript based on mode and input
    const filename = generateTranscriptFilename(
      isStandaloneMode,
      fileInput,
      timelineInfo?.timelineId
    )

    // Save transcript to JSON file
    const { segments, speakers } = await saveTranscript(transcript, filename, {
      case: settings.textCase,
      removePunctuation: settings.removePunctuation,
      splitOnPunctuation: settings.splitOnPunctuation,
      censoredWords: settings.enableCensor ? settings.censoredWords : [],
      maxWordsPerLine: settings.maxWordsPerLine,
      maxCharsPerLine: settings.maxCharsPerLine,
      maxLinesPerSubtitle: settings.maxLinesPerSubtitle,
    })
    console.log("Transcript saved to:", filename)

    // Update the global subtitles state to show in sidebar
    setSpeakers(speakers)
    setSubtitles(segments)
    console.log("Subtitle list updated with", segments.length, "subtitles")

    return filename
  }

  async function pushToTimeline() {
    let filename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineInfo.timelineId);
    await addSubtitlesToTimeline(filename, settings.selectedTemplate.value, settings.selectedOutputTrack);
  }

  return (
    <GlobalContext.Provider value={{
      settings,
      modelsState,
      timelineInfo,
      markIn,
      subtitles,
      speakers,
      error,
      fileInput,
      isStandaloneMode,
      setIsStandaloneMode,
      checkDownloadedModels,
      setModelsState,
      setFileInput,
      updateSetting,
      setError,
      setSpeakers,
      updateSpeakers,
      refresh,
      updateSubtitle,
      exportSubtitles,
      exportSubtitlesAs,
      importSubtitles,
      jumpToSpeaker,
      pushToTimeline,
      resetSettings,
      checkForUpdates,
      // Event listener states
      transcriptionProgress,
      downloadingModel,
      isModelDownloading,
      downloadProgress,
      diarizationProgress,
      isDiarizing,
      setTranscriptionProgress,
      setupEventListeners,
      handleDeleteModel,
      getSourceAudio,
      cancelExport,
      // Export state
      isExporting,
      setIsExporting,
      exportProgress,
      setExportProgress,
      cancelRequestedRef,
      // Transcription utils
      validateTranscriptionInput,
      createTranscriptionOptions,
      processTranscriptionResults,
      // UI state
      isTranscribing,
      setIsTranscribing,
      isRefreshing,
      setIsRefreshing,
      isUpdateAvailable,
      isUpdateDismissed,
      setIsUpdateDismissed,
      showMobileSubtitles,
      setShowMobileSubtitles,
    }}>
      {children}
    </GlobalContext.Provider>
  );
}

export const useGlobal = () => {
  const context = useContext(GlobalContext);
  if (!context) throw new Error('useGlobal must be used within a GlobalProvider');
  return context;
};