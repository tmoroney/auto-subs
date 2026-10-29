import * as React from "react";
import { AudioLines, Check, FileAudio, Languages, Mic2, MonitorPlay, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useProgress } from "@/contexts/ProgressContext";
import { modelSupportsLanguage } from "@/lib/models";
import type { Model, TimelineInfo, Track } from "@/types";
import { DraftTranscriptPanel } from "@/components/subtitles/draft-transcript-panel";
import { Button, Menu, MenuPopup, MenuRadioItem, Segmented, Switch, Tooltip } from "@/components/kit";
import { LanguageButton } from "./language-button";
import { FileDropArea } from "./source-section";
import type { ProcessingStep } from "./utils";
import type { Integration } from "@/contexts/IntegrationContext";

export interface TranscriptionPanelViewProps {
  modelsState: Model[];
  selectedModelIndex: number;
  selectedLanguage: string;
  onSelectModel: (modelIndex: number) => void;
  downloadingModel: string | null;
  downloadProgress: number;
  openModelSelector: boolean;
  onOpenModelSelectorChange: (open: boolean) => void;
  isSmallScreen: boolean;
  audioInputMode: "file" | "timeline";
  onAudioInputModeChange: (mode: "file" | "timeline") => void;
  processingSteps: ProcessingStep[];
  progressContainerRef: React.RefObject<HTMLDivElement>;
  onExportToFile: () => void;
  onViewSubtitles?: () => void;
  isSubtitleViewerOpen?: boolean;
  timelineInfo: TimelineInfo;
  selectedFile?: string | null;
  onSelectedFileChange?: (file: string | null) => void;
  onStart?: () => void;
  onCancel?: () => void;
  onStartNewTranscription: () => void | Promise<void>;
  onRefreshAudioTracks?: () => Promise<void>;
  isProcessing?: boolean;
  selectedIntegration: Integration;
}

function displayTrackLabel(track: Track) {
  const number = track.value || "1";
  const name = track.label.trim();
  const defaultName = /^Audio\s+\d+$/i.test(name);
  return `A${number}${name && !defaultName ? ` ${name}` : ""}`;
}

function fileName(path: string | null | undefined) {
  return path?.split(/[/\\]/).pop() || "";
}

export function TranscriptionPanelView({
  modelsState,
  selectedModelIndex,
  selectedLanguage,
  audioInputMode,
  processingSteps,
  timelineInfo,
  selectedFile,
  onSelectedFileChange,
  onStart,
  onCancel,
  isProcessing = false,
  selectedIntegration,
  isSmallScreen,
}: TranscriptionPanelViewProps) {
  const { t } = useTranslation();
  const { setSelectedIntegration } = useIntegration();
  const { isRunActive, livePreviewSegments } = useProgress();
  const selectedTracksByApp = useSettingsStore((state) => state.selectedInputTracksByApp);
  const exportRange = useSettingsStore((state) => state.exportRange ?? "inout");
  const translate = useSettingsStore((state) => state.translate);
  const enableDiarize = useSettingsStore((state) => state.enableDiarize);
  const maxSpeakers = useSettingsStore((state) => state.maxSpeakers);
  const customPrompt = useSettingsStore((state) => state.customPrompt);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  const isFileMode = audioInputMode === "file" || selectedIntegration === "standalone";
  const tracks = timelineInfo.inputTracks ?? [];
  const selectedTracks = selectedTracksByApp[selectedIntegration] ?? [];
  const running = isProcessing || isRunActive;
  const model = modelsState[selectedModelIndex];
  const supportsLanguage = model ? modelSupportsLanguage(model, selectedLanguage) : true;
  const isDisconnected = !isFileMode && !timelineInfo.timelineId;
  const activeStep =
    processingSteps.find((step) => step.isActive) ??
    processingSteps.find((step) => !step.isCompleted);
  const stepProgress = activeStep?.progress ?? 0;
  const stepLabel = activeStep?.title ?? t("progressSteps.prepare");

  const toggleTrack = (trackId: string) => {
    const next = selectedTracks.includes(trackId)
      ? selectedTracks.filter((id) => id !== trackId)
      : [...selectedTracks, trackId];
    updateSetting("selectedInputTracksByApp", {
      ...selectedTracksByApp,
      [selectedIntegration]: next,
    });
  };

  const useFileSource = () => setSelectedIntegration("standalone");
  const warning = !isFileMode
    ? isDisconnected
      ? selectedIntegration === "davinci"
        ? t("redesign.connectResolve")
        : t("titlebar.premiere.tooltip.openPremiere")
      : tracks.length === 0
        ? t("actionBar.tracks.noneFound")
        : selectedTracks.length === 0
          ? t("actionBar.tracks.noneSelected")
          : !supportsLanguage
            ? t("redesign.modelLanguageUnsupported")
            : ""
    : !selectedFile
      ? t("redesign.fileNotSelected")
      : !supportsLanguage
        ? t("redesign.modelLanguageUnsupported")
        : "";
  const canStart = !running && !warning;
  const trackSummary = selectedTracks
    .map((id) => {
      const track = tracks.find((item) => item.value === id);
      return track ? displayTrackLabel(track) : `A${id}`;
    })
    .join(", ");

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !running && canStart) {
        event.preventDefault();
        onStart?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canStart, onStart, running]);

  if (running) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--as-bg)]">
        <div className="min-h-0 flex-1 overflow-hidden">
          <DraftTranscriptPanel
            segments={livePreviewSegments}
            isComplete={false}
            progress={stepProgress}
            isFullScreen
          />
        </div>
        <footer className="flex h-16 shrink-0 items-center gap-4 border-t border-[var(--as-line)] bg-[var(--as-bg)] px-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-[var(--as-fg-secondary)]">
              {stepLabel}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--as-line)]">
              <div
                className="h-full rounded-full bg-[var(--as-primary)] transition-[width] duration-300"
                style={{ width: `${stepProgress}%` }}
              />
            </div>
          </div>
          <Button variant="tone" onClick={onCancel}>
            <Square className="size-3.5 fill-current" />
            {t("redesign.stop")}
          </Button>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--as-bg)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-5 sm:px-7 sm:py-7 ${isSmallScreen ? "" : "lg:px-10"}`}>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--as-fg-muted)]">
              {isFileMode ? <FileAudio className="size-3.5" /> : <MonitorPlay className="size-3.5" />}
              {isFileMode ? t("actionBar.mode.fileInput") : t("actionBar.mode.timeline")}
            </div>
            <h1 className="mt-2 truncate text-2xl text-[var(--as-fg)] sm:text-3xl" style={{ fontFamily: "var(--as-font-title)" }}>
              {isFileMode
                ? fileName(selectedFile) || t("redesign.fileNotSelected")
                : timelineInfo.name || t("actionBar.tracks.createTrack")}
            </h1>
          </div>

          {isFileMode ? (
            <FileDropArea
              selectedFile={selectedFile ?? null}
              onSelectedFileChange={(file) => onSelectedFileChange?.(file)}
              className="min-h-[220px] border-[var(--as-line-strong)] bg-[var(--as-card)]"
            />
          ) : isDisconnected ? (
            <section className="rounded-2xl border border-[var(--as-line)] bg-[var(--as-card)] p-5 sm:p-7">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-[var(--as-primary-soft)] text-[var(--as-primary)]">
                <MonitorPlay className="size-5" />
              </div>
              <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--as-font-title)" }}>
                {selectedIntegration === "davinci"
                  ? t("redesign.connectResolve")
                  : t("titlebar.premiere.productName")}
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--as-fg-secondary)]">
                {selectedIntegration === "davinci"
                  ? t("gettingStarted.resolveNote.openResolve")
                  : t("titlebar.premiere.tooltip.openPremiere")}
              </p>
              {selectedIntegration === "davinci" && (
                <p className="mt-2 text-sm font-medium text-[var(--as-fg)]">
                  {t("gettingStarted.resolveNote.workspace")} <span className="px-1 text-[var(--as-fg-muted)]">›</span>
                  {t("gettingStarted.resolveNote.scripts")} <span className="px-1 text-[var(--as-fg-muted)]">›</span>
                  {t("gettingStarted.resolveNote.autosubs")}
                </p>
              )}
              <Button variant="tone" className="mt-5" onClick={useFileSource}>
                <FileAudio className="size-4" />
                {t("redesign.useFile")}
              </Button>
            </section>
          ) : (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--as-fg)]">
                  {t("redesign.audioTracks")}
                </h2>
                <Segmented
                  value={exportRange}
                  onValueChange={(value) => updateSetting("exportRange", value as "entire" | "inout")}
                  ariaLabel={t("actionBar.tracks.exportRange.entire")}
                  options={[
                    { value: "entire", label: t("redesign.wholeTimeline") },
                    { value: "inout", label: t("redesign.inToOut") },
                  ]}
                />
              </div>
              {tracks.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {tracks.map((track) => {
                    const selected = selectedTracks.includes(track.value);
                    const label = displayTrackLabel(track);
                    return (
                      <Tooltip key={track.value} content={track.label}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleTrack(track.value)}
                          className={`flex h-12 min-w-0 items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--as-primary)] ${
                            selected
                              ? "border-[var(--as-fg)] bg-[var(--as-fg)] text-[var(--as-bg)]"
                              : "border-[var(--as-line)] bg-[var(--as-card)] text-[var(--as-fg-secondary)] hover:bg-[var(--as-card-hover)]"
                          }`}
                        >
                          {selected && <Check className="size-3.5 shrink-0" />}
                          <span className="truncate">{label}</span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--as-line-strong)] px-4 py-6 text-sm text-[var(--as-fg-muted)]">
                  {t("actionBar.tracks.noneFound")}
                </div>
              )}
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--as-line)] bg-[var(--as-card)] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--as-fg)]">
                <Languages className="size-4 text-[var(--as-fg-muted)]" />
                {t("actionBar.language.title")}
              </div>
              <LanguageButton />
              <div className="mt-4 flex items-center justify-between border-t border-[var(--as-line)] pt-3">
                <span className="text-xs text-[var(--as-fg-secondary)]">
                  {t("actionBar.language.translate")}
                </span>
                <Switch
                  checked={translate}
                  onCheckedChange={(checked: boolean) => updateSetting("translate", checked)}
                  aria-label={t("actionBar.language.translate")}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--as-line)] bg-[var(--as-card)] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--as-fg)]">
                <Mic2 className="size-4 text-[var(--as-fg-muted)]" />
                {t("actionBar.speakers.title")}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--as-fg-secondary)]">
                  {t("actionBar.speakers.description")}
                </span>
                <Switch
                  checked={enableDiarize}
                  onCheckedChange={(checked: boolean) => updateSetting("enableDiarize", checked)}
                  aria-label={t("actionBar.speakers.title")}
                />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--as-line)] pt-3">
                <span className="text-xs text-[var(--as-fg-muted)]">
                  {t("actionBar.speakers.countTitle")}
                </span>
                <Menu.Root>
                  <Menu.Trigger
                    render={
                      <Button variant="tone" size="sm">
                        {enableDiarize
                          ? maxSpeakers === null
                            ? t("actionBar.common.auto")
                            : maxSpeakers
                          : t("actionBar.speakers.disabled")}
                      </Button>
                    }
                  />
                  <MenuPopup>
                    <Menu.RadioGroup
                      value={maxSpeakers === null ? "auto" : String(maxSpeakers)}
                      onValueChange={(value: string) =>
                        updateSetting("maxSpeakers", value === "auto" ? null : Number(value))
                      }
                    >
                      {["auto", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((value) => (
                        <MenuRadioItem key={value} value={value}>
                          <Check className="size-3.5 opacity-0 data-[checked]:opacity-100" />
                          {value === "auto" ? t("actionBar.common.auto") : value}
                        </MenuRadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </MenuPopup>
                </Menu.Root>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--as-line)] bg-[var(--as-card)] p-4 sm:col-span-2">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--as-fg)]">
                <AudioLines className="size-4 text-[var(--as-fg-muted)]" />
                {t("redesign.namesTerms")}
              </div>
              <textarea
                value={customPrompt}
                onChange={(event) => updateSetting("customPrompt", event.target.value)}
                placeholder={t("redesign.promptHint")}
                disabled={model?.engine !== "whisper"}
                className="min-h-20 w-full resize-y rounded-xl border border-[var(--as-line)] bg-[var(--as-bg)] px-3 py-2.5 text-sm text-[var(--as-fg)] outline-none placeholder:text-[var(--as-fg-muted)] focus:border-[var(--as-primary)] disabled:cursor-not-allowed disabled:opacity-55"
              />
              {model?.engine !== "whisper" && (
                <p className="mt-2 text-xs text-[var(--as-fg-muted)]">
                  {t("actionBar.format.customPromptWhisperOnly")}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="flex min-h-16 shrink-0 items-center gap-3 border-t border-[var(--as-line)] bg-[var(--as-bg)] px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          {warning ? (
            <p className="truncate text-xs font-medium text-[var(--as-danger)]">
              {warning}
            </p>
          ) : (
            <p className="truncate text-xs text-[var(--as-fg-secondary)]">
              {isFileMode ? fileName(selectedFile) : trackSummary}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={!canStart}
          onClick={() => onStart?.()}
        >
          <AudioLines className="size-4" />
          {t("redesign.transcribe")}
          <span className="ml-1 hidden rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium sm:inline">
            ⌘↵
          </span>
        </Button>
      </footer>
    </div>
  );
}
