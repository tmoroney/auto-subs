import * as React from "react";
import { ScrollText, Settings2, Speech } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { SpeakerSelector } from "@/components/settings/diarize-selector";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import { migrateCustomPrompt } from "./utils";

interface OptionsRowProps {
  selectedModelEngine?: string;
}

export function OptionsRow({ selectedModelEngine }: OptionsRowProps) {
  const { t } = useTranslation();
  const enableDiarize = useSettingsStore((s) => s.enableDiarize);
  const maxSpeakers = useSettingsStore((s) => s.maxSpeakers);
  const customPrompt = useSettingsStore((s) => s.customPrompt);
  const enableVad = useSettingsStore((s) => s.enableVad);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false);
  const [openCustomPromptPopover, setOpenCustomPromptPopover] =
    React.useState(false);
  const [openAdvancedPopover, setOpenAdvancedPopover] = React.useState(false);
  const [showPromptOptionLabel, setShowPromptOptionLabel] =
    React.useState(false);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      const width = node.getBoundingClientRect().width;
      setShowPromptOptionLabel(width >= 340);
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

  const speakersTitle = t("actionBar.speakers.title", "Speakers");

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid gap-2",
        showPromptOptionLabel
          ? "grid-cols-[minmax(64px,1fr)_minmax(88px,1fr)_44px]"
          : "grid-cols-[minmax(64px,1fr)_44px_44px]",
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
            className="group h-10 min-w-0 justify-center gap-1 rounded-lg bg-muted/35 px-2 dark:bg-muted"
            aria-expanded={openSpeakerPopover}
            aria-label={`${speakersTitle}: ${diarizeLabel}`}
            title={`${speakersTitle}: ${diarizeLabel}`}
          >
            <Speech className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="min-w-0 truncate text-sm leading-5 group-hover:text-primary transition-colors">
              {diarizeLabel}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="center" side="top">
          <SpeakerSelector />
        </PopoverContent>
      </Popover>

      <CustomPromptPopover
        open={openCustomPromptPopover}
        onOpenChange={setOpenCustomPromptPopover}
        showLabel={showPromptOptionLabel}
        customPrompt={customPrompt}
        onCustomPromptChange={(value) => updateSetting("customPrompt", value)}
        disabled={selectedModelEngine !== "whisper"}
      />

      <Popover open={openAdvancedPopover} onOpenChange={setOpenAdvancedPopover}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="group relative h-10 w-11 min-w-0 justify-center rounded-lg bg-muted/35 px-2 dark:bg-muted"
            aria-expanded={openAdvancedPopover}
            aria-label={t("actionBar.advanced.title")}
            title={t("actionBar.advanced.title")}
          >
            <Settings2 className="size-4 shrink-0 text-foreground group-hover:text-primary transition-colors" />
            {enableVad === false ? (
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
          <AdvancedOptionsPanel />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AdvancedOptionsPanel() {
  const { t } = useTranslation();
  const enableVad = useSettingsStore((s) => s.enableVad);
  const enableDTW = useSettingsStore((s) => s.enableDTW);
  const enableForcedAlignment = useSettingsStore((s) => s.enableForcedAlignment);
  const translate = useSettingsStore((s) => s.translate);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  // Mirrors the backend gate: forced alignment only actually runs (and only
  // then turns DTW off) when translation is off — see engine.rs `enable_dtw`.
  const alignmentSupersedesDtw = enableForcedAlignment && !translate;

  return (
    <div className="px-4 pb-4 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">
            {t("settings.forcedAlignment.title")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate
              ? t("settings.forcedAlignment.translationIncompatible")
              : t("settings.forcedAlignment.description")}
          </p>
        </div>
        <Switch
          checked={enableForcedAlignment}
          disabled={translate}
          onCheckedChange={(checked) =>
            updateSetting("enableForcedAlignment", checked)
          }
          aria-label={t("settings.forcedAlignment.title")}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{t("settings.dtw.title")}</Label>
          <p className="text-xs text-muted-foreground">
            {alignmentSupersedesDtw
              ? t("settings.dtw.supersededByAlignment")
              : t("settings.dtw.description")}
          </p>
        </div>
        <Switch
          checked={enableDTW}
          disabled={alignmentSupersedesDtw}
          onCheckedChange={(checked) => updateSetting("enableDTW", checked)}
          aria-label={t("settings.dtw.title")}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">
            {t("settings.speechDetection.title", "Speech Detection")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.speechDetection.description",
              "Skips silence; turn off if words are missed",
            )}
          </p>
        </div>
        <Switch
          checked={enableVad}
          onCheckedChange={(checked) => updateSetting("enableVad", checked)}
          aria-label={t("settings.speechDetection.title", "Speech Detection")}
        />
      </div>
    </div>
  );
}

interface CustomPromptPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showLabel: boolean;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  disabled?: boolean;
}

function CustomPromptPopover({
  open,
  onOpenChange,
  showLabel,
  customPrompt,
  onCustomPromptChange,
  disabled = false,
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
    <Popover open={open} onOpenChange={(next) => onOpenChange(next && !disabled)}>
      <PopoverTrigger asChild>
        <span
          className="min-w-0"
          title={
            disabled ? t("actionBar.format.customPromptWhisperOnly") : undefined
          }
        >
          <Button
            variant="ghost"
            size="default"
            aria-haspopup="listbox"
            disabled={disabled}
            className="group relative h-10 w-full min-w-0 justify-center gap-1.5 rounded-lg bg-muted/35 px-2 dark:bg-muted"
            aria-expanded={open}
            aria-label={
              disabled
                ? t("actionBar.format.customPromptWhisperOnly")
                : t("actionBar.format.customPromptTitle")
            }
            title={
              disabled
                ? t("actionBar.format.customPromptWhisperOnly")
                : t("actionBar.format.customPromptTitle")
            }
          >
            <ScrollText
              className={cn(
                "size-4 shrink-0 group-hover:text-primary transition-colors",
                showLabel ? "text-muted-foreground" : "text-foreground",
              )}
            />
            {showLabel ? (
              <span className="min-w-0 truncate text-sm leading-5 group-hover:text-primary transition-colors">
                {t("actionBar.format.customPromptButton", "Prompt")}
              </span>
            ) : null}
            {customPrompt.trim() ? (
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
            ) : null}
          </Button>
        </span>
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
