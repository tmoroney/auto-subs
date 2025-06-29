import { ReactNode, createContext, useContext, useState, useEffect, useRef } from 'react';

// Import the required APIs from Tauri
import { exit } from '@tauri-apps/plugin-process';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { load, Store } from '@tauri-apps/plugin-store';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { platform } from '@tauri-apps/plugin-os';
import { getVersion } from '@tauri-apps/api/app';
import { join, downloadDir, appCacheDir, cacheDir } from '@tauri-apps/api/path';

// Import custom APIs and utilities
import { Subtitle, Speaker, TopSpeaker, ErrorMsg, TimelineInfo, AudioInfo, Progress, Settings, EnabeledSteps } from "@/types/interfaces";
import { startTranscriptionServer, stopTranscriptionServer } from '@/api/transcriptionServer';
import { exportAudio, jumpToTime, getTimelineInfo, addSubtitles, closeResolveLink } from '@/api/resolveAPI';
import { fetchTranscription } from '@/api/transcribeAPI';
import { getFullTranscriptPath, readTranscript, updateTranscript } from '../utils/fileUtils';
import { generateSrt } from '@/utils/srtUtils';

interface GlobalContextType {
  settings: Settings;
  timelineInfo: TimelineInfo;
  subtitles: Subtitle[];
  speakers: Speaker[];
  topSpeaker: TopSpeaker;
  error: ErrorMsg;
  audioPath: string;
  progress: Progress;
  timelineId: string | null;
  updateSetting: (key: keyof Settings, value: any) => void
  enableStep: (step: keyof EnabeledSteps, state: boolean) => void;
  setError: (error: ErrorMsg) => void;
  setProgress: (progress: Progress) => void;
  runSteps: (useCachedAudio: boolean) => Promise<void>;
  setSpeakers: (speakers: Speaker[]) => void;
  updateSpeaker: (index: number, label: string, color: string, style: string) => Promise<void>;
  refresh: () => Promise<void>;
  populateSubtitles: (timelineId: string) => Promise<void>;
  addSubsToTimeline: () => Promise<void>;
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

let storageDir = "";

const DEFAULT_SETTINGS: Settings = {
  inputTrack: "0",
  outputTrack: "0",
  template: "0",
  model: "small",
  language: "auto",
  translate: false,
  maxWords: 5,
  maxChars: 25,
  textFormat: "none",
  animationType: "none",
  highlightType: "none",
  highlightColor: "#000000",
  wordLevel: false,
  removePunctuation: false,
  sensitiveWords: [],
  alignWords: false,
  diarizeSpeakerCount: 2,
  diarizeMode: "auto",
  enabledSteps: {
    exportAudio: true,
    transcribe: true,
    customSrt: false,
    diarize: false,
  }
};

export function GlobalProvider({ children }: GlobalProviderProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [store, setStore] = useState<Store | null>(null);
  const [progress, setProgress] = useState<Progress>({ isLoading: false, value: 0, currentStep: 0, message: "" });
  const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>({ name: "", timelineId: "", templates: [], inputTracks: [], outputTracks: [] });

  // State declarations
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [topSpeaker, setTopSpeaker] = useState<TopSpeaker>({ label: "", id: "", percentage: 0 });
  const [error, setError] = useState<ErrorMsg>({ title: "", desc: "" });
  const [audioPath, setAudioPath] = useState("");
  const [markIn, setMarkIn] = useState(0);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [markOut, setMarkOut] = useState(0);
  const hasInitialized = useRef(false);

  // Initialization useEffect
  useEffect(() => {
    setTranscriptsFolder();
    // if (!hasInitialized.current) {
    //   startTranscriptionServer({
    //     setProgress: (value: number) => setProgress(prev => ({ ...prev, value: value })),
    //     setIsLoading: (value: boolean) => setProgress(prev => ({ ...prev, isLoading: value })),
    //     setCurrentStep: (value: number) => setProgress(prev => ({ ...prev, currentStep: value })),
    //     setMessage: (message: string) => setProgress(prev => ({ ...prev, message: message })),
    //     setSubtitles: (update: (prev: any[]) => any[]) => setSubtitles(prev => update(prev)),
    //     enabledSteps: settings.enabledSteps,
    //     serverLoadingRef: { current: false }
    //   });
    //   hasInitialized.current = true;
    // }
    initializeStore();
    setTranscriptsFolder();
    
    // Initialize timeline info and load subtitles
    async function initializeTimeline() {
      try {
        console.log('Fetching timeline info...');
        const info = await getTimelineInfo().catch(() => {
          console.log('Backend is offline, using example captions');
          return null;
        });

        if (info && info.timelineId) {
          console.log('Timeline info received:', info);
          setTimelineInfo(info);
          console.log('Populating subtitles for timeline:', info.timelineId);
          await populateSubtitles(info.timelineId);
        } else {
          // Load example captions when backend is offline
          console.log('Loading example captions...');
          try {
            const response = await fetch('/example-captions.json');
            if (!response.ok) throw new Error('Failed to load example captions');
            
            const exampleCaptions = await response.json();
            console.log('Example captions loaded:', exampleCaptions);
            
            // Transform example captions to match Subtitle type
            const subtitles = exampleCaptions.map((caption: any) => {
              const subtitle: any = {
                id: caption.id.toString(),
                start: caption.start,
                end: caption.end,
                text: caption.text.trim(),
                words: caption.words || []
              };
              // Only add speaker if speaker_id exists in the original data
              if (caption.speaker_id !== undefined) {
                subtitle.speaker = `Speaker ${caption.speaker_id}`;
              }
              return subtitle;
            });
            
            setSubtitles(subtitles);
            console.log('Example subtitles set:', subtitles);
          } catch (error) {
            console.error('Error loading example captions:', error);
            setError({
              title: 'Backend Offline',
              desc: 'Could not connect to the backend and failed to load example captions.'
            });
          }
        }
      } catch (error) {
        console.error('Error initializing timeline:', error);
      }
    }
    
    initializeTimeline();
    
    getCurrentWindow().once("tauri://close-requested", async () => {
      await stopTranscriptionServer();
      closeResolveLink();
      exit(0);
    });
  }, []);

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

  async function setTranscriptsFolder() {
    storageDir = platform() === 'windows'
      ? await join(await cacheDir(), "AutoSubs-Cache/Cache/transcripts")
      : await join(await appCacheDir(), "transcripts");
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
  const updateSetting = (key: keyof typeof DEFAULT_SETTINGS, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };
  // Enable or disable a step
  const enableStep = (step: keyof EnabeledSteps, state: boolean) => {
    setSettings(prev => ({
      ...prev,
      enabledSteps: {
        ...prev.enabledSteps,
        [step]: state
      }
    }));
  };

  // Load subtitles when timelineId changes
  useEffect(() => {
    async function loadSubtitles() {
      if (timelineId) {
        console.log("Loading subtitles for timeline:", timelineId);
        const transcript = await readTranscript(timelineId, storageDir);
        if (transcript) {
          console.log("Transcript loaded:", transcript);
          setMarkIn(transcript.mark_in);
          setSubtitles(transcript.segments || []);
          setSpeakers(transcript.speakers || []);
          setTopSpeaker(transcript.top_speaker || { name: '', count: 0 });
          console.log("Subtitles set:", transcript.segments);
        } else {
          console.warn("No transcript found for timeline:", timelineId);
          setSubtitles([]);
        }
      } else {
        console.log("No timelineId, clearing subtitles");
        setSubtitles([]);
      }
    }
    
    loadSubtitles();
  }, [timelineId]);

  async function populateSubtitles(newTimelineId: string) {
    if (process.env.NODE_ENV === 'development') {
      console.log("Setting timelineId to:", newTimelineId);
    }
    setTimelineId(newTimelineId);
  }

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

      let transcript = {
        "segments": subtitles,
        "speakers": [],
      }

      // write to json file
      await writeTextFile(await join(storageDir, `${timelineInfo.timelineId}.json`), JSON.stringify(transcript, null, 2));
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
    await updateTranscript(storageDir, timelineInfo.timelineId, newSpeakers, newTopSpeaker); // Use updated newTopSpeaker
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

  async function runSteps(useCachedAudio: boolean) {
    // To-do: Add ability to re-run specific step - not only cached audio
    setProgress(prev => ({ ...prev, isLoading: true, progress: 5 }));
    setSubtitles([]);

    // Initialize audio info with timeline and path
    const audioInfo: AudioInfo = {
      timeline: timelineInfo.timelineId,
      path: audioPath,
      markIn: markIn,
      markOut: markOut
    };

    if (settings.enabledSteps.exportAudio && !useCachedAudio && !settings.enabledSteps.customSrt) {
      setProgress(prev => ({ ...prev, currentStep: 1 }));
      // Update audio info with exported audio details
      Object.assign(audioInfo, await exportAudio(settings.inputTrack));
    }

    setProgress(prev => ({ ...prev, progress: 20 }));
    
    if (settings.enabledSteps.transcribe && !settings.enabledSteps.customSrt) {
      setProgress(prev => ({ ...prev, currentStep: 2 }));
      // Get the full transcript path and fetch transcription
      await getFullTranscriptPath(timelineInfo.timelineId, storageDir);
      await fetchTranscription(settings);
    }

    // TODO: skip transcription if custom srt is enabled
    // TODO: send request to modify subtitles if only text format is re-run

    setProgress(prev => ({ ...prev, currentStep: 7, progress: 90, message: "Populating timeline..." }));
    await populateSubtitles(timelineInfo.timelineId);
    await addSubtitles("filepath", timelineInfo.timelineId, settings.outputTrack);

    setProgress(prev => ({ ...prev, progress: 100, isLoading: false }));
  }

  async function addSubsToTimeline() {
    await addSubtitles(await getFullTranscriptPath(timelineInfo.timelineId, storageDir), timelineInfo.timelineId, settings.outputTrack);
  }

  async function jumpToSpeaker(start: number) {
    await jumpToTime(start, markIn);
  }
  
  async function refresh() {
    try {
    setTimelineInfo(await getTimelineInfo());
    await populateSubtitles(timelineInfo.timelineId);
    } catch (error) {
      setError({
        title: "Failed to get current timeline",
        desc: "Please open a timeline in Resolve, then try again."
      });
    }
  }

  return (
    <GlobalContext.Provider value={{
      settings,
      timelineInfo,
      subtitles,
      speakers,
      topSpeaker,
      error,
      audioPath,
      progress,
      timelineId,
      updateSetting,
      enableStep,
      setError,
      setProgress,
      runSteps,
      setSpeakers,
      updateSpeaker,
      refresh,
      populateSubtitles,
      addSubsToTimeline,
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