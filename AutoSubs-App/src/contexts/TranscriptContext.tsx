import React, { createContext, useContext, useState, useCallback } from 'react';
import { Subtitle, Speaker, Settings } from '@/types/interfaces';
import { useResolve } from '@/contexts/ResolveContext';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import {
  generateTranscriptFilename,
  generateTranscriptTxt,
  resolveTranscriptFilename,
  readTranscript,
  saveTranscript,
  updateTranscript
} from '../utils/file-utils';
import { reformatSubtitles as rustReformatSubtitles } from '@/api/formatting-api';
import { applyTextFormattingToSubtitle } from '@/utils/subtitle-formatter';
import { generateSrt, parseSrt } from '@/utils/srt-utils';

interface TranscriptContextType {
  subtitles: Subtitle[];
  speakers: Speaker[];
  markIn: number;
  currentTranscriptFilename: string | null;
  setSubtitles: (subtitles: Subtitle[]) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  setCurrentTranscriptFilename: (filename: string | null) => void;
  updateSpeakers: (newSpeakers: Speaker[]) => Promise<void>;
  updateSubtitles: (newSubtitles: Subtitle[], filename?: string) => Promise<void>;
  processTranscriptionResults: (transcript: any, settings: Settings, fileInput: string | null, timelineId: string) => Promise<string>;
  reformatSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  exportSubtitlesAs: (format: 'srt' | 'txt', subtitles?: Subtitle[], speakers?: Speaker[]) => Promise<void>;
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

  // Load subtitles when timelineId or fileInput changes
  const loadSubtitles = useCallback(async (isStandaloneMode: boolean, fileInput: string | null, timelineId: string) => {
    const filename = await resolveTranscriptFilename(isStandaloneMode, fileInput, timelineId);
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
        setSpeakers([]);
      }
    } else {
      console.log("No matching transcript found");
      setCurrentTranscriptFilename(null);
      setSubtitles([]);
      setSpeakers([]);
    }
  }, []);

  async function updateSpeakers(newSpeakers: Speaker[]) {
    console.log("Updating speakers:", newSpeakers);
    setSpeakers(newSpeakers);

    try {
      if (currentTranscriptFilename) {
        await updateTranscript(currentTranscriptFilename, {
          speakers: newSpeakers
        });
        console.log('Speakers updated in both UI and file');
      }
    } catch (error) {
      console.error('Failed to update speakers in file:', error);
    }
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
      timelineId,
      settings.isStandaloneMode ? undefined : timelineInfo?.name
    )

    setCurrentTranscriptFilename(filename);

    // Save transcript to JSON file
    const { segments, speakers } = await saveTranscript(transcript, filename, {
      formatOptions: {
        case: settings.textCase,
        removePunctuation: settings.removePunctuation,
        censoredWords: settings.enableCensor ? settings.censoredWords : [],
      },
      metadata: {
        sourceType: settings.isStandaloneMode ? 'standalone' : 'resolve',
        displayName: settings.isStandaloneMode
          ? (fileInput?.split(/[/\\]/).pop()?.replace(/\.[^/.\\]+$/, '') || 'transcript')
          : timelineInfo?.name || 'transcript',
        timelineId: settings.isStandaloneMode ? undefined : timelineId,
        timelineName: settings.isStandaloneMode ? undefined : timelineInfo?.name,
        sourceFilePath: settings.isStandaloneMode ? fileInput || undefined : undefined,
        sourceFileName: settings.isStandaloneMode && fileInput
          ? fileInput.split(/[/\\]/).pop() || undefined
          : undefined,
      }
    })
    console.log("Transcript saved to:", filename)

    // Update the global subtitles state to show in sidebar
    setSpeakers(speakers)
    setSubtitles(segments)
    console.log("Subtitle list updated with", segments.length, "subtitles")

    return filename
  }

  const reformatSubtitles = async (settings: Settings, fileInput: string | null, timelineId: string) => {
    const filename = currentTranscriptFilename
      ?? generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineId);
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
      textDensity: settings.textDensity,
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

    // 3. Save reformatted segments and update state
    // Use updateTranscript (not saveTranscript) to preserve originalSegments unchanged
    await updateTranscript(filename, { subtitles: segments });
    console.log("Subtitle list updated with", segments.length, "subtitles");
    setSpeakers(transcript.speakers || []);
    setSubtitles(segments);
  };

  async function exportSubtitlesAs(
    format: 'srt' | 'txt', 
    subtitlesParam?: Subtitle[],
    speakersParam?: Speaker[]
  ) {
    const subtitlesToExport = subtitlesParam || subtitles;
    const speakersToExport = speakersParam || speakers;
    
    try {
      if (!subtitlesToExport || subtitlesToExport.length === 0) {
        throw new Error('No subtitles available to export');
      }

      const defaultPath = format === 'srt' ? 'subtitles.srt' : 'transcript.txt';
      const filters = format === 'srt'
        ? [{ name: 'SRT Files', extensions: ['srt'] }]
        : [{ name: 'Text Files', extensions: ['txt'] }];

      const filePath = await save({
        defaultPath,
        filters,
      });

      if (!filePath) {
        console.log('Save was canceled');
        return;
      }

      if (format === 'srt') {
        console.log('Generating SRT data from subtitles (first 3 items):', subtitlesToExport.slice(0, 3));
        console.log('Subtitles array length:', subtitlesToExport.length);

        // Log the structure of the first subtitle if it exists
        if (subtitlesToExport.length > 0) {
          console.log('First subtitle structure:', {
            keys: Object.keys(subtitlesToExport[0]),
            values: Object.entries(subtitlesToExport[0]).map(([key, value]) => ({
              key,
              type: typeof value,
              value: value
            }))
          });
        }

        let srtData = generateSrt(subtitlesToExport);

        if (!srtData || srtData.trim() === '') {
          console.error('Generated SRT data is empty');
          throw new Error('Generated SRT data is empty');
        }

        await writeTextFile(filePath, srtData);
        console.log('SRT file saved successfully to', filePath);
      } else {
        const transcriptText = generateTranscriptTxt(subtitlesToExport, speakersToExport);

        if (!transcriptText || transcriptText.trim() === '') {
          console.error('Generated transcript text is empty');
          throw new Error('Generated transcript text is empty');
        }

        await writeTextFile(filePath, transcriptText);
        console.log('TXT transcript file saved successfully to', filePath);
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
      let filename = generateTranscriptFilename(
        settings.isStandaloneMode,
        fileInput,
        timelineId,
        settings.isStandaloneMode ? undefined : timelineInfo?.name,
      );
      console.log("Saving transcript to:", filename);
      // No speakers for imported subtitles
      let { segments } = await saveTranscript(transcript, filename, {
        formatOptions: {
          case: settings.textCase,
          removePunctuation: settings.removePunctuation,
          censoredWords: settings.enableCensor ? settings.censoredWords : [],
        },
        metadata: {
          sourceType: settings.isStandaloneMode ? 'standalone' : 'resolve',
          displayName: settings.isStandaloneMode
            ? (fileInput?.split(/[/\\]/).pop()?.replace(/\.[^/.\\]+$/, '') || 'transcript')
            : timelineInfo?.name || 'transcript',
          timelineId: settings.isStandaloneMode ? undefined : timelineId,
          timelineName: settings.isStandaloneMode ? undefined : timelineInfo?.name,
          sourceFilePath: settings.isStandaloneMode ? fileInput || undefined : undefined,
          sourceFileName: settings.isStandaloneMode && fileInput
            ? fileInput.split(/[/\\]/).pop() || undefined
            : undefined,
        }
      });
      setCurrentTranscriptFilename(filename)
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
      currentTranscriptFilename,
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
