import * as React from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/contexts/SettingsContext";
import { initI18n, normalizeUiLanguage, SUPPORTED_UI_LANGUAGES } from "@/i18n";
import { Button } from "@/components/ui/button";
import { models, getFirstRecommendedModelForLanguage } from "@/lib/models";
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
import { Globe, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const UI_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh", label: "中文" },
] as const;

export function GettingStartedOverlay() {
  const { settings, updateSetting, isHydrated } = useSettings();
  const { t } = useTranslation();

  const shouldShow = isHydrated && !settings.onboardingCompleted;

  const [selection, setSelection] = React.useState(() => {
    return normalizeUiLanguage(settings.uiLanguage);
  });
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (shouldShow) {
      setSelection(normalizeUiLanguage(settings.uiLanguage));
    }
  }, [shouldShow, settings.uiLanguage]);

  const handleContinue = () => {
    const normalizedUi = normalizeUiLanguage(selection);
    const hasUiTranslation = (SUPPORTED_UI_LANGUAGES as readonly string[]).includes(
      selection.toLowerCase()
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

    updateSetting("onboardingCompleted", true);
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 top-9 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          "mx-4 grid w-full max-w-md gap-6 border bg-background p-8 shadow-xl",
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

        <div className="space-y-4">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                {selection
                  ? UI_LANGUAGE_OPTIONS.find((opt) => opt.value === selection)?.label
                  : t("gettingStarted.selectLanguage")}
                <Globe className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder={t("gettingStarted.searchLanguage")} />
                <CommandList>
                  <CommandEmpty>{t("gettingStarted.noLanguageFound")}</CommandEmpty>
                  <CommandGroup>
                    {UI_LANGUAGE_OPTIONS.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        value={`${opt.label} ${opt.value}`}
                        onSelect={() => {
                          setSelection(normalizeUiLanguage(opt.value));
                          setOpen(false);
                        }}
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
