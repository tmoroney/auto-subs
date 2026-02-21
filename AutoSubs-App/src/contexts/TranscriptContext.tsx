import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Subtitle, Speaker, Settings } from '@/types/interfaces';
import { useResolve } from '@/contexts/ResolveContext';
import { useSettings } from '@/contexts/SettingsContext';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import {
  generateTranscriptFilename,
  readTranscript,
  saveTranscript,
  updateTranscript
} from '../utils/file-utils';
import { reformatSubtitles as rustReformatSubtitles } from '@/utils/formatting-api';
import { applyTextFormattingToSubtitle } from '@/utils/subtitle-formatter';
import { generateSrt, parseSrt } from '@/utils/srt-utils';

interface TranscriptContextType {
  subtitles: Subtitle[];
  speakers: Speaker[];
  markIn: number;
  setSubtitles: (subtitles: Subtitle[]) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  setCurrentTranscriptFilename: (filename: string | null) => void;
  updateSpeakers: (newSpeakers: Speaker[]) => Promise<void>;
  updateSubtitles: (newSubtitles: Subtitle[], filename?: string) => Promise<void>;
  processTranscriptionResults: (transcript: any, settings: Settings, fileInput: string | null, timelineId: string) => Promise<string>;
  reformatSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  exportSubtitlesAs: (format: 'srt' | 'json', includeSpeakerLabels: boolean, subtitles?: Subtitle[], speakers?: Speaker[]) => Promise<void>;
  importSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  loadSubtitles: (isStandaloneMode: boolean, fileInput: string | null, timelineId: string) => Promise<void>;
}

const TranscriptContext = createContext<TranscriptContextType | null>(null);

export function TranscriptProvider({ children }: { children: React.ReactNode }) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [markIn, setMarkIn] = useState(0);
  const [currentTranscriptFilename, setCurrentTranscriptFilename] = useState<string | null>(null);
  const { timelineInfo } = useResolve();
  const { settings } = useSettings();

  // Auto-load subtitles when timeline changes
  useEffect(() => {
    const loadSubtitlesForTimeline = async () => {
      if (timelineInfo?.timelineId) {
        console.log("Timeline changed, loading subtitles for:", timelineInfo.timelineId);
        await loadSubtitles(settings.isStandaloneMode, null, timelineInfo.timelineId);
      } else {
        console.log("No timeline, clearing subtitles");
        setSubtitles([]);
        setSpeakers([]);
      }
    };

    loadSubtitlesForTimeline();
  }, [timelineInfo?.timelineId, settings.isStandaloneMode]);

  // Load subtitles when timelineId or fileInput changes
  const loadSubtitles = useCallback(async (isStandaloneMode: boolean, fileInput: string | null, timelineId: string) => {
    let filename = generateTranscriptFilename(isStandaloneMode, fileInput, timelineId);
    if (filename && filename.length > 0) {
      console.log("Loading subtitles:", filename);
      const transcript = await readTranscript(filename);
      if (transcript) {
        console.log("Transcript loaded:", transcript);
        setCurrentTranscriptFilename(filename);
        setMarkIn(transcript.mark_in);
        setSubtitles(transcript.segments || []);
        setSpeakers(transcript.speakers || []);
      } else {
        console.warn("No transcript found for:", filename);
        setCurrentTranscriptFilename(null);
        setSubtitles([]);
      }
    } else {
      console.log("No timelineId, clearing subtitles");
      setCurrentTranscriptFilename(null);
      setSubtitles([]);
    }
  }, []);

  async function updateSpeakers(newSpeakers: Speaker[]) {
    console.log("Updating speakers:", newSpeakers);
    setSpeakers(newSpeakers);
    // Note: This will need to be called with proper context for filename generation
    // We'll handle this in the implementation where it's used
  }

  // Function to update a specific subtitle
  const updateSubtitles = async (newSubtitles: Subtitle[], filename?: string) => {
    // Update the local subtitles state
    setSubtitles(newSubtitles);

    // Save to JSON file if we have the necessary context
    try {
      const targetFilename = filename ?? currentTranscriptFilename;
      if (targetFilename) {
        await updateTranscript(targetFilename, {
          subtitles: newSubtitles
        });
        console.log('Subtitle updated in both UI and file');
      }
    } catch (error) {
      console.error('Failed to update subtitle in file:', error);
    }
  };

  /**
   * Processes transcription results
   */
  const processTranscriptionResults = async (
    transcript: any, 
    settings: Settings, 
    fileInput: string | null, 
    timelineId: string
  ): Promise<string> => {
    // Generate filename for new transcript based on mode and input
    const filename = generateTranscriptFilename(
      settings.isStandaloneMode,
      fileInput,
      timelineId
    )

    setCurrentTranscriptFilename(filename);

    // Save transcript to JSON file
    const { segments, speakers } = await saveTranscript(transcript, filename, {
      case: settings.textCase,
      removePunctuation: settings.removePunctuation,
      censoredWords: settings.enableCensor ? settings.censoredWords : [],
    })
    console.log("Transcript saved to:", filename)

    // Update the global subtitles state to show in sidebar
    setSpeakers(speakers)
    setSubtitles(segments)
    console.log("Subtitle list updated with", segments.length, "subtitles")

    return filename
  }

  const reformatSubtitles = async (settings: Settings, fileInput: string | null, timelineId: string) => {
    const filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineId);
    const transcript = await readTranscript(filename);
    if (!transcript) {
      console.error("Failed to read transcript");
      return;
    }

    setCurrentTranscriptFilename(filename);
    const originalSegments: Subtitle[] = transcript.originalSegments || transcript.segments || [];

    // 1. Structural splitting via Rust (from original word-level data)
    let segments = await rustReformatSubtitles(originalSegments, {
      maxLines: settings.maxLinesPerSubtitle,
      textDensity: "standard",
      language: settings.language,
    });

    // 2. Content formatting in JS (case, punctuation, censoring)
    const censoredWords = settings.enableCensor ? settings.censoredWords : [];
    segments = segments.map(sub =>
      applyTextFormattingToSubtitle(sub, {
        case: settings.textCase,
        removePunctuation: settings.removePunctuation,
        censoredWords,
      })
    );

    // 3. Save and update state
    const speakers: Speaker[] = transcript.speakers || [];
    const { segments: savedSegments, speakers: savedSpeakers } = await saveTranscript(
      { ...transcript, segments, originalSegments, speakers },
      filename,
    );
    console.log("Subtitle list updated with", savedSegments.length, "subtitles");
    setSpeakers(savedSpeakers);
    setSubtitles(savedSegments);
  };

  async function exportSubtitlesAs(
    format: 'srt' | 'json', 
    includeSpeakerLabels: boolean, 
    subtitlesParam?: Subtitle[]
  ) {
    const subtitlesToExport = subtitlesParam || subtitles;
    
    try {
      if (!subtitlesToExport || subtitlesToExport.length === 0) {
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

  async function importSubtitles(settings: Settings, fileInput: string | null, timelineId: string) {
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
      let filename = generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineId);
      console.log("Saving transcript to:", filename);
      // No speakers for imported subtitles
      let { segments } = await saveTranscript(transcript, filename, {
        case: settings.textCase,
        removePunctuation: settings.removePunctuation,
        censoredWords: settings.enableCensor ? settings.censoredWords : [],
      });
      setSubtitles(segments)
    } catch (error) {
      console.error('Failed to open file', error);
      // Error handling should be done by caller
      throw error;
    }
  }

  return (
    <TranscriptContext.Provider value={{
      subtitles,
      speakers,
      markIn,
      setSubtitles,
      setSpeakers,
      setCurrentTranscriptFilename,
      updateSpeakers,
      updateSubtitles,
      processTranscriptionResults,
      reformatSubtitles,
      exportSubtitlesAs,
      importSubtitles,
      loadSubtitles,
    }}>
      {children}
    </TranscriptContext.Provider>
  );
}

export const useTranscript = () => {
  const context = useContext(TranscriptContext);
  if (!context) {
    throw new Error('useTranscript must be used within a TranscriptProvider');
  }
  return context;
};
