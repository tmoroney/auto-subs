import * as React from "react";
import {
  Speech,
  AudioLines,
  X,
  PlayCircle,
  ArrowRight,
  ScrollText,
  Info,
  MonitorIcon,
  Baseline,
  History,
  Palette,
  Settings as SettingsIcon,
  FileText,
  Shapes,
  GitMerge,
  Heart,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { platform } from "@tauri-apps/plugin-os";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";
import { useTheme } from "@/components/providers/theme-provider";
import {
  UploadIcon,
  type UploadIconHandle,
} from "@/components/ui/icons/upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/settings/model-picker";
import { LanguageSelector } from "@/components/settings/language-selector";
import { SpeakerSelector } from "@/components/settings/diarize-selector";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { ProcessingStepItem } from "@/components/processing/processing-step-item";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { SupportDialog } from "@/components/dialogs/support-dialog";
import { ManageModelsDialog } from "@/components/settings/model-manager";
import { IntegrationStatus } from "@/components/layout/integration-status";
import { TranscriptHistoryPopover } from "@/components/subtitles/transcript-history-popover";
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
import SubSlateCard from "@/components/ui/SubSlateCard";
import type { SubtitleDocumentListItem } from "@/utils/file-utils";

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
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  onTranscriptDocumentsRefresh: () => Promise<void>;
  livePreviewSegments: any[];
  isSubtitleViewerOpen?: boolean;
  settings: Settings;
  timelineInfo: TimelineInfo;
  selectedFile?: string | null;
  onSelectedFileChange?: (file: string | null) => void;
  onStart?: () => void;
  onCancel?: () => void;
  onStartNewTranscription: () => void | Promise<void>;
  onRefreshAudioTracks?: () => Promise<void>;
  isProcessing?: boolean;
  selectedIntegration: "davinci" | "premiere" | "aftereffects";
}

interface TranscriptionHeaderProps {
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  onTranscriptDocumentsRefresh: () => Promise<void>;
  onViewSubtitles?: () => void;
  isSubtitleViewerOpen?: boolean;
}

function TranscriptionHeader({
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  onTranscriptDocumentsRefresh,
  onViewSubtitles,
  isSubtitleViewerOpen = false,
}: TranscriptionHeaderProps) {
  const { t } = useTranslation();
  const [styleDialogOpen, setStyleDialogOpen] = React.useState(false);
  const [isMacOs, setIsMacOs] = React.useState(true);

  React.useEffect(() => {
    try {
      setIsMacOs(platform() === "macos");
    } catch {
      setIsMacOs(true);
    }
  }, []);

  return (
    <>
      <div
        className={`flex h-12 shrink-0 items-center justify-between gap-3 border-b mb-2 pr-4 ${isMacOs ? "pl-20" : "pl-4"}`}
        data-tauri-drag-region={isMacOs ? true : undefined}
      >
        <div
          className="min-w-0"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <IntegrationStatus />
        </div>
        <div
          className="flex shrink-0 items-center"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-sm"
                onClick={() => setStyleDialogOpen(true)}
              >
                <Palette />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("actionBar.options.subtitleStyle", "Caption Style")}
            </TooltipContent>
          </Tooltip>
          <TranscriptHistoryPopover
            subtitleDocuments={transcriptDocuments}
            isLoading={isLoadingTranscriptDocuments}
            onTranscriptOpen={() => onViewSubtitles?.()}
            onRefresh={onTranscriptDocumentsRefresh}
            tooltipLabel={t("titlebar.subtitleHistory.title", "History")}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-sm"
                aria-label={t("titlebar.subtitleHistory.title", "History")}
              >
                <History />
              </Button>
            }
          />
          <SettingsDropdown />
          {onViewSubtitles && !isSubtitleViewerOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-sm"
                  aria-label={t("completion.viewSubtitles", "View Subtitles")}
                  onClick={onViewSubtitles}
                >
                  <FileText />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("completion.viewSubtitles", "View Subtitles")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
        <DialogContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>
              {t("actionBar.options.subtitleStyle", "Caption Theme")}
            </DialogTitle>
          </DialogHeader>
          <TextFormattingPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { modelsState, downloadedModelValues, handleDeleteModel } = useModels();
  const [manageModelsOpen, setManageModelsOpen] = React.useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [supportDialogOpen, setSupportDialogOpen] = React.useState(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const suppressTooltipUntilRef = React.useRef(0);

  const managerModels: Model[] = downloadedModelValues.includes(
    diarizeModel.value,
  )
    ? [...modelsState, { ...diarizeModel, isDownloaded: true }]
    : modelsState;

  const handleThemeChange = (themeValue: string) => {
    setTheme(themeValue as "dark" | "light" | "system");
  };

  const suppressTooltip = React.useCallback(() => {
    suppressTooltipUntilRef.current = Date.now() + 700;
    setTooltipOpen(false);
  }, []);

  const handleDropdownOpenChange = (nextOpen: boolean) => {
    setDropdownOpen(nextOpen);
    suppressTooltip();
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
        <Tooltip
          open={tooltipOpen}
          onOpenChange={(nextOpen) => {
            setTooltipOpen(
              nextOpen &&
                !dropdownOpen &&
                Date.now() > suppressTooltipUntilRef.current,
            );
          }}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-sm"
                aria-label={t("settings.title", "Settings")}
              >
                <SettingsIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("settings.title", "Settings")}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          className="w-48 rounded-lg"
          side="bottom"
          align="end"
          sideOffset={4}
          onPointerDown={suppressTooltip}
          onClick={suppressTooltip}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setSettingsDialogOpen(true)}
              className="cursor-pointer"
            >
              <SettingsIcon />
              <span>{t("settings.title", "Settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setManageModelsOpen(true)}
              className="cursor-pointer"
            >
              <Shapes />
              <span>{t("models.manage.title", "Manage Models")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild className="cursor-pointer">
              <a
                href="https://github.com/tmoroney/auto-subs"
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <GitMerge />
                <span>{t("settings.support.viewSource", "View Source")}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSupportDialogOpen(true)}
              className="cursor-pointer focus:bg-pink-100 focus:text-pink-700 data-[highlighted]:bg-pink-100 data-[highlighted]:text-pink-700 dark:focus:bg-pink-900/50 dark:focus:text-pink-500 dark:data-[highlighted]:bg-pink-900/50 dark:data-[highlighted]:text-pink-500"
            >
              <div className="group relative flex w-full items-center">
                <Heart className="mr-2 h-4 w-4 text-pink-500 transition-all group-data-[highlighted]:fill-pink-500 group-focus:fill-pink-500" />
                <span>
                  {t("settings.support.supportAutoSubs", "Support AutoSubs")}
                </span>
                <div className="pointer-events-none absolute inset-0">
                  {[
                    { tx: "-90px", ty: "-90px", s: 1.8, r: "-20deg", d: "0s" },
                    { tx: "80px", ty: "-100px", s: 1.5, r: "25deg", d: "0.05s" },
                    { tx: "-30px", ty: "-120px", s: 1.7, r: "5deg", d: "0.1s" },
                    { tx: "100px", ty: "-80px", s: 1.4, r: "-15deg", d: "0.15s" },
                    { tx: "0px", ty: "-115px", s: 1.9, r: "0deg", d: "0.2s" },
                    { tx: "-100px", ty: "-75px", s: 1.5, r: "15deg", d: "0.25s" },
                    { tx: "70px", ty: "-115px", s: 1.6, r: "-5deg", d: "0.3s" },
                  ].map((heart, index) => (
                    <Heart
                      key={index}
                      className="heart-anim absolute left-1/2 top-1/2 h-5 w-5 text-pink-400 opacity-0"
                      style={
                        {
                          "--tx": heart.tx,
                          "--ty": heart.ty,
                          "--s": heart.s,
                          "--r": heart.r,
                          animationDelay: heart.d,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <div className="p-1">
            <Tabs value={theme} onValueChange={handleThemeChange}>
              <TabsList className="w-full">
                <TabsTrigger value="light">
                  <Sun />
                </TabsTrigger>
                <TabsTrigger value="dark">
                  <Moon />
                </TabsTrigger>
                <TabsTrigger value="system">
                  <Monitor />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={managerModels}
        onDeleteModel={(modelValue) => void handleDeleteModel(modelValue)}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      <SupportDialog
        open={supportDialogOpen}
        onOpenChange={setSupportDialogOpen}
      />
    </>
  );
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
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  onTranscriptDocumentsRefresh,
  livePreviewSegments,
  isSubtitleViewerOpen = false,
  settings: _settings, // Renamed to avoid clash with useSettings()
  timelineInfo,
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
  const uploadIconRef = React.useRef<UploadIconHandle>(null);
  const dropAreaUploadIconRef = React.useRef<UploadIconHandle>(null);
  const [openSourceLanguage, setOpenSourceLanguage] = React.useState(false);
  const [openTargetLanguage, setOpenTargetLanguage] = React.useState(false);
  const [localSelectedFile, setLocalSelectedFile] = React.useState<
    string | null
  >(null);
  const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false);
  const [openTextFormattingPopover, setOpenTextFormattingPopover] =
    React.useState(false);
  const [openCustomPromptPopover, setOpenCustomPromptPopover] =
    React.useState(false);
  const [isRefreshingTracks, setIsRefreshingTracks] = React.useState(false);
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
    if (openCustomPromptPopover) return;

    const nextCustomPrompt = composeCustomPrompt(localTerms, localContext);
    if (nextCustomPrompt === currentSettings.customPrompt) return;

    updateSetting("customPrompt", nextCustomPrompt);
  }, [
    currentSettings.customPrompt,
    openCustomPromptPopover,
    localTerms,
    localContext,
    updateSetting,
  ]);

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

  const handleRefreshAudioTracks = React.useCallback(async () => {
    if (!onRefreshAudioTracks || isRefreshingTracks) return;

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

  const renderFileDropArea = (className = "min-h-0 flex-1") => (
    <div
      key="file-drop-area"
      className={`group flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-muted-foreground/25 bg-muted/10 px-4 py-4 transition-colors hover:bg-muted/30 hover:border-muted-foreground/40 outline-none ${className}`}
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

  const sourceModeLabel =
    currentSettings.audioInputMode === "timeline"
      ? t("actionBar.mode.timeline")
      : t("actionBar.mode.fileInput");

  const selectedModelLabel = t(modelsState[selectedModelIndex].label);

  const sourceLanguageLabel =
    currentSettings.language === "auto"
      ? t("actionBar.common.auto")
      : languages.find((l) => l.value === currentSettings.language)?.label ??
      currentSettings.language;

  const targetLanguageLabel =
    translateLanguages.find((l) => l.value === currentSettings.targetLanguage)
      ?.label ?? currentSettings.targetLanguage;

  const languageSummary = currentSettings.translate
    ? `${sourceLanguageLabel} → ${targetLanguageLabel}`
    : sourceLanguageLabel;

  // Additional settings labels
  const diarizeLabel = currentSettings.enableDiarize
    ? currentSettings.maxSpeakers === null
      ? t("actionBar.common.auto")
      : currentSettings.maxSpeakers
    : t("actionBar.speakers.disabled");

  const textDensityLabel = t(
    `actionBar.format.textDensity.${currentSettings.textDensity}`,
  );

  const textCaseLabel =
    currentSettings.textCase !== "none"
      ? t(`actionBar.format.textCase.${currentSettings.textCase}`)
      : "";

  const gpuLabel = currentSettings.enableGpu
    ? t("settings.gpu.title")
    : "";

  const dtwLabel = currentSettings.enableDTW
    ? t("settings.dtw.title")
    : "";

  const punctuationLabel = currentSettings.removePunctuation
    ? t("actionBar.format.removePunctuationTitle")
    : "";

  // Build summary with all information
  const summaryParts = [
    sourceModeLabel,
    selectedModelLabel,
    languageSummary,
  ];

  if (currentSettings.enableDiarize) {
    summaryParts.push(`${t("actionBar.speakers.title")}: ${diarizeLabel}`);
  }

  if (currentSettings.textDensity !== "standard") {
    summaryParts.push(textDensityLabel);
  }

  if (currentSettings.enableGpu) {
    summaryParts.push(gpuLabel);
  }

  if (currentSettings.enableDTW) {
    summaryParts.push(dtwLabel);
  }

  if (currentSettings.textCase !== "none") {
    summaryParts.push(textCaseLabel);
  }

  if (currentSettings.removePunctuation) {
    summaryParts.push(punctuationLabel);
  }

  const runSummary = summaryParts.join(" · ");

  const renderCollapsedRunSummary = () => (
    <div className="min-w-0 rounded-xl border bg-muted/35 px-3.5 py-3">
      <p className="text-sm font-medium leading-relaxed">{runSummary}</p>
    </div>
  );

  const renderTimelineTrackSelector = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden" data-tour="audio-input">
      {inputTracks.length > 0 ? (
        <>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border p-1.5 pr-2.5 bg-card">
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
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${isChecked
                    ? "border-input bg-background shadow-sm"
                    : "border-transparent dark:border-border bg-muted hover:bg-muted/80"
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
        </>
      ) : (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted/10 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("actionBar.tracks.createTrack")}
          </p>
        </div>
      )}
    </div>
  );

  const renderSourceModeTabs = () => (
    <Tabs
      value={audioInputMode}
      onValueChange={(value) => {
        const mode = value as "file" | "timeline";
        onAudioInputModeChange(mode);
        if (mode === "timeline") {
          handleRefreshAudioTracks();
        }
      }}
      data-tour="mode-switcher"
      key={i18n.language}
      className="w-full"
    >
      <TabsList className="h-9 w-full p-1">
        <TabsTrigger value="timeline" className="h-7 gap-1.5 px-3 text-sm">
          <MonitorIcon className="size-4" />
          {t("actionBar.mode.timeline")}
        </TabsTrigger>
        <TabsTrigger
          value="file"
          className="h-7 gap-1.5 px-3 text-sm"
          onMouseEnter={() => uploadIconRef.current?.startAnimation()}
          onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
        >
          <UploadIcon ref={uploadIconRef} className="size-4" size={16} />
          {t("actionBar.mode.fileInput")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const renderSectionHeader = (
    number: number,
    label: string,
    action?: React.ReactNode,
  ) => (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20 text-sm font-semibold text-primary">
        {number}
      </span>
      <h3 className="text-base font-semibold leading-none text-foreground">
        {label}
      </h3>
      {action ? <div className="ml-auto min-w-0">{action}</div> : null}
    </div>
  );

  return (
    <div className="h-full flex flex-col relative">
      <TranscriptionHeader
        transcriptDocuments={transcriptDocuments}
        isLoadingTranscriptDocuments={isLoadingTranscriptDocuments}
        onTranscriptDocumentsRefresh={onTranscriptDocumentsRefresh}
        onViewSubtitles={onViewSubtitles}
        isSubtitleViewerOpen={isSubtitleViewerOpen}
      />

      <div className="flex-1 min-h-0 flex flex-col p-4 pt-1">
        {showProcessing && (
          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{
              maskImage: "linear-gradient(to bottom, black 90%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 90%, transparent 100%)",
            }}
          >
            <div
              ref={progressContainerRef}
              className="w-full px-1 relative z-10"
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
          </div>
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
              <PlayCircle className="h-4 w-4" />
              {t("common.startNewTranscription", "Start new transcription")}
            </Button>
          </div>
        ) : (
          <div
            className={showProcessing ? "flex-shrink-0" : "min-h-0 flex-1"}
          >
            <div
              className="flex h-full w-full flex-col gap-2.5"
              data-tour="transcription-controls"
            >
              {isProcessing ? (
                <Card className="z-50 rounded-2xl bg-background p-3 shadow-none">
                  {renderCollapsedRunSummary()}
                </Card>
              ) : (
                <>
                {/* Input Card */}
                <Card className="z-50 flex min-h-0 flex-1 flex-col rounded-2xl bg-background p-3 shadow-none">
                  {renderSectionHeader(
                    1,
                    t("actionBar.source", "Source"),
                  )}
                  <div className="w-full mb-3">
                    {renderSourceModeTabs()}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    {currentSettings.audioInputMode === "timeline" ? (
                      renderTimelineTrackSelector()
                    ) : (
                      renderFileDropArea()
                    )}
                  </div>
                </Card>

                {/* Language Card */}
                <Card className="z-50 rounded-2xl bg-background p-3 shadow-none">
                  {renderSectionHeader(2, t("actionBar.language.title", "Language"))}
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-2">
                  <Popover
                    open={openSourceLanguage}
                    onOpenChange={setOpenSourceLanguage}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={openSourceLanguage}
                        className="h-auto min-w-0 justify-start rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/30"
                        data-tour="transcription-controls-target"
                      >
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="text-[11px] font-medium leading-none text-muted-foreground">
                            {t("actionBar.language.input", "Input")}
                          </span>
                          <span className="mt-1 max-w-full truncate text-sm font-semibold leading-none text-foreground">
                            {sourceLanguageLabel}
                          </span>
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0" align="start" side="top">
                      <LanguageSelector
                        mode="source"
                        onSelect={() => setOpenSourceLanguage(false)}
                      />
                    </PopoverContent>
                  </Popover>
                  <ArrowRight className="mx-auto h-5 w-5 text-muted-foreground" />
                  <Popover
                    open={openTargetLanguage}
                    onOpenChange={setOpenTargetLanguage}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={openTargetLanguage}
                        className="h-auto min-w-0 justify-start rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/30"
                      >
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="text-[11px] font-medium leading-none text-muted-foreground">
                            {t("actionBar.language.translateTo", "Translate to")}
                          </span>
                          <span className="mt-1 max-w-full truncate text-sm font-semibold leading-none text-foreground">
                            {currentSettings.translate
                              ? targetLanguageLabel
                              : t("actionBar.common.off", "Off")}
                          </span>
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0" align="end" side="top">
                      <LanguageSelector
                        mode="translate"
                        onSelect={() => setOpenTargetLanguage(false)}
                      />
                    </PopoverContent>
                  </Popover>
                  </div>
                </Card>

                {/* Options Card */}
                <Card className="z-50 rounded-2xl bg-background p-3 shadow-none">
                  {renderSectionHeader(3, t("actionBar.options", "Options"))}
                  <div className="grid grid-cols-3 gap-2">
                      <Popover
                        open={openSpeakerPopover}
                        onOpenChange={setOpenSpeakerPopover}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="default"
                            role="combobox"
                            className="group h-12 justify-start gap-2 rounded-lg bg-muted/35 dark:bg-muted px-3 hover:bg-muted/55"
                            aria-expanded={openSpeakerPopover}
                          >
                            <Speech className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span className="flex min-w-0 flex-col items-start">
                              <span className="max-w-full truncate text-[11px] font-semibold leading-none group-hover:text-primary transition-colors">
                                {t("actionBar.options.speakerLabels", "Speakers")}
                              </span>
                              <span className="mt-1 max-w-full truncate text-[10px] leading-none text-muted-foreground">
                                {currentSettings.enableDiarize
                                  ? currentSettings.maxSpeakers === null
                                    ? t("actionBar.common.auto")
                                    : currentSettings.maxSpeakers
                                  : t("actionBar.common.off")}
                              </span>
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
                            variant="ghost"
                            size="default"
                            role="combobox"
                            className="group h-12 justify-start gap-2 rounded-lg bg-muted/35 dark:bg-muted px-3 hover:bg-muted/55"
                            aria-expanded={openTextFormattingPopover}
                          >
                            <Baseline className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span className="flex min-w-0 flex-col items-start">
                              <span className="max-w-full truncate text-[11px] font-semibold leading-none group-hover:text-primary transition-colors">
                                {t("actionBar.options.subtitleStyle", "Style")}
                              </span>
                              <span className="mt-1 max-w-full truncate text-[10px] leading-none text-muted-foreground">
                                {t("actionBar.options.subtitleStyleDescription", "Captions")}
                              </span>
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-80 p-0"
                          align="center"
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
                            variant="ghost"
                            size="default"
                            role="combobox"
                            className="group relative h-12 justify-start gap-2 rounded-lg bg-muted/35 dark:bg-muted px-3 hover:bg-muted/55"
                            aria-expanded={openCustomPromptPopover}
                            aria-label={t("actionBar.format.customPromptTitle")}
                            title={t("actionBar.format.customPromptTitle")}
                          >
                            <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span className="flex min-w-0 flex-col items-start">
                              <span className="max-w-full truncate text-[11px] font-semibold leading-none group-hover:text-primary transition-colors">
                                {t("actionBar.format.customPromptButton", "Prompt")}
                              </span>
                              <span className="mt-1 max-w-full truncate text-[10px] leading-none text-muted-foreground">
                                {t("actionBar.options.promptDescription", "Custom")}
                              </span>
                            </span>
                            {currentSettings.customPrompt.trim() ? (
                              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                            ) : null}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-80 p-0"
                          side="top"
                          align="end"
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
                </Card>

                {/* Model Card */}
                <Card className="z-50 rounded-2xl bg-background p-3 shadow-none">
                  {renderSectionHeader(4, t("actionBar.model", "Model"))}
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
                </Card>

                {/* Engine Card */}
                <div className="z-50 shadow-none">
                  <Button
                    onClick={onStart}
                    size="lg"
                    variant="default"
                    disabled={
                      isProcessing ||
                      (currentSettings.audioInputMode === "file" &&
                        !selectedFile) ||
                      (currentSettings.audioInputMode === "timeline" &&
                        (selectedTrackCount === 0 || inputTracks.length === 0))
                    }
                    className="w-full"
                  >
                    <PlayCircle className="h-4 w-4" />
                    {currentSettings.audioInputMode === "timeline" &&
                      selectedTrackCount > 0 &&
                      inputTracks.length > 0
                      ? `${t("common.generateSubtitles")} (${selectedTrackCount})`
                      : t("common.generateSubtitles")}
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
                <X className="h-4 w-4" />
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
  onTranscriptCreated,
  transcriptDocuments = [],
  isLoadingTranscriptDocuments = false,
  onTranscriptDocumentsRefresh = async () => {},
  isSubtitleViewerOpen = false,
}: {
  onViewSubtitles?: () => void;
  onTranscriptCreated?: () => void | Promise<void>;
  transcriptDocuments?: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments?: boolean;
  onTranscriptDocumentsRefresh?: () => Promise<void>;
  isSubtitleViewerOpen?: boolean;
} = {}) {
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

  const { selectedIntegration } = useIntegration();

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
