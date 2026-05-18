import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { useSettings } from "@/contexts/SettingsContext";
import { languages, translateLanguages } from "@/lib/languages";
import type { Model } from "@/types";

interface RunSummaryCardProps {
  modelsState: Model[];
  selectedModelIndex: number;
}

export function RunSummaryCard({
  modelsState,
  selectedModelIndex,
}: RunSummaryCardProps) {
  const summary = useRunSummary(modelsState, selectedModelIndex);

  return (
    <Card className="z-50 rounded-2xl bg-background p-3 shadow-none">
      <div className="min-w-0 rounded-2xl border bg-muted/35 px-3.5 py-3">
        <p className="text-sm font-medium leading-relaxed">{summary}</p>
      </div>
    </Card>
  );
}

function useRunSummary(
  modelsState: Model[],
  selectedModelIndex: number,
): string {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const sourceModeLabel =
    settings.audioInputMode === "timeline"
      ? t("actionBar.mode.timeline")
      : t("actionBar.mode.fileInput");

  const selectedModelLabel = t(modelsState[selectedModelIndex].label);

  const sourceLanguageLabel =
    settings.language === "auto"
      ? t("actionBar.common.auto")
      : languages.find((l) => l.value === settings.language)?.label ??
        settings.language;

  const targetLanguageLabel =
    translateLanguages.find((l) => l.value === settings.targetLanguage)
      ?.label ?? settings.targetLanguage;

  const languageSummary = settings.translate
    ? `${sourceLanguageLabel} → ${targetLanguageLabel}`
    : sourceLanguageLabel;

  const diarizeLabel = settings.enableDiarize
    ? settings.maxSpeakers === null
      ? t("actionBar.common.auto")
      : settings.maxSpeakers
    : t("actionBar.common.off");

  const textDensityLabel = t(
    `actionBar.format.textDensity.${settings.textDensity}`,
  );

  const textCaseLabel =
    settings.textCase !== "none"
      ? t(`actionBar.format.textCase.${settings.textCase}`)
      : "";

  const gpuLabel = settings.enableGpu ? t("settings.gpu.title") : "";
  const dtwLabel = settings.enableDTW ? t("settings.dtw.title") : "";
  const punctuationLabel = settings.removePunctuation
    ? t("actionBar.format.removePunctuationTitle")
    : "";

  const summaryParts: (string | number)[] = [
    sourceModeLabel,
    selectedModelLabel,
    languageSummary,
  ];

  if (settings.enableDiarize) {
    summaryParts.push(`${t("actionBar.speakers.title")}: ${diarizeLabel}`);
  }
  if (settings.textDensity !== "standard") {
    summaryParts.push(textDensityLabel);
  }
  if (settings.enableGpu) {
    summaryParts.push(gpuLabel);
  }
  if (settings.enableDTW) {
    summaryParts.push(dtwLabel);
  }
  if (settings.textCase !== "none") {
    summaryParts.push(textCaseLabel);
  }
  if (settings.removePunctuation) {
    summaryParts.push(punctuationLabel);
  }

  return summaryParts.join(" · ");
}
