import * as React from "react";
import {
  Check,
  ChevronDown,
  FileAudio,
  Plus,
  RefreshCw,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { languages, translateLanguages } from "@/lib/languages";
import { useSettingsStore } from "@/stores/settings-store";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useProgress } from "@/contexts/ProgressContext";
import { modelSupportsLanguage } from "@/lib/models";
import type { Model, TimelineInfo, Track } from "@/types";
import { Button, Menu, MenuPopup, MenuRadioItem, Segmented, Tooltip } from "@/components/kit";
import { LiveTranscript } from "./live-transcript";
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
  onRefreshAudioTracks,
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

  const isFileMode = audioInputMode === "file" || selectedIntegration === "standalone";
  const isPremiereSource =
    selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
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
  const lastStreamedEnd = livePreviewSegments.reduce(
    (latest, segment) => Math.max(latest, segment.end ?? 0),
    0,
  );
  const progressPosition = (() => {
    const total = Math.max(0, Math.floor(lastStreamedEnd));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
      : `${minutes}:${seconds}`;
  })();
  const stepLabel =
    activeStep?.id === "transcribe"
      ? t("redesign.transcribing")
      : activeStep?.title ?? t("progressSteps.prepare");
  const sourceName = isFileMode
    ? t("actionBar.mode.fileInput")
    : isPremiereSource
      ? t("titlebar.premiere.productName")
      : t("titlebar.resolve.productName");

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
  const sourceLanguageLabel =
    selectedLanguage === "auto"
      ? t("redesign.autoDetect")
      : languages.find((language) => language.value === selectedLanguage)?.label ??
        selectedLanguage;
  const targetLanguageLabel = translate
    ? translateLanguages.find((language) => language.value === targetLanguage)?.label ??
      targetLanguage
    : t("redesign.sameAsSpoken");
  const speakerLabel = !enableDiarize
    ? t("redesign.off")
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
        <LiveTranscript
          segments={livePreviewSegments}
          sourceName={sourceName}
          projectName={isFileMode ? undefined : timelineInfo.projectName}
          title={
            isFileMode
              ? fileName(selectedFile) || t("redesign.newTranscriptTitle")
              : timelineInfo.name || t("redesign.newTranscriptTitle")
          }
          language={sourceLanguageLabel}
          modelName={model ? t(model.label) : ""}
          isFileMode={isFileMode}
          diarizationEnabled={enableDiarize}
        />
        <footer className="as-action-bar as-action-bar--running">
          <div className="as-progress-fill" style={{ width: `${stepProgress}%` }} />
          <div className="as-action-inner">
            <div className="as-action-summary">
              <span>{stepLabel}</span>
              <span className="as-progress-time">
                {progressPosition} · {Math.round(stepProgress)}%
              </span>
            </div>
            <Button
              variant="ghost"
              aria-label={t("redesign.stop")}
              title={t("redesign.stop")}
              className="as-stop-button"
              onClick={onCancel}
            >
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            </Button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="as-transcription-view">
      <div className="as-setup-scroll">
        <div
          className={`as-setup-content ${isDisconnected ? "as-setup-content--disconnected" : ""}`}
        >
          {isDisconnected ? (
            <div className="as-disconnected">
              <div className="as-eyebrow">
                <span className="as-source-dot as-source-dot--waiting" />
                {sourceName}
                <span className="as-eyebrow-meta">· {t("redesign.waiting")}</span>
              </div>
              <h1 className="as-title as-title--muted">
                {isPremiereSource
                  ? t("redesign.connectPremiere")
                  : t("redesign.connectResolve")}
              </h1>
              <p className="as-disconnected-meta">
                {isPremiereSource
                  ? t("redesign.premiereInstructions")
                  : t("redesign.resolveInstructions")}{" "}
                <span className="as-path">
                  {isPremiereSource
                    ? t("redesign.premierePath")
                    : t("redesign.resolvePath")}
                </span>
              </p>
              <button
                type="button"
                className="as-link as-link--muted"
                onClick={() => setSelectedIntegration("standalone")}
              >
                {t("redesign.useFile")}
              </button>
            </div>
          ) : (
            <>
              <div className="as-eyebrow">
                {isFileMode ? (
                  <FileAudio className="as-file-source-icon" aria-hidden="true" />
                ) : (
                  <span className="as-source-dot" />
                )}
                {sourceName}
                {!isFileMode && timelineInfo.projectName && (
                  <span className="as-eyebrow-meta">· {timelineInfo.projectName}</span>
                )}
              </div>
              <h1
                className={`as-title ${isFileMode && !selectedFile ? "as-title--muted" : ""}`}
              >
                {isFileMode
                  ? fileName(selectedFile) || t("redesign.newTranscriptTitle")
                  : timelineInfo.name || t("redesign.newTranscriptTitle")}
              </h1>
              <div className="as-meta">
                {isFileMode
                ? selectedFile
                  ? fileName(selectedFile)
                  : t("redesign.fileTypes")
                  : null}
                {!isFileMode && (
                  <span className="as-track-meta">
                    {t("redesign.audioTrackCount", { count: tracks.length })}
                    {onRefreshAudioTracks && (
                      <button
                        type="button"
                        className="as-refresh-button"
                        aria-label={t("redesign.refreshTracks")}
                        title={t("redesign.refreshTracks")}
                        onClick={() => void onRefreshAudioTracks()}
                      >
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                )}
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
                      className="as-link as-link--muted"
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
                            <span className="as-track-id">A{track.value}</span>
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
                    label={t("redesign.spokenIn")}
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
                    label={t("redesign.subtitlesIn")}
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
                    label={t("redesign.speakers")}
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
              {isFileMode && !selectedFile
                ? t("redesign.chooseFile")
                : warning ||
                  (isFileMode
                  ? selectedFile
                    ? fileName(selectedFile)
                    : t("redesign.fileNotSelected")
                  : t("redesign.tracks", { count: selectedTracks.length }))}
            </p>
            <Button
              variant="primary"
              size="lg"
              disabled={!canStart}
              className="as-transcribe-button"
              onClick={() => onStart?.()}
            >
              {t("redesign.transcribe")}
              <span className="as-shortcut">{navigator.userAgent.includes("Mac") ? "⌘↵" : "Ctrl↵"}</span>
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
