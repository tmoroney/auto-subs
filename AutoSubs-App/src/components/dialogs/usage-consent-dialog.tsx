import { BarChart3, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as openExternal } from "@tauri-apps/plugin-shell";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRIVACY_DOC_URL, UsageSummaryPreview } from "@/components/dialogs/usage-summary-preview";
import { useSettingsStore } from "@/stores/settings-store";

interface UsageConsentDialogProps {
  open: boolean;
}

/**
 * One-time opt-in prompt for anonymous usage stats. Deliberately symmetrical:
 * both answers are a single click on an equally weighted button, and the exact
 * payload is one click away — an opaque prompt would be worse than no telemetry
 * at all for an open-source app. Dismissing counts as declining, so the prompt
 * is shown once and never nags.
 */
export function UsageConsentDialog({ open }: UsageConsentDialogProps) {
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const { t } = useTranslation();

  const answer = (shared: boolean) => updateSetting("shareUsageData", shared);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) answer(false); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <BarChart3 className="size-5 text-primary" />
          </div>
          <DialogTitle>{t("usageStats.consent.title")}</DialogTitle>
          <DialogDescription>{t("usageStats.consent.description")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-500" />
            <span>{t("usageStats.consent.shared")}</span>
          </li>
          <li className="flex gap-2">
            <X className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-500" />
            <span>{t("usageStats.consent.notShared")}</span>
          </li>
        </ul>

        <UsageSummaryPreview />

        <p className="text-xs text-muted-foreground">
          {t("usageStats.consent.changeLater")}{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => void openExternal(PRIVACY_DOC_URL)}
          >
            {t("usageStats.privacyPolicy")}
          </button>
        </p>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" className="flex-1" onClick={() => answer(false)}>
            {t("usageStats.consent.decline")}
          </Button>
          <Button variant="default" className="flex-1" onClick={() => answer(true)}>
            {t("usageStats.consent.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
