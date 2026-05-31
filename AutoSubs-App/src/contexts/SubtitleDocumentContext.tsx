import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Subtitle, Speaker, Settings } from '@/types';
import { useResolve } from '@/contexts/ResolveContext';
import { useAdobe } from '@/contexts/AdobeContext';
import { useIntegration } from '@/contexts/IntegrationContext';
import { getActiveCensorWords } from '@/censor/merge';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import {
  generateSubtitleDocumentFilename,
  generateTranscriptTxt,
  resolveSubtitleDocumentFilename,
  readSubtitleDocument,
  saveSubtitleDocument,
  updateSubtitleDocument
} from '../utils/file-utils';
import { reformatSubtitles as rustReformatSubtitles } from '@/api/formatting-api';
import { generateSrt, parseSrt } from '@/utils/srt-utils';
import { loadFontForLanguage } from '@/lib/font-loader';

interface SubtitleDocumentContextType {
  subtitles: Subtitle[];
  speakers: Speaker[];
  markIn: number;
  currentSubtitleDocumentFilename: string | null;
  setSubtitles: (subtitles: Subtitle[]) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  setCurrentSubtitleDocumentFilename: (filename: string | null) => void;
  updateSpeakers: (newSpeakers: Speaker[]) => Promise<void>;
  updateSubtitles: (newSubtitles: Subtitle[], filename?: string) => Promise<void>;
  flushPendingSubtitleSave: () => Promise<void>;
  processTranscriptionResults: (transcript: any, settings: Settings, fileInput: string | null, timelineId: string) => Promise<string>;
  reformatSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  exportSubtitlesAs: (format: 'srt' | 'txt', subtitles?: Subtitle[], speakers?: Speaker[]) => Promise<void>;
  importSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  loadSubtitles: (audioInputMode: "file" | "timeline", fileInput: string | null, timelineId: string) => Promise<void>;
}

const SubtitleDocumentContext = createContext<SubtitleDocumentContextType | null>(null);

export function SubtitleDocumentProvider({ children }: { children: React.ReactNode }) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [markIn, setMarkIn] = useState(0);
  const [currentSubtitleDocumentFilename, setCurrentSubtitleDocumentFilename] = useState<string | null>(null);

  // Debounce subtitle file writes to prevent concurrent read-parse-stringify-write
  // cycles from accumulating in the V8 heap when the user types quickly.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ subtitles: Subtitle[]; filename: string } | null>(null);
  const { timelineInfo: resolveTimeline } = useResolve();
  const { timelineInfo: adobeTimeline } = useAdobe();
  const { selectedIntegration } = useIntegration();
  const isAdobeActive = selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
  const timelineInfo = isAdobeActive ? adobeTimeline : resolveTimeline;

  // Load subtitles when timelineId or fileInput changes
  const loadSubtitles = useCallback(async (audioInputMode: "file" | "timeline", fileInput: string | null, timelineId: string) => {
    const filename = await resolveSubtitleDocumentFilename(audioInputMode === "file", fileInput, timelineId);
    if (filename && filename.length > 0) {
      console.log("Loading subtitles:", filename);
      const transcript = await readSubtitleDocument(filename);
      if (transcript) {
        console.log("Transcript loaded:", transcript);
        setCurrentSubtitleDocumentFilename(filename);
        setMarkIn(transcript.mark_in);
        setSubtitles(transcript.segments || []);
        setSpeakers(transcript.speakers || []);
        loadFontForLanguage(transcript.language);
      } else {
        console.warn("No transcript found for:", filename);
        setCurrentSubtitleDocumentFilename(null);
        setSubtitles([]);
        setSpeakers([]);
      }
    } else {
      console.log("No matching transcript found");
      setCurrentSubtitleDocumentFilename(null);
      setSubtitles([]);
      setSpeakers([]);
    }
  }, []);

  async function updateSpeakers(newSpeakers: Speaker[]) {
    console.log("Updating speakers:", newSpeakers);
    setSpeakers(newSpeakers);

    try {
      if (currentSubtitleDocumentFilename) {
        await updateSubtitleDocument(currentSubtitleDocumentFilename, {
          speakers: newSpeakers
        });
        console.log('Speakers updated in both UI and file');
      }
    } catch (error) {
      console.error('Failed to update speakers in file:', error);
    }
  }

  // Flush any pending debounced subtitle save immediately. Call before any
  // operation that requires the on-disk file to be current (add to timeline,
  // reformat, export).
  const flushPendingSubtitleSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    try {
      await updateSubtitleDocument(pending.filename, { subtitles: pending.subtitles });
    } catch (error) {
      console.error('Failed to flush pending subtitle save:', error);
    }
  }, []);

  // Function to update a specific subtitle
  const updateSubtitles = useCallback(async (newSubtitles: Subtitle[], filename?: string) => {
    // Update the local subtitles state immediately for responsive UI.
    setSubtitles(newSubtitles);

    const targetFilename = filename ?? currentSubtitleDocumentFilename;
    if (!targetFilename) return;

    // Debounce the file write. Each updateSubtitleDocument call reads the full
    // document (including originalSegments + word timing data), parses it, and
    // re-serialises it. On a large transcript this can be several MB of JSON.
    // Calling it on every keystroke without debouncing causes many concurrent
    // read-parse-write cycles to pile up in the V8 heap, which can trigger an
    // Out of Memory crash in WebView2.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    pendingSaveRef.current = { subtitles: newSubtitles, filename: targetFilename };
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      try {
        await updateSubtitleDocument(pending.filename, { subtitles: pending.subtitles });
        console.log('Subtitle saved to file (debounced)');
      } catch (error) {
        console.error('Failed to update subtitle in file:', error);
      }
    }, 500);
  }, [currentSubtitleDocumentFilename]);

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
    const filename = generateSubtitleDocumentFilename(
      settings.audioInputMode === "file",
      fileInput,
      timelineId,
      settings.audioInputMode === "file" ? undefined : timelineInfo?.name
    )

    setCurrentSubtitleDocumentFilename(filename);

    // Save transcript to JSON file.
    // Content formatting (case, punctuation, censoring) is already applied by the
    // Rust backend during transcription, so no post-processing is needed here.
    const { segments, speakers } = await saveSubtitleDocument(transcript, filename, {
      metadata: {
        sourceType: settings.audioInputMode === "file" ? 'standalone' : 'resolve',
        displayName: settings.audioInputMode === "file"
          ? (fileInput?.split(/[/\\]/).pop()?.replace(/\.[^/.\\]+$/, '') || 'transcript')
          : timelineInfo?.name || 'transcript',
        timelineId: settings.audioInputMode === "file" ? undefined : timelineId,
        timelineName: settings.audioInputMode === "file" ? undefined : timelineInfo?.name,
        sourceFilePath: settings.audioInputMode === "file" ? fileInput || undefined : undefined,
        sourceFileName: settings.audioInputMode === "file" && fileInput
          ? fileInput.split(/[/\\]/).pop() || undefined
          : undefined,
      }
    })
    console.log("Transcript saved to:", filename)

    // Update the global subtitles state to show in sidebar
    setSpeakers(speakers)
    setSubtitles(segments)
    console.log("Subtitle list updated with", segments.length, "subtitles")

    // Ensure the font for the detected transcription language is registered
    // (important when settings.language === "auto").
    loadFontForLanguage(transcript?.language);

    return filename
  }

  const reformatSubtitles = async (settings: Settings, fileInput: string | null, timelineId: string) => {
    await flushPendingSubtitleSave();
    const filename = currentSubtitleDocumentFilename
      ?? generateSubtitleDocumentFilename(settings.audioInputMode === "file", fileInput, timelineId);
    const transcript = await readSubtitleDocument(filename);
    if (!transcript) {
      console.error("Failed to read transcript");
      return;
    }

    setCurrentSubtitleDocumentFilename(filename);
    const originalSegments: Subtitle[] = transcript.originalSegments || transcript.segments || [];

    // Single Rust call applies BOTH structural splitting and content formatting
    // (case, punctuation removal, censoring) in one pass. We pass the transcript's
    // stored language (the detected / output language at transcription time) so
    // Rust's language-aware profile selection (CPL, function words, kinsoku, etc.)
    // stays consistent. If missing, Rust falls back to the Latin default.
    const segments = await rustReformatSubtitles(originalSegments, {
      maxLines: settings.maxLinesPerSubtitle,
      textDensity: settings.textDensity,
      customMaxCharsPerLine: settings.textDensity === "custom" ? settings.customMaxCharsPerLine : undefined,
      language: transcript.language,
      textCase: settings.textCase,
      removePunctuation: settings.removePunctuation,
      censoredWords: settings.enableCensor ? getActiveCensorWords(settings) : [],
    });

    // Save reformatted segments and update state.
    // Use updateSubtitleDocument (not saveSubtitleDocument) to preserve originalSegments unchanged.
    await updateSubtitleDocument(filename, { subtitles: segments });
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
      let filename = generateSubtitleDocumentFilename(
        settings.audioInputMode === "file",
        fileInput,
        timelineId,
        settings.audioInputMode === "file" ? undefined : timelineInfo?.name,
      );
      console.log("Saving transcript to:", filename);
      // No speakers for imported subtitles.
      // Content formatting is skipped here — imported SRTs lack word-level data.
      // Users can apply formatting via the reformat flow after import.
      let { segments } = await saveSubtitleDocument(transcript, filename, {
        metadata: {
          sourceType: settings.audioInputMode === "file" ? 'standalone' : 'resolve',
          displayName: settings.audioInputMode === "file"
            ? (fileInput?.split(/[/\\]/).pop()?.replace(/\.[^/.\\]+$/, '') || 'transcript')
            : timelineInfo?.name || 'transcript',
          timelineId: settings.audioInputMode === "file" ? undefined : timelineId,
          timelineName: settings.audioInputMode === "file" ? undefined : timelineInfo?.name,
          sourceFilePath: settings.audioInputMode === "file" ? fileInput || undefined : undefined,
          sourceFileName: settings.audioInputMode === "file" && fileInput
            ? fileInput.split(/[/\\]/).pop() || undefined
            : undefined,
        }
      });
      setCurrentSubtitleDocumentFilename(filename)
      setSubtitles(segments)
    } catch (error) {
      console.error('Failed to open file', error);
      // Error handling should be done by caller
      throw error;
    }
  }

  return (
    <SubtitleDocumentContext.Provider value={{
      subtitles,
      speakers,
      markIn,
      currentSubtitleDocumentFilename,
      setSubtitles,
      setSpeakers,
      setCurrentSubtitleDocumentFilename,
      updateSpeakers,
      updateSubtitles,
      flushPendingSubtitleSave,
      processTranscriptionResults,
      reformatSubtitles,
      exportSubtitlesAs,
      importSubtitles,
      loadSubtitles,
    }}>
      {children}
    </SubtitleDocumentContext.Provider>
  );
}

export const useSubtitleDocument = () => {
  const context = useContext(SubtitleDocumentContext);
  if (!context) {
    throw new Error('useSubtitleDocument must be used within a SubtitleDocumentProvider');
  }
  return context;
};
