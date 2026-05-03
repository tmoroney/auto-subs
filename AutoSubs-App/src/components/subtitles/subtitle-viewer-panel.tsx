import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Clock,
  FileText,
  History,
  Loader2,
  Repeat2,
  Search,
  Trash2,
  Type,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { Skeleton } from "@/components/ui/skeleton";
import { SubtitleList } from "@/components/subtitles/subtitle-list";
import { SpeakerSettings } from "@/components/common/speaker-settings";
import { ImportExportPopover } from "@/components/common/import-export-popover";
import { AddToTimelineDialog } from "@/components/dialogs/add-to-timeline-dialog";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Speaker, Template, Track } from "@/types";
import {
  deleteSubtitleDocument,
  listSubtitleDocumentIndex,
  readSubtitleDocument,
  type SubtitleDocumentListItem,
} from "@/utils/file-utils";
import { useTranslation } from "react-i18next";
import { PlusIcon, type PlusIconHandle } from "../ui/plus";
import { cn } from "@/lib/utils";

const ESTIMATED_SUBTITLE_DOCUMENT_ROW_HEIGHT = 60;
const SUBTITLE_DOCUMENT_ROW_OVERSCAN = 8;
const SUBTITLE_DOCUMENT_SKELETON_ROWS = 10;

interface SubtitleViewerPanelProps {
  isOpen?: boolean;
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
            className="h-7 w-7"
            onClick={() => onSearchQueryChange("")}
          >
            <X className="h-4 w-4" />
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
          variant={searchCaseSensitive ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7 text-xs"
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
          variant={searchWholeWord ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7 text-xs"
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
          variant={showReplace ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleReplace}
        >
          <Repeat2 className="h-4 w-4" />
        </Button>
      }
      tooltip={t("subtitles.search.replaceAll")}
      useAddon
    />,
  ].filter(Boolean);

  const searchInput = (
    <InputGroup>
      <InputGroupInput
        ref={searchInputRef}
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        aria-label={searchAriaLabel}
        className="text-sm"
      />
      {searchActions}
    </InputGroup>
  );

  const replaceSection = (
    <ButtonGroup className="w-full mt-2">
      <Input
        placeholder={t("subtitles.search.replaceWithPlaceholder")}
        value={replaceValue}
        onChange={(e) => onReplaceValueChange(e.target.value)}
        className="text-sm"
      />
      <Button
        type="button"
        variant="secondary"
        disabled={!canReplace}
        onClick={onReplaceAll}
        size="sm"
      >
        {t("subtitles.search.replaceAll")}
      </Button>
    </ButtonGroup>
  );

  return (
    <div className={headerClassName}>
      {searchInput}
      {showReplace && replaceSection}
    </div>
  );
}

interface SpeakersPopoverProps {
  open: boolean;
  speakers: Speaker[];
  onOpenChange: (open: boolean) => void;
  onSpeakerChange: (index: number, speaker: Speaker) => void;
  t: (key: string) => string;
  tracks?: Track[];
}

function SpeakersPopover({
  open,
  speakers,
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
              size="sm"
              className="h-9 px-3"
              title={t("subtitles.speakers")}
            >
              <Users className="h-4 w-4 mr-0.5" />
              {t("subtitles.speakers")}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
      </Tooltip>
      <PopoverContent
        align="center"
        className="w-[340px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="pb-3">
          <h4 className="font-medium text-sm">{t("speakerEditor.title")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("speakerEditor.description")}
          </p>
        </div>
        <ScrollArea className="h-[320px] pr-4 -mr-4">
          <div className="space-y-3">
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
              size="sm"
              className="h-9 px-3"
              title={t("subtitles.reformat")}
            >
              <Type className="h-4 w-4 mr-0.5" />
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
  settings: ReturnType<typeof useSettings>["settings"];
  speakers: Speaker[];
  showSpeakerEditor: boolean;
  showReformat: boolean;
  importSubtitles: ReturnType<typeof useSubtitleDocument>["importSubtitles"];
  exportSubtitlesAs: ReturnType<
    typeof useSubtitleDocument
  >["exportSubtitlesAs"];
  subtitles: ReturnType<typeof useSubtitleDocument>["subtitles"];
  onSpeakerEditorOpenChange: (open: boolean) => void;
  onSpeakerChange: (index: number, speaker: Speaker) => void;
  onReformatOpenChange: (open: boolean) => void;
  onApplyReformat: () => Promise<void>;
  t: (key: string) => string;
  tracks?: Track[];
}

function SubtitleToolbar({
  subtitlesLength,
  settings,
  speakers,
  showSpeakerEditor,
  showReformat,
  importSubtitles,
  exportSubtitlesAs,
  subtitles,
  onSpeakerEditorOpenChange,
  onSpeakerChange,
  onReformatOpenChange,
  onApplyReformat,
  t,
  tracks,
}: SubtitleToolbarProps) {
  return (
    <div className="shrink-0 px-3 pb-3 pt-2 flex items-center gap-2 relative z-20 border-b overflow-x-auto">
      <div className="flex items-center gap-2 w-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <ImportExportPopover
              onImport={() => importSubtitles(settings, null, "")}
              onExport={(format) =>
                exportSubtitlesAs(format, subtitles, speakers)
              }
              hasSubtitles={subtitlesLength > 0}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  title={t("importExport.button")}
                >
                  <Upload className="h-4 w-4 mr-0.5" />
                  {t("importExport.button")}
                </Button>
              }
            />
          </TooltipTrigger>
        </Tooltip>

        {speakers.length > 0 && (
          <SpeakersPopover
            open={showSpeakerEditor}
            speakers={speakers}
            onOpenChange={onSpeakerEditorOpenChange}
            onSpeakerChange={onSpeakerChange}
            t={t}
            tracks={tracks}
          />
        )}

        <ReformatPopover
          open={showReformat}
          subtitleCount={subtitlesLength}
          onOpenChange={onReformatOpenChange}
          onApply={onApplyReformat}
          t={t}
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
  subtitleDocumentDateLocale?: string;
  onSubtitleDocumentOpen: () => void;
}

interface SubtitleHistoryListProps {
  searchQuery: string;
  subtitleDocumentDateLocale?: string;
  onSubtitleDocumentOpen: () => void;
  t: (key: string) => string;
}

function SubtitleHistoryList({
  searchQuery,
  subtitleDocumentDateLocale,
  onSubtitleDocumentOpen,
  t,
}: SubtitleHistoryListProps) {
  const [subtitleDocuments, setSubtitleDocuments] = React.useState<
    SubtitleDocumentListItem[]
  >([]);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [deletingFilename, setDeletingFilename] = React.useState<string | null>(
    null,
  );
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const {
    setSubtitles,
    setSpeakers,
    setCurrentSubtitleDocumentFilename,
    currentSubtitleDocumentFilename,
  } = useSubtitleDocument();

  const loadSubtitleDocuments = React.useCallback(async () => {
    try {
      setSubtitleDocuments(await listSubtitleDocumentIndex());
    } catch (error) {
      console.error("Failed to load subtitle documents:", error);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    void loadSubtitleDocuments();
  }, [loadSubtitleDocuments]);

  const formatSubtitleDocumentDate = React.useCallback(
    (createdAt: Date) =>
      createdAt.toLocaleDateString(subtitleDocumentDateLocale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [subtitleDocumentDateLocale],
  );

  const filteredSubtitleDocuments = React.useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return subtitleDocuments;

    return subtitleDocuments.filter((subtitleDocument) => {
      const createdAt = subtitleDocument.createdAt;
      const month = String(createdAt.getMonth() + 1).padStart(2, "0");
      const day = String(createdAt.getDate()).padStart(2, "0");
      const year = String(createdAt.getFullYear());
      const hours = String(createdAt.getHours()).padStart(2, "0");
      const minutes = String(createdAt.getMinutes()).padStart(2, "0");
      const searchableText = [
        subtitleDocument.displayName,
        subtitleDocument.filename,
        subtitleDocument.timelineName,
        formatSubtitleDocumentDate(createdAt),
        createdAt.toLocaleString(subtitleDocumentDateLocale),
        createdAt.toLocaleDateString(subtitleDocumentDateLocale),
        createdAt.toLocaleTimeString(subtitleDocumentDateLocale, {
          hour: "numeric",
          minute: "2-digit",
        }),
        `${year}-${month}-${day}`,
        `${month}/${day}/${year}`,
        `${day}/${month}/${year}`,
        `${hours}:${minutes}`,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return searchableText.includes(query);
    });
  }, [
    formatSubtitleDocumentDate,
    searchQuery,
    subtitleDocumentDateLocale,
    subtitleDocuments,
  ]);

  const groupedItems = React.useMemo(() => {
    const items: (
      | { type: "header"; label: string }
      | { type: "document"; data: SubtitleDocumentListItem }
    )[] = [];

    if (filteredSubtitleDocuments.length === 0) return items;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    let currentSection: string | null = null;

    filteredSubtitleDocuments.forEach((subtitleDocument) => {
      const date = new Date(subtitleDocument.createdAt);
      const subtitleDocumentDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );

      let section = "";
      if (subtitleDocumentDate.getTime() === today.getTime()) {
        section = t("titlebar.subtitleHistory.sections.today");
      } else if (subtitleDocumentDate.getTime() === yesterday.getTime()) {
        section = t("titlebar.subtitleHistory.sections.yesterday");
      } else if (subtitleDocumentDate.getTime() >= lastWeek.getTime()) {
        section = t("titlebar.subtitleHistory.sections.last_week");
      } else {
        section = t("titlebar.subtitleHistory.sections.older");
      }

      if (section !== currentSection) {
        items.push({ type: "header", label: section });
        currentSection = section;
      }

      items.push({ type: "document", data: subtitleDocument });
    });

    return items;
  }, [filteredSubtitleDocuments, t]);

  const rowVirtualizer = useVirtualizer({
    count: groupedItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index: number) =>
      groupedItems[index]?.type === "header"
        ? 32
        : ESTIMATED_SUBTITLE_DOCUMENT_ROW_HEIGHT,
    getItemKey: (index: number) => {
      const item = groupedItems[index];
      if (item?.type === "header") return `header-${item.label}`;
      return item?.data.filename ?? index;
    },
    overscan: SUBTITLE_DOCUMENT_ROW_OVERSCAN,
  });

  const openSubtitleDocument = async (filename: string) => {
    try {
      const subtitleDocumentData = await readSubtitleDocument(filename);
      if (subtitleDocumentData) {
        setSubtitles(subtitleDocumentData.segments || []);
        setSpeakers(subtitleDocumentData.speakers || []);
        setCurrentSubtitleDocumentFilename(filename);
        onSubtitleDocumentOpen();
      }
    } catch (error) {
      console.error("Failed to load subtitle document:", error);
    }
  };

  const handleDeleteSubtitleDocument = async (filename: string) => {
    try {
      await deleteSubtitleDocument(filename);
      if (currentSubtitleDocumentFilename === filename) {
        setSubtitles([]);
        setSpeakers([]);
        setCurrentSubtitleDocumentFilename(null);
      }
      void loadSubtitleDocuments();
    } catch (error) {
      console.error("Failed to delete subtitle document:", error);
    } finally {
      setDeletingFilename(null);
    }
  };

  if (!hasLoaded) {
    return (
      <div className="h-full overflow-hidden px-2 py-2">
        <div className="space-y-1">
          {Array.from({ length: SUBTITLE_DOCUMENT_SKELETON_ROWS }).map(
            (_, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-md px-3 py-2.5"
              >
                <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-[72%]" />
                  <Skeleton className="h-3 w-[48%]" />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (filteredSubtitleDocuments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/50">
          <History className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-foreground">
          {searchQuery
            ? t("titlebar.subtitleHistory.no_results")
            : t("titlebar.subtitleHistory.empty_title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {searchQuery
            ? t("titlebar.subtitleHistory.no_results_detail")
            : t("titlebar.subtitleHistory.empty_detail")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div ref={scrollContainerRef} className="h-full overflow-y-auto pt-2">
        <div
          className="relative"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow: any) => {
            const item = groupedItems[virtualRow.index];
            if (!item) return null;

            if (item.type === "header") {
              return (
                <div
                  key={`header-${item.label}`}
                  style={{
                    height: 32,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="absolute left-0 right-0 top-0 flex items-center px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70"
                >
                  {item.label}
                </div>
              );
            }

            const subtitleDocument = item.data;
            const isActive =
              currentSubtitleDocumentFilename === subtitleDocument.filename;

            return (
              <div
                key={subtitleDocument.filename}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="absolute left-2 right-2 top-0"
              >
                <div
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-border"
                      : "hover:bg-sidebar-accent/50 text-foreground",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:text-primary",
                        isActive &&
                          "border-primary/30 text-primary bg-primary/5",
                      )}
                    >
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold tracking-tight">
                        {subtitleDocument.displayName}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 opacity-70" />
                          {formatSubtitleDocumentDate(
                            subtitleDocument.createdAt,
                          )}
                        </span>
                        {subtitleDocument.timelineName && (
                          <>
                            <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                            <span className="truncate">
                              {subtitleDocument.timelineName}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs font-medium hover:bg-background text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        void openSubtitleDocument(subtitleDocument.filename)
                      }
                    >
                      {t("common.open")}
                    </Button>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-background text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setDeletingFilename(subtitleDocument.filename)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">{t("common.delete")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t("common.delete")}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {isActive && (
                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-1 rounded-full bg-primary" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog
        open={!!deletingFilename}
        onOpenChange={(open) => !open && setDeletingFilename(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("titlebar.subtitleHistory.delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("titlebar.subtitleHistory.delete_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deletingFilename &&
                void handleDeleteSubtitleDocument(deletingFilename)
              }
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
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
  subtitleDocumentDateLocale,
  onSubtitleDocumentOpen,
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
          itemClassName="hover:bg-sidebar-accent transition-colors"
        />
      ) : (
        <div className="h-full min-h-0">
          <SubtitleHistoryList
            searchQuery={searchQuery}
            subtitleDocumentDateLocale={subtitleDocumentDateLocale}
            onSubtitleDocumentOpen={onSubtitleDocumentOpen}
            t={t}
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
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("addToTimeline.adding")}
            </>
          ) : (
            <>
              <PlusIcon ref={layersIconRef} className="w-4 h-4" />
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
  const { t, i18n } = useTranslation();
  const hasSubtitles = subtitles.length > 0;
  const subtitleDocumentDateLocale =
    i18n.resolvedLanguage || i18n.language || undefined;

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
      <div className="flex shrink-0 items-center justify-between px-3 pt-2">
        <h2 className="font-semibold pl-1">Subtitles</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          disabled={!onClose}
          aria-label={t("common.close")}
          className="z-20"
        >
          <X className="h-4 w-4" />
        </Button>
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
      ) : (
        <div className={headerClassName}>
          <InputGroup>
            <InputGroupInput
              ref={searchInputRef}
              placeholder={t("titlebar.subtitleHistory.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t("titlebar.subtitleHistory.searchPlaceholder")}
              className="text-sm"
            />
            {searchQuery ? (
              <InputGroupAddon align="inline-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("subtitles.clearSearch")}
                  </TooltipContent>
                </Tooltip>
              </InputGroupAddon>
            ) : (
              <InputGroupAddon align="inline-end">
                <Search className="h-4 w-4 text-muted-foreground" />
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
      )}

      {hasSubtitles && (
        <SubtitleToolbar
          subtitlesLength={subtitles.length}
          settings={settings}
          speakers={speakers}
          showSpeakerEditor={showSpeakerEditor}
          showReformat={showReformat}
          importSubtitles={importSubtitles}
          exportSubtitlesAs={exportSubtitlesAs}
          subtitles={subtitles}
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
        subtitleDocumentDateLocale={subtitleDocumentDateLocale}
        onSubtitleDocumentOpen={() => {
          setSelectedIndex(null);
          setSearchQuery("");
        }}
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
