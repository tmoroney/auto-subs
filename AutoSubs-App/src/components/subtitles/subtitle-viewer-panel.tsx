import * as React from "react";
import { platform } from "@tauri-apps/plugin-os";
import {
  FileUp,
  History,
  Repeat2,
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
import { SubtitleList } from "@/components/subtitles/subtitle-list";
import { type ExportFormat } from "@/components/common/export-popover";
import { OutputPanel } from "@/components/subtitles/output-panel";
import { TranscriptStatusRow } from "@/components/subtitles/transcript-status-row";
import { TranscriptHistoryPopover } from "@/components/subtitles/transcript-history-popover";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useSettingsStore } from "@/stores/settings-store";
import { useOutputPanelStore } from "@/stores/output-panel-store";
import { useAudioPreview } from "@/contexts/AudioPreviewContext";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { describeError } from "@/components/transcription/utils";
import { useTranslation } from "react-i18next";
import { type SubtitleDocumentListItem } from "@/utils/file-utils";

interface SubtitleViewerPanelProps {
  isOpen?: boolean;
  isFullScreen?: boolean;
  onClose?: () => void;
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  onTranscriptDocumentsRefresh: () => Promise<void>;
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

interface SubtitleContentProps {
  subtitlesLength: number;
  searchQuery: string;
  searchCaseSensitive: boolean;
  searchWholeWord: boolean;
  selectedIndex: number | null;
  onSelectedIndexChange: (index: number | null) => void;
  onJumpToTime: (seconds: number) => Promise<void>;
  onMatchCountChange: (count: number) => void;
  t: (key: string) => string;
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  onTranscriptDocumentsRefresh: () => Promise<void>;
}

function SubtitleContent({
  subtitlesLength,
  searchQuery,
  searchCaseSensitive,
  searchWholeWord,
  selectedIndex,
  onSelectedIndexChange,
  onJumpToTime,
  onMatchCountChange,
  t,
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  onTranscriptDocumentsRefresh,
}: SubtitleContentProps) {
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
          onMatchCountChange={onMatchCountChange}
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
            onRefresh={onTranscriptDocumentsRefresh}
            align="center"
            side="top"
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
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

export function SubtitleViewerPanel({
  isOpen = true,
  isFullScreen = false,
  onClose,
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  onTranscriptDocumentsRefresh,
}: SubtitleViewerPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false);
  const [searchWholeWord, setSearchWholeWord] = React.useState(false);
  const [showReplace, setShowReplace] = React.useState(false);
  const [replaceValue, setReplaceValue] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [showReformat, setShowReformat] = React.useState(false);
  const [matchCount, setMatchCount] = React.useState(0);
  const [isAddingToTimeline, setIsAddingToTimeline] = React.useState(false);
  const [justSent, setJustSent] = React.useState(false);
  const [isMacOs, setIsMacOs] = React.useState(true);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const {
    subtitles,
    currentSubtitleDocumentFilename,
    currentSubtitleDocumentSourceName,
    updateSubtitles,
    flushPendingSubtitleSave,
    exportSubtitlesAs,
    importSubtitles,
    reformatSubtitles,
    speakers,
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

  const outputExpanded = useOutputPanelStore((s) => s.expanded);
  const closeOutputPanel = useOutputPanelStore((s) => s.close);

  const pushToTimeline = isAdobeActive
    ? (
        filename?: string,
        _selectedTemplate?: string,
        _selectedOutputTrack?: string,
        _presetSettings?: Record<string, unknown>,
      ) => adobePush(filename)
    : resolvePush;

  const jumpToTime = isAdobeActive ? adobeJumpToTime : resolveJumpToTime;

  const { seekToTime: seekAudioPreview } = useAudioPreview();
  const { showError } = useErrorDialog();

  // When a timestamp is clicked, jump the connected timeline AND seek the
  // local audio preview (if one is loaded) to the same position.
  const handleJumpToTime = React.useCallback(
    async (seconds: number) => {
      seekAudioPreview(seconds);
      await jumpToTime(seconds);
    },
    [jumpToTime, seekAudioPreview],
  );

  const { t } = useTranslation();
  const hasSubtitles = subtitles.length > 0;

  React.useEffect(() => {
    setJustSent(false);
  }, [subtitles]);

  React.useEffect(() => {
    try {
      setIsMacOs(platform() === "macos");
    } catch {
      setIsMacOs(true);
    }
  }, []);

  // Reopening the viewer should always land on the transcript, never on a
  // sheet left expanded from a previous session.
  React.useEffect(() => closeOutputPanel, [closeOutputPanel]);

  React.useEffect(() => {
    if (!isOpen || !onClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Escape backs out of the output sheet first; only a second press
        // closes the whole panel.
        if (useOutputPanelStore.getState().expanded) {
          closeOutputPanel();
          return;
        }
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, closeOutputPanel]);

  

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
  const headerClassName = "shrink-0 p-3 pt-0 pb-2";

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
    await flushPendingSubtitleSave();
    const timelineId = timelineInfo?.timelineId || "";
    await reformatSubtitles(useSettingsStore.getState(), null, timelineId);
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

      // Flush any debounced subtitle edits to disk before the Lua server reads
      // the file.
      await flushPendingSubtitleSave();

      setIsAddingToTimeline(true);
      await pushToTimeline(
        currentSubtitleDocumentFilename,
        selectedTemplate,
        selectedOutputTrack,
        presetSettings,
      );
      setJustSent(true);
    } catch (error) {
      console.error("Failed to add to timeline:", error);
      const { title, message, detail } = describeError(
        error,
        t("errorDialog.addToTimelineFailed", "Couldn't add subtitles to timeline"),
      );
      showError({ title, message, detail });
    } finally {
      setIsAddingToTimeline(false);
    }
  };

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      await exportSubtitlesAs(format, subtitles, speakers);
    },
    [exportSubtitlesAs, subtitles, speakers],
  );

  if (!isOpen) return null;

  return (
    <div className={shellClassName}>
      <div
        className={`flex h-12 shrink-0 items-center justify-between gap-3 pr-2 ${isFullScreen && isMacOs ? "pl-24" : "pl-4"}`}
        data-tauri-drag-region={isMacOs ? true : undefined}
      >
        <div
          className="min-w-0"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <h2 className="font-semibold select-none">
            {t("subtitles.title")}
          </h2>
        </div>
        <div
          className="z-20 flex items-center"
          data-tauri-drag-region={isMacOs ? "false" : undefined}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => importSubtitles(useSettingsStore.getState(), null, "")}
              >
                <FileUp />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("importExport.importTab")}
            </TooltipContent>
          </Tooltip>
          <TranscriptHistoryPopover
            subtitleDocuments={transcriptDocuments}
            isLoading={isLoadingTranscriptDocuments}
            onTranscriptOpen={() => {}}
            onRefresh={onTranscriptDocumentsRefresh}
            tooltipLabel={t("subtitles.previousSubtitles")}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("subtitles.previousSubtitles")}
              >
                <History />
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
            <X />
          </Button>
        </div>
      </div>

      {/* Transcript region. The output sheet takes this space when expanded so
          it gets the full panel height instead of a dialog's worth. */}
      {!outputExpanded && (
        <>
          {hasSubtitles && (
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
          )}

          {hasSubtitles && (
            <TranscriptStatusRow
              sourceName={currentSubtitleDocumentSourceName}
              documentName={currentSubtitleDocumentFilename}
              subtitleCount={subtitles.length}
              matchCount={searchQuery.trim() ? matchCount : null}
              showReformat={showReformat}
              onReformatOpenChange={setShowReformat}
              onApplyReformat={handleApplyReformat}
            />
          )}

          <SubtitleContent
            subtitlesLength={subtitles.length}
            searchQuery={searchQuery}
            searchCaseSensitive={searchCaseSensitive}
            searchWholeWord={searchWholeWord}
            selectedIndex={selectedIndex}
            onSelectedIndexChange={setSelectedIndex}
            onJumpToTime={handleJumpToTime}
            onMatchCountChange={setMatchCount}
            t={t}
            transcriptDocuments={transcriptDocuments}
            isLoadingTranscriptDocuments={isLoadingTranscriptDocuments}
            onTranscriptDocumentsRefresh={onTranscriptDocumentsRefresh}
          />
        </>
      )}

      <OutputPanel
        timelineInfo={timelineInfo}
        isConnected={isIntegrationConnected}
        selectedIntegration={selectedIntegration as any}
        templates={isAdobeActive ? [] : resolveTemplates}
        templatesLoading={!isAdobeActive && resolveTemplatesLoading}
        templatesLoaded={isAdobeActive || resolveTemplatesLoaded}
        onLoadTemplates={isAdobeActive ? undefined : refreshResolveTemplates}
        onAddToTimeline={handleAddToTimeline}
        onExport={handleExport}
        isAdding={isAddingToTimeline}
        justSent={justSent}
      />
    </div>
  );
}
