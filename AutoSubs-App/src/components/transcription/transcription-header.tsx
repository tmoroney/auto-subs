import * as React from "react";
import { FileText, History, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IntegrationStatus } from "@/components/layout/integration-status";
import { TranscriptHistoryPopover } from "@/components/subtitles/transcript-history-popover";
import { CaptionTemplateSelectionDialog } from "@/components/dialogs/caption-style/template-selection";
import type { TimelineInfo } from "@/types";
import type { SubtitleDocumentListItem } from "@/utils/file-utils";
import { SettingsDropdown } from "./settings-dropdown";

interface TranscriptionHeaderProps {
  transcriptDocuments: SubtitleDocumentListItem[];
  isLoadingTranscriptDocuments: boolean;
  onTranscriptDocumentsRefresh: () => Promise<void>;
  onViewSubtitles?: () => void;
  isSubtitleViewerOpen?: boolean;
  templates: TimelineInfo["templates"];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  onLoadTemplates?: () => Promise<TimelineInfo["templates"]>;
}

export function TranscriptionHeader({
  transcriptDocuments,
  isLoadingTranscriptDocuments,
  onTranscriptDocumentsRefresh,
  onViewSubtitles,
  isSubtitleViewerOpen = false,
  templates,
  templatesLoading,
  templatesLoaded,
  onLoadTemplates,
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

      <CaptionTemplateSelectionDialog
        open={styleDialogOpen}
        onOpenChange={setStyleDialogOpen}
        templates={templates}
        templatesLoading={templatesLoading}
        templatesLoaded={templatesLoaded}
        onLoadTemplates={onLoadTemplates}
      />
    </>
  );
}
