import * as React from "react";
import { platform } from "@tauri-apps/plugin-os";
import {
  Download,
  History,
  Loader2,
  Repeat2,
  Type,
  Users,
  X,
  Search,
  CornerDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SubtitleList } from "@/components/subtitles/subtitle-list";
import { SpeakerSettings } from "@/components/common/speaker-settings";
import { ImportExportPopover } from "@/components/common/import-export-popover";
import { AddToTimelineDialog } from "@/components/dialogs/add-to-timeline-dialog";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { TranscriptHistoryPopover } from "@/components/subtitles/transcript-history-popover";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Speaker, Template, Track } from "@/types";
import { useTranslation } from "react-i18next";
import { PlusIcon, type PlusIconHandle } from "../ui/plus";
import { listSubtitleDocuments, type SubtitleDocumentListItem } from "@/utils/file-utils";

interface SubtitleViewerPanelProps {
  isOpen?: boolean;
  isFullScreen?: boolean;
  onClose?: () => void;
}

interface SearchActionButtonProps {
  button: React.ReactNode;
  tooltip: string;
  useAddon?: boolean;
}

function SearchActionButton({
  button,
  tooltip,
  useAddon = false,
}: SearchActionButtonProps) {
  const trigger = useAddon ? (
    <InputGroupAddon align="inline-end">{button}</InputGroupAddon>
  ) : (
    button
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface SearchSectionProps {
  headerClassName: string;
  t: (key: string) => string;
  searchQuery: string;
  replaceValue: string;
  searchCaseSensitive: boolean;
  searchWholeWord: boolean;
  showReplace: boolean;
  canReplace: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onSearchQueryChange: (value: string) => void;
  onReplaceValueChange: (value: string) => void;
  onToggleCaseSensitive: () => void;
  onToggleWholeWord: () => void;
  onToggleReplace: () => void;
  onReplaceAll: () => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
}

function SearchSection({
  headerClassName,
  t,
  searchQuery,
  replaceValue,
  searchCaseSensitive,
  searchWholeWord,
  showReplace,
  canReplace,
  searchInputRef,
  onSearchQueryChange,
  onReplaceValueChange,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onToggleReplace,
  onReplaceAll,
  searchPlaceholder,
  searchAriaLabel,
}: SearchSectionProps) {
  const showClearButton = Boolean(searchQuery);

  const searchActions = [
    showClearButton ? (
      <SearchActionButton
        key="clear"
        button={
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => onSearchQueryChange("")}
          >
            <X className="size-4" />
          </Button>
        }
        tooltip={searchAriaLabel}
      />
    ) : null,
    <SearchActionButton
      key="case-sensitive"
      button={
        <Button
          type="button"
          variant={searchCaseSensitive ? "default" : "ghost"}
          size="icon"
          className="size-7 text-xs rounded-full"
          onClick={onToggleCaseSensitive}
        >
          Aa
        </Button>
      }
      tooltip={t("subtitles.search.caseMatch")}
      useAddon
    />,
    <SearchActionButton
      key="whole-word"
      button={
        <Button
          type="button"
          variant={searchWholeWord ? "default" : "ghost"}
          size="icon"
          className="size-7 text-xs rounded-full"
          onClick={onToggleWholeWord}
        >
          W
        </Button>
      }
      tooltip={t("subtitles.search.wholeWord")}
      useAddon
    />,
    <SearchActionButton
      key="replace-toggle"
      button={
        <Button
          type="button"
          variant={showReplace ? "default" : "ghost"}
          size="icon"
          className="size-7 rounded-full"
          onClick={onToggleReplace}
        >
          <Repeat2 className="size-4" />
        </Button>
      }
      tooltip={t("subtitles.search.replaceAll")}
      useAddon
    />,
  ].filter(Boolean);

  const searchInput = (
    <InputGroup className="rounded-xl overflow-hidden border-slate-200 dark:border-slate-800 bg-background/50">
      <InputGroupAddon align="inline-start" className="text-muted-foreground pr-1">
        <Search className="size-4" />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchInputRef}
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        aria-label={searchAriaLabel}
        className="text-sm px-2"
      />
      {searchActions}
    </InputGroup>
  );

  const replaceSection = (
    <div className="flex w-full items-center rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-background/50 focus-within:ring-1 focus-within:ring-ring">
      <div className="pl-3 text-muted-foreground flex items-center justify-center">
        <CornerDownRight className="size-4" />
      </div>
      <Input
        placeholder={t("subtitles.search.replaceWithPlaceholder")}
        value={replaceValue}
        onChange={(e) => onReplaceValueChange(e.target.value)}
        className="flex-1 text-sm pl-2 pr-3 border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none"
      />
      <Button
        type="button"
        variant="default"
        disabled={!canReplace}
        onClick={onReplaceAll}
        className="rounded-none px-4 bg-[#0a0a0b] hover:bg-[#0a0a0b]/90 text-white border-l border-slate-200 dark:border-slate-800"
      >
        {t("subtitles.search.replaceAll")}
      </Button>
    </div>
  );

  return (
    <div className={headerClassName}>
      <div className="flex flex-col gap-1.5">
        {searchInput}
        {showReplace && replaceSection}
      </div>
    </div>
  );
}

interface SpeakersPopoverProps {
  open: boolean;
  speakers: Speaker[];
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSpeakerChange: (index: number, speaker: Speaker) => void;
  t: (key: string) => string;
  tracks?: Track[];
}

function SpeakersPopover({
  open,
  speakers,
  disabled = false,
  onOpenChange,
  onSpeakerChange,
  t,
  tracks,
}: SpeakersPopoverProps) {
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else onOpenChange(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="shadow-none"
              title={t("subtitles.speakers")}
              disabled={disabled}
            >
              <Users className="size-4 mr-0.5" />
              {t("subtitles.speakers")}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
      </Tooltip>
      <PopoverContent
        align="center"
        className="w-[340px] pb-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="pb-3">
          <h4 className="font-medium text-sm">{t("speakerEditor.title")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("speakerEditor.description")}
          </p>
        </div>
        <ScrollArea className="max-h-[400px] pr-4 -mr-4">
          <div className="space-y-3 pb-4">
            {speakers.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {t("subtitles.empty.noSubtitlesAvailable")}
              </p>
            )}
            {speakers.map((speaker, index) => (
              <div key={index} className="border rounded-md p-3 bg-card">
                <SpeakerSettings
                  speaker={speaker}
                  onSpeakerChange={(updated) => onSpeakerChange(index, updated)}
                  tracks={tracks}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface ReformatPopoverProps {
  open: boolean;
  subtitleCount: number;
  onOpenChange: (open: boolean) => void;
  onApply: () => Promise<void>;
  t: (key: string) => string;
}

function ReformatPopover({
  open,
  subtitleCount,
  onOpenChange,
  onApply,
  t,
}: ReformatPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="shadow-none"
              title={t("subtitles.reformat")}
            >
              <Type className="size-4 mr-0.5" />
              {t("subtitles.reformat")}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
      </Tooltip>
      <PopoverContent
        align="center"
        className="w-80 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <TextFormattingPanel
          showActions
          onCancel={() => onOpenChange(false)}
          onApply={onApply}
          applyDisabled={subtitleCount === 0}
        />
      </PopoverContent>
    </Popover>
  );
}

interface SubtitleToolbarProps {
  subtitlesLength: number;
  speakers: Speaker[];
  showSpeakerEditor: boolean;
  showReformat: boolean;
  onSpeakerEditorOpenChange: (open: boolean) => void;
  onSpeakerChange: (index: number, speaker: Speaker) => void;
  onReformatOpenChange: (open: boolean) => void;
  onApplyReformat: () => Promise<void>;
  t: (key: string) => string;
  tracks?: Track[];
}

function SubtitleToolbar({
  subtitlesLength,
  speakers,
  showSpeakerEditor,
  showReformat,
  onSpeakerEditorOpenChange,
  onSpeakerChange,
  onReformatOpenChange,
  onApplyReformat,
  t,
  tracks,
}: SubtitleToolbarProps) {
  return (
    <div className="shrink-0 px-3 pb-3 pt-2 flex items-center gap-2 relative z-20 border-b overflow-x-auto">
      <div className="grid w-full grid-cols-2 gap-1">
        <ReformatPopover
          open={showReformat}
          subtitleCount={subtitlesLength}
          onOpenChange={onReformatOpenChange}
          onApply={onApplyReformat}
          t={t}
        />
        <SpeakersPopover
          open={showSpeakerEditor}
          speakers={speakers}
          disabled={speakers.length === 0}
          onOpenChange={onSpeakerEditorOpenChange}
          onSpeakerChange={onSpeakerChange}
          t={t}
          tracks={tracks}
        />
      </div>
    </div>
  );
}

interface SubtitleContentProps {
  subtitlesLength: number;
  searchQuery: string;
  searchCaseSensitive: boolean;
  searchWholeWord: boolean;
  selectedIndex: number | null;
  onSelectedIndexChange: (index: number | null) => void;
  onJumpToTime: (seconds: number) => Promise<void>;
  t: (key: string) => string;
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  loadTranscriptDocuments: () => Promise<void>;
}

function SubtitleContent({
  subtitlesLength,
  searchQuery,
  searchCaseSensitive,
  searchWholeWord,
  selectedIndex,
  onSelectedIndexChange,
  onJumpToTime,
  t,
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  loadTranscriptDocuments,
}: SubtitleContentProps) {
  const hasLoadedTranscripts = React.useRef(false);
  const contentClassName =
    subtitlesLength > 0
      ? "flex-1 overflow-y-auto min-h-0 px-0 relative z-0"
      : "flex-1 overflow-hidden min-h-0 px-0 relative z-0";

  return (
    <div className={contentClassName}>
      {subtitlesLength > 0 ? (
        <SubtitleList
          searchQuery={searchQuery}
          searchCaseSensitive={searchCaseSensitive}
          searchWholeWord={searchWholeWord}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={onSelectedIndexChange}
          onJumpToTime={onJumpToTime}
          itemClassName="hover:bg-muted dark:hover:bg-slate-900 transition-colors"
        />
      ) : (
        <div className="flex h-full min-h-0 flex-col items-center justify-center px-8 text-center">
          <p className="text-sm text-foreground">
            {t("subtitles.empty.noSubtitlesAvailable")}
          </p>
          <TranscriptHistoryPopover
            subtitleDocuments={transcriptDocuments}
            isLoading={isLoadingTranscriptDocuments}
            onTranscriptOpen={() => {}}
            onRefresh={loadTranscriptDocuments}
            align="center"
            side="top"
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  if (!hasLoadedTranscripts.current) {
                    hasLoadedTranscripts.current = true;
                    loadTranscriptDocuments();
                  }
                }}
                aria-label={t("subtitles.previousSubtitles")}
              >
                <History className="size-4" />
                {t("subtitles.previousSubtitles")}
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}

interface AddToTimelineFooterProps {
  settings: ReturnType<typeof useSettings>["settings"];
  timelineInfo: ReturnType<typeof useResolve>["timelineInfo"];
  templates: Template[];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  onLoadTemplates?: () => Promise<Template[]>;
  layersIconRef: React.RefObject<PlusIconHandle>;
  onAddToTimeline: (
    selectedOutputTrack: string,
    selectedTemplate: string,
    presetSettings?: Record<string, unknown>,
  ) => Promise<void>;
  t: (key: string) => string;
  isAdding: boolean;
  selectedIntegration?: "davinci" | "premiere" | "aftereffects";
}

function AddToTimelineFooter({
  settings,
  timelineInfo,
  templates,
  templatesLoading,
  templatesLoaded,
  onLoadTemplates,
  layersIconRef,
  onAddToTimeline,
  t,
  isAdding,
  selectedIntegration,
}: AddToTimelineFooterProps) {
  return (
    <div className="shrink-0 p-3 flex justify-end gap-2 border-t shadow-2xl">
      <AddToTimelineDialog
        settings={settings}
        timelineInfo={timelineInfo}
        templates={templates}
        templatesLoading={templatesLoading}
        templatesLoaded={templatesLoaded}
        onLoadTemplates={onLoadTemplates}
        onAddToTimeline={onAddToTimeline}
        isAdding={isAdding}
        selectedIntegration={selectedIntegration}
      >
        <Button
          variant="secondary"
          size="default"
          disabled={isAdding}
          className="w-full"
          onMouseEnter={() =>
            !isAdding && layersIconRef.current?.startAnimation?.()
          }
          onMouseLeave={() =>
            !isAdding && layersIconRef.current?.stopAnimation?.()
          }
        >
          {isAdding ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("addToTimeline.adding")}
            </>
          ) : (
            <>
              <PlusIcon ref={layersIconRef} className="size-4" />
              {t("subtitles.addToTimeline")}
            </>
          )}
        </Button>
      </AddToTimelineDialog>
    </div>
  );
}

export function SubtitleViewerPanel({
  isOpen = true,
  isFullScreen = false,
  onClose,
}: SubtitleViewerPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false);
  const [searchWholeWord, setSearchWholeWord] = React.useState(false);
  const [showReplace, setShowReplace] = React.useState(false);
  const [replaceValue, setReplaceValue] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false);
  const [showReformat, setShowReformat] = React.useState(false);
  const [isAddingToTimeline, setIsAddingToTimeline] = React.useState(false);
  const [isMacOs, setIsMacOs] = React.useState(true);
  const [transcriptDocuments, setTranscriptDocuments] = React.useState<SubtitleDocumentListItem[]>([]);
  const [isLoadingTranscriptDocuments, setIsLoadingTranscriptDocuments] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const layersIconRef = React.useRef<PlusIconHandle>(null);

  const {
    subtitles,
    currentSubtitleDocumentFilename,
    updateSubtitles,
    exportSubtitlesAs,
    importSubtitles,
    reformatSubtitles,
    speakers,
    updateSpeakers,
  } = useSubtitleDocument();

  const {
    timelineInfo: resolveTimeline,
    templates: resolveTemplates,
    templatesLoading: resolveTemplatesLoading,
    templatesLoaded: resolveTemplatesLoaded,
    refreshTemplates: refreshResolveTemplates,
    pushToTimeline: resolvePush,
    jumpToTime: resolveJumpToTime,
  } = useResolve();

  const {
    timelineInfo: adobeTimeline,
    pushToTimeline: adobePush,
    jumpToTime: adobeJumpToTime,
  } = useAdobe();

  const { selectedIntegration } = useIntegration();
  const isAdobeActive =
    selectedIntegration === "premiere" ||
    selectedIntegration === "aftereffects";

  const timelineInfo = isAdobeActive ? adobeTimeline : resolveTimeline;

  const pushToTimeline = isAdobeActive
    ? (
        filename?: string,
        _selectedTemplate?: string,
        _selectedOutputTrack?: string,
        _presetSettings?: Record<string, unknown>,
      ) => adobePush(filename)
    : resolvePush;

  const jumpToTime = isAdobeActive ? adobeJumpToTime : resolveJumpToTime;

  const { settings } = useSettings();
  const { t } = useTranslation();
  const hasSubtitles = subtitles.length > 0;

  React.useEffect(() => {
    try {
      setIsMacOs(platform() === "macos");
    } catch {
      setIsMacOs(true);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen || !onClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const loadTranscriptDocuments = React.useCallback(async () => {
    setIsLoadingTranscriptDocuments(true);
    try {
      const documents = await listSubtitleDocuments();
      setTranscriptDocuments(documents);
    } catch (error) {
      console.error("Failed to load transcript documents:", error);
    } finally {
      setIsLoadingTranscriptDocuments(false);
    }
  }, []);

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const buildFindRegExp = React.useCallback(() => {
    const q = (searchQuery ?? "").trim();
    if (!q) return null;
    const escaped = escapeRegExp(q);
    const pattern = searchWholeWord ? `\\b${escaped}\\b` : escaped;
    const flags = searchCaseSensitive ? "g" : "gi";
    return new RegExp(pattern, flags);
  }, [searchCaseSensitive, searchQuery, searchWholeWord]);

  const canReplace = Boolean(searchQuery.trim());
  const isIntegrationConnected = isAdobeActive
    ? Boolean(adobeTimeline?.timelineId)
    : Boolean(resolveTimeline?.timelineId);
  const shellClassName = "flex h-full min-h-0 flex-col overflow-hidden";
  const headerClassName = "shrink-0 p-3 pb-0";

  function handleSpeakerChange(index: number, updated: Speaker) {
    const next = [...speakers];
    next[index] = updated;
    updateSpeakers(next);
  }

  const handleReplaceAll = () => {
    const re = buildFindRegExp();
    if (!re) return;
    const next = subtitles.map((s) => ({
      ...s,
      text: (s.text ?? "").replace(re, replaceValue),
    }));
    updateSubtitles(next);
  };

  const handleApplyReformat = async () => {
    const timelineId = timelineInfo?.timelineId || "";
    await reformatSubtitles(settings, null, timelineId);
    setShowReformat(false);
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

      setIsAddingToTimeline(true);
      await pushToTimeline(
        currentSubtitleDocumentFilename,
        selectedTemplate,
        selectedOutputTrack,
        presetSettings,
      );
    } catch (error) {
      console.error("Failed to add to timeline:", error);
      throw error;
    } finally {
      setIsAddingToTimeline(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={shellClassName}>
      <div
        className="flex shrink-0 items-center justify-between px-3 pt-2"
        data-tauri-drag-region={isMacOs ? true : undefined}
      >
        <h2
          className={`font-semibold select-none ${isFullScreen && isMacOs ? "pl-20" : "pl-1"}`}
          data-tauri-drag-region={isMacOs ? true : undefined}
        >
          {t("subtitles.title")}
        </h2>
        <div
          className="z-20 flex items-center"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <ImportExportPopover
            onImport={() => importSubtitles(settings, null, "")}
            onExport={(format) => exportSubtitlesAs(format, subtitles, speakers)}
            hasSubtitles={subtitles.length > 0}
            defaultTab={subtitles.length > 0 ? "export" : "import"}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                title={t("importExport.button")}
              >
                <Download/>
              </Button>
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={!onClose}
          >
            <X/>
          </Button>
        </div>
      </div>

      {hasSubtitles ? (
        <SearchSection
          headerClassName={headerClassName}
          t={t}
          searchQuery={searchQuery}
          replaceValue={replaceValue}
          searchCaseSensitive={searchCaseSensitive}
          searchWholeWord={searchWholeWord}
          showReplace={showReplace}
          canReplace={canReplace}
          searchInputRef={searchInputRef}
          onSearchQueryChange={setSearchQuery}
          onReplaceValueChange={setReplaceValue}
          onToggleCaseSensitive={() =>
            setSearchCaseSensitive((value) => !value)
          }
          onToggleWholeWord={() => setSearchWholeWord((value) => !value)}
          onToggleReplace={() => setShowReplace((value) => !value)}
          onReplaceAll={handleReplaceAll}
          searchPlaceholder={t("subtitles.searchPlaceholder")}
          searchAriaLabel={t("subtitles.searchAria")}
        />
      ) : null}

      {hasSubtitles && (
        <SubtitleToolbar
          subtitlesLength={subtitles.length}
          speakers={speakers}
          showSpeakerEditor={showSpeakerEditor}
          showReformat={showReformat}
          onSpeakerEditorOpenChange={setShowSpeakerEditor}
          onSpeakerChange={handleSpeakerChange}
          onReformatOpenChange={setShowReformat}
          onApplyReformat={handleApplyReformat}
          t={t}
          tracks={timelineInfo?.outputTracks}
        />
      )}

      <SubtitleContent
        subtitlesLength={subtitles.length}
        searchQuery={searchQuery}
        searchCaseSensitive={searchCaseSensitive}
        searchWholeWord={searchWholeWord}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        onJumpToTime={jumpToTime}
        t={t}
        transcriptDocuments={transcriptDocuments}
        isLoadingTranscriptDocuments={isLoadingTranscriptDocuments}
        loadTranscriptDocuments={loadTranscriptDocuments}
      />

      {isIntegrationConnected && subtitles.length > 0 && (
        <AddToTimelineFooter
          settings={settings}
          timelineInfo={timelineInfo}
          templates={isAdobeActive ? [] : resolveTemplates}
          templatesLoading={!isAdobeActive && resolveTemplatesLoading}
          templatesLoaded={isAdobeActive || resolveTemplatesLoaded}
          onLoadTemplates={isAdobeActive ? undefined : refreshResolveTemplates}
          layersIconRef={layersIconRef}
          onAddToTimeline={handleAddToTimeline}
          t={t}
          isAdding={isAddingToTimeline}
          selectedIntegration={selectedIntegration as any}
        />
      )}
    </div>
  );
}
