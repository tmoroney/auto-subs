// src/api/transcribeApi.ts
import { fetch } from '@tauri-apps/plugin-http';
import { join, downloadDir } from '@tauri-apps/api/path';
import { AudioInfo, Settings } from "@/types/interfaces";

const transcribeAPI = "http://localhost:56001/transcribe/";

export async function fetchTranscription(audioInfo: AudioInfo, outputDir: string, options: Settings) {
  const filePath = await join(await downloadDir(), "autosubs-exported-audio.wav");

  const body = {
    file_path: filePath,
    output_dir: outputDir,
    timeline: audioInfo.timeline,
    mark_in: audioInfo.markIn,
    mark_out: audioInfo.markOut,
    model: options.model,
    language: options.language,
    translate: options.translate,
    diarize: options.enabledSteps.diarize,
    diarizeSpeakerCount: options.diarizeSpeakerCount,
    diarizeMode: options.diarizeMode,
    alignWords: options.alignWords,
    sensitiveWords: options.sensitiveWords.filter((word) => word !== ""), // Remove empty strings
    removePunctuation: options.removePunctuation,
    textFormat: options.textFormat,
    maxWords: options.maxWords,
    maxChars: options.maxChars,
  };
  const response = await fetch(transcribeAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorDetail = (await response.json().catch(() => ({}))).detail;
    throw new Error(errorDetail || `HTTP error: ${response.status}`);
  }
  const data = await response.json();
  return data.result_file;
}