import * as React from "react";
import { Trash2 } from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { cn } from "@/lib/utils";
import {
  deleteSubtitleDocument,
  readSubtitleDocument,
  type SubtitleDocumentListItem,
} from "@/utils/file-utils";
import { useTranslation } from "react-i18next";

interface TranscriptHistoryPopoverProps {
  trigger: React.ReactNode;
  subtitleDocuments: SubtitleDocumentListItem[];
  isLoading: boolean;
  onTranscriptOpen: () => void;
  onRefresh: () => Promise<void>;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  tooltipLabel?: string;
}

export function TranscriptHistoryPopover({
  trigger,
  subtitleDocuments,
  isLoading,
  onTranscriptOpen,
  onRefresh,
  align = "end",
  side = "bottom",
  tooltipLabel,
}: TranscriptHistoryPopoverProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const suppressTooltipUntilRef = React.useRef(0);
  const [deletingFilename, setDeletingFilename] = React.useState<string | null>(
    null,
  );
  const {
    setSubtitles,
    setSpeakers,
    setCurrentSubtitleDocumentFilename,
    currentSubtitleDocumentFilename,
  } = useSubtitleDocument();
  const locale = i18n.resolvedLanguage || i18n.language || undefined;

  const formatDateTime = React.useCallback(
    (createdAt: Date) =>
      createdAt.toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [locale],
  );

  const suppressTooltip = React.useCallback(() => {
    suppressTooltipUntilRef.current = Date.now() + 700;
    setTooltipOpen(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      suppressTooltip();
    }
  };

  const openSubtitleDocument = async (filename: string) => {
    try {
      const subtitleDocumentData = await readSubtitleDocument(filename);
      if (!subtitleDocumentData) return;

      setSubtitles(subtitleDocumentData.segments || []);
      setSpeakers(subtitleDocumentData.speakers || []);
      setCurrentSubtitleDocumentFilename(filename);
      suppressTooltip();
      setOpen(false);
      onTranscriptOpen();
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
      await onRefresh();
    } catch (error) {
      console.error("Failed to delete subtitle document:", error);
    } finally {
      setDeletingFilename(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        {tooltipLabel ? (
          <Tooltip
            open={tooltipOpen}
            onOpenChange={(nextOpen) => {
              setTooltipOpen(
                nextOpen && !open && Date.now() > suppressTooltipUntilRef.current,
              );
            }}
          >
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        )}
        <PopoverContent
          align={align}
          side={side}
          sideOffset={6}
          className="w-80 rounded-xl p-0 shadow-xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDown={suppressTooltip}
          onClick={suppressTooltip}
        >
          <Command shouldFilter>
            <CommandInput
              placeholder={t("titlebar.subtitleHistory.searchPlaceholder")}
            />
            <CommandList className="max-h-[260px]">
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t("titlebar.subtitleHistory.loading")}
                </div>
              ) : subtitleDocuments.length === 0 ? (
                <CommandEmpty>
                  {t("titlebar.subtitleHistory.empty")}
                </CommandEmpty>
              ) : (
                <>
                  <CommandEmpty>
                    {t("titlebar.subtitleHistory.no_results")}
                  </CommandEmpty>
                  <CommandGroup>
                    {subtitleDocuments.map((subtitleDocument) => {
                      const isActive =
                        currentSubtitleDocumentFilename ===
                        subtitleDocument.filename;
                      const dateTime = formatDateTime(
                        subtitleDocument.createdAt,
                      );

                      return (
                        <CommandItem
                          key={subtitleDocument.filename}
                          value={[
                            subtitleDocument.displayName,
                            subtitleDocument.filename,
                            subtitleDocument.timelineName,
                            dateTime,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          className={cn(
                            "group flex h-9 cursor-pointer items-center gap-2 rounded-md px-2",
                            isActive && "bg-accent text-accent-foreground",
                          )}
                          onSelect={() =>
                            void openSubtitleDocument(
                              subtitleDocument.filename,
                            )
                          }
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {subtitleDocument.displayName}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground group-hover:hidden group-focus-within:hidden">
                            {dateTime}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="hidden h-6 w-6 shrink-0 text-muted-foreground hover:bg-background hover:text-destructive group-hover:inline-flex group-focus-within:inline-flex"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDeletingFilename(
                                subtitleDocument.filename,
                              );
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">
                              {t("common.delete")}
                            </span>
                          </Button>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={!!deletingFilename}
        onOpenChange={(nextOpen) => !nextOpen && setDeletingFilename(null)}
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
