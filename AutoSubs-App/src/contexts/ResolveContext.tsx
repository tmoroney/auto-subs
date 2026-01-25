import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { TimelineInfo } from '@/types/interfaces';
import { getTimelineInfo, cancelExport, addSubtitlesToTimeline } from '@/api/resolve-api';

interface ResolveContextType {
  timelineInfo: TimelineInfo;
  markIn: number;
  isExporting: boolean;
  exportProgress: number;
  cancelRequestedRef: React.MutableRefObject<boolean>;
  refresh: () => Promise<void>;
  pushToTimeline: (filename?: string, selectedTemplate?: string, selectedOutputTrack?: string) => Promise<void>;
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

  // Initialize timeline info
  useEffect(() => {
    async function initializeTimeline() {
      try {
        console.log('Fetching timeline info...');
        const info = await getTimelineInfo().catch(() => {
          console.log('Link to Resolve is offline');
          return null;
        });

        if (info && info.timelineId) {
          console.log('Timeline info received:', info);
          setTimelineInfo(info);
        }
      } catch (error) {
        console.error('Error initializing timeline:', error);
      }
    }

    initializeTimeline();
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

  async function pushToTimeline(filename?: string, selectedTemplate?: string, selectedOutputTrack?: string) {
    // If parameters are not provided, use defaults
    const finalFilename = filename || '';
    const finalTemplate = selectedTemplate || 'Subtitle';
    const finalTrack = selectedOutputTrack || '1';
    
    await addSubtitlesToTimeline(finalFilename, finalTemplate, finalTrack);
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

        // Poll for export progress until completion
        let exportCompleted = false;
        let audioInfo = null;

        while (!exportCompleted && !cancelRequestedRef.current) {
          // Check if cancellation was requested before making the next API call
          if (cancelRequestedRef.current) {
            console.log("Export polling interrupted by cancellation request");
            break;
          }

          const progressResult = await getExportProgress();
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
              break;
            }
          }
        }

        setIsExporting(false);
        setExportProgress(100);

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
