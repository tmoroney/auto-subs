import * as React from "react";
import {
  Speech,
  Type,
  AudioLines,
  Globe,
  X,
  PlayCircle,
  ChevronRight,
  ChevronDown,
  ScrollText,
  Info,
  RefreshCw,

  SlidersHorizontal,
  PartyPopper,
  MonitorIcon,
  Baseline,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import {
  UploadIcon,
  type UploadIconHandle,
} from "@/components/ui/icons/upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/settings/model-picker";
import { LanguageSelector } from "@/components/settings/language-selector";
import { SpeakerSelector } from "@/components/settings/diarize-selector";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { ProcessingStepItem } from "@/components/processing/processing-step-item";
import { useModels } from "@/contexts/ModelsContext";
import { useProgress } from "@/contexts/ProgressContext";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { ResolveApiError } from "@/api/resolve-api";
import { languages, translateLanguages } from "@/lib/languages";
import {
  Model,
  Settings,
  TimelineInfo,
  Track,
  TranscriptionOptions,
} from "@/types";
import { useTranslation } from "react-i18next";
import { diarizeModel } from "@/lib/models";
import SubSlateCard from "@/components/SubSlateCard";


const SUPPORTED_MEDIA_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "aac",
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "mpeg",
  "mpg",
  "m4v",
  "3gp",
  "aiff",
  "opus",
  "alac",
];

function isSupportedMediaFile(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension ? SUPPORTED_MEDIA_EXTENSIONS.includes(extension) : false;
}

const CUSTOM_PROMPT_TERMS_HEADER = "Key terms and preferred spellings:";
const CUSTOM_PROMPT_CONTEXT_HEADER = "Context / style note:";
const CUSTOM_PROMPT_EXAMPLE_TERMS = "OpenAI, DaVinci Resolve, SubSlate, FFmpeg";
const CUSTOM_PROMPT_EXAMPLE_CONTEXT =
  "This is a tutorial about editing subtitles in DaVinci Resolve. Prefer “AutoSubs”, not “Auto Subs”.";

function normalizeExampleText(value: string): string {
  return value.replace(/"/g, "“");
}

function scrubExampleValue(value: string, example: string): string {
  return normalizeExampleText(value) === normalizeExampleText(example)
    ? ""
    : value;
}

function parseCustomPrompt(value: string): { terms: string; context: string } {
  const prompt = value;
  if (!prompt.trim()) return { terms: "", context: "" };

  const termsIndex = prompt.indexOf(CUSTOM_PROMPT_TERMS_HEADER);
  const contextIndex = prompt.indexOf(CUSTOM_PROMPT_CONTEXT_HEADER);

  if (termsIndex === -1 && contextIndex === -1) {
    return { terms: prompt, context: "" };
  }

  let terms = "";
  let context = "";

  if (termsIndex !== -1) {
    const termsStart = termsIndex + CUSTOM_PROMPT_TERMS_HEADER.length;
    // Find the end: either context header or end of string
    let termsEnd = contextIndex === -1 ? prompt.length : contextIndex;
    // If there's a double newline before context header, stop there
    if (contextIndex !== -1) {
      const doubleNewlineBeforeContext = prompt.lastIndexOf(
        "\n\n",
        contextIndex,
      );
      if (doubleNewlineBeforeContext > termsStart) {
        termsEnd = doubleNewlineBeforeContext;
      }
    }
    terms = prompt.slice(termsStart, termsEnd);
    // Remove leading newline if present
    if (terms.startsWith("\n")) {
      terms = terms.slice(1);
    }
  }

  if (contextIndex !== -1) {
    const contextStart = contextIndex + CUSTOM_PROMPT_CONTEXT_HEADER.length;
    context = prompt.slice(contextStart);
    // Remove leading newline if present
    if (context.startsWith("\n")) {
      context = context.slice(1);
    }
  }

  return {
    terms: scrubExampleValue(terms, CUSTOM_PROMPT_EXAMPLE_TERMS),
    context: scrubExampleValue(context, CUSTOM_PROMPT_EXAMPLE_CONTEXT),
  };
}

function composeCustomPrompt(terms: string, context: string): string {
  const sections: string[] = [];

  if (terms.length > 0) {
    sections.push(`${CUSTOM_PROMPT_TERMS_HEADER}\n${terms}`);
  }

  if (context.length > 0) {
    sections.push(`${CUSTOM_PROMPT_CONTEXT_HEADER}\n${context}`);
  }

  return sections.join("\n\n");
}

interface ProcessingStep {
  id?: string;
  title: string;
  description: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

interface TranscriptionPanelViewProps {
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
  livePreviewSegments: any[];
  settings: Settings;
  timelineInfo: TimelineInfo;
  selectedFile?: string | null;
  onSelectedFileChange?: (file: string | null) => void;
  onStart?: () => void;
  onCancel?: () => void;
  onRefreshAudioTracks?: () => Promise<void>;
  isProcessing?: boolean;
  selectedIntegration: "davinci" | "premiere" | "aftereffects";
  onSelectedIntegrationChange: (integration: "davinci" | "premiere" | "aftereffects") => void;
}


function TranscriptionPanelView({
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
  livePreviewSegments,
  settings: _settings, // Renamed to avoid clash with useSettings()
  timelineInfo,
  selectedFile: selectedFileProp,
  onSelectedFileChange,
  onStart,
  onCancel,
  onRefreshAudioTracks,
  isProcessing,
  selectedIntegration,
  onSelectedIntegrationChange,
}: TranscriptionPanelViewProps) {

  const { t, i18n } = useTranslation();
  const { settings: currentSettings, updateSetting } = useSettings();
  const isTourActive = !currentSettings.tourCompleted;
  const uploadIconRef = React.useRef<UploadIconHandle>(null);
  const dropAreaUploadIconRef = React.useRef<UploadIconHandle>(null);
  const [openLanguage, setOpenLanguage] = React.useState(false);
  const [localSelectedFile, setLocalSelectedFile] = React.useState<
    string | null
  >(null);
  const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false);
  const [openTextFormattingPopover, setOpenTextFormattingPopover] =
    React.useState(false);
  const [openCustomPromptPopover, setOpenCustomPromptPopover] =
    React.useState(false);
  const [sourceControlsExpanded, setSourceControlsExpanded] =
    React.useState(true);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [isRefreshingTracks, setIsRefreshingTracks] = React.useState(false);
  const [refreshSpinKey, setRefreshSpinKey] = React.useState(0);
  const [localTerms, setLocalTerms] = React.useState("");
  const [localContext, setLocalContext] = React.useState("");

  const customPromptParts = React.useMemo(
    () => parseCustomPrompt(currentSettings.customPrompt),
    [currentSettings.customPrompt],
  );

  // Sync local state when popover opens
  React.useEffect(() => {
    if (openCustomPromptPopover) {
      setLocalTerms(customPromptParts.terms);
      setLocalContext(customPromptParts.context);
    }
  }, [
    openCustomPromptPopover,
    customPromptParts.terms,
    customPromptParts.context,
  ]);

  // Sync to settings when popover closes
  React.useEffect(() => {
    if (!openCustomPromptPopover) {
      updateSetting(
        "customPrompt",
        composeCustomPrompt(localTerms, localContext),
      );
    }
  }, [openCustomPromptPopover, localTerms, localContext, updateSetting]);

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

  const handleFileSelect = async () => {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("actionBar.fileDialog.mediaFiles"),
          extensions: SUPPORTED_MEDIA_EXTENSIONS,
        },
      ],
      defaultPath: await downloadDir(),
    });
    setSelectedFile(file);
  };

  const selectedTracks =
    currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
  const selectedTrackCount = selectedTracks.length;
  const hasProcessingSteps = processingSteps.length > 0;
  const showProcessing = isProcessing || hasProcessingSteps;
  const hasCompletedRun = !isProcessing && hasProcessingSteps;
  const shouldShowExpandedSourceControls =
    !hasCompletedRun || sourceControlsExpanded;

  React.useEffect(() => {
    if (isProcessing) {
      setSourceControlsExpanded(false);
    } else if (!hasProcessingSteps) {
      setSourceControlsExpanded(true);
    }
  }, [hasProcessingSteps, isProcessing]);

  const handleRefreshAudioTracks = React.useCallback(async () => {
    if (!onRefreshAudioTracks || isRefreshingTracks) return;

    setRefreshSpinKey((key) => key + 1);

    try {
      setIsRefreshingTracks(true);
      await onRefreshAudioTracks();
    } finally {
      setIsRefreshingTracks(false);
    }
  }, [isRefreshingTracks, onRefreshAudioTracks]);

  const toggleInputTrack = React.useCallback(
    (trackId: string) => {
      const currentTracks =
        currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
      const isSelected = currentTracks.includes(trackId);
      const nextTracks = isSelected
        ? currentTracks.filter((id: string) => id !== trackId)
        : [...currentTracks, trackId];

      const nextMap = {
        ...currentSettings.selectedInputTracksByApp,
        [selectedIntegration]: nextTracks,
      };

      updateSetting("selectedInputTracksByApp", nextMap);
    },
    [currentSettings.selectedInputTracksByApp, selectedIntegration, updateSetting],
  );

  const renderFileDropArea = (className = "h-[160px]") => (
    <div
      key="file-drop-area"
      className={`group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/10 py-20 px-4 transition-colors hover:bg-muted/30 hover:border-muted-foreground/40 outline-none ${className}`}
      data-tour="audio-input"
      tabIndex={0}
      role="button"
      aria-label={t("actionBar.fileDrop.aria")}
      onClick={handleFileSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleFileSelect();
      }}
      onMouseEnter={() => dropAreaUploadIconRef.current?.startAnimation()}
      onMouseLeave={() => dropAreaUploadIconRef.current?.stopAnimation()}
    >
      {selectedFile ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-green-500/10 p-3 text-green-500">
            <UploadIcon ref={dropAreaUploadIconRef} size={24} />
          </div>
          <span className="text-sm font-medium text-foreground truncate px-2 text-center max-w-[280px]">
            {selectedFile.split("/").pop()}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-black/5 dark:bg-white/5 p-3 text-muted-foreground group-hover:text-foreground transition-colors">
            <UploadIcon ref={dropAreaUploadIconRef} size={24} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              {t("actionBar.fileDrop.prompt")}
            </span>
            <span className="text-xs text-muted-foreground/80">
              {t("actionBar.fileDrop.supports")}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  const sourceSummary = React.useMemo(() => {
    if (currentSettings.audioInputMode === "file") {
      return selectedFile?.split("/").pop() ?? t("actionBar.fileDrop.prompt");
    }

    const rangeLabel =
      currentSettings.exportRange === "inout"
        ? t("actionBar.tracks.exportRange.inout")
        : t("actionBar.tracks.exportRange.entire");
    const selectedTracks =
      currentSettings.selectedInputTracksByApp[selectedIntegration] || [];
    const tracksLabel =
      selectedTrackCount === 1
        ? t("actionBar.tracks.trackN", {
            n: selectedTracks[0],
          })
        : t("actionBar.tracks.countSelected", { count: selectedTrackCount });

    return `${rangeLabel} · ${tracksLabel}`;
  }, [
    currentSettings.audioInputMode,
    currentSettings.exportRange,
    currentSettings.selectedInputTracksByApp,
    selectedIntegration,
    selectedFile,
    selectedTrackCount,
    t,
  ]);

  const renderCollapsedSourceSummary = () => (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/35 pl-4 pr-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{sourceSummary}</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 px-2"
        onClick={() => {
          setSourceControlsExpanded(true);
          handleRefreshAudioTracks();
        }}
      >
        {t("common.edit", "Edit")}
      </Button>
    </div>
  );

  const renderTimelineTrackSelector = () => (
    <div className="space-y-2.5" data-tour="audio-input">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={currentSettings.exportRange || "entire"}
          onValueChange={(val) =>
            updateSetting("exportRange", val as "entire" | "inout")
          }
        >
          <SelectTrigger className="h-8 w-fit max-w-full border-transparent bg-transparent px-2 text-sm shadow-none hover:bg-muted focus:ring-0 transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="entire">
              {t("actionBar.tracks.exportRange.entire")}
            </SelectItem>
            <SelectItem value="inout">
              {t("actionBar.tracks.exportRange.inout")}
            </SelectItem>
          </SelectContent>
        </Select>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleRefreshAudioTracks}
                disabled={isRefreshingTracks}
                aria-label={t("common.refresh", "Refresh")}
              >
                <RefreshCw
                  key={refreshSpinKey}
                  className={`h-4 w-4 ${refreshSpinKey > 0 ? "[animation:spin_500ms_linear_1]" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("common.refresh", "Refresh")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {inputTracks.length > 0 ? (
        <div className="max-h-[28vh] space-y-2 overflow-y-auto rounded-lg pr-2">
          {inputTracks.map((track, index) => {
            const currentTracks =
              currentSettings.selectedInputTracksByApp[selectedIntegration] ||
              [];
            const isChecked = currentTracks.includes(track.value);

            return (
              <div
                key={track.value}
                role="button"
                tabIndex={0}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isChecked
                    ? "border-input bg-muted/60 shadow-sm"
                    : "border-transparent bg-muted/35 dark:border-border dark:bg-muted/50 hover:bg-muted/55 dark:hover:bg-muted/60"
                }`}
                onClick={() => toggleInputTrack(track.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleInputTrack(track.value);
                  }
                }}
              >
                <Checkbox
                  checked={isChecked}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none border-muted-foreground/40 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                />
                <AudioLines className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {track.label}
                </span>
                <span className="rounded-md border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                  {index + 1}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("actionBar.tracks.createTrack")}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col relative p-3">
      <div className="sticky top-0 z-10 flex items-center justify-between pb-3 bg-transparent">
        <div className="flex items-center gap-2">
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
          />
        </div>

        <Tabs
          value={audioInputMode}
          onValueChange={(value) => {
            onAudioInputModeChange(value as "file" | "timeline");
            setSourceControlsExpanded(true);
            handleRefreshAudioTracks();
          }}
          data-tour="mode-switcher"
          key={i18n.language}
        >
          <TabsList className="p-1 h-auto dark:bg-background">
            <TabsTrigger
              value="file"
              onMouseEnter={() => uploadIconRef.current?.startAnimation()}
              onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
            >
              <UploadIcon ref={uploadIconRef} className="h-4 w-4" />
              {t("actionBar.mode.fileInput")}
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              onPointerDown={() => onAudioInputModeChange("timeline")}
            >
              <MonitorIcon className="h-4 w-4" />
              {t("actionBar.mode.timeline")}
            </TabsTrigger>

          </TabsList>
        </Tabs>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          maskImage: "linear-gradient(to bottom, black 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 90%, transparent 100%)",
        }}
      >
        {showProcessing ? (
          <div
            ref={progressContainerRef}
            className="w-full px-4 pb-6 relative z-10"
          >
            <div className="flex flex-col gap-2">
              {processingSteps.map((step) => (
                <div key={step.id} className="w-full">
                  <ProcessingStepItem
                    id={step.id}
                    title={step.title}
                    description={step.description}
                    progress={step.progress}
                    isActive={step.isActive}
                    isCompleted={step.isCompleted}
                    isCancelled={step.isCancelled}
                    onExportToFile={onExportToFile}
                    onAddToTimeline={onAddToTimeline}
                    onViewSubtitles={onViewSubtitles}
                    livePreviewSegments={livePreviewSegments}
                    settings={currentSettings}
                    timelineInfo={timelineInfo}
                    selectedIntegration={selectedIntegration}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full space-y-2 pb-12 text-center">
            <img
              src="/autosubs-logo.png"
              alt="AutoSubs"
              className="w-16 h-16"
            />
            <h2 className="text-2xl font-semibold">
              {t("workspace.empty.welcomeTitle")}
            </h2>
            {currentSettings.transcriptionsCompleted > 0 ? (
              <Badge variant="secondary" className="text-sm px-3 py-1 gap-1.5">
                {currentSettings.transcriptionsCompleted} complete
                <PartyPopper className="w-3.5 h-3.5" />
              </Badge>
            ) : (
              <p className="max-w-72 pb-2">
                {t("workspace.empty.welcomeDescription")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        <Card
          className={`p-3 ${isTourActive ? "" : "sticky bottom-4"} m-1 z-50 shadow-lg bg-background`}
        >
          <div className="grid w-full gap-3" data-tour="transcription-controls">
            {!isProcessing &&
              (shouldShowExpandedSourceControls
                ? currentSettings.audioInputMode === "timeline"
                  ? renderTimelineTrackSelector()
                  : renderFileDropArea("h-[140px]")
                : renderCollapsedSourceSummary())}

            <Collapsible
              open={optionsOpen}
              onOpenChange={setOptionsOpen}
              className="space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <Popover open={openLanguage} onOpenChange={setOpenLanguage}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="default"
                      role="combobox"
                      aria-expanded={openLanguage}
                      data-tour="transcription-controls-target"
                    >
                      <Globe className="h-4 w-4" />
                      <span className="text-xs truncate flex items-center gap-1">
                        {currentSettings.translate ? (
                          <>
                            {currentSettings.language === "auto"
                              ? t("actionBar.common.auto")
                              : languages.find(
                                  (l) => l.value === currentSettings.language,
                                )?.label}
                            <ChevronRight className="h-3 w-3" />
                            {
                              translateLanguages.find(
                                (l) =>
                                  l.value === currentSettings.targetLanguage,
                              )?.label
                            }
                          </>
                        ) : currentSettings.language === "auto" ? (
                          t("actionBar.common.auto")
                        ) : (
                          languages.find(
                            (l) => l.value === currentSettings.language,
                          )?.label
                        )}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-72" align="start" side="top">
                    <LanguageSelector />
                  </PopoverContent>
                </Popover>

                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    aria-expanded={optionsOpen}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="text-xs">
                      {t("common.options", "Options")}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${optionsOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>

              </div>

              <CollapsibleContent>
                <div className="flex items-center gap-1.5">
                  <Popover
                    open={openSpeakerPopover}
                    onOpenChange={setOpenSpeakerPopover}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="default"
                        role="combobox"
                        aria-expanded={openSpeakerPopover}
                      >
                        <Speech className="h-4 w-4" />
                        <span className="text-xs">
                          {currentSettings.enableDiarize
                            ? currentSettings.maxSpeakers === null
                              ? t("actionBar.common.auto")
                              : currentSettings.maxSpeakers
                            : t("actionBar.common.off")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-0"
                      align="start"
                      side="top"
                    >
                      <SpeakerSelector />
                    </PopoverContent>
                  </Popover>

                  <Popover
                    open={openTextFormattingPopover}
                    onOpenChange={setOpenTextFormattingPopover}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="default"
                        role="combobox"
                        aria-expanded={openTextFormattingPopover}
                      >
                        <Baseline className="h-4 w-4" />
                        <span className="text-xs">
                          {t("actionBar.format.formatButton", "Format")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-80 p-0"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <TextFormattingPanel />
                    </PopoverContent>
                  </Popover>

                  <Popover
                    open={openCustomPromptPopover}
                    onOpenChange={setOpenCustomPromptPopover}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="default"
                        role="combobox"
                        aria-expanded={openCustomPromptPopover}
                        aria-label={t("actionBar.format.customPromptTitle")}
                        title={t("actionBar.format.customPromptTitle")}
                      >
                        <ScrollText />
                        <span className="text-xs">
                          {t("actionBar.format.customPromptButton", "Prompt")}
                        </span>
                        {currentSettings.customPrompt.trim() ? (
                          <span className="absolute right-2.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                        ) : null}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-80 p-0"
                      side="top"
                      align="center"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <div className="px-4 py-3.5 space-y-4">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">
                            {t("actionBar.format.customPromptTitle")}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t("actionBar.format.customPromptDescription")}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium">
                              {t("actionBar.format.customPromptTermsTitle")}
                            </Label>
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px]">
                                  <p className="text-xs">
                                    {t(
                                      "actionBar.format.customPromptTermsExample",
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <Textarea
                            value={localTerms}
                            onChange={(
                              e: React.ChangeEvent<HTMLTextAreaElement>,
                            ) => setLocalTerms(e.target.value)}
                            placeholder={t(
                              "actionBar.format.customPromptTermsPlaceholder",
                            )}
                            className="min-h-[76px] resize-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium">
                              {t("actionBar.format.customPromptContextTitle")}
                            </Label>
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[255px]">
                                  <p className="text-xs">
                                    {t(
                                      "actionBar.format.customPromptContextExample",
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <Textarea
                            value={localContext}
                            onChange={(
                              e: React.ChangeEvent<HTMLTextAreaElement>,
                            ) => setLocalContext(e.target.value)}
                            placeholder={t(
                              "actionBar.format.customPromptContextPlaceholder",
                            )}
                            className="min-h-[64px] resize-none text-sm"
                          />
                        </div>
                      </div>
                      <div className="border-t bg-muted/30">
                        <div className="px-4 py-3">
                          <p className="text-xs text-muted-foreground">
                            {t("actionBar.format.customPromptWhisperOnly")}
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {isProcessing ? (
              <Button
                onClick={onCancel}
                size="default"
                variant="destructive"
                className="w-full mt-1"
              >
                <X className="h-4 w-4" />
                {t("common.cancel")}
              </Button>
            ) : (
              <Button
                onClick={onStart}
                size="default"
                variant="default"
                className="w-full mt-1"
                disabled={
                  isProcessing ||
                  (currentSettings.audioInputMode === "file" &&
                    !selectedFile) ||
                  (currentSettings.audioInputMode === "timeline" &&
                    selectedTrackCount === 0)
                }
              >
                <PlayCircle className="h-4 w-4" />
                {currentSettings.audioInputMode === "timeline" &&
                selectedTrackCount > 0
                  ? `${t("common.generateSubtitles")} (${selectedTrackCount})`
                  : t("common.generateSubtitles")}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Normalise any thrown value (native `Error`, `ResolveApiError`, plain
 * strings from Tauri `invoke`, unknown) into the fields the error dialog
 * expects. `ResolveApiError` carries a richer `detail` from Resolve which
 * we surface in the dialog's collapsible "Show details" section.
 */
function describeError(
  error: unknown,
  fallbackTitle: string,
): { title: string; message: string; detail?: string } {
  if (error instanceof ResolveApiError) {
    return {
      title: fallbackTitle,
      message: error.message,
      detail: error.detail,
    };
  }
  if (error instanceof Error) {
    return { title: fallbackTitle, message: error.message || fallbackTitle };
  }
  if (typeof error === "string") {
    return { title: fallbackTitle, message: error };
  }
  return { title: fallbackTitle, message: fallbackTitle };
}

export function TranscriptionPanel({
  onViewSubtitles,
}: { onViewSubtitles?: () => void } = {}) {
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

  const { selectedIntegration, setSelectedIntegration } = useIntegration();

  const isPremiereActive = selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
  const timelineInfo = isPremiereActive ? premiereTimeline : resolveTimeline;
  const refreshAudioTracks = isPremiereActive
    ? refreshPremiere
    : refreshResolve;
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

  const handleSelectedFileChange = React.useCallback((file: string | null) => {
    setFileInput(file);
    setFileInputSelectionId((v) => v + 1);
  }, []);

  React.useEffect(() => {
    const run = async () => {
      if (settings.audioInputMode !== "file") return;
      if (!fileInput) return;

      try {
        await loadSubtitles(
          "file",
          fileInput,
          timelineInfo?.timelineId ?? "standalone",
        );
      } catch (error) {
        console.error("Failed to load subtitles for selected file:", error);
      }
    };

    run();
  }, [
    fileInputSelectionId,
    fileInput,
    loadSubtitles,
    settings.audioInputMode,
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

  const handleStartTranscription = async () => {
    if (settings.audioInputMode === "timeline" && !timelineInfo.timelineId) {
      console.error("No timeline selected");
      return;
    }

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
            livePreviewSegments={livePreviewSegments}
            settings={settings}
            timelineInfo={timelineInfo}
            selectedFile={fileInput}
            onSelectedFileChange={handleSelectedFileChange}
            onStart={handleStartTranscription}
            onCancel={handleCancelTranscription}
            onRefreshAudioTracks={refreshAudioTracks}
            isProcessing={isProcessing}
            selectedIntegration={selectedIntegration}
            onSelectedIntegrationChange={setSelectedIntegration}
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
