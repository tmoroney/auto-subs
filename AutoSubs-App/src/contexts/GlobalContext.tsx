import { ReactNode, createContext, useContext, useState, useEffect } from 'react';

// Import the required APIs from Tauri
import { open, save } from '@tauri-apps/plugin-dialog';
import { load, Store } from '@tauri-apps/plugin-store';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { downloadDir } from '@tauri-apps/api/path';

// Import custom APIs and utilities
import { Subtitle, Speaker, TopSpeaker, ErrorMsg, TimelineInfo, Settings, Model } from "@/types/interfaces";
import { jumpToTime, getTimelineInfo } from '@/api/resolveAPI';
import { generateTranscriptFilename, readTranscript, saveTranscript, updateTranscript } from '../utils/fileUtils';
import { generateSrt } from '@/utils/srtUtils';
import { models } from '@/lib/models';

interface GlobalContextType {
  settings: Settings;
  modelsState: Model[];
  isStandaloneMode: boolean;
  timelineInfo: TimelineInfo;
  subtitles: Subtitle[];
  speakers: Speaker[];
  topSpeaker: TopSpeaker;
  error: ErrorMsg;
  fileInput: string | null;
  checkDownloadedModels: () => Promise<void>;
  setIsStandaloneMode: (isStandaloneMode: boolean) => void;
  setFileInput: (fileInput: string | null) => void;
  updateSetting: (key: keyof Settings, value: any) => void
  setError: (error: ErrorMsg) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  updateSpeaker: (index: number, label: string, color: string, style: string) => Promise<void>;
  refresh: () => Promise<void>;
  setModelsState: (models: Model[]) => void;
  updateSubtitles: (subtitles: Subtitle[]) => void;
  updateCaption: (captionId: number, updatedCaption: { id: number; start: number; end: number; text: string; speaker?: string; words?: any[] }) => Promise<void>;
  exportSubtitles: () => Promise<void>;
  importSubtitles: () => Promise<void>;
  jumpToSpeaker: (start: number) => void;
  resetSettings: () => void;
  checkForUpdates: () => Promise<string | null>;
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
  maxSpeakers: 2,

  // Text settings
  maxWords: 5,
  maxChars: 25,
  numLines: 1,
  textFormat: "none",
  removePunctuation: false,
  enableCensor: false,
  censorWords: [],

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
  const [topSpeaker, setTopSpeaker] = useState<TopSpeaker>({ label: "", id: "", percentage: 0 });
  const [error, setError] = useState<ErrorMsg>({ title: "", desc: "" });
  const [fileInput, setFileInput] = useState<string | null>(null);

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

    /*
    getCurrentWindow().once("tauri://close-requested", async () => {
      try {
        // Set a timeout to ensure we don't hang forever
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout waiting for Resolve API')), 1000);
        });
        
        // Try to send the exit request, but don't wait indefinitely
        await Promise.race([
          closeResolveLink().catch(err => console.error('Error closing Resolve link:', err)),
          timeoutPromise
        ]);
      } catch (error) {
        console.error('Failed to properly close Resolve link:', error);
      } finally {
        // Always exit the app, even if the request failed
        exit(0);
      }
    });
    */
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
          setTopSpeaker(transcript.top_speaker || { name: '', count: 0 });
          console.log("Subtitles set:", transcript.segments);
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
    try {
      if (!subtitles || subtitles.length === 0) {
        throw new Error('No subtitles available to export');
      }

      const filePath = await save({
        defaultPath: 'subtitles.srt',
        filters: [{ name: 'SRT Files', extensions: ['srt'] }],
      });

      if (!filePath) {
        console.log('Save was canceled');
        return;
      }

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
      console.log('File saved successfully to', filePath);
    } catch (error) {
      console.error('Failed to save file', error);
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

      // read srt file and convert to json
      const srtData = await readTextFile(transcriptPath);
      const srtLines = srtData.split('\n');
      let subtitles: Subtitle[] = [];

      // convert srt to [{start, end, text}]
      for (let i = 0; i < srtLines.length; i++) {
        if (srtLines[i].match(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/)) {
          let start = srtLines[i].split(' --> ')[0];
          let end = srtLines[i].split(' --> ')[1];
          let text = srtLines[i + 1];

          const [startHours, startMinutes, startSeconds] = start.split(':');
          const [startSecs, startMillis] = startSeconds.split(',');
          const startInSeconds = parseInt(startHours) * 3600 + parseInt(startMinutes) * 60 + parseInt(startSecs) + parseInt(startMillis) / 1000;

          const [endHours, endMinutes, endSeconds] = end.split(':');
          const [endSecs, endMillis] = endSeconds.split(',');
          const endInSeconds = parseInt(endHours) * 3600 + parseInt(endMinutes) * 60 + parseInt(endSecs) + parseInt(endMillis) / 1000;

          let subtitle = { start: startInSeconds.toString(), end: endInSeconds.toString(), text, speaker: "" };
          subtitles.push(subtitle);
        }
      }

      setSubtitles(subtitles);

      let transcript = { "segments": subtitles };

      // Save transcript to file in Transcripts directory
      let filename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineInfo.timelineId);
      await saveTranscript(transcript, filename);
    } catch (error) {
      console.error('Failed to open file', error);
      setError({
        title: "Error Opening SRT File",
        desc: "Failed to open the SRT file. Please try again."
      });
    }
  }

  async function updateSpeaker(index: number, label: string, color: string, style: string) {
    let newTopSpeaker = topSpeaker;
    if (topSpeaker.id === speakers[index].id) {
      newTopSpeaker = { ...topSpeaker, label };
      setTopSpeaker(newTopSpeaker); // Update the state
    }

    const newSpeakers = [...speakers];
    newSpeakers[index].label = label;
    newSpeakers[index].color = color;
    newSpeakers[index].style = style;

    setSpeakers(newSpeakers);
    await updateTranscript(timelineInfo.timelineId, newSpeakers, newTopSpeaker); // Use updated newTopSpeaker
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

  // async function runSteps(useCachedAudio: boolean) {
  //   // To-do: Add ability to re-run specific step - not only cached audio
  //   setProgress(prev => ({ ...prev, isLoading: true, progress: 5 }));
  //   setSubtitles([]);

  //   // Initialize audio info with timeline and path
  //   const audioInfo: AudioInfo = {
  //     timeline: timelineInfo.timelineId,
  //     path: audioPath,
  //     markIn: markIn,
  //     markOut: markOut
  //   };

  //   if (settings.enabledSteps.exportAudio && !useCachedAudio && !settings.enabledSteps.customSrt) {
  //     setProgress(prev => ({ ...prev, currentStep: 1 }));
  //     // Update audio info with exported audio details
  //     Object.assign(audioInfo, await exportAudio(settings.inputTrack));
  //   }

  //   setProgress(prev => ({ ...prev, progress: 20 }));

  //   if (settings.enabledSteps.transcribe && !settings.enabledSteps.customSrt) {
  //     setProgress(prev => ({ ...prev, currentStep: 2 }));
  //     // Get the full transcript path and fetch transcription
  //     await getFullTranscriptPath(timelineInfo.timelineId);
  //     //await fetchTranscription(settings);
  //   }

  //   // TODO: skip transcription if custom srt is enabled
  //   // TODO: send request to modify subtitles if only text format is re-run

  //   setProgress(prev => ({ ...prev, currentStep: 7, progress: 90, message: "Populating timeline..." }));
  //   await populateSubtitles(timelineInfo.timelineId);
  //   await addSubtitles("filepath", timelineInfo.timelineId, settings.outputTrack);

  //   setProgress(prev => ({ ...prev, progress: 100, isLoading: false }));
  // }

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

  // Function to update subtitles
  const updateSubtitles = (newSubtitles: Subtitle[]) => {
    setSubtitles(newSubtitles);
  };

  // Function to update a specific caption
  const updateCaption = async (captionId: number, updatedCaption: { id: number; start: number; end: number; text: string; speaker?: string; words?: any[] }) => {
    // Update the local subtitles state
    setSubtitles(prevSubtitles =>
      prevSubtitles.map((subtitle: any) => {
        if (subtitle.id === captionId.toString()) {
          return {
            ...subtitle,
            start: updatedCaption.start.toString(),
            end: updatedCaption.end.toString(),
            text: updatedCaption.text,
            speaker: updatedCaption.speaker || subtitle.speaker,
            words: updatedCaption.words || subtitle.words
          };
        }
        return subtitle;
      })
    );

    // Save to JSON file if we have the necessary context
    try {
      const { updateCaptionInTranscript } = await import('@/utils/fileUtils');

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
        await updateCaptionInTranscript(filename, updatedCaption);
        console.log('Caption updated in both UI and file');
      }
    } catch (error) {
      console.error('Failed to update caption in file:', error);
    }
  };

  return (
    <GlobalContext.Provider value={{
      settings,
      modelsState,
      timelineInfo,
      subtitles,
      speakers,
      topSpeaker,
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
      updateSpeaker,
      refresh,
      updateSubtitles,
      updateCaption,
      exportSubtitles,
      importSubtitles,
      jumpToSpeaker,
      resetSettings,
      checkForUpdates
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