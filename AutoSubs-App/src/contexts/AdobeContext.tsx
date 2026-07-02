import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { TimelineInfo } from '@/types';
import { requestSequenceInfo, requestAudioExport, requestImportSRT, requestJumpToTime } from '@/api/adobe-api';
import { getAudioExportDir, getSubtitleDocumentPath, loadSubtitleDocumentSubtitles } from '@/utils/file-utils';
import { generateSrt } from '@/utils/srt-utils';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useSettingsStore } from '@/stores/settings-store';
import { useIntegration } from '@/contexts/IntegrationContext';

interface AdobeContextType {
  timelineInfo: TimelineInfo;
  premiereTimeline: TimelineInfo;
  afterEffectsTimeline: TimelineInfo;
  isConnected: boolean;
  isPremiereConnected: boolean;
  isAfterEffectsConnected: boolean;
  isExporting: boolean;
  exportProgress: number;
  refresh: () => Promise<void>;
  pushToTimeline: (filename?: string) => Promise<void>;
  getSourceAudio: (audioInputMode: "file" | "timeline", fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;

  jumpToTime: (seconds: number) => Promise<void>;
}

const AdobeContext = createContext<AdobeContextType | null>(null);

const emptyTimeline: TimelineInfo = {
  name: "",
  timelineId: "",
  templates: [],
  inputTracks: [],
  outputTracks: [],
  projectName: ""
};

/** Maps raw API data from either Adobe host into a normalised TimelineInfo shape. */
function toTimelineInfo(data: any): TimelineInfo {
  return {
    name: data.name || data.sequenceName || "Sequence",
    timelineId: data.id || "adobe_seq",
    templates: [],
    inputTracks: data.audioTrackInfo?.map((t: any) => ({
      value: t.index.toString(),
      label: t.name || `Audio ${t.index}`
    })) ?? [],
    outputTracks: [],
    projectName: data.projectName || ""
  };
}

export function AdobeProvider({ children }: { children: React.ReactNode }) {
  const exportRange = useSettingsStore((s) => s.exportRange);
  const { selectedIntegration } = useIntegration();

  const [appConnections, setAppConnections] = useState<Record<string, boolean>>({
    premiere: false,
    aftereffects: false
  });

  const [premiereTimeline, setPremiereTimeline] = useState<TimelineInfo>(emptyTimeline);
  const [aeTimeline, setAeTimeline] = useState<TimelineInfo>(emptyTimeline);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const pendingRequests = useRef<Map<string, (value: any) => void>>(new Map());

  const isPremiereConnected = appConnections.premiere;
  const isAfterEffectsConnected = appConnections.aftereffects;
  const isConnected = selectedIntegration === 'aftereffects' ? isAfterEffectsConnected : isPremiereConnected;
  const timelineInfo = selectedIntegration === 'aftereffects' ? aeTimeline : premiereTimeline;

  const refreshApp = useCallback(async (app: 'premiere' | 'aftereffects', connected: boolean) => {
    if (!connected) return;

    try {
      const result = await sendRequestAndWait((sid) => requestSequenceInfo(sid, app));
      const data = typeof result === 'string' ? JSON.parse(result) : result;

      if (data && data.success) {
        if (app === 'premiere') setPremiereTimeline(toTimelineInfo(data));
        else if (app === 'aftereffects') setAeTimeline(toTimelineInfo(data));
      }
    } catch (error) {
      console.error(`Failed to refresh info for ${app}:`, error);
    }
    // sendRequestAndWait is a stable function (defined outside useCallback and only reads a ref);
    // it does not need to be in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (selectedIntegration === 'premiere' || selectedIntegration === 'aftereffects') {
      await refreshApp(selectedIntegration, isConnected);
    }
  }, [selectedIntegration, isConnected, refreshApp]);

  useEffect(() => {
    const unlistenStatus = listen<{ status: string, app: string }>('adobe-status', (event) => {
      const { status, app } = event.payload;
      const isAppConnected = status === 'connected';
      const targetApp = app as 'premiere' | 'aftereffects';

      setAppConnections(prev => ({
        ...prev,
        [targetApp]: isAppConnected
      }));

      const hostName = targetApp === 'aftereffects' ? 'After Effects' : 'Premiere Pro';
      if (isAppConnected) {
        toast.success(`Connected to ${hostName}`);
        // Senior pattern: pass status explicitly instead of relying on async state update
        refreshApp(targetApp, true);
      } else {
        toast.error(`Disconnected from ${hostName}`);
        if (targetApp === 'premiere') setPremiereTimeline(emptyTimeline);
        else if (targetApp === 'aftereffects') setAeTimeline(emptyTimeline);
      }
    });

    const unlistenMessage = listen<any>('adobe-message', (event) => {
      const msg = event.payload;
      const originApp = msg.integration;
      const sessionId = msg.sessionId || (msg.payload && typeof msg.payload === 'object' ? msg.payload.sessionId : undefined);

      if (sessionId && pendingRequests.current.has(sessionId)) {
        const resolve = pendingRequests.current.get(sessionId);
        if (resolve) {
          resolve(msg.payload);
          pendingRequests.current.delete(sessionId);
        }
      } else if (msg.type === 'sequence_info_response') {
        const result = msg.payload;
        const data = typeof result === 'string' ? JSON.parse(result) : result;
        if (data && data.success) {
          if (originApp === 'premiere') setPremiereTimeline(toTimelineInfo(data));
          else if (originApp === 'aftereffects') setAeTimeline(toTimelineInfo(data));
        }
      }
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenMessage.then(f => f());
    };
  }, [refreshApp]);

  // Refresh when the user actively switches integration. `isConnected` is intentionally
  // excluded from the dep array: we pass it explicitly as an argument to avoid a stale
  // closure while still preventing a double-fire on every connection event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isConnected) {
      refreshApp(selectedIntegration as 'premiere' | 'aftereffects', isConnected);
    }
  }, [selectedIntegration]); // isConnected excluded intentionally — see comment above

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

  async function pushToTimeline(filename?: string) {
    if (!filename || !selectedIntegration) return;
    try {
      const filePath = await getSubtitleDocumentPath(filename);
      const subtitles = await loadSubtitleDocumentSubtitles(filename);
      const srtPath = filePath.replace(/\.json$/, '.srt');
      const srtData = generateSrt(subtitles);
      await writeTextFile(srtPath, srtData);

      const hostName = selectedIntegration === 'aftereffects' ? 'After Effects' : 'Premiere Pro';
      toast.info(`Importing subtitles to ${hostName}...`);
      const result = await sendRequestAndWait((sid) => requestImportSRT(srtPath, sid, selectedIntegration));
      const data = typeof result === 'string' ? JSON.parse(result) : result;

      if (data && data.success) {
        toast.success(data.method === 'createCaptionTrack' ? 'Caption track created!' : 'SRT imported successfully!');
      } else {
        toast.error(`Failed to import SRT: ${data?.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  }

  async function getSourceAudio(audioInputMode: "file" | "timeline", fileInput: string | null, inputTracks: string[]): Promise<{ path: string, offset: number } | null> {
    if (audioInputMode === "file" || !isConnected || !selectedIntegration) return { path: fileInput || "", offset: 0 };

    setIsExporting(true);
    setExportProgress(10);
    try {
      const exportDir = await getAudioExportDir();
      const tracks = inputTracks.map(Number).filter(n => !isNaN(n));
      const result = await sendRequestAndWait((sid) => requestAudioExport(exportDir, tracks, exportRange || 'entire', '', sid, selectedIntegration));
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      if (data && data.success) {
        setExportProgress(100);
        setIsExporting(false);
        return { path: data.outputPath, offset: data.timeOffsetSeconds || 0 };
      }
      throw new Error(data?.error || 'Export failed');
    } catch (error: any) {
      setIsExporting(false);
      setExportProgress(0);
      toast.error(`Audio export failed: ${error.message}`);
      throw error;
    }
  }

  async function jumpToTime(seconds: number) {
    if (!isConnected || !selectedIntegration) return;
    try {
      // Fire and forget pattern. No need to wait for a WebSocket response.
      await requestJumpToTime(seconds, undefined, selectedIntegration);
    } catch (error) {
      console.error('Failed to dispatch jump_to_time command:', error);
    }
  }

  return (
    <AdobeContext.Provider value={{
      timelineInfo,
      premiereTimeline,
      afterEffectsTimeline: aeTimeline,
      isConnected,
      isPremiereConnected,
      isAfterEffectsConnected,
      isExporting,
      exportProgress,
      refresh,
      pushToTimeline,
      getSourceAudio,
      jumpToTime
    }}>
      {children}
    </AdobeContext.Provider>
  );
}

export const useAdobe = () => {
  const context = useContext(AdobeContext);
  if (!context) throw new Error('useAdobe must be used within an AdobeProvider');
  return context;
};
