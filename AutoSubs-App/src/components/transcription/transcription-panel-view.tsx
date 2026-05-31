import * as React from "react";
import { PlayCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/settings/model-picker";
import { useSettings } from "@/contexts/SettingsContext";
import type {
  Model,
  Settings,
  TimelineInfo,
  Track,
} from "@/types";
import type { SubtitleDocumentListItem } from "@/utils/file-utils";
import { TranscriptionHeader } from "./transcription-header";
import { ProcessingStepsList } from "./processing-steps-list";
import { RunSummaryCard } from "./run-summary";
import { CompactSettingsRow, SectionHeader } from "./section-row";
import {
  FileDropArea,
  SourceModeTabs,
  TimelineTrackSelector,
  formatLocalizedTrackNumber,
} from "./source-section";
import { LanguageButton } from "./language-button";
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
  onAddToTimeline: (
    selectedOutputTrack: string,
    selectedTemplate: string,
    presetSettings?: Record<string, unknown>,
  ) => Promise<void>;
  onViewSubtitles?: () => void;
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  onTranscriptDocumentsRefresh: () => Promise<void>;
  livePreviewSegments: any[];
  isSubtitleViewerOpen?: boolean;
  settings: Settings;
  timelineInfo: TimelineInfo;
  templates: TimelineInfo["templates"];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  onLoadTemplates?: () => Promise<TimelineInfo["templates"]>;
  selectedFile?: string | null;
  onSelectedFileChange?: (file: string | null) => void;
  onStart?: () => void;
  onCancel?: () => void;
  onStartNewTranscription: () => void | Promise<void>;
  onRefreshAudioTracks?: () => Promise<void>;
  isProcessing?: boolean;
  selectedIntegration: "davinci" | "premiere" | "aftereffects";
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
  onAddToTimeline,
  onViewSubtitles,
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  onTranscriptDocumentsRefresh,
  livePreviewSegments,
  isSubtitleViewerOpen = false,
  timelineInfo,
  templates,
  templatesLoading,
  templatesLoaded,
  onLoadTemplates,
  selectedFile: selectedFileProp,
  onSelectedFileChange,
  onStart,
  onCancel,
  onStartNewTranscription,
  onRefreshAudioTracks,
  isProcessing,
  selectedIntegration,
}: TranscriptionPanelViewProps) {
  const { t, i18n } = useTranslation();
  const { settings: currentSettings, updateSetting } = useSettings();

  const [localSelectedFile, setLocalSelectedFile] = React.useState<
    string | null
  >(null);
  const [isRefreshingTracks, setIsRefreshingTracks] = React.useState(false);

  const selectedFile = selectedFileProp ?? localSelectedFile;

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
    (async () => {
      const webview = await getCurrentWebview();
      unlisten = await webview.onDragDropEvent((event: any) => {
        if (event.payload.type === "drop") {
          const files = event.payload.paths as string[] | undefined;
          if (files && files.length > 0) {
            const supportedFile = files.find(isSupportedMediaFile);
            if (supportedFile) {
              setSelectedFile(supportedFile);
            }
          }
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [setSelectedFile]);

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
      currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
    const validTrackIds = inputTracks.map((track) => track.value);
    const cleanedSelectedTracks = currentSelectedTracks.filter((trackId: string) =>
      validTrackIds.includes(trackId)
    );

    if (cleanedSelectedTracks.length !== currentSelectedTracks.length) {
      const nextMap = {
        ...currentSettings.selectedInputTracksByApp,
        [selectedIntegration]: cleanedSelectedTracks,
      };
      updateSetting("selectedInputTracksByApp", nextMap);
    }
  }, [inputTracks, currentSettings.selectedInputTracksByApp, selectedIntegration, updateSetting]);

  const selectedTracks =
    currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
  const selectedTrackCount = selectedTracks.length;
  const hasProcessingSteps = processingSteps.length > 0;
  const showProcessing = isProcessing || hasProcessingSteps;
  const hasCompletedRun = !isProcessing && hasProcessingSteps;

  const startDisabled =
    isProcessing ||
    (currentSettings.audioInputMode === "file" && !selectedFile) ||
    (currentSettings.audioInputMode === "timeline" &&
      (selectedTrackCount === 0 || inputTracks.length === 0));

  const formatSectionNumber = React.useCallback(
    (value: number) => formatLocalizedTrackNumber(value, i18n.language),
    [i18n.language],
  );

  const startButtonLabel =
    currentSettings.audioInputMode === "timeline" &&
    selectedTrackCount > 0 &&
    inputTracks.length > 0
      ? `${t("common.generateSubtitles")} (${selectedTrackCount})`
      : t("common.generateSubtitles");

  return (
    <div className="h-full flex flex-col relative">
      <TranscriptionHeader
        transcriptDocuments={transcriptDocuments}
        isLoadingTranscriptDocuments={isLoadingTranscriptDocuments}
        onTranscriptDocumentsRefresh={onTranscriptDocumentsRefresh}
        onViewSubtitles={onViewSubtitles}
        isSubtitleViewerOpen={isSubtitleViewerOpen}
        templates={templates}
        templatesLoading={templatesLoading}
        templatesLoaded={templatesLoaded}
        onLoadTemplates={onLoadTemplates}
        timelineInfo={timelineInfo}
      />

      <div className="flex-1 min-h-0 flex flex-col p-3.5 pt-1.5 pb-4">
        {showProcessing && (
          <ProcessingStepsList
            steps={processingSteps}
            isProcessing={isProcessing}
            containerRef={progressContainerRef}
            livePreviewSegments={livePreviewSegments}
            timelineInfo={timelineInfo}
            selectedIntegration={selectedIntegration}
            onExportToFile={onExportToFile}
            onAddToTimeline={onAddToTimeline}
            onViewSubtitles={onViewSubtitles}
            isSubtitleViewerOpen={isSubtitleViewerOpen}
          />
        )}

        {hasCompletedRun ? (
          <div className="flex-shrink-0 pt-3">
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
              data-tour="transcription-controls"
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
                    <div className="mb-2.5 w-full">
                      <SourceModeTabs
                        audioInputMode={audioInputMode}
                        onAudioInputModeChange={onAudioInputModeChange}
                        onSwitchToTimeline={handleRefreshAudioTracks}
                      />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col">
                      {currentSettings.audioInputMode === "timeline" ? (
                        <TimelineTrackSelector
                          inputTracks={inputTracks}
                          selectedIntegration={selectedIntegration}
                          onRefreshTracks={handleRefreshAudioTracks}
                          isRefreshingTracks={isRefreshingTracks}
                        />
                      ) : (
                        <FileDropArea
                          selectedFile={selectedFile}
                          onSelectedFileChange={setSelectedFile}
                        />
                      )}
                    </div>
                  </div>

                  <Card className="z-50 overflow-hidden rounded-2xl bg-background p-0 shadow-none">
                    <CompactSettingsRow
                      number={formatSectionNumber(2)}
                      label={t("actionBar.language.title", "Language")}
                      className="border-b"
                    >
                      <LanguageButton />
                    </CompactSettingsRow>

                    <CompactSettingsRow
                      number={formatSectionNumber(3)}
                      label={t("actionBar.options", "Options")}
                      className="border-b"
                    >
                      <OptionsRow />
                    </CompactSettingsRow>

                    <CompactSettingsRow
                      number={formatSectionNumber(4)}
                      label={t("actionBar.model", "Model")}
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
                  </Card>

                  {/* Start Transcription */}
                  <div className="z-50 shadow-none">
                    <Button
                      onClick={onStart}
                      size="lg"
                      variant="default"
                      disabled={startDisabled}
                      className="w-full"
                    >
                      <PlayCircle className="size-4" />
                      {startButtonLabel}
                    </Button>
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
