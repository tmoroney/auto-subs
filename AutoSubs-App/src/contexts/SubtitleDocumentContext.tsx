import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Subtitle, Speaker, Settings } from '@/types';
import { useResolve } from '@/contexts/ResolveContext';
import { useAdobe } from '@/contexts/AdobeContext';
import { useIntegration, type Integration } from '@/contexts/IntegrationContext';
import { getActiveCensorWords } from '@/censor/merge';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { downloadDir, basename } from '@tauri-apps/api/path';
import { toast } from 'sonner';
import i18n from '@/i18n';
import {
  generateSubtitleDocumentFilename,
  resolveSubtitleDocumentFilename,
  readSubtitleDocument,
  saveSubtitleDocument,
  updateSubtitleDocument,
  type TranscriptSourceType,
} from '../utils/file-utils';
import { reformatSubtitles as rustReformatSubtitles } from '@/api/formatting-api';
import { parseSrt } from '@/utils/srt-utils';
import {
  buildSubtitleExportContent,
  subtitleExportDialogOptions,
  type SubtitleExportFormat,
} from '@/utils/export-file';
import {
  canExportSubtitles,
  subtitleDocumentSourceName,
  subtitleExportBaseName,
  subtitleExportWritePath,
  writeJsonTranscriptExport,
} from '@/utils/subtitle-export';
import { loadFontForLanguage } from '@/lib/font-loader';
import { preserveSubtitleEdits } from '@/utils/subtitle-edits';

function getTranscriptSourceType(
  audioInputMode: "file" | "timeline",
  integration: Integration | undefined
): TranscriptSourceType {
  if (integration === "standalone") return "standalone";
  if (audioInputMode === "file") return "standalone";
  switch (integration) {
    case "premiere":
      return "premiere";
    case "aftereffects":
      return "aftereffects";
    case "davinci":
      return "resolve";
    default:
      return "unknown";
  }
}

interface SubtitleDocumentContextType {
  subtitles: Subtitle[];
  speakers: Speaker[];
  markIn: number;
  currentSubtitleDocumentFilename: string | null;
  /**
   * Human-meaningful name of what was transcribed — the source audio filename
   * in standalone mode, the timeline name otherwise. Null when unknown, in
   * which case callers should fall back to the document filename.
   */
  currentSubtitleDocumentSourceName: string | null;
  /** Language stored with the open transcript, as passed to reformatting. */
  subtitleLanguage: string | undefined;
  setSubtitles: (subtitles: Subtitle[]) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  setCurrentSubtitleDocumentFilename: (filename: string | null) => void;
  updateSpeakers: (newSpeakers: Speaker[]) => Promise<void>;
  updateSubtitles: (newSubtitles: Subtitle[], filename?: string) => Promise<void>;
  flushPendingSubtitleSave: () => Promise<void>;
  processTranscriptionResults: (transcript: any, settings: Settings, fileInput: string | null, timelineId: string) => Promise<string>;
  reformatSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  exportSubtitlesAs: (format: SubtitleExportFormat, subtitles?: Subtitle[], speakers?: Speaker[]) => Promise<void>;
  importSubtitles: (settings: Settings, fileInput: string | null, timelineId: string) => Promise<void>;
  loadSubtitles: (audioInputMode: "file" | "timeline", fileInput: string | null, timelineId: string) => Promise<void>;
  openStoredSubtitleDocument: (filename: string, transcript: any) => void;
  closeDeletedSubtitleDocument: (filename: string) => void;
}

const SubtitleDocumentContext = createContext<SubtitleDocumentContextType | null>(null);

export function SubtitleDocumentProvider({ children }: { children: React.ReactNode }) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [markIn, setMarkIn] = useState(0);
  const [currentSubtitleDocumentFilename, setCurrentSubtitleDocumentFilename] = useState<string | null>(null);
  const [currentSubtitleDocumentSourceName, setCurrentSubtitleDocumentSourceName] = useState<string | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState<string | undefined>(undefined);

  // Prefer the source audio file's name, else the timeline it came from.
  // Deliberately excludes `displayName`, which falls back to the generated
  // document filename and would surface an id like `example__tr_2026…`.
  const documentFilenameRef = useRef(currentSubtitleDocumentFilename);
  documentFilenameRef.current = currentSubtitleDocumentFilename;

  // Debounce subtitle file writes to prevent concurrent read-parse-stringify-write
  // cycles from accumulating in the V8 heap when the user types quickly.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ subtitles: Subtitle[]; filename: string } | null>(null);
  // Export reads these after the save dialog closes. They are used only when
  // the same document is still open, so a different transcript cannot mix in.
  const subtitlesRef = useRef(subtitles);
  const speakersRef = useRef(speakers);
  subtitlesRef.current = subtitles;
  speakersRef.current = speakers;
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
        setCurrentSubtitleDocumentSourceName(subtitleDocumentSourceName(transcript));
        setSubtitleLanguage(transcript.language);
        setMarkIn(transcript.mark_in);
        setSubtitles(transcript.segments || []);
        setSpeakers(transcript.speakers || []);
        loadFontForLanguage(transcript.language);
      } else {
        console.warn("No transcript found for:", filename);
        setCurrentSubtitleDocumentFilename(null);
        setCurrentSubtitleDocumentSourceName(null);
        setSubtitleLanguage(undefined);
        setSubtitles([]);
        setSpeakers([]);
      }
    } else {
      console.log("No matching transcript found");
      setCurrentSubtitleDocumentFilename(null);
      setCurrentSubtitleDocumentSourceName(null);
      setSubtitleLanguage(undefined);
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
    setCurrentSubtitleDocumentSourceName(
      settings.audioInputMode === "file"
        ? fileInput?.split(/[/\\]/).pop() || null
        : timelineInfo?.name || null,
    );

    // Save transcript to JSON file.
    // Content formatting (case, punctuation, censoring) is already applied by the
    // Rust backend during transcription, so no post-processing is needed here.
    const { segments, speakers } = await saveSubtitleDocument(transcript, filename, {
      metadata: {
        sourceType: getTranscriptSourceType(settings.audioInputMode, selectedIntegration),
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
    setSubtitleLanguage(transcript?.language)
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
      throw new Error("Failed to read transcript");
    }

    setCurrentSubtitleDocumentFilename(filename);
    setCurrentSubtitleDocumentSourceName(
      subtitleDocumentSourceName(transcript) ?? currentSubtitleDocumentSourceName,
    );
    const source: Subtitle[] = transcript.editedSegments ?? transcript.originalSegments ?? transcript.segments ?? [];
    // Normalize engine tokens without content formatting so unchanged words
    // keep their original spelling, punctuation and timing. Compare the saved
    // display text with its word tokens to recover manual corrections.
    const normalizedSource = await rustReformatSubtitles(source, {
      language: transcript.language,
      textDensity: 'custom',
      customMaxCharsPerLine: 100000,
      maxLines: 1,
      textCase: 'none',
      removePunctuation: false,
      censoredWords: [],
    });
    const editedSource = preserveSubtitleEdits(normalizedSource, transcript.segments ?? [], transcript.language);

    // Single Rust call applies BOTH structural splitting and content formatting
    // (case, punctuation removal, censoring) in one pass. We pass the transcript's
    // stored language (the detected / output language at transcription time) so
    // Rust's language-aware profile selection (CPL, function words, kinsoku, etc.)
    // stays consistent. If missing, Rust falls back to the Latin default.
    const segments = await rustReformatSubtitles(editedSource.segments, {
      maxLines: settings.maxLinesPerSubtitle,
      textDensity: settings.textDensity,
      customMaxCharsPerLine: settings.textDensity === "custom" && settings.customDensityUnit !== "words" ? settings.customMaxCharsPerLine : undefined,
      customMaxWordsPerLine: settings.textDensity === "custom" && settings.customDensityUnit === "words" ? settings.customMaxWordsPerLine : undefined,
      language: transcript.language,
      textCase: settings.textCase,
      removePunctuation: settings.removePunctuation,
      censoredWords: settings.enableCensor ? getActiveCensorWords(settings) : [],
      censorStyle: settings.censorStyle,
    });

    // Save reformatted segments and update state.
    // Keep the raw transcription intact and persist corrections separately so
    // another reformat (including after reopening the app) retains them.
    await updateSubtitleDocument(filename, {
      subtitles: segments,
      editedSegments: editedSource.changed ? editedSource.segments : undefined,
    });
    console.log("Subtitle list updated with", segments.length, "subtitles");
    setSpeakers(transcript.speakers || []);
    setSubtitles(segments);
    setSubtitleLanguage(transcript.language);
  };

  async function exportSubtitlesAs(
    format: SubtitleExportFormat,
    subtitlesParam?: Subtitle[],
    speakersParam?: Speaker[]
  ) {
    const subtitlesToExport = subtitlesParam || subtitles;
    const speakersToExport = speakersParam || speakers;
    
    try {
      if (!canExportSubtitles(subtitlesToExport)) {
        throw new Error('No subtitles available to export');
      }

      const startedFilename = currentSubtitleDocumentFilename;
      const startedSubtitles = subtitlesToExport;
      const startedSpeakers = speakersToExport;

      let storageName: string | null = null;
      if (startedFilename) {
        try {
          storageName = await basename(startedFilename);
        } catch (error) {
          console.warn('Failed to extract filename from path, using default:', error);
        }
      }
      const baseName = subtitleExportBaseName(
        currentSubtitleDocumentSourceName,
        storageName,
      );

      const { defaultPath, filters } = subtitleExportDialogOptions(format, baseName);
      const filePath = subtitleExportWritePath(await save({
        defaultPath,
        filters,
      }));

      if (!filePath) {
        console.log('Save was canceled');
        return;
      }

      if (format === 'json') {
        const outcome = await writeJsonTranscriptExport({
          chosenPath: filePath,
          hasSavedDocument: Boolean(startedFilename),
          flush: flushPendingSubtitleSave,
          readDocument: () => readSubtitleDocument(startedFilename as string),
          write: writeTextFile,
          startedFilename,
          currentFilename: () => documentFilenameRef.current,
          startedSubtitles,
          startedSpeakers,
          liveSubtitles: () => subtitlesRef.current,
          liveSpeakers: () => speakersRef.current,
        });
        if (outcome === 'written') {
          console.log('JSON transcript file saved successfully to', filePath);
        }
        return;
      }

      const sameDocument = documentFilenameRef.current === startedFilename;
      const exportSubtitles = sameDocument ? subtitlesRef.current : startedSubtitles;
      const exportSpeakers = sameDocument ? speakersRef.current : startedSpeakers;

      const content = buildSubtitleExportContent(format, exportSubtitles, exportSpeakers);
      if (!content || content.trim() === '') {
        console.error(`Generated ${format} data is empty`);
        throw new Error(`Generated ${format} data is empty`);
      }

      await writeTextFile(filePath, content);
      console.log(`${format} file saved successfully to`, filePath);
    } catch (error) {
      console.error(`Failed to save ${format} file`, error);
      toast.error(i18n.t("importExport.exportFailed"));
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
          sourceType: getTranscriptSourceType(settings.audioInputMode, selectedIntegration),
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
      setCurrentSubtitleDocumentSourceName(
        settings.audioInputMode === "file"
          ? fileInput?.split(/[/\\]/).pop() || null
          : timelineInfo?.name || null,
      )
      setSubtitleLanguage(undefined)
      setSubtitles(segments)
    } catch (error) {
      console.error('Failed to open file', error);
      // Error handling should be done by caller
      throw error;
    }
  }

  const openStoredSubtitleDocument = (filename: string, transcript: any) => {
    setSubtitles(transcript?.segments || []);
    setSpeakers(transcript?.speakers || []);
    setCurrentSubtitleDocumentFilename(filename);
    setCurrentSubtitleDocumentSourceName(subtitleDocumentSourceName(transcript));
    setSubtitleLanguage(transcript?.language);
    if (typeof transcript?.mark_in === "number") {
      setMarkIn(transcript.mark_in);
    }
    loadFontForLanguage(transcript?.language);
  };

  const closeDeletedSubtitleDocument = (filename: string) => {
    if (pendingSaveRef.current?.filename === filename) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
    }
    if (documentFilenameRef.current !== filename) return;
    setSubtitles([]);
    setSpeakers([]);
    setCurrentSubtitleDocumentFilename(null);
    setCurrentSubtitleDocumentSourceName(null);
    setSubtitleLanguage(undefined);
    setMarkIn(0);
  };

  return (
    <SubtitleDocumentContext.Provider value={{
      subtitles,
      speakers,
      markIn,
      currentSubtitleDocumentFilename,
      currentSubtitleDocumentSourceName,
      subtitleLanguage,
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
      openStoredSubtitleDocument,
      closeDeletedSubtitleDocument,
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
