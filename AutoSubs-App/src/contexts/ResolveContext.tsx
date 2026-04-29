import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { TimelineInfo } from '@/types';
import { getTimelineInfo, cancelExport, addSubtitlesToTimeline } from '@/api/resolve-api';

interface ResolveContextType {
  timelineInfo: TimelineInfo;
  markIn: number;
  isExporting: boolean;
  exportProgress: number;
  cancelRequestedRef: React.MutableRefObject<boolean>;
  refresh: () => Promise<void>;
  pushToTimeline: (filename?: string, selectedTemplate?: string, selectedOutputTrack?: string, presetSettings?: Record<string, unknown>) => Promise<void>;
  getSourceAudio: (isStandaloneMode: boolean, fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  cancelExport: () => Promise<any>;
}

const ResolveContext = createContext<ResolveContextType | null>(null);

export function ResolveProvider({ children }: { children: React.ReactNode }) {
  const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>({ name: "", timelineId: "", templates: [], inputTracks: [], outputTracks: [] });
  const [markIn] = useState(0);
  
  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const cancelRequestedRef = useRef<boolean>(false);

  // Keep trying to connect to Resolve in the background while disconnected.
  // A single one-shot attempt on mount misses two common situations: the app
  // rendering before the Lua server has finished binding (race on launch), and
  // the user reopening the app after the server was shut down by a previous
  // session's Exit command.  Polling every 5 s is cheap — GetTimelineInfo is a
  // lightweight call — and gives the user an automatic reconnect rather than
  // requiring a manual refresh click.
  useEffect(() => {
    let cancelled = false;
    let polling = false;

    async function tryConnect() {
      if (polling) return;
      polling = true;
      try {
        const info = await getTimelineInfo().catch(() => null);
        if (!cancelled && info && info.timelineId) {
          setTimelineInfo(info);
        }
      } catch {
        // ignore — we'll retry on the next interval
      } finally {
        polling = false;
      }
    }

    tryConnect();

    const interval = setInterval(() => {
      // Only poll while disconnected to avoid redundant Resolve API calls
      // during normal operation.
      setTimelineInfo(current => {
        if (!current.timelineId) {
          tryConnect();
        }
        return current;
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function refresh() {
    try {
      let newTimelineInfo = await getTimelineInfo();
      setTimelineInfo(newTimelineInfo);
    } catch (error) {
      // setError will be handled by calling context if needed
      console.error("Failed to get current timeline:", error);
      throw error;
    }
  }

  async function pushToTimeline(
    filename?: string,
    selectedTemplate?: string,
    selectedOutputTrack?: string,
    presetSettings?: Record<string, unknown>,
  ) {
    // If parameters are not provided, use defaults
    const finalFilename = filename || '';
    const finalTemplate = selectedTemplate || 'Subtitle';
    const finalTrack = selectedOutputTrack || '1';

    const response = await addSubtitlesToTimeline(finalFilename, finalTemplate, finalTrack, null, presetSettings);

    // Surface a language-aware font swap (done server-side in the Lua macro
    // server) so the user knows why their caption font changed.
    const result = response && typeof response === 'object' ? response.result : undefined;
    const fontSwap = result && typeof result === 'object' ? result.fontSwap : null;
    if (fontSwap) {
      if (fontSwap.to) {
        toast.info(
          `Using '${fontSwap.to}' for ${fontSwap.language} captions`,
          { description: `The default caption font doesn't support this language. Change the Font in your preset to override.` },
        );
      } else if (fontSwap.missing) {
        toast.warning(
          `No installed font found for ${fontSwap.language} captions`,
          { description: `Install a font that supports ${fontSwap.script} (e.g. a Noto ${fontSwap.script} family) to render captions correctly.` },
        );
      }
    }
  }

  // Function to get source audio based on current mode
  const getSourceAudio = async (
    isStandaloneMode: boolean,
    fileInput: string | null,
    inputTracks: string[]
  ): Promise<{ path: string, offset: number } | null> => {
    if (timelineInfo && !isStandaloneMode) {
      // Reset cancellation flag at the start of export
      cancelRequestedRef.current = false;
      setIsExporting(true);
      setExportProgress(0);

      try {
        // Import the required functions directly
        const { exportAudio, getExportProgress } = await import('@/api/resolve-api');

        // Start the export (non-blocking)
        const exportResult = await exportAudio(inputTracks);
        console.log("Export started:", exportResult);

        // Poll for export progress until completion.
        // Resolve can stall its own Lua scripting engine during rendering, so
        // individual GetExportProgress requests may time out even while the
        // export is still running normally. We tolerate up to
        // MAX_CONSECUTIVE_ERRORS consecutive network/timeout errors before
        // giving up, so a long-running export doesn't kill the UI prematurely.
        let exportCompleted = false;
        let audioInfo = null;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 10;

        while (!exportCompleted && !cancelRequestedRef.current) {
          // Check if cancellation was requested before making the next API call
          if (cancelRequestedRef.current) {
            console.log("Export polling interrupted by cancellation request");
            await cancelExport();
            break;
          }

          let progressResult;
          try {
            progressResult = await getExportProgress();
            consecutiveErrors = 0;
          } catch (pollErr) {
            consecutiveErrors++;
            console.warn(
              `Export progress poll failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
              pollErr,
            );
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              throw pollErr;
            }
            // Back off before retrying — Resolve may be busy rendering
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }

          console.log("Export progress:", progressResult);

          // Update progress
          setExportProgress(progressResult.progress || 0);

          if (progressResult.completed) {
            exportCompleted = true;
            audioInfo = progressResult.audioInfo;
            console.log("Export completed:", audioInfo);
          } else if (progressResult.cancelled) {
            console.log("Export was cancelled");
            setIsExporting(false);
            setExportProgress(0);
            return null;
          } else if (progressResult.error) {
            console.error("Export error:", progressResult.message);
            setIsExporting(false);
            setExportProgress(0);
            throw new Error(progressResult.message || "Export failed");
          }

          // Wait before next poll (avoid overwhelming the server)
          if (!exportCompleted && !cancelRequestedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check again after timeout in case cancellation happened during the wait
            if (cancelRequestedRef.current) {
              console.log("Export polling interrupted during wait interval");
              await cancelExport();
              break;
            }
          }
        }

        setIsExporting(false);
        setExportProgress(0);

        // If audioInfo is null, the export was cancelled or failed
        if (!audioInfo) {
          console.log("Export cancelled or failed - no audio info available");
          return null;
        }

        let audioPath = audioInfo["path"];
        let audioOffset = audioInfo["offset"];
        return { path: audioPath, offset: audioOffset };

      } catch (error) {
        setIsExporting(false);
        setExportProgress(0);
        throw error;
      }
    } else {
      return { path: fileInput || "", offset: 0 };
    }
  };

  return (
    <ResolveContext.Provider value={{
      timelineInfo,
      markIn,
      isExporting,
      exportProgress,
      cancelRequestedRef,
      refresh,
      pushToTimeline,
      getSourceAudio,
      setIsExporting,
      setExportProgress,
      cancelExport,
    }}>
      {children}
    </ResolveContext.Provider>
  );
}

export const useResolve = () => {
  const context = useContext(ResolveContext);
  if (!context) {
    throw new Error('useResolve must be used within a ResolveProvider');
  }
  return context;
};
