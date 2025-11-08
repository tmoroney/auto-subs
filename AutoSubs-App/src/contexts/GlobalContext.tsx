import { ReactNode, createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Import the required APIs from Tauri
import { open, save } from '@tauri-apps/plugin-dialog';
import { load, Store } from '@tauri-apps/plugin-store';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { downloadDir } from '@tauri-apps/api/path';
import { listen } from '@tauri-apps/api/event';

// Import custom APIs and utilities
import { Subtitle, Speaker, ErrorMsg, TimelineInfo, Settings, Model, TranscriptionOptions } from "@/types/interfaces";
import { getTimelineInfo, cancelExport, addSubtitlesToTimeline } from '@/api/resolveAPI';
import { generateTranscriptFilename, readTranscript, saveTranscript, updateTranscript } from '../utils/fileUtils';
import { generateSrt, parseSrt } from '@/utils/srtUtils';
import { models } from '@/lib/models';

interface GlobalContextType {
  settings: Settings;
  modelsState: Model[];
  timelineInfo: TimelineInfo;
  markIn: number;
  subtitles: Subtitle[];
  speakers: Speaker[];
  error: ErrorMsg;
  fileInput: string | null;
  // Event listener states
  transcriptionProgress: number;
  labeledProgress: { progress: number, type?: string, label?: string } | null;
  downloadingModel: string | null;
  isModelDownloading: boolean;
  downloadProgress: number;
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
  showMobileSubtitles: boolean;
  setShowMobileSubtitles: (showMobileSubtitles: boolean) => void;
  setTranscriptionProgress: (progress: number) => void;
  setLabeledProgress: (progress: { progress: number, type?: string, label?: string } | null) => void;
  checkDownloadedModels: () => Promise<void>;
  setFileInput: (fileInput: string | null) => void;
  updateSetting: (key: keyof Settings, value: any) => void
  setError: (error: ErrorMsg) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  updateSpeakers: (speakers: Speaker[]) => void;
  refresh: () => Promise<void>;
  setModelsState: (models: Model[]) => void;
  updateSubtitles: (newSubtitles: Subtitle[]) => Promise<void>;
  reformatSubtitles: () => Promise<void>;
  exportSubtitlesAs: (format: 'srt' | 'json', includeSpeakerLabels: boolean) => Promise<void>;
  importSubtitles: () => Promise<void>;
  resetSettings: () => void;
  setupEventListeners: () => () => void; // Return cleanup function
  handleDeleteModel: (modelValue: string) => Promise<void>;
  getSourceAudio: (isStandaloneMode: boolean, fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;
  cancelExport: () => Promise<any>;
}

export const GlobalContext = createContext<GlobalContextType | null>(null);

interface GlobalProviderProps {
  children: ReactNode;
}

export const DEFAULT_SETTINGS: Settings = {
  // Mode
  isStandaloneMode: false,

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
  maxCharsPerLine: 34,
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

  // State declarations
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [error, setError] = useState<ErrorMsg>({ title: "", desc: "" });
  const [fileInput, setFileInput] = useState<string | null>(null);

  // Event listener states
  const [transcriptionProgress, setTranscriptionProgress] = useState<number>(0);
  const [labeledProgress, setLabeledProgress] = useState<{ progress: number, type?: string, label?: string } | null>(null);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [isModelDownloading, setIsModelDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const cancelRequestedRef = useRef<boolean>(false);

  // UI state
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
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
          downloadedModel === model.value
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
      let filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId);
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
  }, [timelineInfo.timelineId, settings.isStandaloneMode, fileInput]);

  async function exportSubtitlesAs(format: 'srt' | 'json', includeSpeakerLabels: boolean) {
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

        let srtData = generateSrt(subtitles, includeSpeakerLabels, speakers);

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
      let filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId);
      console.log("Saving transcript to:", filename);
      // No speakers for imported subtitles
      let { segments } = await saveTranscript(transcript, filename, {
        case: settings.textCase,
        removePunctuation: settings.removePunctuation,
        splitOnPunctuation: settings.splitOnPunctuation,
        censoredWords: settings.enableCensor ? settings.censoredWords : [],
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
    let filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId);
    await updateTranscript(filename, {
      speakers: newSpeakers
    });
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

  // Set up event listeners for whisper progress
  const setupEventListeners = useCallback(() => {
    let unlistenProgress: (() => void) | null = null;
    let lastDownloadingModel: string | null = null;

    const setup = async () => {
      try {
        // Single progress listener for all whisper operations
        unlistenProgress = await listen<{ progress: number, type?: string, label?: string }>('labeled-progress', (event: { payload: any }) => {
          console.log('Received progress:', event.payload);
          setLabeledProgress(event.payload);
          
          // Handle model downloading
          if (event.payload.type === 'Download') {
            // Only extract model name when label changes to avoid repeated string operations
            if (event.payload.label !== lastDownloadingModel) {
              const modelName = event.payload.label?.replace('Downloading ', '').replace(' model...', '') || null;
              lastDownloadingModel = event.payload.label;
              setDownloadingModel(modelName);
            }
            setIsModelDownloading(true);
            setDownloadProgress(event.payload.progress);
          } else {
            // Clear model download state when not downloading
            if (isModelDownloading) {
              lastDownloadingModel = null;
              setDownloadingModel(null);
              setIsModelDownloading(false);
              setDownloadProgress(0);
            }
          }
          
          // Update transcription progress for backward compatibility
          setTranscriptionProgress(event.payload.progress);
        });

      } catch (error) {
        console.error('Failed to setup event listeners:', error);
      }
    };

    setup();

    // Return cleanup function
    return () => {
      if (unlistenProgress) unlistenProgress();
    };
  }, []);

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
  const updateSubtitles = async (newSubtitles: Subtitle[]) => {

    // Update the local subtitles state
    setSubtitles(newSubtitles);

    // Save to JSON file if we have the necessary context
    try {
      // Determine the current transcript filename
      let filename: string | null = null;

      if (timelineInfo?.timelineId) {
        // In resolve mode, use timeline name
        filename = `${timelineInfo.timelineId}.json`;
      } else {
        // In standalone mode, we need to find the most recent transcript
        const currentFilename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId);
        filename = currentFilename;
      }

      if (filename) {
        await updateTranscript(filename, {
          subtitles: newSubtitles
        });
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
    if (!fileInput && settings.isStandaloneMode) {
      console.error("No file selected")
      return false
    }
    if (!timelineInfo && !settings.isStandaloneMode) {
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
    targetLanguage: settings.targetLanguage,
    enableDtw: settings.enableDTW,
    enableGpu: settings.enableGpu,
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
      settings.isStandaloneMode,
      fileInput,
      timelineInfo?.timelineId
    )

    // Save transcript to JSON file
    const { segments, speakers } = await saveTranscript(transcript, filename, {
      case: settings.textCase,
      removePunctuation: settings.removePunctuation,
      splitOnPunctuation: settings.splitOnPunctuation,
      censoredWords: settings.enableCensor ? settings.censoredWords : [],
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

  const reformatSubtitles = async () => {
    const filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo?.timelineId);
    const transcript = await readTranscript(filename);
    if (!transcript) {
      console.error("Failed to read transcript");
      return;
    }
    const { segments, speakers } = await saveTranscript(transcript, filename, {
      case: settings.textCase,
      removePunctuation: settings.removePunctuation,
      splitOnPunctuation: settings.splitOnPunctuation,
      censoredWords: settings.enableCensor ? settings.censoredWords : [],
      maxCharsPerLine: settings.maxCharsPerLine,
      maxLinesPerSubtitle: settings.maxLinesPerSubtitle,
    });
    console.log("Subtitle list updated with", segments.length, "subtitles");
    setSpeakers(speakers);
    setSubtitles(segments);
  };

  async function pushToTimeline() {
    let filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId);
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
      checkDownloadedModels,
      setModelsState,
      setFileInput,
      updateSetting,
      setError,
      setSpeakers,
      updateSpeakers,
      refresh,
      updateSubtitles,
      reformatSubtitles,
      exportSubtitlesAs,
      importSubtitles,
      pushToTimeline,
      resetSettings,
      // Event listener states
      transcriptionProgress,
      labeledProgress,
      downloadingModel,
      isModelDownloading,
      downloadProgress,
      setTranscriptionProgress,
      setLabeledProgress,
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