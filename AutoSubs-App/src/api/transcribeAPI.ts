// src/api/transcribeApi.ts
import { join, downloadDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { Settings } from "@/types/interfaces";

export async function fetchTranscription(options: Settings) {
  const filePath = await join(await downloadDir(), "autosubs-exported-audio.wav");
  const modelPath = options.model; // You may need to resolve the full path if not absolute
  const language = options.language;

  // Call the Tauri Rust command instead of HTTP fetch
  const result = await invoke('transcribe_audio', {
    modelPath,
    wavPath: filePath,
    language,
    // You can extend this to pass more parameters if you update the Rust side
  }) as Array<[number, number, string]>;

  // Optionally, format the result as needed for your app
  return result;
}