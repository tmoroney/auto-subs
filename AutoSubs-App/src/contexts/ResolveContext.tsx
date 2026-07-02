import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Template, TimelineInfo } from '@/types';
import { getTimelineInfo, getTemplates, cancelExport, addSubtitlesToTimeline } from '@/api/resolve-api';
import { useIntegration } from '@/contexts/IntegrationContext';
import { useSettingsStore } from '@/stores/settings-store';
import { validateExportedAudioFile } from '@/utils/file-utils';

interface ResolveContextType {
  timelineInfo: TimelineInfo;
  templates: Template[];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  markIn: number;
  isExporting: boolean;
  exportProgress: number;
  cancelRequestedRef: React.MutableRefObject<boolean>;
  refresh: () => Promise<void>;
  refreshTemplates: () => Promise<Template[]>;
  pushToTimeline: (filename?: string, selectedTemplate?: string, selectedOutputTrack?: string, presetSettings?: Record<string, unknown>) => Promise<void>;
  getSourceAudio: (audioInputMode: "file" | "timeline", fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  cancelExport: () => Promise<any>;
  jumpToTime: (seconds: number) => Promise<void>;
}


const ResolveContext = createContext<ResolveContextType | null>(null);

export function ResolveProvider({ children }: { children: React.ReactNode }) {
  const { selectedIntegration } = useIntegration();
  const exportRange = useSettingsStore((s) => s.exportRange);
  const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>({ name: "", timelineId: "", templates: [], inputTracks: [], outputTracks: [], projectName: "" });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [markIn] = useState(0);
  
  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const cancelRequestedRef = useRef<boolean>(false);
  const emptyTimelineInfo: TimelineInfo = { name: "", timelineId: "", templates: [], inputTracks: [], outputTracks: [], projectName: "" };

  const refresh = useCallback(async () => {
    try {
      let newTimelineInfo = await getTimelineInfo();
      setTimelineInfo({ ...newTimelineInfo, templates });
    } catch (error) {
      // Silently fail for connection errors to avoid console flooding
      // The calling context can handle UI updates if needed
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Connection refused') || errorMessage.includes('tcp connect error')) {
        // Connection refused - Resolve is not running, fail silently
        return;
      }
      // For other errors, still throw but don't log to console
      throw error;
    }
  }, [templates]);

  const refreshTemplates = useCallback(async () => {
    if (templatesLoaded) {
      return templates;
    }

    setTemplatesLoading(true);
    try {
      const nextTemplates = await getTemplates();
      setTemplates(nextTemplates);
      setTemplatesLoaded(true);
      setTimelineInfo((info) => ({ ...info, templates: nextTemplates }));
      return nextTemplates;
    } finally {
      setTemplatesLoading(false);
    }
  }, [templates, templatesLoaded]);

  useEffect(() => {
    let cancelled = false;

    if (selectedIntegration !== "davinci") {
      setTimelineInfo(emptyTimelineInfo);
      setTemplates([]);
      setTemplatesLoading(false);
      setTemplatesLoaded(false);
      return;
    }

    let inFlight = false;
    const pollTimeline = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const info = await getTimelineInfo();
        if (!cancelled) setTimelineInfo({ ...info, templates });
      } catch (error) {
        if (cancelled) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('Connection refused') ||
          errorMessage.includes('tcp connect error') ||
          errorMessage.includes('No timeline detected')
        ) {
          setTimelineInfo(emptyTimelineInfo);
        }
      } finally {
        inFlight = false;
      }
    };

    const startupTimers = [0, 1000, 3000].map((delay) =>
      window.setTimeout(() => {
        void pollTimeline();
      }, delay),
    );
    const interval = window.setInterval(() => {
      void pollTimeline();
    }, 60000);

    return () => {
      cancelled = true;
      startupTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
    };
  }, [selectedIntegration, templates, refresh]);

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
    audioInputMode: "file" | "timeline",
    fileInput: string | null,
    inputTracks: string[]
  ): Promise<{ path: string, offset: number } | null> => {
    if (timelineInfo && audioInputMode === "timeline") {
      // Reset cancellation flag at the start of export
      cancelRequestedRef.current = false;
      setIsExporting(true);
      setExportProgress(0);

      try {
        // Import the required functions directly
        const { exportAudio, getExportProgress } = await import('@/api/resolve-api');

        // Start the export (non-blocking)
        const exportResult = await exportAudio(inputTracks, exportRange || "entire");
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
            // Cancellation may have been requested during the backoff; send
            // the cancel to Resolve before exiting so the render doesn't keep
            // running after the UI has stopped.
            if (cancelRequestedRef.current) {
              await cancelExport();
              break;
            }
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
        await validateExportedAudioFile(audioPath);

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
      templates,
      templatesLoading,
      templatesLoaded,
      markIn,
      isExporting,
      exportProgress,
      cancelRequestedRef,
      refresh,
      refreshTemplates,
      pushToTimeline,
      getSourceAudio,
      setIsExporting,
      setExportProgress,
      cancelExport,
      jumpToTime: async (seconds: number) => {
        const { jumpToTime: resolveJump } = await import("@/api/resolve-api");
        await resolveJump(seconds);
      },
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
