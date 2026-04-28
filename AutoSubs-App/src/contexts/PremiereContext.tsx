import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { TimelineInfo } from '@/types';
import { requestSequenceInfo, requestAudioExport, requestImportSRT } from '@/api/premiere-api';
import { getAudioExportDir, getTranscriptPath, loadTranscriptSubtitles } from '@/utils/file-utils';
import { generateSrt } from '@/utils/srt-utils';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useSettings } from '@/contexts/SettingsContext';

interface PremiereContextType {
  timelineInfo: TimelineInfo;
  isConnected: boolean;
  isExporting: boolean;
  exportProgress: number;
  refresh: () => Promise<void>;
  pushToTimeline: (filename?: string) => Promise<void>;
  getSourceAudio: (isStandaloneMode: boolean, fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;
}

const PremiereContext = createContext<PremiereContextType | null>(null);

export function PremiereProvider({ children }: { children: React.ReactNode }) {
  const { settings: currentSettings } = useSettings();
  const [isConnected, setIsConnected] = useState(false);
  const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>({
    name: "",
    timelineId: "",
    templates: [],
    inputTracks: [],
    outputTracks: []
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const pendingRequests = useRef<Map<string, (value: any) => void>>(new Map());

  useEffect(() => {
    // Listen to status events from Rust
    const unlistenStatus = listen<{ status: string }>('premiere-status', (event) => {
      setIsConnected(event.payload.status === 'connected');
      if (event.payload.status === 'connected') {
        toast.success('Connected to Premiere Pro');
        refresh();
      } else {
        toast.error('Disconnected from Premiere Pro');
      }
    });

    // Listen to messages from Premiere
    const unlistenMessage = listen<any>('premiere-message', (event) => {
      const msg = event.payload;
      console.log('Message from Premiere:', msg);

      // Extract sessionId from payload if it's nested
      const sessionId = msg.sessionId || (msg.payload && typeof msg.payload === 'object' ? msg.payload.sessionId : undefined);

      if (sessionId) {
        if (pendingRequests.current.has(sessionId)) {
          const resolve = pendingRequests.current.get(sessionId);
          if (resolve) {
            resolve(msg.payload);
            pendingRequests.current.delete(sessionId);
          }
        } else {
          console.warn(`Received late response for timed out session: ${sessionId}`);
        }
      } else if (msg.type === 'sequence_info_response') {
         // Fallback for sequence info without matching sessionId
         const result = msg.payload;
         const data = typeof result === 'string' ? JSON.parse(result) : result;
         if (data && data.success) {
            setTimelineInfo({
              name: data.name || data.sequenceName || "Sequence",
              timelineId: data.id || "premiere_seq",
              templates: [],
              inputTracks: data.audioTrackInfo?.map((t: any) => ({
                value: t.index.toString(),
                label: t.name || `Audio ${t.index}`
              })) || [],
              outputTracks: []
            });
         }
      }
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenMessage.then(f => f());
    };
  }, []);

  const sendRequestAndWait = (fn: (sessionId: string) => Promise<string>): Promise<any> => {
    return new Promise((resolve, reject) => {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const timeout = setTimeout(() => {
        pendingRequests.current.delete(sessionId);
        reject(new Error('Request timed out'));
      }, 30000);
      
      pendingRequests.current.set(sessionId, (val) => {
        clearTimeout(timeout);
        resolve(val);
      });

      fn(sessionId).catch((err) => {
        pendingRequests.current.delete(sessionId);
        clearTimeout(timeout);
        reject(err);
      });
    });
  };

  async function refresh() {
    try {
      const result = await sendRequestAndWait((sid) => requestSequenceInfo(sid));
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      
      if (data && data.success) {
        setTimelineInfo({
          name: data.name || data.sequenceName || "Sequence",
          timelineId: data.id || "premiere_seq",
          templates: [],
          inputTracks: data.audioTrackInfo?.map((t: any) => ({
            value: t.index.toString(),
            label: t.name || `Audio ${t.index}`
          })) || [],
          outputTracks: []
        });
      } else {
        toast.warning(data?.error || "No active sequence found in Premiere");
      }
    } catch (error) {
      console.error("Failed to refresh Premiere info:", error);
      toast.error("Failed to communicate with Premiere Pro");
    }
  }

  async function pushToTimeline(filename?: string) {
    if (!filename) return;
    try {
      const filePath = await getTranscriptPath(filename);
      const subtitles = await loadTranscriptSubtitles(filename);
      const srtPath = filePath.replace(/\.json$/, '.srt');
      const srtData = generateSrt(subtitles);
      await writeTextFile(srtPath, srtData);
      
      toast.info('Importing subtitles to Premiere Pro...');
      const result = await sendRequestAndWait((sid) => requestImportSRT(srtPath, sid));
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      
      if (data && data.success) {
        if (data.method === 'createCaptionTrack') {
          toast.success('Caption track created on timeline!');
        } else {
          toast.success('SRT imported to project. Drag it from the Project Panel to your timeline.');
          if (data.warning) console.warn('Premiere caption warning:', data.warning);
        }
      } else {
        toast.error(`Failed to import SRT: ${data?.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  }

  async function getSourceAudio(
    isStandaloneMode: boolean,
    fileInput: string | null,
    inputTracks: string[]
  ): Promise<{ path: string, offset: number } | null> {
    if (isStandaloneMode || !isConnected) {
      return { path: fileInput || "", offset: 0 };
    }

    setIsExporting(true);
    setExportProgress(10);

    try {
      const exportDir = await getAudioExportDir();
      const tracks = inputTracks.map(Number).filter(n => !isNaN(n));
      
      const exportRange = currentSettings.exportRange || 'entire';
      const result = await sendRequestAndWait((sid) => 
        requestAudioExport(exportDir, tracks, exportRange, '', sid)
      );
      
      setExportProgress(90);
      const data = typeof result === 'string' ? JSON.parse(result) : result;

      if (data && data.success) {
        setExportProgress(100);
        setIsExporting(false);
        return { path: data.outputPath, offset: data.timeOffsetSeconds || 0 };
      } else {
        throw new Error(data?.error || 'Export failed');
      }
    } catch (error: any) {
      setIsExporting(false);
      setExportProgress(0);
      toast.error(`Audio export failed: ${error.message}`);
      throw error;
    }
  }

  return (
    <PremiereContext.Provider value={{
      timelineInfo,
      isConnected,
      isExporting,
      exportProgress,
      refresh,
      pushToTimeline,
      getSourceAudio
    }}>
      {children}
    </PremiereContext.Provider>
  );
}

export const usePremiere = () => {
  const context = useContext(PremiereContext);
  if (!context) {
    throw new Error('usePremiere must be used within a PremiereProvider');
  }
  return context;
};
