import * as React from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";

import { useSettings } from "@/contexts/SettingsContext";
import { useResolve } from "@/contexts/ResolveContext";
import { initI18n, normalizeUiLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { models, getFirstRecommendedModelForLanguage } from "@/lib/models";
import { languages, uiLanguages } from "@/lib/languages";
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
import { Globe, Check, MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function GettingStartedOverlay() {
  const { settings, updateSetting, isHydrated } = useSettings();
  const { t } = useTranslation();
  const { timelineInfo } = useResolve();

  const shouldShow = isHydrated && !settings.onboardingCompleted;
  const isResolveConnected = timelineInfo.timelineId !== "";

  const [selection, setSelection] = React.useState<string>(() => {
    return normalizeUiLanguage(settings.uiLanguage);
  });
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (shouldShow) {
      setSelection(normalizeUiLanguage(settings.uiLanguage));
    }
  }, [shouldShow, settings.uiLanguage]);

  const handleLanguageSelect = (value: string) => {
    setSelection(value);
    setOpen(false);

    // Update UI language immediately if the selected language has a UI translation
    const normalizedUi = normalizeUiLanguage(value);
    const hasUiTranslation = uiLanguages.some(
      (lang) => lang.value === value.toLowerCase()
    );

    if (hasUiTranslation) {
      updateSetting("uiLanguage", normalizedUi);
      initI18n(normalizedUi);
    }
  };

  const handleContinue = async () => {
    const normalizedUi = normalizeUiLanguage(selection);
    const hasUiTranslation = uiLanguages.some(
      (lang) => lang.value === selection.toLowerCase()
    );

    if (hasUiTranslation) {
      updateSetting("uiLanguage", normalizedUi);
      initI18n(normalizedUi);
    }

    updateSetting("language", selection);

    // Auto-select first recommended model that supports the selected language
    const recommendedModel = getFirstRecommendedModelForLanguage(selection);
    if (recommendedModel) {
      const modelIndex = models.findIndex(m => m.value === recommendedModel.value);
      if (modelIndex !== -1) {
        updateSetting("model", modelIndex);
      }
    }

    // Mark current version as seen so brand-new users don't see the
    // "What's New" popup immediately after onboarding.
    try {
      const version = await getVersion();
      if (version) updateSetting("lastSeenVersion", version);
    } catch {
      /* ignore */
    }

    updateSetting("onboardingCompleted", true);
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 top-9 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          "mx-4 grid w-full max-w-md gap-5 border bg-background p-8 shadow-xl",
          "sm:rounded-xl"
        )}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
            <Globe className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {t("gettingStarted.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("gettingStarted.description")}
            </p>
          </div>
        </div>

        {!isResolveConnected && (
          <div className="flex items-start rounded-lg border text-amber-800 dark:text-amber-200 border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
            <p className="space-y-0.5">
              <div>{t("gettingStarted.resolveNote.openResolve")}</div>
              <div className="flex items-center justify-center gap-2">
                <b>{t("gettingStarted.resolveNote.workspace")}</b>
                <MoveRight className="h-3 w-3" />
                <b>{t("gettingStarted.resolveNote.scripts")}</b>
                <MoveRight className="h-3 w-3" />
                <b>{t("gettingStarted.resolveNote.autosubs")}</b>
              </div>
            </p>
          </div>
        )}

        <div className="space-y-4">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between px-4"
              >
                {selection
                  ? languages.find((opt) => opt.value === selection)?.label
                  : t("gettingStarted.selectLanguage")}
                <Globe className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder={t("gettingStarted.searchLanguage")} />
                <CommandList>
                  <CommandEmpty>{t("gettingStarted.noLanguageFound")}</CommandEmpty>
                  <CommandGroup>
                    {languages.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        value={`${opt.label} ${opt.value}`}
                        onSelect={() => handleLanguageSelect(opt.value)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selection === opt.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {opt.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button onClick={handleContinue} className="w-full">
            {t("gettingStarted.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
