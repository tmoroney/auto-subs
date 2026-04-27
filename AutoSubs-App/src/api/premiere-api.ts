import { invoke } from '@tauri-apps/api/core';

export async function sendToPremiere(type: string, payload: any = {}, sessionId?: string) {
  const finalSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await invoke<string>('send_to_premiere', {
    payload: {
      type,
      payload,
      sessionId: finalSessionId,
    },
  });
  return finalSessionId;
}

export async function requestSequenceInfo(sessionId?: string) {
  return sendToPremiere('request_sequence_info', {}, sessionId);
}

export async function requestAudioExport(
  exportFolder: string,
  selectedTracks: number[],
  selectedRange: string = 'entire',
  presetPath: string = '',
  sessionId?: string
) {
  return sendToPremiere(
    'request_audio_export',
    { exportFolder, selectedTracks, selectedRange, presetPath },
    sessionId
  );
}

export async function requestImportSRT(filePath: string, sessionId?: string) {
  return sendToPremiere('request_import_srt', { filePath }, sessionId);
}
