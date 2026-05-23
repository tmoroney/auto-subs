import * as React from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  ChevronsUpDownIcon,
  type ChevronsUpDownIconHandle,
} from "@/components/ui/icons/chevrons-up-down";
import { LanguageSelector } from "@/components/settings/language-selector";
import { useSettings } from "@/contexts/SettingsContext";
import { languages, translateLanguages } from "@/lib/languages";

export function LanguageButton() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [open, setOpen] = React.useState(false);
  const chevronsRef = React.useRef<ChevronsUpDownIconHandle>(null);

  const sourceLanguageLabel =
    settings.language === "auto"
      ? t("actionBar.common.auto")
      : languages.find((l) => l.value === settings.language)?.label ??
        settings.language;

  const targetLanguageLabel =
    translateLanguages.find((l) => l.value === settings.targetLanguage)
      ?.label ?? settings.targetLanguage;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          role="combobox"
          aria-expanded={open}
          className="group w-full min-w-0 select-none justify-start rounded-lg bg-muted/30 pl-4 pr-3 dark:bg-muted"
          data-tour="transcription-controls-target"
          onMouseEnter={() => chevronsRef.current?.startAnimation()}
          onMouseLeave={() => chevronsRef.current?.stopAnimation()}
        >
          <span className="flex min-w-0 items-center gap-2 overflow-hidden">
            <span className="min-w-0 truncate text-sm font-semibold leading-none group-hover:text-primary transition-colors">
              {sourceLanguageLabel}
            </span>
            {settings.translate ? (
              <>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-sm font-semibold leading-none group-hover:text-primary transition-colors">
                  {targetLanguageLabel}
                </span>
              </>
            ) : null}
          </span>
          <ChevronsUpDownIcon
            ref={chevronsRef}
            className="ml-auto shrink-0"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="center" side="top">
        <LanguageSelector />
      </PopoverContent>
    </Popover>
  );
}
