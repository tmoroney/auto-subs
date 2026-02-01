import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/contexts/SettingsContext";
import { initI18n, normalizeUiLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const UI_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "zh", label: "中文" },
  { value: "tr", label: "Türkçe" },
] as const;

export function LanguagePickerModal() {
  const { settings, updateSetting, isHydrated } = useSettings();
  const { t } = useTranslation();

  const shouldShow = isHydrated && !settings.uiLanguagePromptCompleted;

  const [selection, setSelection] = React.useState(() => {
    return normalizeUiLanguage(settings.uiLanguage);
  });

  React.useEffect(() => {
    if (shouldShow) {
      setSelection(normalizeUiLanguage(settings.uiLanguage));
    }
  }, [shouldShow, settings.uiLanguage]);

  const handleContinue = () => {
    updateSetting("uiLanguage", selection);
    updateSetting("uiLanguagePromptCompleted", true);
    initI18n(selection);
  };

  return (
    <DialogPrimitive.Root open={shouldShow}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg"
          )}
        >
          <div className="space-y-1.5 text-center sm:text-left">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              {t("languagePicker.title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t("languagePicker.description")}
            </DialogPrimitive.Description>
          </div>

          <div className="space-y-4">
            <Select value={selection} onValueChange={(v) => setSelection(normalizeUiLanguage(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UI_LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex justify-end">
              <Button onClick={handleContinue}>{t("languagePicker.continue")}</Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
