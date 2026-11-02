import { invoke } from "@tauri-apps/api/core";
import { getActiveCensorWords } from "@/censor/merge";
import type {
  EnsureModelsRequest,
  EnsureModelsResponse,
  Settings,
  Speaker,
  Subtitle,
  TranscriptionOptions,
} from "@/types";
import { buildSubtitleExportContent } from "@/utils/export-file";
import { createOptionsSnapshot } from "./snapshot";

/** A snapshot of the effective standalone settings; it contains no model paths. */
export function createQueueOptions(
  settings: Settings,
  modelId: string,
  sourcePath: string,
  allowInvalid = false,
): TranscriptionOptions {
  return createOptionsSnapshot(settings, modelId, sourcePath, getActiveCensorWords(settings), allowInvalid);
}

/** Resolve all models required for a job. The caller must serialize preparation. */
export async function ensureQueueModels(options: TranscriptionOptions): Promise<TranscriptionOptions> {
  const request: EnsureModelsRequest = {
    model: options.model,
    enableVad: options.enableVad,
    enableDiarize: options.enableDiarize,
    enableForcedAlignment: options.enableForcedAlignment,
    maxSpeakers: options.maxSpeakers,
    diarizeBackend: options.diarizeBackend,
  };
  const paths = await invoke<EnsureModelsResponse>("ensure_models", { request });
  return {
    ...options,
    asrModelPath: paths.asrModelPath,
    vadModelPath: paths.vadModelPath,
    diarizeSegmentPath: paths.diarizeSegmentPath,
    diarizeEmbeddingPath: paths.diarizeEmbeddingPath,
    diarizeSortformerPath: paths.diarizeSortformerPath,
    alignerModelDir: paths.alignerDir,
  };
}

/** The Rust result shape consumed by saveSubtitleDocument. */
export interface QueueTranscript {
  segments: Array<{ start: number; end: number; text: string; speaker_id?: string; words?: unknown[] }>;
  speakers?: Speaker[];
  language?: string;
  [key: string]: unknown;
}

/** The caller must ensure that no other transcription owns the shared pipeline. */
export function transcribeQueueFile(options: TranscriptionOptions): Promise<QueueTranscript> {
  return invoke<QueueTranscript>("queue_transcribe_audio", { options });
}

export type QueueOutputFormat = "srt" | "txt";

/** Build selected formats from already-formatted cues without changing editor state. */
export function prepareQueueExport(transcript: QueueTranscript, formats: QueueOutputFormat[]): Array<{
  format: QueueOutputFormat;
  content: string;
}> {
  const segments: Subtitle[] = (transcript.segments ?? []).map((segment, id) => ({
    id,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    speaker_id: segment.speaker_id,
    // SRT export uses cue text and timing; word-level editing remains in the
    // interactive Generate flow and does not affect this representation.
    words: [],
  }));
  return formats.map((format) => ({
    format,
    content: buildSubtitleExportContent(format, segments, transcript.speakers ?? []),
  }));
}

/** Save next to the source by default, preserving older outputs under dated names. */
export async function exportQueueTranscript(
  transcript: QueueTranscript,
  sourcePath: string,
  formats: QueueOutputFormat[],
  outputDirectory?: string | null,
): Promise<{ outputPaths: string[]; backupPaths: string[] }> {
  return invoke("queue_export_outputs", {
    sourcePath,
    outputs: prepareQueueExport(transcript, formats),
    outputDirectory: outputDirectory ?? null,
  });
}
