import * as React from "react";
import { ScrollText, Speech, Type } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { SpeakerSelector } from "@/components/settings/diarize-selector";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import { migrateCustomPrompt } from "./utils";

export function OptionsRow() {
  const { t } = useTranslation();
  const enableDiarize = useSettingsStore((s) => s.enableDiarize);
  const maxSpeakers = useSettingsStore((s) => s.maxSpeakers);
  const customPrompt = useSettingsStore((s) => s.customPrompt);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
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

  const diarizeLabel = enableDiarize
    ? maxSpeakers === null
      ? t("actionBar.common.auto")
      : maxSpeakers
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
            aria-haspopup="listbox"
            className="group h-10 min-w-0 justify-center gap-1.5 rounded-lg bg-muted/35 px-2 dark:bg-muted"
            aria-expanded={openSpeakerPopover}
            aria-label={`${t("actionBar.options.speakerLabels", "Speakers")}: ${diarizeLabel}`}
            title={`${t("actionBar.options.speakerLabels", "Speakers")}: ${diarizeLabel}`}
          >
            <Speech className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
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
            aria-haspopup="listbox"
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
        customPrompt={customPrompt}
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
  const [localPrompt, setLocalPrompt] = React.useState("");

  // Sync local state when popover opens, migrating any legacy two-section format
  React.useEffect(() => {
    if (open) {
      setLocalPrompt(migrateCustomPrompt(customPrompt));
    }
  }, [open, customPrompt]);

  // Sync to settings when popover closes
  React.useEffect(() => {
    if (open) return;
    if (localPrompt === customPrompt) return;
    onCustomPromptChange(localPrompt);
  }, [open, localPrompt, customPrompt, onCustomPromptChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="default"
          aria-haspopup="listbox"
          className="group relative h-10 min-w-0 justify-center gap-1.5 rounded-lg bg-muted/35 px-2 dark:bg-muted"
          aria-expanded={open}
          aria-label={t("actionBar.format.customPromptTitle")}
          title={t("actionBar.format.customPromptTitle")}
        >
          <ScrollText
            className={cn(
              "size-4 shrink-0 group-hover:text-primary transition-colors",
              showLabel ? "text-muted-foreground" : "text-foreground",
            )}
          />
          {showLabel ? (
            <span className="min-w-0 truncate text-sm font-semibold leading-none group-hover:text-primary transition-colors">
              {t("actionBar.format.customPromptButton", "Prompt")}
            </span>
          ) : null}
          {customPrompt.trim() ? (
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        side="top"
        align="center"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-4 py-3.5 space-y-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">
              {t("actionBar.format.customPromptTitle")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("actionBar.format.customPromptDescription")}
            </p>
          </div>
          <Textarea
            value={localPrompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setLocalPrompt(e.target.value)
            }
            placeholder={t("actionBar.format.customPromptPlaceholder")}
            className="min-h-[100px] resize-none text-sm"
          />
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("actionBar.format.customPromptLanguageWarning")}
          </p>
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
