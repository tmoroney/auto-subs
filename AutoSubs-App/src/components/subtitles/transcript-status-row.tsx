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

interface TranscriptStatusRowProps {
  /**
   * What was transcribed — the source audio filename, or the timeline name.
   * Null when neither is known, in which case no name is shown at all: the
   * generated document id is noise, not information.
   */
  sourceName: string | null | undefined;
  subtitleCount: number;
  /** Number of subtitles matching the active search, or null when not searching. */
  matchCount: number | null;
  showReformat: boolean;
  onReformatOpenChange: (open: boolean) => void;
  onApplyReformat: () => Promise<void>;
}

export function TranscriptStatusRow({
  sourceName,
  subtitleCount,
  matchCount,
  showReformat,
  onReformatOpenChange,
  onApplyReformat,
}: TranscriptStatusRowProps) {
  const { t } = useTranslation();
  const displayName = sourceName?.trim() ?? "";

  // While searching, the count segment becomes the results readout. The name
  // stays put so the row doesn't reflow as the user types.
  const countLabel =
    matchCount === null
      ? t("subtitles.status.count", { count: subtitleCount })
      : t("subtitles.status.matches", { count: matchCount });

  return (
    // Left padding matches the subtitle rows below (p-4 + border-l-2 = 18px)
    // so the name sits in the same column as the transcript text it labels.
    // Right padding matches the search field above, which the button belongs to.
    <div className="flex h-10 shrink-0 items-center gap-2 border-b pl-[18px] pr-2 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {displayName && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Monospaced and boxed so it reads as a value from the user's
                  filesystem rather than as UI copy — matching how timecodes
                  are set apart in the list below. The negative margin pulls
                  the pill's *text* onto the same column as the subtitle text,
                  which the plain count below also sits on. */}
              <span className="-ml-1.5 min-w-0 max-w-[60%] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {displayName}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{displayName}</TooltipContent>
          </Tooltip>
        )}
        <span className="shrink-0 text-muted-foreground">{countLabel}</span>
      </div>

      <Popover open={showReformat} onOpenChange={onReformatOpenChange}>
        {/* No tooltip: the button is labelled, so one would just repeat it. */}
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            // Ghost, not outline: a bordered-and-filled control is a heavy
            // object to drop into a light metadata strip, and at this row
            // height it reads as crammed in. With a label to carry the
            // meaning, hover is enough of an affordance.
            className="h-7 shrink-0 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <WrapText className="size-3.5" />
            {t("subtitles.reformat")}
          </Button>
        </PopoverTrigger>
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
