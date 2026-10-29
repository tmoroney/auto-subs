import * as React from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  Plus,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { languages, translateLanguages } from "@/lib/languages";
import { useSettingsStore } from "@/stores/settings-store";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useProgress } from "@/contexts/ProgressContext";
import { modelSupportsLanguage } from "@/lib/models";
import type { Model, TimelineInfo, Track } from "@/types";
import { DraftTranscriptPanel } from "@/components/subtitles/draft-transcript-panel";
import { Button, Menu, MenuPopup, MenuRadioItem, Segmented, Tooltip } from "@/components/kit";
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

function displayTrackName(track: Track) {
  const name = track.label.trim();
  return /^Audio\s+\d+$/i.test(name) ? "" : name;
}

function fileName(path: string | null | undefined) {
  return path?.split(/[/\\]/).pop() || "";
}

function formatDuration(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function OptionCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button type="button" className="as-option-trigger">
            <span className="as-option-copy">
              <span className="as-option-label">{label}</span>
              <span className="as-option-value">{value}</span>
            </span>
            <ChevronDown className="as-option-chevron" />
          </button>
        }
      />
      <MenuPopup className="as-option-menu">{children}</MenuPopup>
    </Menu.Root>
  );
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
}: TranscriptionPanelViewProps) {
  const { t } = useTranslation();
  const { setSelectedIntegration } = useIntegration();
  const { isRunActive, livePreviewSegments } = useProgress();
  const selectedTracksByApp = useSettingsStore((state) => state.selectedInputTracksByApp);
  const exportRange = useSettingsStore((state) => state.exportRange ?? "inout");
  const translate = useSettingsStore((state) => state.translate);
  const targetLanguage = useSettingsStore((state) => state.targetLanguage);
  const enableDiarize = useSettingsStore((state) => state.enableDiarize);
  const maxSpeakers = useSettingsStore((state) => state.maxSpeakers);
  const customPrompt = useSettingsStore((state) => state.customPrompt);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [showPrompt, setShowPrompt] = React.useState(Boolean(customPrompt));
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

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
  const sourceName = isFileMode
    ? t("actionBar.mode.fileInput")
    : selectedIntegration === "premiere" || selectedIntegration === "aftereffects"
      ? t("titlebar.premiere.productName")
      : t("titlebar.resolve.productName");

  React.useEffect(() => {
    if (!running) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);

  const toggleTrack = (trackId: string) => {
    const next = selectedTracks.includes(trackId)
      ? selectedTracks.filter((id) => id !== trackId)
      : [...selectedTracks, trackId];
    updateSetting("selectedInputTracksByApp", {
      ...selectedTracksByApp,
      [selectedIntegration]: next,
    });
  };

  const warning = isFileMode
    ? !selectedFile
      ? t("redesign.fileNotSelected")
      : !supportsLanguage
        ? t("redesign.modelLanguageUnsupported")
        : ""
    : tracks.length === 0
      ? t("actionBar.tracks.noneFound")
      : selectedTracks.length === 0
        ? t("actionBar.tracks.noneSelected")
        : !supportsLanguage
          ? t("redesign.modelLanguageUnsupported")
          : "";
  const canStart = !running && !warning && !isDisconnected;
  const trackSummary = selectedTracks
    .map((id) => {
      const track = tracks.find((item) => item.value === id);
      const name = track ? displayTrackName(track) : "";
      return name ? `${id} ${name}` : id;
    })
    .join(", ");
  const sourceLanguageLabel =
    selectedLanguage === "auto"
      ? t("actionBar.common.auto")
      : languages.find((language) => language.value === selectedLanguage)?.label ??
        selectedLanguage;
  const targetLanguageLabel = translate
    ? translateLanguages.find((language) => language.value === targetLanguage)?.label ??
      targetLanguage
    : t("redesign.sameAsSpoken");
  const speakerLabel = !enableDiarize
    ? t("actionBar.speakers.disabled")
    : maxSpeakers == null
      ? t("actionBar.common.auto")
      : String(maxSpeakers);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canStart) {
        event.preventDefault();
        onStart?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canStart, onStart]);

  if (running) {
    return (
      <div className="as-transcription-view as-running-view">
        <div className="as-draft-content">
          <DraftTranscriptPanel
            segments={livePreviewSegments}
            isComplete={false}
            progress={stepProgress}
            isFullScreen
          />
        </div>
        <footer className="as-action-bar as-action-bar--running">
          <div className="as-progress-fill" style={{ width: `${stepProgress}%` }} />
          <div className="as-action-inner">
            <div className="as-action-summary">
              <span>{stepLabel}</span>
              <span className="as-progress-time">
                {formatDuration(elapsedSeconds)} · {Math.round(stepProgress)}%
              </span>
            </div>
            <Button variant="tone" className="as-stop-button" onClick={onCancel}>
              <Square className="size-3.5 fill-current" />
              {t("redesign.stop")}
            </Button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="as-transcription-view">
      <div className="as-setup-scroll">
        <div className="as-setup-content">
          {isDisconnected ? (
            <div className="as-disconnected">
              <div className="as-eyebrow">
                <span className="as-source-dot as-source-dot--waiting" />
                {sourceName}
                <span className="as-eyebrow-meta">· {t("redesign.waiting")}</span>
              </div>
              <h1 className="as-title as-title--muted">
                {t("redesign.connectResolve")}
              </h1>
              <p className="as-disconnected-meta">
                {t("gettingStarted.resolveNote.openResolve")}{" "}
                <span className="as-path">
                  {t("gettingStarted.resolveNote.workspace")} ›{" "}
                  {t("gettingStarted.resolveNote.scripts")} ›{" "}
                  {t("gettingStarted.resolveNote.autosubs")}
                </span>
              </p>
              <button
                type="button"
                className="as-link"
                onClick={() => setSelectedIntegration("standalone")}
              >
                {t("redesign.useFile")}
              </button>
            </div>
          ) : (
            <>
              <div className="as-eyebrow">
                <span
                  className={`as-source-dot ${isFileMode ? "as-source-dot--file" : ""}`}
                />
                {sourceName}
                {!isFileMode && timelineInfo.projectName && (
                  <span className="as-eyebrow-meta">· {timelineInfo.projectName}</span>
                )}
              </div>
              <h1 className="as-title">
                {isFileMode
                  ? fileName(selectedFile) || t("redesign.newTranscriptTitle")
                  : timelineInfo.name || t("redesign.newTranscriptTitle")}
              </h1>
              <div className="as-meta">
                {isFileMode
                  ? selectedFile
                    ? fileName(selectedFile)
                    : t("redesign.fileTypes")
                  : t("redesign.audioTrackCount", { count: tracks.length })}
              </div>

              {isFileMode ? (
                <section className="as-section as-file-section">
                  <FileDropArea
                    selectedFile={selectedFile ?? null}
                    onSelectedFileChange={(file) => onSelectedFileChange?.(file)}
                    className="as-file-drop"
                  />
                </section>
              ) : (
                <section className="as-section">
                  <div className="as-section-head">
                    <h2>{t("redesign.audioTracks")}</h2>
                    <button
                      type="button"
                      className="as-link"
                      onClick={() => {
                        updateSetting(
                          "selectedInputTracksByApp",
                          {
                            ...selectedTracksByApp,
                            [selectedIntegration]:
                              selectedTracks.length === tracks.length
                                ? []
                                : tracks.map((track) => track.value),
                          },
                        );
                      }}
                    >
                      {selectedTracks.length === tracks.length
                        ? t("redesign.clear")
                        : t("redesign.selectAll")}
                    </button>
                  </div>
                  <div className="as-tracks">
                    {tracks.map((track) => {
                      const selected = selectedTracks.includes(track.value);
                      const name = displayTrackName(track);
                      return (
                        <Tooltip key={track.value} content={track.label}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleTrack(track.value)}
                            className={`as-track ${selected ? "as-track--selected" : ""}`}
                          >
                            <span className="as-track-id">{track.value}</span>
                            {name && <span className="as-track-name">{name}</span>}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                  <div className="as-range">
                    <Segmented
                      value={exportRange}
                      onValueChange={(value) =>
                        updateSetting("exportRange", value as "entire" | "inout")
                      }
                      ariaLabel={t("actionBar.tracks.exportRange.entire")}
                      options={[
                        { value: "entire", label: t("redesign.wholeTimeline") },
                        { value: "inout", label: t("redesign.inToOut") },
                      ]}
                      className="as-range-segmented"
                    />
                  </div>
                </section>
              )}

              <section className="as-section as-options-section">
                <div className="as-options">
                  <OptionCard
                    label={t("actionBar.language.title")}
                    value={sourceLanguageLabel}
                  >
                    <Menu.RadioGroup
                      value={selectedLanguage}
                      onValueChange={(value: string) =>
                        updateSetting("language", value)
                      }
                    >
                      <MenuRadioItem value="auto" className="as-menu-radio">
                        <Check className="as-menu-check" />
                        {t("actionBar.common.auto")}
                      </MenuRadioItem>
                      {languages
                        .filter((language) => language.value !== "auto")
                        .map((language) => (
                          <MenuRadioItem
                            key={language.value}
                            value={language.value}
                            className="as-menu-radio"
                          >
                            <Check className="as-menu-check" />
                            {language.label}
                          </MenuRadioItem>
                        ))}
                    </Menu.RadioGroup>
                  </OptionCard>
                  <OptionCard
                    label={t("actionBar.language.translate")}
                    value={targetLanguageLabel}
                  >
                    <Menu.RadioGroup
                      value={translate ? targetLanguage : "same"}
                      onValueChange={(value: string) => {
                        if (value === "same") {
                          updateSetting("translate", false);
                          return;
                        }
                        updateSetting("targetLanguage", value);
                        updateSetting("translate", true);
                      }}
                    >
                      <MenuRadioItem value="same" className="as-menu-radio">
                        <Check className="as-menu-check" />
                        {t("redesign.sameAsSpoken")}
                      </MenuRadioItem>
                      {translateLanguages.map((language) => (
                        <MenuRadioItem
                          key={language.value}
                          value={language.value}
                          className="as-menu-radio"
                        >
                          <Check className="as-menu-check" />
                          {language.label}
                        </MenuRadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </OptionCard>
                  <OptionCard
                    label={t("actionBar.speakers.title")}
                    value={speakerLabel}
                  >
                    <Menu.RadioGroup
                      value={!enableDiarize ? "off" : maxSpeakers == null ? "auto" : String(maxSpeakers)}
                      onValueChange={(value: string) => {
                        updateSetting("enableDiarize", value !== "off");
                        if (value !== "off") {
                          updateSetting("maxSpeakers", value === "auto" ? null : Number(value));
                        }
                      }}
                    >
                      {["off", "auto", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((value) => (
                        <MenuRadioItem key={value} value={value} className="as-menu-radio">
                          <Check className="as-menu-check" />
                          {value === "off"
                            ? t("actionBar.speakers.disabled")
                            : value === "auto"
                              ? t("actionBar.common.auto")
                              : value}
                        </MenuRadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </OptionCard>
                </div>
                {model?.engine === "whisper" && (
                  <div className="as-prompt">
                    <button
                      type="button"
                      className="as-prompt-toggle"
                      aria-expanded={showPrompt}
                      onClick={() => setShowPrompt((open) => !open)}
                    >
                      <Plus className="size-3.5" />
                      {t("redesign.namesTerms")}
                    </button>
                    {showPrompt && (
                      <textarea
                        value={customPrompt}
                        onChange={(event) =>
                          updateSetting("customPrompt", event.target.value)
                        }
                        placeholder={t("redesign.promptHint")}
                        className="as-prompt-input"
                      />
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {!isDisconnected && (
        <footer className="as-action-bar">
          <div className="as-action-inner">
            <p className={`as-action-summary ${warning ? "as-action-summary--warning" : ""}`}>
              {warning ||
                (isFileMode
                  ? selectedFile
                    ? fileName(selectedFile)
                    : t("redesign.fileNotSelected")
                  : t("redesign.trackSummary", {
                      count: selectedTracks.length,
                      tracks: trackSummary,
                    }))}
            </p>
            <Button
              variant="primary"
              size="lg"
              disabled={!canStart}
              className="as-transcribe-button"
              onClick={() => onStart?.()}
            >
              <AudioLines className="size-4" />
              {t("redesign.transcribe")}
              <span className="as-kbd">⌘↵</span>
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
