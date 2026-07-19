import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { useSettingsStore } from "@/stores/settings-store";
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
  const audioInputMode = useSettingsStore((s) => s.audioInputMode);
  const language = useSettingsStore((s) => s.language);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
  const translate = useSettingsStore((s) => s.translate);
  const enableDiarize = useSettingsStore((s) => s.enableDiarize);
  const maxSpeakers = useSettingsStore((s) => s.maxSpeakers);
  const textDensity = useSettingsStore((s) => s.textDensity);
  const textCase = useSettingsStore((s) => s.textCase);
  const enableGpu = useSettingsStore((s) => s.enableGpu);
  const enableDTW = useSettingsStore((s) => s.enableDTW);
  const enableForcedAlignment = useSettingsStore((s) => s.enableForcedAlignment);
  const removePunctuation = useSettingsStore((s) => s.removePunctuation);

  const sourceModeLabel =
    audioInputMode === "timeline"
      ? t("actionBar.mode.timeline")
      : t("actionBar.mode.fileInput");

  const selectedModelLabel = t(modelsState[selectedModelIndex].label);

  const sourceLanguageLabel =
    language === "auto"
      ? t("actionBar.common.auto")
      : languages.find((l) => l.value === language)?.label ??
        language;

  const targetLanguageLabel =
    translateLanguages.find((l) => l.value === targetLanguage)
      ?.label ?? targetLanguage;

  const languageSummary = translate
    ? `${sourceLanguageLabel} → ${targetLanguageLabel}`
    : sourceLanguageLabel;

  const diarizeLabel = enableDiarize
    ? maxSpeakers === null
      ? t("actionBar.common.auto")
      : maxSpeakers
    : t("actionBar.common.off");

  const textDensityLabel = t(
    `actionBar.format.textDensity.${textDensity}`,
  );

  const textCaseLabel =
    textCase !== "none"
      ? t(`actionBar.format.textCase.${textCase}`)
      : "";

  const gpuLabel = enableGpu ? t("settings.gpu.title") : "";
  const dtwLabel = enableDTW ? t("settings.dtw.title") : "";
  const punctuationLabel = removePunctuation
    ? t("actionBar.format.removePunctuationTitle")
    : "";

  const summaryParts: (string | number)[] = [
    sourceModeLabel,
    selectedModelLabel,
    languageSummary,
  ];

  if (enableDiarize) {
    summaryParts.push(`${t("actionBar.speakers.title")}: ${diarizeLabel}`);
  }
  if (textDensity !== "standard") {
    summaryParts.push(textDensityLabel);
  }
  if (enableGpu) {
    summaryParts.push(gpuLabel);
  }
  if (enableDTW) {
    summaryParts.push(dtwLabel);
  }
  if (enableForcedAlignment && !translate) {
    summaryParts.push(t("settings.forcedAlignment.summary"));
  }
  if (textCase !== "none") {
    summaryParts.push(textCaseLabel);
  }
  if (removePunctuation) {
    summaryParts.push(punctuationLabel);
  }

  return summaryParts.join(" · ");
}
