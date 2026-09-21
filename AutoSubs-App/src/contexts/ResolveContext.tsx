import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Template, TimelineInfo } from '@/types';
import { getTimelineInfo, getTemplates, cancelExport, addSubtitlesToTimeline, ResolveApiError } from '@/api/resolve-api';
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
  /** Loads the project's Fusion title templates; `force` bypasses the cache. */
  refreshTemplates: (options?: { force?: boolean }) => Promise<Template[]>;
  pushToTimeline: (filename?: string, selectedTemplate?: string, selectedOutputTrack?: string, presetSettings?: Record<string, unknown>) => Promise<void>;
  getSourceAudio: (audioInputMode: "file" | "timeline", fileInput: string | null, inputTracks: string[]) => Promise<{ path: string, offset: number } | null>;
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  cancelExport: () => Promise<any>;
  jumpToTime: (seconds: number) => Promise<void>;
}


const EMPTY_TIMELINE_INFO: TimelineInfo = {
  name: "",
  timelineId: "",
  inputTracks: [],
  outputTracks: [],
  projectName: "",
  projectId: "",
};

/**
 * Templates live in the Resolve project's media pool, so a cached list is only
 * valid for the project it was read from. Keying the cache this way is what
 * stops a template added mid session (or a project switch) from being invisible
 * until the app restarts.
 *
 * The key is the project's unique id where Resolve reports one: two distinct
 * projects can carry the same display name, and keying on the name alone would
 * serve one project's templates to the other. The name is only a fallback for
 * hosts that report no id.
 */
const templatesCacheKey = (info: TimelineInfo) =>
  info.projectId ? `id:${info.projectId}` : `name:${info.projectName || ""}`;

const ResolveContext = createContext<ResolveContextType | null>(null);

export function ResolveProvider({ children }: { children: React.ReactNode }) {
  const { selectedIntegration } = useIntegration();
  const exportRange = useSettingsStore((s) => s.exportRange);
  const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>(EMPTY_TIMELINE_INFO);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  /** Project the cached `templates` were read from, or null when unloaded. */
  const [templatesKey, setTemplatesKey] = useState<string | null>(null);
  const [markIn] = useState(0);
  
  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const cancelRequestedRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const newTimelineInfo = await getTimelineInfo();
      setTimelineInfo(newTimelineInfo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Resolve offline — fail silently during background polling. Matches both
      // raw reqwest strings and the friendly message from resolve_bridge.
      if (
        errorMessage.includes('Connection refused') ||
        errorMessage.includes('tcp connect error') ||
        errorMessage.includes('DaVinci Resolve is not running') ||
        errorMessage.includes('AutoSubs bridge is unavailable')
      ) {
        return;
      }
      throw error;
    }
  }, []);

  const currentTemplatesKey = templatesCacheKey(timelineInfo);
  const templatesLoaded = templatesKey !== null && templatesKey === currentTemplatesKey;

  const refreshTemplates = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && templatesKey !== null && templatesKey === currentTemplatesKey) {
        return templates;
      }

      setTemplatesLoading(true);
      try {
        const nextTemplates = await getTemplates(force);
        setTemplates(nextTemplates);
        setTemplatesKey(currentTemplatesKey);
        return nextTemplates;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [templates, templatesKey, currentTemplatesKey],
  );

  // Mirror of connection state for the poll scheduler below, so the effect
  // doesn't re-subscribe every time timelineInfo changes.
  const connectedRef = useRef(false);
  useEffect(() => {
    connectedRef.current = timelineInfo.timelineId !== "";
  }, [timelineInfo]);

  useEffect(() => {
    let cancelled = false;

    if (selectedIntegration !== "davinci") {
      setTimelineInfo(EMPTY_TIMELINE_INFO);
      setTemplates([]);
      setTemplatesLoading(false);
      setTemplatesKey(null);
      return;
    }

    let inFlight = false;
    let pollTimer: number | null = null;
    // Consecutive offline-looking poll failures. A single stalled mailbox
    // ack is normal when Resolve is busy (a slow Lua handler or a congested
    // UI event queue delays the response), so the badge only drops to
    // "Disconnected" after a second failure in a row.
    let offlineStrikes = 0;
    const scheduleNext = (delayOverride?: number) => {
      if (cancelled) return;
      // Two cadences: disconnected polls every 5 s (each offline probe can
      // already take ~2 s in the mailbox ack timeout, so don't go lower);
      // connected polls stay at 60 s since this is a timeline-info refresh,
      // not a liveness check.
      const delay = delayOverride ?? (connectedRef.current ? 60000 : 5000);
      // Only one chain: the startup burst below also lands here, so drop any
      // timer already pending before arming the next one.
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => {
        void pollTimeline();
      }, delay);
    };

    const pollTimeline = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const info = await getTimelineInfo();
        if (!cancelled) {
          offlineStrikes = 0;
          setTimelineInfo(info);
        }
      } catch (error) {
        if (cancelled) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('No timeline detected')) {
          // The bridge answered; Resolve just has no timeline open.
          offlineStrikes = 0;
          setTimelineInfo(EMPTY_TIMELINE_INFO);
        } else if (
          errorMessage.includes('DaVinci Resolve is not running') ||
          errorMessage.includes('AutoSubs bridge is unavailable') ||
          errorMessage.includes('Connection refused') ||
          errorMessage.includes('tcp connect error')
        ) {
          offlineStrikes++;
          if (!connectedRef.current || offlineStrikes >= 2) {
            setTimelineInfo(EMPTY_TIMELINE_INFO);
          }
        }
      } finally {
        inFlight = false;
        // After a first offline-looking failure on a live connection, re-poll
        // soon so the second strike (or a success) settles the badge within
        // a few seconds instead of the usual 60 s cadence. After a clear,
        // force the disconnected cadence since connectedRef lags a render.
        const delay = offlineStrikes >= 2
          ? 5000
          : connectedRef.current && offlineStrikes === 1
            ? 3000
            : undefined;
        scheduleNext(delay);
      }
    };

    const startupTimers = [0, 1000, 3000].map((delay) =>
      window.setTimeout(() => {
        void pollTimeline();
      }, delay),
    );

    return () => {
      cancelled = true;
      startupTimers.forEach((timer) => window.clearTimeout(timer));
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [selectedIntegration]);

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
    const rawResult = response && typeof response === 'object' ? response.result : undefined;
    const result = rawResult && typeof rawResult === 'object' ? rawResult : undefined;
    const fontSwap = result?.fontSwap;
    const warning = result?.warning;
    if (warning) {
      toast.warning(
        String(warning),
        { description: result?.detail ? String(result.detail) : undefined },
      );
    }
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
            console.error("Export error:", progressResult.message, progressResult.detail);
            setIsExporting(false);
            setExportProgress(0);
            throw new ResolveApiError(
              progressResult.message || "Export failed",
              progressResult.detail,
              "GetExportProgress",
            );
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
        audioPath = await validateExportedAudioFile(audioPath);

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
