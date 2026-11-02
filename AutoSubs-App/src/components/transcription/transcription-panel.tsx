import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useModels } from "@/contexts/ModelsContext";
import { stepTitle, useProgress } from "@/contexts/ProgressContext";
import { buildProcessingSteps, stepIdFromEvent, type StepState } from "@/queue/progress-steps";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "@/stores/settings-store";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { ResolveApiError } from "@/api/resolve-api";
import SubSlateCard from "@/components/ui/SubSlateCard";
import type { Settings, TranscriptionOptions, EnsureModelsRequest, EnsureModelsResponse } from "@/types";
import { getActiveCensorWords } from "@/censor/merge";
import { TranscriptionPanelView } from "./transcription-panel-view";
import { describeError } from "./utils";
import { getPipelineOwner, subscribePipelineOwner, tryAcquirePipeline, releasePipeline } from "@/queue/pipeline-owner";
import { useTranscriptionQueue } from "@/queue/use-transcription-queue";
import { CancellationBarrier } from "@/queue/cancellation-barrier";
import { createQueueOptions } from "@/queue/job-service";
import { QueueSidebar } from "@/components/queue/queue-sidebar";
import { getQueueSettingIssues } from "@/queue/model-compatibility";
import { modelSupportsLanguage } from "@/lib/models";
import { translateLanguages } from "@/lib/languages";
import { loadQueueResult } from "@/queue/result-store";
import { restoreQueueSettings } from "@/queue/restore-settings";
import { queueResultSelectionKey } from "@/queue/queue-state";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { SUPPORTED_MEDIA_EXTENSIONS } from "./utils";

interface TranscriptionPanelProps {
  onViewSubtitles?: () => void;
  onTranscriptCreated?: () => void | Promise<void>;
  isSubtitleViewerOpen?: boolean;
  queueOpen?: boolean;
  onQueueOpenChange?: (open: boolean) => void;
}

export function TranscriptionPanel({
  onViewSubtitles,
  onTranscriptCreated,
  isSubtitleViewerOpen = false,
  queueOpen = false,
  onQueueOpenChange,
}: TranscriptionPanelProps = {}) {
  const {
    subtitles,
    speakers,
    processTranscriptionResults,
    exportSubtitlesAs,
    loadSubtitles,
    flushPendingSubtitleSave,
    openStoredSubtitleDocument,
    clearCurrentSubtitleDocument,
    invalidatePendingSubtitleLoads,
    startSubtitleLoad,
  } = useSubtitleDocument();
  const {
    selectedInputTracksByApp,
    model,
    language,
    translate,
    targetLanguage,
    audioInputMode,
    enableDTW,
    enableForcedAlignment,
    enableGpu,
    enableVad,
    enableDiarize,
    maxSpeakers,
    diarizeBackend,
    textDensity,
    maxLinesPerSubtitle,
    customMaxCharsPerLine,
    customMaxWordsPerLine,
    customDensityUnit,
    textCase,
    removePunctuation,
    enableCensor,
    censorStyle,
    customPrompt,
    transcriptionsCompleted,
    subSlateMilestoneShown,
  } = useSettingsStore(
    useShallow((s) => ({
      selectedInputTracksByApp: s.selectedInputTracksByApp,
      model: s.model,
      language: s.language,
      translate: s.translate,
      targetLanguage: s.targetLanguage,
      audioInputMode: s.audioInputMode,
      enableDTW: s.enableDTW,
      enableForcedAlignment: s.enableForcedAlignment,
      enableGpu: s.enableGpu,
      enableVad: s.enableVad,
      enableDiarize: s.enableDiarize,
      maxSpeakers: s.maxSpeakers,
      diarizeBackend: s.diarizeBackend,
      textDensity: s.textDensity,
      maxLinesPerSubtitle: s.maxLinesPerSubtitle,
      customMaxCharsPerLine: s.customMaxCharsPerLine,
      customMaxWordsPerLine: s.customMaxWordsPerLine,
      customDensityUnit: s.customDensityUnit,
      textCase: s.textCase,
      removePunctuation: s.removePunctuation,
      enableCensor: s.enableCensor,
      censorStyle: s.censorStyle,
      customPrompt: s.customPrompt,
      transcriptionsCompleted: s.transcriptionsCompleted,
      subSlateMilestoneShown: s.subSlateMilestoneShown,
    })),
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const { modelsState, checkDownloadedModels } = useModels();
  const {
    timelineInfo: resolveTimeline,
    refresh: refreshResolve,
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
    isExporting: premiereIsExporting,
    exportProgress: premiereExportProgress,
    getSourceAudio: premiereGetSourceAudio,
  } = useAdobe();

  const { selectedIntegration } = useIntegration();

  // Standalone has no timeline: treat it as file mode everywhere in this
  // panel even if a stale persisted setting says otherwise.
  const isStandalone = selectedIntegration === "standalone";
  const effectiveMode: "file" | "timeline" = isStandalone ? "file" : audioInputMode;

  const isPremiereActive =
    selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
  const timelineInfo = isPremiereActive ? premiereTimeline : resolveTimeline;
  const refreshAudioTracks = isPremiereActive ? refreshPremiere : refreshResolve;
  const getSourceAudio = isPremiereActive
    ? premiereGetSourceAudio
    : resolveGetSourceAudio;
  const cancelRequestedRef = resolveCancelRequestedRef;
  const isExporting = isPremiereActive
    ? premiereIsExporting
    : resolveIsExporting;
  const exportProgress = isPremiereActive
    ? premiereExportProgress
    : resolveExportProgress;

  // Senior Pattern: derive active tracks from the app-aware map instead of a global list
  const activeSelectedTracks =
    selectedInputTracksByApp[selectedIntegration] || [];
  const cancelExport = resolveCancelExport; // Fallback for cancel
  const setIsExporting = resolveSetIsExporting; // Fallback
  const setExportProgress = resolveSetExportProgress; // Fallback
  const {
    processingSteps,
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
  const queue = useTranscriptionQueue((options) => {
    const issues = getQueueSettingIssues(options, modelsState, modelSupportsLanguage, translateLanguages.map((item) => item.value));
    return issues.length ? issues.map((issue) => tErr(`queue.${issue}`)).join(" ") : null;
  });
  const [selectedQueueId, setSelectedQueueId] = React.useState<string | null>(null);
  const [queueSelectionVersion, setQueueSelectionVersion] = React.useState(0);
  const selectedQueueIdRef = React.useRef<string | null>(null);
  const queueSelectionRequestRef = React.useRef(0);
  const censorSnapshotRef = React.useRef<{ words: string[]; signature: string } | null>(null);
  const restoringQueueSettingsRef = React.useRef(false);
  const missingQueueModelRef = React.useRef(false);
  const queueModelsRef = React.useRef(modelsState);
  queueModelsRef.current = modelsState;
  const setQueueOpen = React.useCallback((open: boolean) => onQueueOpenChange?.(open), [onQueueOpenChange]);
  const [queueNotice, setQueueNotice] = React.useState<string | null>(null);
  const [preflighting, setPreflighting] = React.useState(false);
  const pipelineOwner = React.useSyncExternalStore(subscribePipelineOwner, getPipelineOwner);
  const queueItemsRef = React.useRef(queue.items);
  queueItemsRef.current = queue.items;
  const queueWasRunningRef = React.useRef(false);
  React.useEffect(() => {
    if (queueWasRunningRef.current && !queue.running) void checkDownloadedModels();
    queueWasRunningRef.current = queue.running;
  }, [queue.running, checkDownloadedModels]);
  const isSmallScreen = useMediaQuery("(max-width: 640px)");
  const isQueueOverlay = useMediaQuery("(max-width: 767px)");
  const progressContainerRef = React.useRef<HTMLDivElement>(null);
  const queueDropRef = React.useRef<HTMLDivElement>(null);
  const lastSubtitleLoadKeyRef = React.useRef<string | null>(null);
  const manualCancellationRef = React.useRef<CancellationBarrier | null>(null);

  const censorSignature = (settings: Settings) => {
    return JSON.stringify([settings.enableCensor, settings.censoredWords, settings.activeCensorLists]);
  };
  const currentCensorSignature = () => censorSignature(useSettingsStore.getState());
  const queueSettingIssues = (options: Pick<TranscriptionOptions, "model" | "lang" | "translate" | "targetLanguage">) =>
    getQueueSettingIssues(options, modelsState, modelSupportsLanguage, translateLanguages.map((item) => item.value));
  const currentIssues = queueSettingIssues({ model: modelsState[model]?.value ?? "", lang: language, translate, targetLanguage });
  const issueText = (issues: ReturnType<typeof queueSettingIssues>) => issues.map((issue) => tErr(`queue.${issue}`));

  // Subscribe directly so switching selection or starting the queue cannot
  // race a delayed effect. Only effective changes are saved; unrelated global
  // settings and loading an item's settings leave the job untouched.
  React.useEffect(() => useSettingsStore.subscribe((settings, previous) => {
    const id = selectedQueueIdRef.current;
    if (!id || restoringQueueSettingsRef.current) return;
    if (missingQueueModelRef.current) {
      if (settings.model === previous.model || !queueModelsRef.current[settings.model]) return;
      missingQueueModelRef.current = false;
    }
    const item = queue.getItems().find((job) => job.id === id);
    if (!item || ["preparing", "transcribing", "exporting"].includes(item.status)) return;
    const snapshot = (value: Settings) => {
      const modelId = queueModelsRef.current[value.model]?.value;
      if (!modelId) return null;
      const options = createQueueOptions(value, modelId, item.sourcePath, true);
      if (censorSnapshotRef.current?.signature === censorSignature(value)) {
        options.censoredWords = [...censorSnapshotRef.current.words];
      }
      return options;
    };
    try {
      const before = snapshot(previous);
      const after = snapshot(settings);
      if (after && JSON.stringify(before) !== JSON.stringify(after)) queue.updateOptions(id, after);
    } catch (error) {
      setQueueNotice(error instanceof Error ? error.message : String(error));
    }
  }), [queue.getItems, queue.updateOptions]);

  const addQueuePaths = React.useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    try {
      const modelId = modelsState[useSettingsStore.getState().model]?.value;
      if (!modelId) throw new Error(tErr("queue.invalidSettings"));
      // Folder enumeration can take time. Capture the effective settings once
      // at enqueue, before the user can change the form during the scan.
      const snapshot = createQueueOptions(useSettingsStore.getState(), modelId, paths[0]);
      if (selectedQueueIdRef.current && censorSnapshotRef.current?.signature === currentCensorSignature()) {
        snapshot.censoredWords = [...censorSnapshotRef.current.words];
      }
      const issues = queueSettingIssues(snapshot);
      if (issues.length) throw new Error(issueText(issues).join(" "));
      const selection = await invoke<{ files: string[]; skipped: string[] }>("queue_collect_files", { paths, recursive: true });
      const existing = new Set(queueItemsRef.current.map((item) => item.sourcePath));
      const options = selection.files.filter((path) => !existing.has(path))
        .map((path) => ({ ...snapshot, audioPath: path }));
      queue.addItems(options);
      setQueueNotice(selection.skipped.length ? tErr("queue.skipped", { count: selection.skipped.length }) : null);
      setQueueOpen(true);
    } catch (error) {
      setQueueNotice(error instanceof Error ? error.message : String(error));
      setQueueOpen(true);
    }
  }, [queue.addItems, modelsState, tErr]);

  const addQueueFiles = async () => {
    const files = await open({ multiple: true, directory: false,
      filters: [{ name: tErr("actionBar.fileDialog.mediaFiles"), extensions: SUPPORTED_MEDIA_EXTENSIONS }] });
    if (files) await addQueuePaths(Array.isArray(files) ? files : [files]);
  };

  const addQueueFolder = async () => {
    const folder = await open({ multiple: false, directory: true, recursive: true });
    if (folder) await addQueuePaths([folder]);
  };

  const startQueue = async () => {
    if (preflighting) return;
    setPreflighting(true);
    try {
      const pendingJobs = () => queue.getItems().filter((item) => item.status === "pending");
      const signature = () => JSON.stringify([pendingJobs().map((item) => [item.id, item.options]), queue.getSaveFormats()]);
      const pending = pendingJobs();
      if (!pending.length) return;
      const initialSignature = signature();
      const selection = await invoke<{ files: string[]; skipped: string[] }>("queue_collect_files", {
        paths: pending.map((item) => item.sourcePath), recursive: false,
      });
      if (signature() !== initialSignature) {
        setQueueNotice(tErr("queue.changed"));
        return;
      }
      const available = new Set(selection.files);
      const unavailable = [...new Set(pending.map((item) => item.sourcePath).filter((path) => !available.has(path)))];
      if (unavailable.length) queue.failUnavailableSources(unavailable, tErr("queue.preflightFailed"));
      const runnable = pendingJobs();
      if (!runnable.length) {
        setQueueNotice(tErr("queue.reauthorizeInputs"));
        return;
      }
      const confirmedSignature = signature();
      const invalid = runnable.find((item) => queueSettingIssues(item.options).length > 0);
      if (invalid) {
        setQueueNotice(issueText(queueSettingIssues(invalid.options)).join(" "));
        return;
      }
      const outputCheck = await invoke<{ outputs: Array<{ outputPath: string; existing: boolean; duplicate: boolean }>; errors: Array<{ sourcePath: string; message: string }> }>("queue_preflight_outputs", {
        sources: runnable.map((item) => item.sourcePath), formats: queue.getSaveFormats(), outputDirectory: null,
      });
      if (outputCheck.errors.length) {
        setQueueNotice(outputCheck.errors.map((error) => `${error.sourcePath}: ${error.message}`).join("\n"));
        return;
      }
      const downloaded = await invoke<string[]>("get_downloaded_models");
      if (signature() !== confirmedSignature) {
        setQueueNotice(tErr("queue.changed"));
        return;
      }
      const missing = new Set(runnable.filter((item) => !downloaded.includes(item.options.model))
        .map((item) => item.options.model));
      const skippedNotice = unavailable.length ? `${tErr("queue.skipped", { count: unavailable.length })}\n${tErr("queue.reauthorizeInputs")}\n\n` : "";
      const collisions = outputCheck.outputs.filter((output) => output.existing || output.duplicate);
      const collisionNotice = collisions.length ? `\n\n${tErr("queue.backupsCount", { count: collisions.length })}\n${collisions.map((output) => output.outputPath).join("\n")}` : "";
      const summary = `${skippedNotice}${tErr("queue.summary", { count: runnable.length, missing: missing.size })}${missing.size ? `\n${[...missing].join(", ")}` : ""}\n\n${tErr("queue.preflightDetail")}${collisionNotice}\n\n${tErr("queue.runQuestion")}`;
      if (await ask(summary, { title: tErr("queue.title"), kind: "info" })) {
        if (signature() !== confirmedSignature) {
          setQueueNotice(tErr("queue.changed"));
          return;
        }
        setQueueNotice(null);
        if (!queue.start()) setQueueNotice(tErr("queue.busy"));
      }
    } catch (error) {
      setQueueNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setPreflighting(false);
    }
  };

  const handleSelectedFileChange = React.useCallback((file: string | null) => {
    queueSelectionRequestRef.current += 1;
    invalidatePendingSubtitleLoads();
    selectedQueueIdRef.current = null;
    setSelectedQueueId(null);
    censorSnapshotRef.current = null;
    setFileInput(file);
    setFileInputSelectionId((v) => v + 1);
  }, [invalidatePendingSubtitleLoads]);

  React.useEffect(() => {
    if (!fileInput || selectedQueueId) return;

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
    selectedQueueId,
    loadSubtitles,
    timelineInfo?.timelineId,
  ]);

  const selectQueueItem = async (id: string) => {
    if (getPipelineOwner() === "manual") return;
    const request = ++queueSelectionRequestRef.current;
    try {
      await flushPendingSubtitleSave();
    } catch (error) {
      if (request === queueSelectionRequestRef.current) setQueueNotice(error instanceof Error ? error.message : String(error));
      return;
    }
    if (request !== queueSelectionRequestRef.current || getPipelineOwner() === "manual") return;
    const item = queue.getItems().find((job) => job.id === id);
    if (!item) return;
    invalidatePendingSubtitleLoads();
    const restored = restoreQueueSettings(item.options, modelsState);
    missingQueueModelRef.current = !restored.ok;
    selectedQueueIdRef.current = id;
    setSelectedQueueId(id);
    setQueueSelectionVersion((version) => version + 1);
    clearProgressSteps();
    setFileInput(item.sourcePath);
    restoringQueueSettingsRef.current = true;
    try { useSettingsStore.setState(restored.patch); }
    finally { restoringQueueSettingsRef.current = false; }
    censorSnapshotRef.current = { words: restored.censoredWordsOverride, signature: currentCensorSignature() };
    setQueueNotice(restored.ok ? null : tErr("queue.missing_model"));
  };

  const selectedQueueItem = queue.items.find((item) => item.id === selectedQueueId);
  const selectedQueueActive = !!selectedQueueItem && queue.activeJobId === selectedQueueItem.id;
  const queueStepMap: Record<string, StepState> = {};
  const queueSeenOrder: string[] = [];
  for (const event of selectedQueueItem?.progressSteps ?? []) {
    const id = stepIdFromEvent(event.label, event.type);
    if (!id) continue;
    queueStepMap[id] = { progress: event.progress };
    queueSeenOrder.push(id);
  }
  const queueProgressSteps = selectedQueueItem ? buildProcessingSteps({
    settings: {
      targetLanguage: selectedQueueItem.options.targetLanguage,
      language: selectedQueueItem.options.lang,
      enableDiarize: selectedQueueItem.options.enableDiarize,
      enableForcedAlignment: selectedQueueItem.options.enableForcedAlignment && !selectedQueueItem.options.translate,
      audioInputMode: "file",
    },
    stepMap: queueStepMap,
    seenOrder: queueSeenOrder,
    runComplete: selectedQueueItem.status === "completed",
    title: stepTitle,
    speakerDetail: selectedQueueItem.speakerCount == null ? undefined : tErr("progressSteps.speakersFound", {
      count: selectedQueueItem.speakerCount,
      defaultValue: `${selectedQueueItem.speakerCount} speakers`,
    }),
  }) : [];
  const resultActionsRef = React.useRef({ flushPendingSubtitleSave, openStoredSubtitleDocument, clearCurrentSubtitleDocument, onTranscriptCreated, onViewSubtitles });
  resultActionsRef.current = { flushPendingSubtitleSave, openStoredSubtitleDocument, clearCurrentSubtitleDocument, onTranscriptCreated, onViewSubtitles };
  const lastLoadedQueueResultKeyRef = React.useRef<string | null>(null);
  const selectedQueueResultKey = queueResultSelectionKey(selectedQueueItem, queueSelectionVersion);
  React.useEffect(() => {
    const filename = selectedQueueItem?.resultFilename;
    const id = selectedQueueId;
    const key = selectedQueueResultKey;
    // The result is written before export finishes. Keep the progress page
    // visible until the job stops, and don't reopen an unchanged result after
    // a cancelled retry. Explicitly reselecting an item still reloads it.
    if (!id || !key || lastLoadedQueueResultKeyRef.current === key) return;
    let cancelled = false;
    const isLatestLoad = startSubtitleLoad();
    const selectionRequest = queueSelectionRequestRef.current;
    const isCurrent = () => !cancelled && isLatestLoad() && selectedQueueIdRef.current === id &&
      queueSelectionRequestRef.current === selectionRequest &&
      queueResultSelectionKey(queue.getItems().find((job) => job.id === id), queueSelectionVersion) === key;
    void (async () => {
      try {
        await resultActionsRef.current.flushPendingSubtitleSave();
        if (!isCurrent()) return;
        if (!filename) {
          resultActionsRef.current.clearCurrentSubtitleDocument();
          lastLoadedQueueResultKeyRef.current = key;
          return;
        }
        const document = await loadQueueResult(filename);
        if (!isCurrent()) return;
        if (!document) throw new Error("Transcript is unavailable");
        resultActionsRef.current.openStoredSubtitleDocument(filename, document);
        lastLoadedQueueResultKeyRef.current = key;
        await resultActionsRef.current.onTranscriptCreated?.();
        if (cancelled || selectedQueueIdRef.current !== id || queueSelectionRequestRef.current !== selectionRequest) return;
        resultActionsRef.current.onViewSubtitles?.();
      } catch (error) {
        if (!cancelled) setQueueNotice(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedQueueId, selectedQueueResultKey, startSubtitleLoad]);

  React.useEffect(() => {
    if (processingSteps.length > 0 && progressContainerRef.current) {
      progressContainerRef.current.scrollTop = 0;
    }
  }, [processingSteps]);

  const willUseForcedAlignment = enableForcedAlignment && !translate;

  React.useEffect(() => {
    const cleanup = setupEventListeners({
      targetLanguage,
      language,
      enableForcedAlignment: willUseForcedAlignment,
      enableDiarize,
      audioInputMode: effectiveMode,
    });

    return cleanup;
  }, [
    setupEventListeners,
    targetLanguage,
    language,
    willUseForcedAlignment,
    enableDiarize,
    effectiveMode,
  ]);

  React.useEffect(() => {
    if (effectiveMode === "timeline" && isExporting) {
      updateProgressStep({
        progress: exportProgress,
        type: "Prepare",
        label: "progressSteps.prepare.export",
      });
    }
  }, [
    isExporting,
    exportProgress,
    effectiveMode,
    updateProgressStep,
  ]);

  const handleExportToFile = async () => {
    try {
      await exportSubtitlesAs("srt", subtitles, speakers);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleStartNewTranscription = React.useCallback(async () => {
    queueSelectionRequestRef.current += 1;
    invalidatePendingSubtitleLoads();
    selectedQueueIdRef.current = null;
    setSelectedQueueId(null);
    censorSnapshotRef.current = null;
    clearProgressSteps();
    setIsProcessing(false);
    setTranscriptionProgress(0);
    setIsExporting(false);
    setExportProgress(0);
    setLabeledProgress(null);
    cancelRequestedRef.current = false;
    setFileInput(null);
    if (effectiveMode === "timeline") {
      await refreshAudioTracks();
    }
  }, [
    invalidatePendingSubtitleLoads,
    cancelRequestedRef,
    clearProgressSteps,
    refreshAudioTracks,
    effectiveMode,
    setExportProgress,
    setIsExporting,
    setFileInput,
  ]);

  const handleStartTranscription = async () => {
    if (effectiveMode === "timeline" && !timelineInfo.timelineId) {
      console.error("No timeline selected");
      return;
    }

    cancelRequestedRef.current = false;
    if (effectiveMode === "file" && !fileInput) {
      console.error("No file selected");
      return;
    }

    if (translate && language !== "auto" && language === targetLanguage) {
      showError({
        title: tErr("errorDialog.sameLanguageSourceAndTarget.title", "Source and target language are the same"),
        message: tErr("errorDialog.sameLanguageSourceAndTarget.message", "Please choose a different source or target language before translating."),
      });
      return;
    }

    if (!tryAcquirePipeline("manual")) return;
    const cancellationBarrier = new CancellationBarrier();
    manualCancellationRef.current = cancellationBarrier;
    setIsProcessing(true);
    setTranscriptionProgress(0);
    clearProgressSteps();

    setupEventListeners({
      targetLanguage,
      language,
      enableForcedAlignment: willUseForcedAlignment,
      enableDiarize,
      audioInputMode: effectiveMode,
    });

    try {
      // A cancelled preparation leaves the backend flag set until the next
      // run. Reset it only after acquiring the shared pipeline.
      await invoke("queue_reset_cancellation");
      if (cancelRequestedRef.current) return;
      const speakerLimit =
        typeof maxSpeakers === "number" && !isNaN(maxSpeakers)
          ? Math.floor(maxSpeakers) || null
          : null;

      const ensureModelsRequest: EnsureModelsRequest = {
        model: modelsState[model].value,
        enableVad,
        enableDiarize,
        enableForcedAlignment: willUseForcedAlignment,
        maxSpeakers: speakerLimit,
        diarizeBackend,
      };

      // Both operations must settle before releasing pipeline ownership, even
      // when one fails while the other is still exporting or downloading.
      const [audioResult, modelResult] = await Promise.allSettled([
        getSourceAudio(
          effectiveMode,
          fileInput,
          activeSelectedTracks,
        ),
        invoke<EnsureModelsResponse>("ensure_models", { request: ensureModelsRequest }),
      ]);

      if (audioResult.status === "rejected") throw audioResult.reason;
      if (modelResult.status === "rejected") throw modelResult.reason;
      const audioInfo = audioResult.value;
      const modelPaths = modelResult.value;

      if (cancelRequestedRef.current) return;

      if (!audioInfo) {
        // `getSourceAudio` returns null only on user-initiated cancellation.
        // Silently clean up without showing an error dialog.
        console.log("Audio source unavailable (cancelled or missing)");
        return;
      }

      const options: TranscriptionOptions = {
        audioPath: audioInfo.path,
        offset: Math.round(audioInfo.offset * 1000) / 1000,
        model: modelsState[model].value,
        lang: language,
        translate,
        targetLanguage,
        enableDtw: enableDTW,
        enableVad,
        enableForcedAlignment: willUseForcedAlignment,
        enableGpu,
        enableDiarize,
        maxSpeakers: speakerLimit,
        diarizeBackend,
        density: textDensity,
        maxLines: Math.max(1, Math.floor(maxLinesPerSubtitle ?? 1)),
        // Custom density sends only the active unit's limit; the backend
        // prefers words for space-separated scripts.
        customMaxCharsPerLine:
          textDensity === "custom" && customDensityUnit !== "words"
            ? Math.max(1, Math.floor(customMaxCharsPerLine ?? 1))
            : undefined,
        customMaxWordsPerLine:
          textDensity === "custom" && customDensityUnit === "words"
            ? Math.max(1, Math.floor(customMaxWordsPerLine ?? 1))
            : undefined,
        textCase,
        removePunctuation,
        censoredWords: enableCensor
          ? (selectedQueueId && censorSnapshotRef.current?.signature === currentCensorSignature()
              ? [...censorSnapshotRef.current.words]
              : getActiveCensorWords(useSettingsStore.getState()))
          : [],
        censorStyle,
        customPrompt: customPrompt.trim() || undefined,
        asrModelPath: modelPaths.asrModelPath,
        vadModelPath: modelPaths.vadModelPath,
        diarizeSegmentPath: modelPaths.diarizeSegmentPath,
        diarizeEmbeddingPath: modelPaths.diarizeEmbeddingPath,
        diarizeSortformerPath: modelPaths.diarizeSortformerPath,
        alignerModelDir: modelPaths.alignerDir,
      };

      const transcript = await invoke("queue_transcribe_audio", { options });
      if (cancelRequestedRef.current) return;

      completeAllProgressSteps();

      await processTranscriptionResults(
        transcript as any,
        useSettingsStore.getState(),
        fileInput,
        timelineInfo.timelineId,
      );
      await onTranscriptCreated?.();
      onViewSubtitles?.();

      const nextCount = (transcriptionsCompleted ?? 0) + 1;
      updateSetting("transcriptionsCompleted", nextCount);
      if (nextCount >= 10 && !subSlateMilestoneShown) {
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

      // End the run explicitly. Nothing else does, and a run that is neither
      // complete nor cancelled leaves the stepper mid-flight and pins the right
      // panel to a draft transcript that will never finish.
      cancelAllProgressSteps();

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
      // A late cancel IPC must not reach a subsequent run after ownership is
      // released, even if this run finished while cancellation was requested.
      await cancellationBarrier.close();
      manualCancellationRef.current = null;
      releasePipeline("manual");
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
    try {
      const requested = manualCancellationRef.current?.request(async () => {
        const operations: Promise<unknown>[] = [];
        if (isProcessing) operations.push(invoke("cancel_transcription"));
        if (isExporting && !isPremiereActive) operations.push(cancelExport());
        await Promise.allSettled(operations);
      }, console.error);
      if (!requested) return;
      cancelRequestedRef.current = true;

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
    }
  };

  return (
    <>
      <div className="relative flex h-full min-w-0">
        {queueOpen && (
          <div ref={queueDropRef} className={isQueueOverlay ? "absolute inset-y-0 left-0 z-[60] max-w-[85%] shadow-xl" : "h-full shrink-0"}>
            <QueueSidebar
              items={queue.items.map((item) => ({
                id: item.id, sourcePath: item.sourcePath, model: item.options.model,
                language: item.options.lang, options: item.options, status: item.status,
                progress: item.progress, error: item.error, outputPath: item.outputPath,
              }))}
              selectedId={selectedQueueId}
              running={queue.running}
              paused={queue.paused}
              notice={queue.storageError || queueNotice}
              settingsIssues={issueText(currentIssues)}
              busy={!queue.hydrated || preflighting || (pipelineOwner !== null && pipelineOwner !== "queue")}
              saveSrt={queue.saveFormats.includes("srt")}
              saveTxt={queue.saveFormats.includes("txt")}
              onSelect={(id) => { void selectQueueItem(id); }}
              onAddFiles={() => { void addQueueFiles(); }}
              onAddFolder={() => { void addQueueFolder(); }}
              onSaveSrtChange={(enabled) => queue.setSaveFormats(enabled ? [...new Set([...queue.saveFormats, "srt" as const])] : queue.saveFormats.filter((format) => format !== "srt"))}
              onSaveTxtChange={(enabled) => queue.setSaveFormats(enabled ? [...new Set([...queue.saveFormats, "txt" as const])] : queue.saveFormats.filter((format) => format !== "txt"))}
              onStart={() => { void startQueue(); }}
              onPause={queue.pause}
              onResume={() => { void startQueue(); }}
              onCancelCurrent={queue.cancelCurrent}
              onRetry={queue.retry}
              onRemove={(id) => {
                queue.remove(id);
                if (selectedQueueIdRef.current === id) { selectedQueueIdRef.current = null; setSelectedQueueId(null); }
              }}
              onDuplicate={queue.duplicate}
              onMove={queue.move}
              onReorder={queue.reorder}
              onClearQueue={() => {
                if (queue.clearQueue()) { selectedQueueIdRef.current = null; setSelectedQueueId(null); setQueueOpen(false); }
              }}
              onClose={() => setQueueOpen(false)}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <TranscriptionPanelView
            modelsState={modelsState}
            selectedModelIndex={model}
            selectedLanguage={language}
            onSelectModel={(modelIndex) => {
              updateSetting("model", modelIndex);
            }}
            downloadingModel={null}
            downloadProgress={0}
            openModelSelector={openModelSelector}
            onOpenModelSelectorChange={setOpenModelSelector}
            isSmallScreen={isSmallScreen}
            audioInputMode={effectiveMode}
            onAudioInputModeChange={(mode) =>
              updateSetting("audioInputMode", mode)
            }
            processingSteps={selectedQueueActive ? queueProgressSteps : processingSteps}
            progressContainerRef={progressContainerRef}
            onExportToFile={handleExportToFile}
            onViewSubtitles={onViewSubtitles}
            isSubtitleViewerOpen={isSubtitleViewerOpen}
            timelineInfo={timelineInfo}
            selectedFile={fileInput}
            onSelectedFileChange={handleSelectedFileChange}
            onStart={handleStartTranscription}
            onCancel={selectedQueueActive ? queue.cancelCurrent : handleCancelTranscription}
            onStartNewTranscription={handleStartNewTranscription}
            onRefreshAudioTracks={refreshAudioTracks}
            isProcessing={isProcessing || selectedQueueActive}
            selectedIntegration={selectedIntegration}
            queueCount={queue.items.length}
            pipelineBusy={pipelineOwner !== null}
            onOpenQueue={() => setQueueOpen(!queueOpen)}
            onAddSelectedToQueue={() => { if (fileInput) void addQueuePaths([fileInput]); }}
            onDropQueuePaths={addQueuePaths}
            queueDropRef={queueDropRef}
            selectedQueueItem={!!selectedQueueItem}
            settingsIssues={issueText(currentIssues)}
            onRemoveQueueItem={() => {
              if (!selectedQueueItem || selectedQueueActive) return;
              queue.remove(selectedQueueItem.id);
              selectedQueueIdRef.current = null;
              setSelectedQueueId(null);
              censorSnapshotRef.current = null;
            }}
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
