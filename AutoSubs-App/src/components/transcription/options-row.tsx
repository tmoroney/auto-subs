import * as React from "react";
import { Info, ScrollText, Speech, Type } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { SpeakerSelector } from "@/components/settings/diarize-selector";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { useSettings } from "@/contexts/SettingsContext";
import { cn } from "@/lib/utils";
import { composeCustomPrompt, parseCustomPrompt } from "./utils";

export function OptionsRow() {
  const { t } = useTranslation();
  const { settings: currentSettings, updateSetting } = useSettings();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false);
  const [openTextFormattingPopover, setOpenTextFormattingPopover] =
    React.useState(false);
  const [openCustomPromptPopover, setOpenCustomPromptPopover] =
    React.useState(false);
  const [showFormatOptionLabel, setShowFormatOptionLabel] =
    React.useState(false);
  const [showPromptOptionLabel, setShowPromptOptionLabel] =
    React.useState(false);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      const width = node.getBoundingClientRect().width;
      setShowFormatOptionLabel(width >= 280);
      setShowPromptOptionLabel(width >= 350);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const diarizeLabel = currentSettings.enableDiarize
    ? currentSettings.maxSpeakers === null
      ? t("actionBar.common.auto")
      : currentSettings.maxSpeakers
    : t("actionBar.common.off");

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid gap-2",
        showPromptOptionLabel
          ? "grid-cols-[minmax(96px,1fr)_minmax(96px,1fr)_minmax(96px,1fr)]"
          : showFormatOptionLabel
            ? "grid-cols-[minmax(88px,1fr)_minmax(88px,1fr)_40px]"
            : "grid-cols-[minmax(96px,1fr)_44px_44px]",
      )}
    >
      <Popover
        open={openSpeakerPopover}
        onOpenChange={setOpenSpeakerPopover}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            role="combobox"
            className="group h-10 min-w-0 justify-center gap-1.5 rounded-lg bg-muted/35 px-2 dark:bg-muted"
            aria-expanded={openSpeakerPopover}
            aria-label={`${t("actionBar.options.speakerLabels", "Speakers")}: ${diarizeLabel}`}
            title={`${t("actionBar.options.speakerLabels", "Speakers")}: ${diarizeLabel}`}
          >
            <Speech className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="min-w-0 truncate text-sm font-semibold leading-none group-hover:text-primary transition-colors">
              {diarizeLabel}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="center" side="top">
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
            className="group h-10 min-w-0 justify-center gap-1.5 rounded-lg bg-muted/35 px-2 dark:bg-muted"
            aria-expanded={openTextFormattingPopover}
            aria-label={`${t("actionBar.subtitleStyle", "Style")}: ${t("actionBar.subtitleStyleDescription", "Captions")}`}
            title={`${t("actionBar.subtitleStyle", "Style")}: ${t("actionBar.subtitleStyleDescription", "Captions")}`}
          >
            <Type
              className={cn(
                "shrink-0 group-hover:text-primary transition-colors",
                showFormatOptionLabel ? "text-muted-foreground" : "text-foreground",
              )}
            />
            {showFormatOptionLabel ? (
              <span className="min-w-0 truncate text-sm font-semibold leading-none group-hover:text-primary transition-colors">
                {t("actionBar.options.format", "Format")}
              </span>
            ) : null}
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

      <CustomPromptPopover
        open={openCustomPromptPopover}
        onOpenChange={setOpenCustomPromptPopover}
        showLabel={showPromptOptionLabel}
        customPrompt={currentSettings.customPrompt}
        onCustomPromptChange={(value) => updateSetting("customPrompt", value)}
      />
    </div>
  );
}

interface CustomPromptPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showLabel: boolean;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
}

function CustomPromptPopover({
  open,
  onOpenChange,
  showLabel,
  customPrompt,
  onCustomPromptChange,
}: CustomPromptPopoverProps) {
  const { t } = useTranslation();
  const [localTerms, setLocalTerms] = React.useState("");
  const [localContext, setLocalContext] = React.useState("");

  const customPromptParts = React.useMemo(
    () => parseCustomPrompt(customPrompt),
    [customPrompt],
  );

  // Sync local state when popover opens
  React.useEffect(() => {
    if (open) {
      setLocalTerms(customPromptParts.terms);
      setLocalContext(customPromptParts.context);
    }
  }, [open, customPromptParts.terms, customPromptParts.context]);

  // Sync to settings when popover closes
  React.useEffect(() => {
    if (open) return;

    const nextCustomPrompt = composeCustomPrompt(localTerms, localContext);
    if (nextCustomPrompt === customPrompt) return;

    onCustomPromptChange(nextCustomPrompt);
  }, [open, localTerms, localContext, customPrompt, onCustomPromptChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="default"
          role="combobox"
          className="group relative h-10 min-w-0 justify-center gap-1.5 rounded-lg bg-muted/35 px-2 dark:bg-muted"
          aria-expanded={open}
          aria-label={t("actionBar.format.customPromptTitle")}
          title={t("actionBar.format.customPromptTitle")}
        >
          <ScrollText
            className={cn(
              "h-4 w-4 shrink-0 group-hover:text-primary transition-colors",
              showLabel ? "text-muted-foreground" : "text-foreground",
            )}
          />
          {showLabel ? (
            <span className="min-w-0 truncate text-sm font-semibold leading-none group-hover:text-primary transition-colors">
              {t("actionBar.format.customPromptButton", "Prompt")}
            </span>
          ) : null}
          {customPrompt.trim() ? (
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
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
                      {t("actionBar.format.customPromptTermsExample")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              value={localTerms}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setLocalTerms(e.target.value)
              }
              placeholder={t("actionBar.format.customPromptTermsPlaceholder")}
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
                      {t("actionBar.format.customPromptContextExample")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              value={localContext}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setLocalContext(e.target.value)
              }
              placeholder={t("actionBar.format.customPromptContextPlaceholder")}
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
  );
}
