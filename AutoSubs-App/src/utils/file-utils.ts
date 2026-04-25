// src/utils/fileUtils.ts
import { join, documentDir, appLocalDataDir } from '@tauri-apps/api/path';
import { readDir, readTextFile, exists, writeTextFile, mkdir, stat, rename, copyFile, remove } from '@tauri-apps/plugin-fs';
import { Subtitle, Speaker } from '@/types';

const TRANSCRIPT_INDEX_FILENAME = 'transcript-index.json';

function normalizeTranscriptText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSpeakerLabel(speakerId: string, speakers: Speaker[], speakerIdBase: number): string {
  const numericSpeakerId = Number(speakerId);
  const speakerIndex = Number.isFinite(numericSpeakerId)
    ? numericSpeakerId - speakerIdBase
    : -1;
  const speakerName = speakerIndex >= 0 ? speakers[speakerIndex]?.name?.trim() : '';

  if (speakerName) {
    return speakerName;
  }

  if (Number.isFinite(numericSpeakerId)) {
    return `Speaker ${numericSpeakerId}`;
  }

  return `Speaker ${speakerId}`;
}

export function generateTranscriptTxt(subtitles: Subtitle[], speakers: Speaker[] = []): string {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return '';
  }

  const normalizedSubtitles = subtitles
    .map((subtitle) => ({
      ...subtitle,
      text: normalizeTranscriptText(subtitle.text ?? ''),
      speaker_id: subtitle.speaker_id?.trim() || undefined,
    }))
    .filter((subtitle) => subtitle.text.length > 0);

  if (normalizedSubtitles.length === 0) {
    return '';
  }

  const hasSpeakers = normalizedSubtitles.some((subtitle) => subtitle.speaker_id);

  if (!hasSpeakers) {
    return normalizedSubtitles
      .map((subtitle) => subtitle.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const speakerIdBase = normalizedSubtitles.some((subtitle) => subtitle.speaker_id === '0') ? 0 : 1;
  const groupedBlocks: Array<{ speakerLabel: string; text: string }> = [];

  for (const subtitle of normalizedSubtitles) {
    const speakerLabel = subtitle.speaker_id
      ? resolveSpeakerLabel(subtitle.speaker_id, speakers, speakerIdBase)
      : 'Transcript';
    const previousBlock = groupedBlocks[groupedBlocks.length - 1];

    if (previousBlock && previousBlock.speakerLabel === speakerLabel) {
      previousBlock.text = `${previousBlock.text} ${subtitle.text}`.trim();
      continue;
    }

    groupedBlocks.push({
      speakerLabel,
      text: subtitle.text,
    });
  }

  return groupedBlocks
    .map((block) => `${block.speakerLabel}:\n${block.text}`)
    .join('\n\n');
}

export interface TranscriptMetadata {
  transcriptId: string;
  sourceType: 'standalone' | 'resolve' | 'unknown';
  displayName: string;
  createdAt: string;
  timelineId?: string;
  timelineName?: string;
  sourceFilePath?: string;
  sourceFileName?: string;
  markIn?: number;
  markOut?: number;
}

interface TranscriptIndexItem {
  filename: string;
  metadata?: Partial<TranscriptMetadata>;
  createdAt?: string;
}

export interface StoredTranscript {
  filename: string;
  createdAt: string;
  processingTime?: number;
  language?: string;
  speakers: Speaker[];
  originalSegments: Subtitle[];
  segments: Subtitle[];
  metadata: TranscriptMetadata;
  transcriptId?: string;
  timelineId?: string;
  timelineName?: string;
  sourceType?: TranscriptMetadata['sourceType'];
  sourceFilePath?: string;
  sourceFileName?: string;
  mark_in?: number;
  mark_out?: number;
}

export interface TranscriptListItem {
  filename: string;
  displayName: string;
  createdAt: Date;
  transcriptId?: string;
  timelineId?: string;
  timelineName?: string;
  markIn?: number;
  markOut?: number;
}

export interface GenerateTranscriptFilenameOptions {
  isStandaloneMode: boolean;
  selectedFile: string | null;
  timelineId?: string;
  timelineName?: string;
}

export interface SaveTranscriptOptions {
  // Content formatting (case, punctuation, censoring) is applied by the Rust backend
  // during transcription / reformat, so no per-save options are needed.
  metadata?: Partial<TranscriptMetadata>;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.\\]+$/, '');
}

function getFileName(filePath: string | null | undefined): string {
  if (!filePath) return 'unknown';
  return filePath.split(/[/\\]/).pop() || 'unknown';
}

function sanitizeFilenamePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 60) || 'transcript';
}

function createTranscriptId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().split('-')[0]
    : Math.random().toString(36).slice(2, 10);
  return `tr_${timestamp}_${randomPart}`;
}

function inferDisplayName(isStandaloneMode: boolean, selectedFile: string | null, timelineName?: string): string {
  if (isStandaloneMode && selectedFile) {
    return stripExtension(getFileName(selectedFile));
  }

  if (!isStandaloneMode && timelineName?.trim()) {
    return timelineName.trim();
  }

  return 'transcript';
}

function buildMetadata(
  transcript: any,
  filename: string,
  overrides: Partial<TranscriptMetadata> | undefined,
): TranscriptMetadata {
  const transcriptId = overrides?.transcriptId || filename.replace(/\.json$/, '').split('__').pop() || createTranscriptId();
  const createdAt = overrides?.createdAt || transcript.createdAt || new Date().toISOString();
  const sourceType = overrides?.sourceType || transcript.sourceType || 'unknown';
  const displayName = overrides?.displayName
    || transcript.timelineName
    || transcript.timeline_name
    || transcript.sourceFileName
    || transcript.source_file_name
    || stripExtension(filename.replace(/\.json$/, ''));

  return {
    transcriptId,
    sourceType,
    displayName,
    createdAt,
    timelineId: overrides?.timelineId ?? transcript.timelineId ?? transcript.timeline_id,
    timelineName: overrides?.timelineName ?? transcript.timelineName ?? transcript.timeline_name,
    sourceFilePath: overrides?.sourceFilePath ?? transcript.sourceFilePath ?? transcript.source_file_path,
    sourceFileName: overrides?.sourceFileName ?? transcript.sourceFileName ?? transcript.source_file_name,
    markIn: overrides?.markIn ?? transcript.mark_in,
    markOut: overrides?.markOut ?? transcript.mark_out,
  };
}

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getTranscriptIndexPath(): Promise<string> {
  const dir = await getTranscriptsDir();
  return await join(dir, TRANSCRIPT_INDEX_FILENAME);
}

async function readTranscriptIndex(): Promise<TranscriptIndexItem[]> {
  const indexPath = await getTranscriptIndexPath();
  if (!(await exists(indexPath))) {
    return [];
  }

  try {
    const contents = await readTextFile(indexPath);
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read transcript index:', error);
    return [];
  }
}

async function writeTranscriptIndex(items: TranscriptIndexItem[]): Promise<void> {
  const indexPath = await getTranscriptIndexPath();
  await writeTextFile(indexPath, JSON.stringify(items, null, 2));
}

async function upsertTranscriptIndexItem(filename: string, metadata: TranscriptMetadata): Promise<void> {
  const items = await readTranscriptIndex();
  const nextItem: TranscriptIndexItem = {
    filename,
    metadata,
    createdAt: metadata.createdAt,
  };

  const existingIndex = items.findIndex((item) => item.filename === filename);
  if (existingIndex >= 0) {
    items[existingIndex] = nextItem;
  } else {
    items.push(nextItem);
  }

  await writeTranscriptIndex(items);
}

async function ensureTranscriptIndexItem(filename: string): Promise<TranscriptIndexItem | null> {
  const items = await readTranscriptIndex();
  const existingItem = items.find((item) => item.filename === filename);
  if (existingItem) {
    return existingItem;
  }

  const transcript = await readTranscript(filename) as StoredTranscript | null;
  if (!transcript) {
    return null;
  }

  const metadata = buildMetadata(transcript, filename, transcript.metadata);
  const nextItem: TranscriptIndexItem = {
    filename,
    metadata,
    createdAt: metadata.createdAt,
  };

  items.push(nextItem);
  await writeTranscriptIndex(items);
  return nextItem;
}

function getLegacyTranscriptFilename(isStandaloneMode: boolean, selectedFile: string | null, timelineId?: string): string | null {
  if (isStandaloneMode && selectedFile) {
    return `${stripExtension(getFileName(selectedFile))}.json`;
  }

  if (!isStandaloneMode && timelineId) {
    return `${timelineId}.json`;
  }

  return null;
}

// Legacy transcripts location (pre-migration). Kept so we can move existing
// data into the new app-local-data directory on first launch.
async function getLegacyTranscriptsDir(): Promise<string> {
  return await join(await documentDir(), "AutoSubs-Transcripts");
}

// Migration runs at most once per process. Any errors are logged but not
// thrown so a failed migration never blocks transcript access.
let migrationPromise: Promise<void> | null = null;

async function migrateLegacyTranscriptsOnce(newDir: string): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    try {
      const legacyDir = await getLegacyTranscriptsDir();
      if (!(await exists(legacyDir))) return;

      let entries;
      try {
        entries = await readDir(legacyDir);
      } catch (err) {
        console.warn('Could not read legacy transcripts directory:', err);
        return;
      }

      const jsonEntries = entries.filter(
        (e) => e.isFile && e.name && e.name.toLowerCase().endsWith('.json'),
      );
      if (jsonEntries.length === 0) return;

      console.log(
        `Migrating ${jsonEntries.length} transcript file(s) from ${legacyDir} to ${newDir}`,
      );

      let migrated = 0;
      for (const entry of jsonEntries) {
        const src = await join(legacyDir, entry.name);
        const dest = await join(newDir, entry.name);
        try {
          if (await exists(dest)) {
            // Destination already has this file; skip to avoid clobbering.
            continue;
          }
          try {
            await rename(src, dest);
          } catch {
            // rename can fail across filesystems; fall back to copy + remove.
            await copyFile(src, dest);
            await remove(src);
          }
          migrated++;
        } catch (err) {
          console.warn(`Failed to migrate transcript ${entry.name}:`, err);
        }
      }

      console.log(`Transcript migration complete. Moved ${migrated} file(s).`);

      // Remove the legacy directory entirely so it no longer clutters
      // the user's Documents folder. Use recursive removal to clean up
      // any stray files (e.g. macOS .DS_Store) that aren't transcripts.
      try {
        await remove(legacyDir, { recursive: true });
        console.log(`Removed legacy transcripts directory: ${legacyDir}`);
      } catch (err) {
        console.warn('Failed to remove legacy transcripts directory:', err);
      }
    } catch (err) {
      console.error('Transcript migration failed:', err);
    }
  })();

  return migrationPromise;
}

// Get the transcripts storage directory.
// Stored under the Tauri app-local-data directory (e.g. on macOS:
// ~/Library/Application Support/<bundle-id>/Transcripts). This keeps
// user-generated data out of Documents and avoids cloud-sync surprises
// (OneDrive/iCloud), while surviving app updates.
export async function getTranscriptsDir(): Promise<string> {
  const dir = await join(await appLocalDataDir(), "Transcripts");

  // Ensure the directory exists
  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
      console.log('Created transcripts directory:', dir);
    }
  } catch (error) {
    console.error('Failed to create transcripts directory:', error);
    throw new Error(`Failed to create transcripts directory: ${error}`);
  }

  // Fire-and-await a one-time migration from the legacy Documents folder.
  await migrateLegacyTranscriptsOnce(dir);

  return dir;
}

export async function getAudioExportDir(): Promise<string> {
  const dir = await join(await appLocalDataDir(), "Audio");

  // Ensure the directory exists
  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
      console.log('Created audio export directory:', dir);
    }
  } catch (error) {
    console.error('Failed to create audio export directory:', error);
    throw new Error(`Failed to create audio export directory: ${error}`);
  }

  return dir;
}

export async function getTranscriptPath(filename: string): Promise<string> {
  const dir = await getTranscriptsDir();
  return await join(dir, filename);
}

export async function readTranscript(filename: string): Promise<any | null> {
  const filePath = await getTranscriptPath(filename);
  console.log("Reading transcript from:", filePath);
  if (!(await exists(filePath))) {
    console.log("Transcript file not found.");
    return null;
  }
  const contents = await readTextFile(filePath);
  return JSON.parse(contents);
}

export function generateTranscriptFilename(
  isStandaloneModeOrOptions: boolean | GenerateTranscriptFilenameOptions,
  selectedFile?: string | null,
  timelineId?: string,
  timelineName?: string,
): string {
  const options = typeof isStandaloneModeOrOptions === 'object'
    ? isStandaloneModeOrOptions
    : {
        isStandaloneMode: isStandaloneModeOrOptions,
        selectedFile: selectedFile ?? null,
        timelineId,
        timelineName,
      };

  const displayName = inferDisplayName(options.isStandaloneMode, options.selectedFile, options.timelineName);
  const safeDisplayName = sanitizeFilenamePart(displayName);
  return `${safeDisplayName}__${createTranscriptId()}.json`;
}

export async function listTranscriptFiles(): Promise<TranscriptListItem[]> {
  const transcriptsDir = await getTranscriptsDir();
  const entries = await readDir(transcriptsDir);

  const transcriptFiles: Array<TranscriptListItem | null> = await Promise.all(
    entries
      .filter((entry) => entry.name.endsWith('.json') && entry.name !== TRANSCRIPT_INDEX_FILENAME)
      .map(async (entry) => {
        try {
          const filePath = await getTranscriptPath(entry.name);
          const fileStats = await stat(filePath);
          const indexItem = await ensureTranscriptIndexItem(entry.name);
          const metadata = indexItem?.metadata
            ? buildMetadata(indexItem, entry.name, indexItem.metadata)
            : undefined;
          const createdAt = (fileStats.mtime ? new Date(fileStats.mtime) : null)
            || parseValidDate(indexItem?.metadata?.createdAt)
            || parseValidDate(indexItem?.createdAt)
            || new Date(0);

          return {
            filename: entry.name,
            displayName: metadata?.displayName?.trim() || stripExtension(entry.name),
            createdAt,
            transcriptId: metadata?.transcriptId,
            timelineId: metadata?.timelineId,
            timelineName: metadata?.timelineName,
            markIn: metadata?.markIn,
            markOut: metadata?.markOut,
          } satisfies TranscriptListItem;
        } catch (error) {
          console.error('Failed to parse transcript metadata for:', entry.name, error);
          return null;
        }
      })
  );

  return transcriptFiles
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function resolveTranscriptFilename(
  isStandaloneMode: boolean,
  selectedFile: string | null,
  timelineId?: string,
): Promise<string | null> {
  const transcripts = await listTranscriptFiles();

  const matchingTranscript = transcripts.find((transcript) => {
    if (isStandaloneMode && selectedFile) {
      return transcript.displayName === stripExtension(getFileName(selectedFile));
    }

    if (!isStandaloneMode && timelineId) {
      return transcript.timelineId === timelineId;
    }

    return false;
  });

  if (matchingTranscript) {
    return matchingTranscript.filename;
  }

  const legacyFilename = getLegacyTranscriptFilename(isStandaloneMode, selectedFile, timelineId);
  if (!legacyFilename) {
    return null;
  }

  const legacyPath = await getTranscriptPath(legacyFilename);
  return (await exists(legacyPath)) ? legacyFilename : null;
}

// Helper to interpolate words with timings if missing
function interpolateWordsFromText(text: string, start: number, end: number) {
  // Use match to preserve whitespace as part of each word
  const wordTexts = text.match(/(\s*\S+)/g) || [];
  const wordCount = wordTexts.length;
  const segmentStart = typeof start === 'string' ? parseFloat(start) : start;
  const segmentEnd = typeof end === 'string' ? parseFloat(end) : end;
  const duration = segmentEnd - segmentStart;
  const wordDuration = wordCount > 0 ? duration / wordCount : 0;
  return wordTexts.map((word, idx) => ({
    word,
    start: (segmentStart + idx * wordDuration).toFixed(3),
    end: (segmentStart + (idx + 1) * wordDuration).toFixed(3),
    line_number: 0
  }));
}

// Save a new transcript to JSON file.
// Segments are assumed to already be structurally split by the Rust backend.
// This function only applies content formatting (case, punctuation, censoring).
export async function saveTranscript(
  transcript: any,
  filename: string,
  options?: SaveTranscriptOptions
): Promise<{ segments: Subtitle[]; speakers: Speaker[] }> {
  try {
    const storageDir = await getTranscriptsDir();
    const filePath = await join(storageDir, filename);

    console.log('Saving transcript to:', filePath);

    // Normalize a single incoming Rust segment into a frontend `Subtitle`,
    // including per-word `line_number` assignment based on newlines in the
    // rendered text (Rust joins multi-line cues with '\n').
    const toSubtitle = (segment: any, index: number) => {
      let words = segment.words && segment.words.length > 0
        ? segment.words
        : interpolateWordsFromText(segment.text, segment.start, segment.end);

      const textStr: string = segment.text ?? '';
      const lines = textStr.split('\n');
      if (words && words.length > 0 && lines.length > 1) {
        let wordIdx = 0;
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const lineWords = lines[lineNum].trim().split(/\s+/).filter(Boolean);
          for (let i = 0; i < lineWords.length && wordIdx < words.length; i++) {
            words[wordIdx] = { ...words[wordIdx], line_number: lineNum };
            wordIdx++;
          }
        }
        while (wordIdx < words.length) {
          words[wordIdx] = { ...words[wordIdx], line_number: lines.length - 1 };
          wordIdx++;
        }
      }

      return {
        // Subtitle.id is numeric; the index keeps cues in stable, monotonically
        // increasing order for React keys and downstream lookups.
        id: index,
        start: segment.start,
        end: segment.end,
        text: (segment.text ?? '').trim(),
        speaker_id: segment.speaker_id || undefined,
        words,
      };
    };

    // `segments`        = fully-formatted display cues from Rust.
    // `originalSegments` = raw post-translation segments from Rust (pre-formatting
    //                      word data). Used as the source for reformat so that
    //                      case/punctuation/censoring can be changed later without
    //                      re-transcribing.
    const segments: Subtitle[] = (transcript.segments ?? []).map(toSubtitle);
    const rawIncomingOriginals: any[] = transcript.originalSegments
      ?? transcript.original_segments
      ?? transcript.segments
      ?? [];
    const originalSegments: Subtitle[] = rawIncomingOriginals.map(toSubtitle);

    // Speakers are now aggregated in the Rust backend and included in the transcript
    const speakers: Speaker[] = transcript.speakers || [];
    const metadata = buildMetadata(transcript, filename, options?.metadata);

    const transcriptData: StoredTranscript = {
      filename,
      transcriptId: metadata.transcriptId,
      createdAt: metadata.createdAt,
      processingTime: transcript.processing_time_sec,
      language: transcript.language,
      metadata,
      timelineId: metadata.timelineId,
      timelineName: metadata.timelineName,
      sourceType: metadata.sourceType,
      sourceFilePath: metadata.sourceFilePath,
      sourceFileName: metadata.sourceFileName,
      mark_in: metadata.markIn,
      mark_out: metadata.markOut,
      speakers: speakers,
      originalSegments: originalSegments,
      segments: segments,
    };

    // Save transcript to file
    await writeTextFile(filePath, JSON.stringify(transcriptData, null, 2));
    await upsertTranscriptIndexItem(filename, metadata);
    console.log('Successfully saved transcript to:', filePath);
    return { segments, speakers };
  } catch (error) {
    console.error('Failed to save transcript:', error);
    throw new Error(`Failed to save transcript: ${String(error)}`);
  }
}

// Load transcript and return subtitles
export async function loadTranscriptSubtitles(filename: string): Promise<Subtitle[]> {
  const storageDir = await getTranscriptsDir();
  const filePath = await join(storageDir, filename);

  if (!(await exists(filePath))) {
    console.log("Transcript file not found:", filename);
    return [];
  }

  const contents = await readTextFile(filePath);
  const transcript = JSON.parse(contents);
  return transcript.segments || [];
}

// Update the transcript file for the specified timeline with new speakers or subtitles
export async function updateTranscript(
  filename: string,
  opts: { subtitles?: Subtitle[]; speakers?: Speaker[] }
) {
  const { speakers, subtitles } = opts;

  // if no speakers or subtitles, do nothing
  if (!speakers && !subtitles) return;

  // read current file
  let transcript = await readTranscript(filename);
  if (!transcript) return;

  const metadata = buildMetadata(transcript, filename, transcript.metadata);

  // update speakers and subtitles
  if (speakers) {
    transcript.speakers = speakers;
  }
  if (subtitles) {
    transcript.segments = subtitles;
  }

  transcript.metadata = metadata;
  transcript.transcriptId = metadata.transcriptId;
  transcript.timelineId = metadata.timelineId;
  transcript.timelineName = metadata.timelineName;
  transcript.sourceType = metadata.sourceType;
  transcript.sourceFilePath = metadata.sourceFilePath;
  transcript.sourceFileName = metadata.sourceFileName;
  transcript.mark_in = metadata.markIn;
  transcript.mark_out = metadata.markOut;

  // write to file
  const filePath = await getTranscriptPath(filename);
  await writeTextFile(filePath, JSON.stringify(transcript, null, 2));
  await upsertTranscriptIndexItem(filename, metadata);
}