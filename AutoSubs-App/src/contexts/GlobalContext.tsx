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

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

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
  // Processing steps state
  processingSteps: ProcessingStep[];
  livePreviewSegments: Subtitle[];
  // Transcription utils
  validateTranscriptionInput: () => boolean;
  createTranscriptionOptions: (audioInfo: { path: string, offset: number }) => TranscriptionOptions;
  processTranscriptionResults: (transcript: any) => Promise<string>;
  pushToTimeline: () => Promise<void>;
  // UI state
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
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
  // Processing step management
  clearProgressSteps: () => void;
  completeAllProgressSteps: () => void;
  cancelAllProgressSteps: () => void;
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

  // Simplified progress management
  const [progressSteps, setProgressSteps] = useState<ProcessingStep[]>([]);
  
  // Live subtitle preview state
  const [livePreviewSegments, setLivePreviewSegments] = useState<Subtitle[]>([]);
  
  // Track seen segments to prevent duplicates across multiple listener setups
  const seenSegmentsRef = useRef<Set<string>>(new Set());

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const cancelRequestedRef = useRef<boolean>(false);

  // UI state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
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

  // Simplified progress step management
  const updateProgressStep = (event: { progress: number, type?: string, label?: string }) => {
    setProgressSteps(prev => {
      const stepId = event.type || 'Unknown'
      const stepTitle = getStepTitle(event.type)
      const stepOrder = getStepOrder()
      
      // Normalize step ID for ordering - treat unknown types as "Warming Up"
      const normalizedStepId = stepOrder.includes(stepId) ? stepId : 'Warming Up'
      
      // Start artificial warming up progress if this is a warming up step and not already animating
      if (normalizedStepId === 'Warming Up' && event.progress < 100 && !warmingUpIntervalRef.current) {
        // Check if we already have a warming up step in the array
        const existingWarmingUpStep = prev.find(s => {
          const stepNormalizedId = stepOrder.includes(s.id) ? s.id : 'Warming Up'
          return stepNormalizedId === 'Warming Up'
        })
        
        if (!existingWarmingUpStep) {
          // Only start animation if no warming up step exists yet
          startWarmingUpProgress()
          return prev // Don't update yet, let the animation handle it
        }
      }
      
      // Stop warming up progress if we're moving to a different step
      if (normalizedStepId !== 'Warming Up' && warmingUpIntervalRef.current) {
        stopWarmingUpProgress()
      }
      
      // Find existing step (by original ID, not normalized)
      const existingStepIndex = prev.findIndex(s => s.id === stepId)
      
      if (existingStepIndex >= 0) {
        // Update existing step
        const updated = [...prev]
        updated[existingStepIndex] = {
          ...updated[existingStepIndex],
          progress: event.progress,
          description: `${Math.round(event.progress)}%`,
          isActive: event.progress < 100,
          isCompleted: event.progress >= 100
        }
        
        // When this step is active (progress < 100), set all previous steps to completed
        if (event.progress < 100) {
          const currentStepOrderIndex = stepOrder.indexOf(normalizedStepId)
          
          return updated.map((step, index) => {
            const stepNormalizedId = stepOrder.includes(step.id) ? step.id : 'Warming Up'
            const stepOrderIndex = stepOrder.indexOf(stepNormalizedId)
            const isPreviousStep = currentStepOrderIndex > -1 && stepOrderIndex > -1 && stepOrderIndex < currentStepOrderIndex
            
            return {
              ...step,
              isActive: index === existingStepIndex,
              isCompleted: isPreviousStep || (index === existingStepIndex && event.progress >= 100),
              progress: isPreviousStep ? 100 : step.progress,
              description: isPreviousStep ? '100%' : step.description
            }
          })
        }
        
        return updated
      } else {
        // Add new step
        const newStep: ProcessingStep = {
          id: stepId,
          title: stepTitle,
          description: `${Math.round(event.progress)}%`,
          progress: event.progress,
          isActive: event.progress < 100,
          isCompleted: event.progress >= 100
        }
        
        // When adding new active step, set all previous steps to completed
        if (event.progress < 100) {
          const currentStepOrderIndex = stepOrder.indexOf(normalizedStepId)
          
          return prev.map(step => {
            const stepNormalizedId = stepOrder.includes(step.id) ? step.id : 'Warming Up'
            const stepOrderIndex = stepOrder.indexOf(stepNormalizedId)
            const isPreviousStep = currentStepOrderIndex > -1 && stepOrderIndex > -1 && stepOrderIndex < currentStepOrderIndex
            
            return {
              ...step,
              isActive: false,
              isCompleted: isPreviousStep || step.isCompleted,
              progress: isPreviousStep ? 100 : step.progress,
              description: isPreviousStep ? '100%' : step.description
            }
          }).concat(newStep)
        }
        
        return [...prev, newStep]
      }
    })
  }
  
  const getStepTitle = (type?: string): string => {
    switch (type) {
      case 'Download': return 'Downloading Model'
      case 'Transcribe': return 'Transcribing Audio'
      case 'Translate': return `Translating to ${settings.targetLanguage}`
      default: return type || 'Warming Up'
    }
  }

  // Warming up progress animation state
  const warmingUpIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Start artificial warming up progress
  const startWarmingUpProgress = useCallback(() => {
    // Clear any existing interval
    if (warmingUpIntervalRef.current) {
      clearInterval(warmingUpIntervalRef.current)
    }

    let progress = 0
    const duration = 5000 // 5 seconds
    const interval = 100 // Update every 100ms
    const increment = (interval / duration) * 100

    warmingUpIntervalRef.current = setInterval(() => {
      progress += increment
      if (progress >= 100) {
        progress = 100
        if (warmingUpIntervalRef.current) {
          clearInterval(warmingUpIntervalRef.current)
          warmingUpIntervalRef.current = null
        }
      }

      // Find any existing warming up step and update it
      setProgressSteps(prev => {
        const warmingUpStepIndex = prev.findIndex(s => {
          const stepOrder = getStepOrder()
          const stepNormalizedId = stepOrder.includes(s.id) ? s.id : 'Warming Up'
          return stepNormalizedId === 'Warming Up'
        })

        if (warmingUpStepIndex >= 0) {
          const updated = [...prev]
          updated[warmingUpStepIndex] = {
            ...updated[warmingUpStepIndex],
            progress: Math.round(progress),
            description: `${Math.round(progress)}%`,
            isActive: progress < 100,
            isCompleted: progress >= 100
          }
          return updated
        } else {
          // Create warming up step if it doesn't exist
          const newStep: ProcessingStep = {
            id: 'Warming Up',
            title: 'Warming Up',
            description: `${Math.round(progress)}%`,
            progress: Math.round(progress),
            isActive: progress < 100,
            isCompleted: progress >= 100
          }
          return [...prev, newStep]
        }
      })
    }, interval)
  }, [])

  // Stop warming up progress
  const stopWarmingUpProgress = useCallback(() => {
    if (warmingUpIntervalRef.current) {
      clearInterval(warmingUpIntervalRef.current)
      warmingUpIntervalRef.current = null
    }
  }, [])

  // Define the order of progress steps
  const getStepOrder = (): string[] => {
    // Include common step types that might appear before the main ones
    const order = ['Warming Up', 'Download', 'Transcribe']
    if (settings.targetLanguage && settings.targetLanguage !== settings.language) {
      order.push('Translate')
    }
    return order
  }
  
  const clearProgressSteps = () => {
    // Stop warming up progress animation
    stopWarmingUpProgress()
    
    setProgressSteps([])
    // Also clear live preview segments when starting new transcription
    setLivePreviewSegments([])
    seenSegmentsRef.current.clear()
    console.log('Cleared progress steps and live preview segments');
  }
  
  const completeAllProgressSteps = () => {
    // Stop warming up progress animation
    stopWarmingUpProgress()
    
    setProgressSteps(prev => [
      ...prev.map(step => ({
        ...step,
        progress: 100,
        isActive: false,
        isCompleted: true
      })),
      {
        id: 'Complete',
        title: 'Transcription Complete',
        description: 'Choose how to use your transcript',
        progress: 100,
        isActive: false,
        isCompleted: true
      }
    ])
  }

  // Cancel all progress steps and show cancelled state
  const cancelAllProgressSteps = () => {
    // Stop warming up progress animation
    stopWarmingUpProgress()
    
    setProgressSteps(prev => 
      prev.map(step => ({
        ...step,
        isActive: false,
        isCancelled: step.isActive && !step.isCompleted, // Mark active steps as cancelled
        // Keep completed steps as completed, don't change them
        isCompleted: step.isCompleted
      }))
    )
  }

  // Set up simplified event listener
  const setupEventListeners = useCallback(() => {
    const setup = async () => {
      try {
        // Single progress listener that directly updates steps array
        await listen<{ progress: number, type?: string, label?: string }>('labeled-progress', (event: { payload: any }) => {
          console.log('Received progress event:', JSON.stringify(event.payload, null, 2));
          updateProgressStep(event.payload);
        });
        
        // New segment listener for live preview
        await listen<string>('new-segment', (event: { payload: any }) => {
          console.log('Received new segment:', event.payload);
          
          // Check if this segment text already exists to prevent duplicates
          const segmentText = event.payload.trim();
          if (!segmentText) {
            console.log('Skipping empty segment');
            return;
          }
          
          // Use the Set to track segments across all listener instances
          if (seenSegmentsRef.current.has(segmentText)) {
            console.log('Skipping duplicate segment (Set):', segmentText);
            return;
          }
          
          // Add to seen segments
          seenSegmentsRef.current.add(segmentText);
          console.log('Adding new segment:', segmentText);
          
          // Create a simple subtitle object from the text
          const newSegment: Subtitle = {
            id: livePreviewSegments.length + 1,
            start: 0,
            end: 0,
            text: event.payload,
            words: [], // Empty array for live preview
            speaker_id: undefined
          };
          
          setLivePreviewSegments(prev => {
            console.log('Current segments count:', prev.length);
            return [...prev, newSegment];
          });
        });
        
        // Clear live preview and seen segments when transcription completes
        await listen('transcription-complete', () => {
          console.log('Transcription complete, clearing live preview');
          setLivePreviewSegments([]);
          seenSegmentsRef.current.clear();
        });
        
      } catch (error) {
        console.error('Failed to set up progress listener:', error);
      }
    };
    
    setup();
    
    // Return cleanup function
    return () => {
      // Cleanup handled automatically by Tauri when component unmounts
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
      transcriptionProgress: 0,
      labeledProgress: null,
      downloadingModel: null,
      isModelDownloading: false,
      downloadProgress: 0,
      setTranscriptionProgress: () => {},
      setLabeledProgress: () => {},
      setupEventListeners,
      handleDeleteModel,
      getSourceAudio,
      cancelExport,
      // Progress state
      processingSteps: progressSteps,
      livePreviewSegments,
      clearProgressSteps,
      completeAllProgressSteps,
      cancelAllProgressSteps,
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
      isProcessing,
      setIsProcessing,
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