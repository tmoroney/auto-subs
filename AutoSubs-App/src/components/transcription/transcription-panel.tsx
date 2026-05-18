import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useModels } from "@/contexts/ModelsContext";
import { useProgress } from "@/contexts/ProgressContext";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { ResolveApiError } from "@/api/resolve-api";
import { diarizeModel } from "@/lib/models";
import SubSlateCard from "@/components/ui/SubSlateCard";
import type { TranscriptionOptions } from "@/types";
import type { SubtitleDocumentListItem } from "@/utils/file-utils";
import { TranscriptionPanelView } from "./transcription-panel-view";
import { describeError } from "./utils";

interface TranscriptionPanelProps {
  onViewSubtitles?: () => void;
  onTranscriptCreated?: () => void | Promise<void>;
  transcriptDocuments?: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments?: boolean;
  onTranscriptDocumentsRefresh?: () => Promise<void>;
  isSubtitleViewerOpen?: boolean;
}

export function TranscriptionPanel({
  onViewSubtitles,
  onTranscriptCreated,
  transcriptDocuments = [],
  isLoadingTranscriptDocuments = false,
  onTranscriptDocumentsRefresh = async () => {},
  isSubtitleViewerOpen = false,
}: TranscriptionPanelProps = {}) {
  const {
    subtitles,
    speakers,
    currentSubtitleDocumentFilename,
    processTranscriptionResults,
    exportSubtitlesAs,
    loadSubtitles,
  } = useSubtitleDocument();
  const { settings, updateSetting } = useSettings();
  const { modelsState, downloadedModelValues, checkDownloadedModels } =
    useModels();
  const {
    timelineInfo: resolveTimeline,
    templates: resolveTemplates,
    templatesLoading: resolveTemplatesLoading,
    templatesLoaded: resolveTemplatesLoaded,
    refreshTemplates: refreshResolveTemplates,
    refresh: refreshResolve,
    pushToTimeline: resolvePush,
    cancelExport: resolveCancelExport,
    isExporting: resolveIsExporting,
    exportProgress: resolveExportProgress,
    setIsExporting: resolveSetIsExporting,
    setExportProgress: resolveSetExportProgress,
    cancelRequestedRef: resolveCancelRequestedRef,
    getSourceAudio: resolveGetSourceAudio,
  } = useResolve();

  const {
    timelineInfo: premiereTimeline,
    refresh: refreshPremiere,
    pushToTimeline: premierePush,
    isExporting: premiereIsExporting,
    exportProgress: premiereExportProgress,
    getSourceAudio: premiereGetSourceAudio,
  } = useAdobe();

  const { selectedIntegration } = useIntegration();

  const isPremiereActive =
    selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
  const timelineInfo = isPremiereActive ? premiereTimeline : resolveTimeline;
  const refreshAudioTracks = isPremiereActive ? refreshPremiere : refreshResolve;
  const getSourceAudio = isPremiereActive
    ? premiereGetSourceAudio
    : resolveGetSourceAudio;
  const pushToTimeline = isPremiereActive
    ? (
        filename?: string,
        _selectedTemplate?: string,
        _selectedOutputTrack?: string,
        _presetSettings?: Record<string, unknown>,
      ) => premierePush(filename)
    : resolvePush;
  const cancelRequestedRef = resolveCancelRequestedRef;
  const isExporting = isPremiereActive
    ? premiereIsExporting
    : resolveIsExporting;
  const exportProgress = isPremiereActive
    ? premiereExportProgress
    : resolveExportProgress;

  // Senior Pattern: derive active tracks from the app-aware map instead of a global list
  const activeSelectedTracks =
    settings.selectedInputTracksByApp[selectedIntegration] || [];
  const cancelExport = resolveCancelExport; // Fallback for cancel
  const setIsExporting = resolveSetIsExporting; // Fallback
  const setExportProgress = resolveSetExportProgress; // Fallback
  const {
    processingSteps,
    livePreviewSegments,
    clearProgressSteps,
    completeAllProgressSteps,
    cancelAllProgressSteps,
    updateProgressStep,
    setupEventListeners,
  } = useProgress();
  const { showError } = useErrorDialog();
  const { t: tErr } = useTranslation();

  const [isProcessing, setIsProcessing] = React.useState(false);
  const [, setTranscriptionProgress] = React.useState(0);
  const [, setLabeledProgress] = React.useState<{
    progress: number;
    type?: string;
    label?: string;
  } | null>(null);
  const [fileInput, setFileInput] = React.useState<string | null>(null);
  const [fileInputSelectionId, setFileInputSelectionId] = React.useState(0);
  const [openModelSelector, setOpenModelSelector] = React.useState(false);
  const [showSubSlate, setShowSubSlate] = React.useState(false);
  const isSmallScreen = useMediaQuery("(max-width: 640px)");
  const progressContainerRef = React.useRef<HTMLDivElement>(null);
  const lastSubtitleLoadKeyRef = React.useRef<string | null>(null);

  const handleSelectedFileChange = React.useCallback((file: string | null) => {
    setFileInput(file);
    setFileInputSelectionId((v) => v + 1);
  }, []);

  React.useEffect(() => {
    if (!fileInput) return;

    const timelineId = timelineInfo?.timelineId ?? "standalone";
    const loadKey = `${fileInputSelectionId}:${fileInput}:${timelineId}`;
    if (lastSubtitleLoadKeyRef.current === loadKey) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        await loadSubtitles("file", fileInput, timelineId);
        lastSubtitleLoadKeyRef.current = loadKey;
      } catch (error) {
        console.error("Failed to load subtitles for selected file:", error);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    fileInputSelectionId,
    fileInput,
    loadSubtitles,
    timelineInfo?.timelineId,
  ]);

  React.useEffect(() => {
    if (processingSteps.length > 0 && progressContainerRef.current) {
      progressContainerRef.current.scrollTop = 0;
    }
  }, [processingSteps]);

  const isModelCached = modelsState[settings.model]?.isDownloaded ?? false;
  const isDiarizeModelDownloaded = downloadedModelValues.includes(
    diarizeModel.value,
  );
  const hasPendingDownloads =
    !isModelCached || (settings.enableDiarize && !isDiarizeModelDownloaded);

  React.useEffect(() => {
    const cleanup = setupEventListeners({
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      isResolveMode: settings.audioInputMode === "timeline",
      hasPendingDownloads,
      enableDiarize: settings.enableDiarize,
    });

    return cleanup;
  }, [
    setupEventListeners,
    settings.targetLanguage,
    settings.language,
    settings.audioInputMode,
    hasPendingDownloads,
    settings.enableDiarize,
  ]);

  React.useEffect(() => {
    if (settings.audioInputMode === "timeline" && isExporting) {
      updateProgressStep({
        progress: exportProgress,
        type: "Export",
      });
    }
  }, [
    isExporting,
    exportProgress,
    settings.audioInputMode,
    updateProgressStep,
  ]);

  const handleExportToFile = async () => {
    try {
      await exportSubtitlesAs("srt", subtitles, speakers);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleAddToTimeline = async (
    selectedOutputTrack: string,
    selectedTemplate: string,
    presetSettings?: Record<string, unknown>,
  ) => {
    try {
      if (!currentSubtitleDocumentFilename) {
        console.error("No active subtitle document to add to timeline");
        return;
      }

      await pushToTimeline(
        currentSubtitleDocumentFilename,
        selectedTemplate,
        selectedOutputTrack,
        presetSettings,
      );
    } catch (error) {
      console.error("Failed to add to timeline:", error);
      const { title, message, detail } = describeError(
        error,
        tErr(
          "errorDialog.addToTimelineFailed",
          "Couldn't add subtitles to timeline",
        ),
      );
      showError({ title, message, detail });
    }
  };

  const handleStartNewTranscription = React.useCallback(async () => {
    clearProgressSteps();
    setIsProcessing(false);
    setTranscriptionProgress(0);
    setIsExporting(false);
    setExportProgress(0);
    setLabeledProgress(null);
    cancelRequestedRef.current = false;
    if (settings.audioInputMode === "timeline") {
      await refreshAudioTracks();
    }
  }, [
    cancelRequestedRef,
    clearProgressSteps,
    refreshAudioTracks,
    settings.audioInputMode,
    setExportProgress,
    setIsExporting,
  ]);

  const handleStartTranscription = async () => {
    if (settings.audioInputMode === "timeline" && !timelineInfo.timelineId) {
      console.error("No timeline selected");
      return;
    }

    cancelRequestedRef.current = false;
    if (settings.audioInputMode === "file" && !fileInput) {
      console.error("No file selected");
      return;
    }

    setIsProcessing(true);
    setTranscriptionProgress(0);
    clearProgressSteps();

    setupEventListeners({
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      isResolveMode: settings.audioInputMode === "timeline",
      hasPendingDownloads,
      enableDiarize: settings.enableDiarize,
    });

    try {
      const audioInfo = await getSourceAudio(
        settings.audioInputMode,
        fileInput,
        activeSelectedTracks,
      );

      if (!audioInfo) {
        // `getSourceAudio` returns null only on user-initiated cancellation.
        // Silently clean up without showing an error dialog.
        console.log("Audio source unavailable (cancelled or missing)");
        return;
      }

      const options: TranscriptionOptions = {
        audioPath: audioInfo.path,
        offset: Math.round(audioInfo.offset * 1000) / 1000,
        model: modelsState[settings.model].value,
        lang: settings.language,
        translate: settings.translate,
        targetLanguage: settings.targetLanguage,
        enableDtw: settings.enableDTW,
        enableGpu: settings.enableGpu,
        enableDiarize: settings.enableDiarize,
        maxSpeakers: settings.maxSpeakers,
        density: settings.textDensity,
        maxLines: settings.maxLinesPerSubtitle,
        customMaxCharsPerLine:
          settings.textDensity === "custom"
            ? settings.customMaxCharsPerLine
            : undefined,
        textCase: settings.textCase,
        removePunctuation: settings.removePunctuation,
        censoredWords: settings.enableCensor ? settings.censoredWords : [],
        customPrompt: settings.customPrompt.trim() || undefined,
      };

      const transcript = await invoke("transcribe_audio", { options });

      completeAllProgressSteps();

      await processTranscriptionResults(
        transcript as any,
        settings,
        fileInput,
        timelineInfo.timelineId,
      );
      await onTranscriptCreated?.();
      onViewSubtitles?.();

      const nextCount = (settings.transcriptionsCompleted ?? 0) + 1;
      updateSetting("transcriptionsCompleted", nextCount);
      if (nextCount >= 10 && !settings.subSlateMilestoneShown) {
        setShowSubSlate(true);
      }
    } catch (error) {
      console.error("Transcription failed:", error);

      // User-initiated cancellation is a normal path, not an error.
      const isCancellation =
        (error instanceof Error && /cancell?ed/i.test(error.message)) ||
        (typeof error === "string" && /cancell?ed/i.test(error));
      if (isCancellation) {
        return;
      }

      // Distinguish export-stage failures (thrown by `getSourceAudio` via
      // `exportAudio`) from transcription-stage failures so the dialog title
      // accurately reflects where things went wrong.
      const isExportFailure =
        error instanceof ResolveApiError &&
        (error.func === "ExportAudio" || error.func === "GetExportProgress");

      const fallbackTitle = isExportFailure
        ? tErr("errorDialog.exportFailed", "Audio export failed")
        : tErr("errorDialog.transcriptionFailed", "Transcription failed");

      const { title, message, detail } = describeError(error, fallbackTitle);
      showError({ title, message, detail });
    } finally {
      setIsProcessing(false);
      setTranscriptionProgress(0);
      setIsExporting(false);
      setExportProgress(0);
      setLabeledProgress(null);
      await checkDownloadedModels();
    }
  };

  const handleCancelTranscription = async () => {
    console.log("Cancelling process...");
    cancelRequestedRef.current = true;

    try {
      if (isProcessing) {
        await invoke("cancel_transcription");
        console.log("Transcription cancellation request sent to backend");
      }

      if (isExporting && !isProcessing) {
        const cancelResult = await cancelExport();
        console.log("Export cancellation result:", cancelResult);
      }

      cancelAllProgressSteps();
      setIsProcessing(false);
      setTranscriptionProgress(0);
      setIsExporting(false);
      setExportProgress(0);
      setLabeledProgress(null);
    } catch (error) {
      console.error("Failed to cancel process:", error);
      setIsProcessing(false);
      setTranscriptionProgress(0);
      setIsExporting(false);
      setExportProgress(0);
      setLabeledProgress(null);
    } finally {
      cancelRequestedRef.current = true;
    }
  };

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0">
          <TranscriptionPanelView
            modelsState={modelsState}
            selectedModelIndex={settings.model}
            selectedLanguage={settings.language}
            onSelectModel={(modelIndex) => {
              updateSetting("model", modelIndex);
            }}
            downloadingModel={null}
            downloadProgress={0}
            openModelSelector={openModelSelector}
            onOpenModelSelectorChange={setOpenModelSelector}
            isSmallScreen={isSmallScreen}
            audioInputMode={settings.audioInputMode}
            onAudioInputModeChange={(mode) =>
              updateSetting("audioInputMode", mode)
            }
            processingSteps={processingSteps}
            progressContainerRef={progressContainerRef}
            onExportToFile={handleExportToFile}
            onAddToTimeline={handleAddToTimeline}
            onViewSubtitles={onViewSubtitles}
            transcriptDocuments={transcriptDocuments}
            isLoadingTranscriptDocuments={isLoadingTranscriptDocuments}
            onTranscriptDocumentsRefresh={onTranscriptDocumentsRefresh}
            isSubtitleViewerOpen={isSubtitleViewerOpen}
            livePreviewSegments={livePreviewSegments}
            settings={settings}
            timelineInfo={timelineInfo}
            templates={isPremiereActive ? [] : resolveTemplates}
            templatesLoading={isPremiereActive ? false : resolveTemplatesLoading}
            templatesLoaded={isPremiereActive ? true : resolveTemplatesLoaded}
            onLoadTemplates={
              isPremiereActive ? undefined : refreshResolveTemplates
            }
            selectedFile={fileInput}
            onSelectedFileChange={handleSelectedFileChange}
            onStart={handleStartTranscription}
            onCancel={handleCancelTranscription}
            onStartNewTranscription={handleStartNewTranscription}
            onRefreshAudioTracks={refreshAudioTracks}
            isProcessing={isProcessing}
            selectedIntegration={selectedIntegration}
          />
        </div>
      </div>

      <SubSlateCard
        open={showSubSlate}
        onClose={() => {
          setShowSubSlate(false);
          updateSetting("subSlateMilestoneShown", true);
        }}
        milestone="10 transcriptions complete"
      />
    </>
  );
}
