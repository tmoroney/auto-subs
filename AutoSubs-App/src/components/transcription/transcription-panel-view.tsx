import * as React from "react";
import { ListPlus, PlayCircle, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/settings/model-picker";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import type {
  Model,
  TimelineInfo,
  Track,
} from "@/types";
import { TranscriptionHeader } from "./transcription-header";
import { CompletionStepItem } from "@/components/processing/completion-step-item";
import { ProcessingStepsList } from "./processing-steps-list";
import { RunSummaryCard } from "./run-summary";
import { CompactSettingsRow, SectionHeader } from "./section-row";
import {
  FileDropArea,
  SourceModeTabs,
  TimelineTrackSelector,
  formatLocalizedTrackNumber,
} from "./source-section";
import type { Integration } from "@/contexts/IntegrationContext";
import { LanguageButton } from "./language-button";
import { FormatRow } from "./format-row";
import { OptionsRow } from "./options-row";
import { isSupportedMediaFile, type ProcessingStep } from "./utils";

export interface TranscriptionPanelViewProps {
  modelsState: Model[];
  selectedModelIndex: number;
  selectedLanguage: string;
  onSelectModel: (modelIndex: number) => void;
  downloadingModel: string | null;
  downloadProgress: number;
  openModelSelector: boolean;
  onOpenModelSelectorChange: (open: boolean) => void;
  isSmallScreen: boolean;
  audioInputMode: "file" | "timeline";
  onAudioInputModeChange: (mode: "file" | "timeline") => void;
  processingSteps: ProcessingStep[];
  progressContainerRef: React.RefObject<HTMLDivElement>;
  onExportToFile: () => void;
  onViewSubtitles?: () => void;
  isSubtitleViewerOpen?: boolean;
  timelineInfo: TimelineInfo;
  selectedFile?: string | null;
  onSelectedFileChange?: (file: string | null) => void;
  onStart?: () => void;
  onCancel?: () => void;
  onStartNewTranscription: () => void | Promise<void>;
  onRefreshAudioTracks?: () => Promise<void>;
  isProcessing?: boolean;
  selectedIntegration: Integration;
  queueCount: number;
  pipelineBusy: boolean;
  onOpenQueue: () => void;
  onAddSelectedToQueue: () => void;
  onDropQueuePaths: (paths: string[]) => void;
  selectedQueueItem: boolean;
  onRemoveQueueItem: () => void;
  settingsIssues: string[];
  queueDropRef: React.RefObject<HTMLDivElement>;
}

export function TranscriptionPanelView({
  modelsState,
  selectedModelIndex,
  selectedLanguage,
  onSelectModel,
  downloadingModel,
  downloadProgress,
  openModelSelector,
  onOpenModelSelectorChange,
  isSmallScreen,
  audioInputMode,
  onAudioInputModeChange,
  processingSteps,
  progressContainerRef,
  onExportToFile,
  onViewSubtitles,
  isSubtitleViewerOpen = false,
  timelineInfo,
  selectedFile: selectedFileProp,
  onSelectedFileChange,
  onStart,
  onCancel,
  onStartNewTranscription,
  onRefreshAudioTracks,
  isProcessing,
  selectedIntegration,
  queueCount,
  pipelineBusy,
  onOpenQueue,
  onAddSelectedToQueue,
  onDropQueuePaths,
  selectedQueueItem,
  onRemoveQueueItem,
  settingsIssues,
  queueDropRef,
}: TranscriptionPanelViewProps) {
  const { t, i18n } = useTranslation();
  const selectedInputTracksByApp = useSettingsStore((s) => s.selectedInputTracksByApp);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const isCustomDensity = useSettingsStore((s) => s.textDensity === "custom");

  const [localSelectedFile, setLocalSelectedFile] = React.useState<
    string | null
  >(null);
  const [isRefreshingTracks, setIsRefreshingTracks] = React.useState(false);

  // Distinguish "prop not provided" (undefined → fall back to local state)
  // from "prop explicitly cleared" (null → respect the parent's reset).
  // Using `??` would treat null as "not set" and resurrect a stale
  // `localSelectedFile` after the parent clears the file, leaving the
  // Generate button looking enabled while `handleStartTranscription`
  // silently no-ops on a null `fileInput`.
  const selectedFile =
    selectedFileProp !== undefined ? selectedFileProp : localSelectedFile;

  const setSelectedFile = React.useCallback(
    (file: string | null) => {
      setLocalSelectedFile(file);
      onSelectedFileChange?.(file);
    },
    [onSelectedFileChange],
  );

  const inputTracks: Track[] = React.useMemo(() => {
    if (!timelineInfo?.inputTracks) return [];
    return timelineInfo.inputTracks;
  }, [timelineInfo]);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const webview = await getCurrentWebview();
      const stop = await webview.onDragDropEvent((event: any) => {
        if (event.payload.type === "drop") {
          const files = event.payload.paths as string[] | undefined;
          if (files && files.length > 0) {
            const rect = queueDropRef.current?.getBoundingClientRect();
            const position = event.payload.position as { x: number; y: number } | undefined;
            const scale = window.devicePixelRatio || 1;
            const inQueue = !!rect && !!position && position.x / scale >= rect.left && position.x / scale <= rect.right
              && position.y / scale >= rect.top && position.y / scale <= rect.bottom;
            if (inQueue || files.length > 1 || !isSupportedMediaFile(files[0])) {
              onDropQueuePaths(files);
              return;
            }
            const supportedFile = files.find(isSupportedMediaFile);
            if (supportedFile) {
              setSelectedFile(supportedFile);
            }
          }
        }
      });
      if (disposed) stop();
      else unlisten = stop;
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [setSelectedFile, onDropQueuePaths, queueDropRef]);

  const handleRefreshAudioTracks = React.useCallback(async () => {
    if (!onRefreshAudioTracks || isRefreshingTracks) return;

    try {
      setIsRefreshingTracks(true);
      await onRefreshAudioTracks();
    } finally {
      setIsRefreshingTracks(false);
    }
  }, [isRefreshingTracks, onRefreshAudioTracks]);

  // Clean up selected tracks that no longer exist (runs on both manual and auto refresh)
  React.useEffect(() => {
    const currentSelectedTracks =
      selectedInputTracksByApp[selectedIntegration] || [];
    const validTrackIds = inputTracks.map((track) => track.value);

    // Don't wipe persisted selections while the track list is still loading
    // or when the host editor reports no audio tracks yet.
    if (validTrackIds.length === 0) return;

    const cleanedSelectedTracks = currentSelectedTracks.filter((trackId: string) =>
      validTrackIds.includes(trackId)
    );

    if (cleanedSelectedTracks.length !== currentSelectedTracks.length) {
      const nextMap = {
        ...selectedInputTracksByApp,
        [selectedIntegration]: cleanedSelectedTracks,
      };
      updateSetting("selectedInputTracksByApp", nextMap);
    }
  }, [inputTracks, selectedInputTracksByApp, selectedIntegration, updateSetting]);

  const selectedTracks =
    selectedInputTracksByApp[selectedIntegration] || [];
  const selectedTrackCount = selectedTracks.length;
  const hasProcessingSteps = processingSteps.some(
    (step) => step.isActive || step.isCompleted,
  );
  const showProcessing = isProcessing || hasProcessingSteps;
  const hasCompletedRun =
    !isProcessing && processingSteps.some((step) => step.isCompleted);

  const startDisabled =
    isProcessing || pipelineBusy || settingsIssues.length > 0 ||
    (audioInputMode === "file" && !selectedFile) ||
    (audioInputMode === "timeline" &&
      (selectedTrackCount === 0 || inputTracks.length === 0));

  const formatSectionNumber = React.useCallback(
    (value: number) => formatLocalizedTrackNumber(value, i18n.language),
    [i18n.language],
  );

  const startButtonLabel =
    audioInputMode === "timeline" &&
    selectedTrackCount > 0 &&
    inputTracks.length > 0
      ? `${t("queue.generateCurrent")} (${selectedTrackCount})`
      : t("queue.generateCurrent");

  return (
    <div className="h-full flex flex-col relative">
      <TranscriptionHeader
        onViewSubtitles={onViewSubtitles}
        isSubtitleViewerOpen={isSubtitleViewerOpen}
      />

      <div className="px-3.5 pb-1 flex justify-start">
        <Button type="button" variant="ghost" size="sm" onClick={onOpenQueue}>
          <ListPlus className="size-4" />{t("queue.open")} ({queueCount})
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-3.5 pt-1.5 pb-4">
        {showProcessing && (
          <ProcessingStepsList
            steps={processingSteps}
            isProcessing={isProcessing}
            containerRef={progressContainerRef}
          />
        )}

        {hasCompletedRun ? (
          <div className="flex-shrink-0 pt-3 flex flex-col gap-2.5">
            <CompletionStepItem
              onExportToFile={onExportToFile}
              onViewSubtitles={onViewSubtitles}
              isSubtitleViewerOpen={isSubtitleViewerOpen}
              timelineInfo={timelineInfo}
              selectedIntegration={selectedIntegration}
            />
            <Button
              type="button"
              onClick={onStartNewTranscription}
              size="lg"
              variant="default"
              className="w-full"
            >
              <PlayCircle className="size-4" />
              {t("common.startNewTranscription", "Start new transcription")}
            </Button>
          </div>
        ) : (
          <div className={showProcessing ? "flex-shrink-0" : "min-h-0 flex-1"}>
            <div
              className="flex h-full w-full flex-col gap-2.5"
            >
              {isProcessing ? (
                <RunSummaryCard
                  modelsState={modelsState}
                  selectedModelIndex={selectedModelIndex}
                />
              ) : (
                <>
                  <div className="z-50 flex min-h-0 flex-1 flex-col">
                    <SectionHeader
                      number={formatSectionNumber(1)}
                      label={t("actionBar.source", "Source")}
                    />
                    {/* Standalone has no timeline: hide the mode toggle and
                        never render the track selector (file mode only). */}
                    {selectedIntegration !== "standalone" && (
                      <div className="mb-2.5 w-full">
                        <SourceModeTabs
                          audioInputMode={audioInputMode}
                          onAudioInputModeChange={onAudioInputModeChange}
                          onSwitchToTimeline={handleRefreshAudioTracks}
                        />
                      </div>
                    )}
                    <div className="grid min-h-0 flex-1 grid-rows-1">
                      {selectedIntegration !== "standalone" && (
                        <TimelineTrackSelector
                          inputTracks={inputTracks}
                          selectedIntegration={selectedIntegration}
                          onRefreshTracks={handleRefreshAudioTracks}
                          isRefreshingTracks={isRefreshingTracks}
                          className={cn(
                            "row-start-1 col-start-1 transition-opacity",
                            audioInputMode !== "timeline" && "opacity-0 pointer-events-none"
                          )}
                        />
                      )}
                      <FileDropArea
                        selectedFile={selectedFile}
                        onSelectedFileChange={setSelectedFile}
                        className={cn(
                          "row-start-1 col-start-1 transition-opacity",
                          audioInputMode !== "file" && "opacity-0 pointer-events-none"
                        )}
                      />
                    </div>
                  </div>

                  <Card className="z-50 overflow-hidden rounded-2xl bg-background p-0 shadow-none">
                    {settingsIssues.length > 0 && (
                      <div role="status" className="border-b px-3 py-2 text-xs text-destructive">
                        <strong>{t("queue.settingsIssues")}: </strong>{settingsIssues.join(" ")}
                      </div>
                    )}
                    <CompactSettingsRow
                      number={formatSectionNumber(2)}
                      label={t("actionBar.language.title", "Language")}
                      className="border-b"
                    >
                      <LanguageButton />
                    </CompactSettingsRow>

                    <CompactSettingsRow
                      number={formatSectionNumber(3)}
                      label={t("actionBar.model", "Model")}
                      className="border-b"
                    >
                      <ModelPicker
                        modelsState={modelsState}
                        selectedModelIndex={selectedModelIndex}
                        selectedLanguage={selectedLanguage}
                        onSelectModel={onSelectModel}
                        downloadingModel={downloadingModel}
                        downloadProgress={downloadProgress}
                        open={openModelSelector}
                        onOpenChange={onOpenModelSelectorChange}
                        isSmallScreen={isSmallScreen}
                        triggerClassName="h-10 rounded-lg px-3 py-0"
                      />
                    </CompactSettingsRow>

                    <CompactSettingsRow
                      number={formatSectionNumber(4)}
                      label={t("actionBar.rows.format", "Format")}
                      alignTop={isCustomDensity}
                      className="border-b"
                    >
                      <FormatRow />
                    </CompactSettingsRow>

                    <CompactSettingsRow
                      number={formatSectionNumber(5)}
                      label={t("actionBar.rows.options", "Options")}
                    >
                      <OptionsRow
                        selectedModelEngine={
                          modelsState[selectedModelIndex]?.engine
                        }
                      />
                    </CompactSettingsRow>
                  </Card>

                  {/* Start Transcription */}
                  <div className="z-50 flex flex-wrap gap-2 shadow-none">
                    <Button
                      onClick={onStart}
                      size="lg"
                      variant="default"
                      disabled={startDisabled}
                      className="flex-1"
                    >
                      <PlayCircle className="size-4" />
                      {startButtonLabel}
                    </Button>
                    {audioInputMode === "file" && (
                      <Button type="button" variant="outline" size="lg"
                        disabled={!selectedFile || (!selectedQueueItem && settingsIssues.length > 0)}
                        onClick={selectedQueueItem ? onRemoveQueueItem : onAddSelectedToQueue}>
                        {selectedQueueItem ? <Trash2 className="size-4" /> : <ListPlus className="size-4" />}
                        {t(selectedQueueItem ? "queue.removeQueueItem" : "queue.addToQueue")}
                      </Button>
                    )}
                  </div>
                </>
              )}
              {isProcessing && (
                <Button
                  onClick={onCancel}
                  size="lg"
                  variant="destructive"
                  className="w-full"
                >
                  <X className="size-4" />
                  {t("common.cancel")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
