import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { pendingUsageSummary } from "@/lib/telemetry";
import { useSettingsStore } from "@/stores/settings-store";

export const PRIVACY_DOC_URL = "https://github.com/tmoroney/auto-subs/blob/main/PRIVACY.md";

/**
 * Shows the literal JSON that would be uploaded. Before any run has been
 * recorded there is nothing pending, so a representative example is shown
 * instead — the point is that the shape is never a mystery.
 */
const EXAMPLE_SUMMARY = {
  v: 1,
  install_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  app_version: "3.8.0",
  channel: "release",
  os: "windows",
  arch: "x86_64",
  gpu_backend: "directml",
  integration: "davinci",
  ui_language: "en",
  engine: "whisper-large-v3",
  language: "auto",
  period_days: 7,
  runs: 12,
  runs_failed: 1,
  runs_diarize: 3,
  runs_translate: 0,
  runs_forced_alignment: 2,
  runs_dtw: 9,
  runs_censor: 0,
  runs_custom_template: 4,
  runs_file_input: 2,
  audio_minutes: 143,
};

export function UsageSummaryPreview() {
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const { t } = useTranslation();
  const [summary, setSummary] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void pendingUsageSummary(uiLanguage).then((pending) => {
      if (!cancelled) setSummary(pending);
    });
    return () => {
      cancelled = true;
    };
  }, [uiLanguage]);

  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        {summary ? t("usageStats.preview.actual") : t("usageStats.preview.example")}
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="max-h-52 overflow-auto border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {JSON.stringify(summary ?? EXAMPLE_SUMMARY, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
