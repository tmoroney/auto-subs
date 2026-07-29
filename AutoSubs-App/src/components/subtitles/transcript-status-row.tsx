import { WrapText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";

/**
 * Turn a subtitle document filename into something worth showing in the UI:
 * drop any directory, drop the extension, and fall back to the timeline name
 * when there is nothing useful left (auto-generated documents often have no
 * meaningful name of their own).
 */
export function formatDocumentName(
  filename: string | null | undefined,
  fallback?: string,
): string {
  const base = (filename ?? "")
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .trim();
  return base || fallback?.trim() || "";
}

interface TranscriptStatusRowProps {
  /**
   * What was transcribed — the source audio filename, or the timeline name.
   * Falls back to the document filename when the document predates source
   * tracking.
   */
  sourceName: string | null | undefined;
  /** Raw document filename, used only when `sourceName` is unavailable. */
  documentName: string | null | undefined;
  subtitleCount: number;
  /** Number of subtitles matching the active search, or null when not searching. */
  matchCount: number | null;
  showReformat: boolean;
  onReformatOpenChange: (open: boolean) => void;
  onApplyReformat: () => Promise<void>;
}

export function TranscriptStatusRow({
  sourceName,
  documentName,
  subtitleCount,
  matchCount,
  showReformat,
  onReformatOpenChange,
  onApplyReformat,
}: TranscriptStatusRowProps) {
  const { t } = useTranslation();
  const displayName = sourceName?.trim() || formatDocumentName(documentName);

  // While searching, the count segment becomes the results readout. The name
  // stays put so the row doesn't reflow as the user types.
  const countLabel =
    matchCount === null
      ? t("subtitles.status.count", { count: subtitleCount })
      : t("subtitles.status.matches", { count: matchCount });

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 px-3 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {displayName && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 truncate font-medium text-foreground">
                  {displayName}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{displayName}</TooltipContent>
            </Tooltip>
            <span className="shrink-0 text-muted-foreground">·</span>
          </>
        )}
        <span className="shrink-0 text-muted-foreground">{countLabel}</span>
      </div>

      <Popover open={showReformat} onOpenChange={onReformatOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                // h-6 keeps the button inside the h-7 row instead of setting
                // the row height itself. A border and a label are what make
                // this read as an action rather than decoration.
                className="h-6 shrink-0 gap-1 rounded-md px-2 text-xs font-normal"
              >
                <WrapText className="size-3" />
                {t("subtitles.reformat")}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("subtitles.reformat")}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-80 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <TextFormattingPanel
            showActions
            onCancel={() => onReformatOpenChange(false)}
            onApply={onApplyReformat}
            applyDisabled={subtitleCount === 0}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
