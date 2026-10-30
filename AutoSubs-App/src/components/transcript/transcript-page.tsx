import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileAudio,
  FileUp,
  Layers,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Type,
  X,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Menu, MenuItem, MenuPopup, MenuRadioItem, MenuSeparator, Popover } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { SubtitleList } from "@/components/subtitles/subtitle-list";
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel";
import { SpeakerSettings } from "@/components/common/speaker-settings";
import { EXPORT_FORMATS, type ExportFormat } from "@/components/common/export-popover";
import { PresetThumbnail } from "@/components/captions/preset-thumbnail";
import { FusionPresetEditor } from "@/components/captions/fusion-preset-editor";
import { useCaptionPresets } from "@/components/captions/use-caption-presets";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useAdobe } from "@/contexts/AdobeContext";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { useAudioPreview } from "@/contexts/AudioPreviewContext";
import { useSettingsStore } from "@/stores/settings-store";
import { getDensityCharLimits } from "@/api/formatting-api";
import {
  applyStylesToTimeline,
  checkTrackConflicts,
  ResolveApiError,
  type ConflictInfo,
} from "@/api/resolve-api";
import { describeError } from "@/components/transcription/utils";
import { describeCaptionStyle, isStyleAvailable, resolveCaptionStyle } from "@/lib/caption-style";
import { groupTranscriptSegments } from "@/utils/group-transcript-segments";
import type { CaptionPreset, Settings, Speaker, Subtitle, Template, Track } from "@/types";
import type { SubtitleDocumentListItem, TranscriptSourceType } from "@/utils/file-utils";

type TextDensity = Settings["textDensity"];
type DensityLimits = { less: number; standard: number; more: number };

const DEFAULT_LIMITS: DensityLimits = { less: 27, standard: 38, more: 49 };
const DENSITIES: TextDensity[] = ["single", "less", "standard", "more", "custom"];

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`
    : `${minutes}:${remaining}`;
}

function relativeDate(date: Date | undefined, language: string) {
  if (!date) return "";
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (Math.abs(days) < 1) return formatter.format(0, "day");
  return formatter.format(days, "day");
}

function sourceTypeFor(
  document: SubtitleDocumentListItem | null,
  integration: string,
): TranscriptSourceType {
  if (document?.sourceType) return document.sourceType;
  if (integration === "standalone") return "standalone";
  if (integration === "premiere") return "premiere";
  if (integration === "aftereffects") return "aftereffects";
  if (integration === "davinci") return "resolve";
  return "unknown";
}

function speakerIndex(speakerId: string | undefined, subtitles: Subtitle[], speakers: Speaker[]) {
  if (!speakerId || speakers.length === 0) return 0;
  const hasZero = subtitles.some((subtitle) => subtitle.speaker_id === "0");
  const numericId = Number(speakerId);
  if (!Number.isFinite(numericId)) return 0;
  const index = numericId - (hasZero ? 0 : 1);
  return index >= 0 && index < speakers.length ? index : 0;
}

function buildFindRegExp(
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, caseSensitive ? "g" : "gi");
}

interface TranscriptPageProps {
  document: SubtitleDocumentListItem | null;
  onClose: () => void;
  onOpenStyles: () => void;
  templates: {
    templates: Template[];
    loaded: boolean;
  };
}

export function TranscriptPage({
  document,
  onClose,
  onOpenStyles,
  templates,
}: TranscriptPageProps) {
    const { t, i18n } = useTranslation();
  const {
    subtitles,
    speakers,
    updateSubtitles,
    updateSpeakers,
    currentSubtitleDocumentFilename,
    currentSubtitleDocumentSourceName,
    currentSubtitleDocumentLanguage,
    flushPendingSubtitleSave,
    reformatSubtitles,
    exportSubtitlesAs,
  } = useSubtitleDocument();
  const { selectedIntegration } = useIntegration();
  const {
    timelineInfo: resolveTimeline,
    pushToTimeline: resolvePush,
    jumpToTime: resolveJumpToTime,
  } = useResolve();
  const {
    timelineInfo: adobeTimeline,
    pushToTimeline: adobePush,
    jumpToTime: adobeJumpToTime,
  } = useAdobe();
  const presets = useCaptionPresets();
  const { showError } = useErrorDialog();
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const settings = useSettingsStore((state) => state);
  const { seekToTime: seekAudioPreview } = useAudioPreview();
  const [view, setView] = React.useState<"subtitles" | "original">("subtitles");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [replaceValue, setReplaceValue] = React.useState("");
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [wholeWord, setWholeWord] = React.useState(false);
  const [showReplace, setShowReplace] = React.useState(false);
  const [matchCount, setMatchCount] = React.useState(0);
  const [formatOpen, setFormatOpen] = React.useState(false);
  const [limits, setLimits] = React.useState(DEFAULT_LIMITS);
  const [trackMenuOpen, setTrackMenuOpen] = React.useState(false);
  const [conflictInfo, setConflictInfo] = React.useState<ConflictInfo | null>(null);
  const [isAdding, setIsAdding] = React.useState(false);
  const [justSent, setJustSent] = React.useState(false);

  const isResolve = selectedIntegration === "davinci";
  const isAdobe = selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
  const sourceType = sourceTypeFor(document, selectedIntegration);
  const isStandalone = sourceType === "standalone" || settings.audioInputMode === "file";
  const timelineInfo = isAdobe ? adobeTimeline : resolveTimeline;
  const connected = isAdobe
    ? Boolean(adobeTimeline?.timelineId)
    : Boolean(resolveTimeline?.timelineId);
  const jumpToTime = isAdobe ? adobeJumpToTime : resolveJumpToTime;
  const outputTracks = resolveTimeline?.outputTracks ?? [];
  const outputLanguage = settings.translate ? settings.targetLanguage : settings.language;
  const sourceName = currentSubtitleDocumentSourceName ||
    currentSubtitleDocumentFilename?.split(/[/\\]/).pop() ||
    document?.filename ||
    t("redesign.transcript.title");
  const relative = relativeDate(document?.createdAt, i18n.language);
  const duration = document?.markOut != null
    ? Math.max(0, document.markOut - (document.markIn ?? 0))
    : null;
  const metadata = [
    currentSubtitleDocumentLanguage,
    duration !== null ? formatTime(duration) : "",
  ].filter(Boolean);
  const style = settings.captionStyle;
  const styleLabel = describeCaptionStyle(style, presets.getPreset, t("captions.style.unavailable"));
  const trackLabel = outputTracks.find((track) => track.value === settings.selectedOutputTrack)?.label ?? "";
  const hasSubtitles = subtitles.length > 0;
  const needsTrackChoice =
    outputTracks.length > 0 &&
    !outputTracks.some((track) => track.value === settings.selectedOutputTrack);
  const styleAvailable = isStyleAvailable(style, presets.presets, templates.templates, templates.loaded);
  const needsStyleChoice = isResolve && !styleAvailable;

  React.useEffect(() => {
    let cancelled = false;
    getDensityCharLimits(outputLanguage)
      .then((result) => {
        if (!cancelled) setLimits(result ?? DEFAULT_LIMITS);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [outputLanguage]);

  React.useEffect(() => {
    setJustSent(false);
  }, [subtitles]);

  React.useEffect(() => {
    if (!isResolve || !connected || !currentSubtitleDocumentFilename || !settings.selectedOutputTrack) {
      setConflictInfo(null);
      return;
    }
    let cancelled = false;
    checkTrackConflicts(currentSubtitleDocumentFilename, settings.selectedOutputTrack)
      .then((info) => {
        if (!cancelled) setConflictInfo(info);
      })
      .catch(() => {
        if (!cancelled) setConflictInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, currentSubtitleDocumentFilename, isResolve, settings.selectedOutputTrack]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        window.document.querySelector('[data-open="true"]')
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSettingChange = async <K extends keyof Settings,>(
    key: K,
    value: Settings[K],
  ) => {
    updateSetting(key, value);
    try {
      await flushPendingSubtitleSave();
      await reformatSubtitles(useSettingsStore.getState(), null, timelineInfo?.timelineId ?? "");
    } catch (error) {
      const { title, message, detail } = describeError(error, t("errorDialog.reformatFailed"));
      showError({ title, message, detail });
    }
  };

  const handleDensityChange = (value: TextDensity) => {
    if (
      value === "custom" &&
      ["less", "standard", "more"].includes(settings.textDensity)
    ) {
      updateSetting(
        "customMaxCharsPerLine",
        limits[settings.textDensity as keyof DensityLimits],
      );
    }
    void handleSettingChange("textDensity", value);
  };

  const handleReplaceAll = () => {
    const expression = buildFindRegExp(query, caseSensitive, wholeWord);
    if (!expression) return;
    updateSubtitles(
      subtitles.map((subtitle) => ({
        ...subtitle,
        text: (subtitle.text ?? "").replace(expression, replaceValue),
      })),
    );
  };

  const handleReplace = () => {
    const expression = buildFindRegExp(query, caseSensitive, wholeWord);
    if (!expression) return;
    const singleMatch = new RegExp(
      expression.source,
      expression.ignoreCase ? "i" : "",
    );
    let replaced = false;
    updateSubtitles(
      subtitles.map((subtitle) => {
        if (replaced) return subtitle;
        const text = subtitle.text ?? "";
        const nextText = text.replace(singleMatch, replaceValue);
        if (nextText !== text) replaced = true;
        return { ...subtitle, text: nextText };
      }),
    );
  };

  const handleJumpToTime = React.useCallback(
    async (seconds: number) => {
      seekAudioPreview(seconds);
      if (selectedIntegration === "standalone") return;
      await jumpToTime(seconds);
    },
    [jumpToTime, seekAudioPreview, selectedIntegration],
  );

  const handleAddToTimeline = async (
    selectedOutputTrack: string,
    selectedTemplate: string,
    presetSettings?: Record<string, unknown>,
  ) => {
    try {
      if (!currentSubtitleDocumentFilename) return;
      await flushPendingSubtitleSave();
      setIsAdding(true);
      if (isAdobe) {
        await adobePush(currentSubtitleDocumentFilename);
      } else {
        await resolvePush(
          currentSubtitleDocumentFilename,
          selectedTemplate,
          selectedOutputTrack,
          presetSettings,
        );
      }
      setJustSent(true);
    } catch (error) {
      const { title, message, detail } = describeError(
        error,
        t("errorDialog.addToTimelineFailed", "Couldn't add subtitles to timeline"),
      );
      showError({
        title,
        message:
          error instanceof ResolveApiError && error.code === "clips_blocked"
            ? t("errorDialog.clipsBlocked")
            : message,
        detail,
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    await exportSubtitlesAs(format, subtitles, speakers);
  };

  const selectedStyle = resolveCaptionStyle(style, presets.getPreset);
  const formatLabel = `${t("redesign.transcript.lineCountSummary", {
    count: settings.maxLinesPerSubtitle,
  })} · ${t(`actionBar.format.textDensity.${settings.textDensity}`)}`;
  const title = sourceType === "standalone"
    ? t("actionBar.mode.fileInput")
    : sourceType === "premiere"
      ? t("titlebar.premiere.productName")
      : sourceType === "aftereffects"
        ? t("redesign.transcript.afterEffects")
        : t("titlebar.resolve.productName");

  const segmentGroups = groupTranscriptSegments(subtitles, speakers.length > 0);

  return (
    <div className="as-transcript-page as-transcript-root">
      <header className="as-transcript-heading">
        <div className="as-transcript-source">
          {sourceType === "standalone" ? (
            <FileAudio aria-hidden="true" />
          ) : sourceType === "premiere" ? (
            <img src="/premiere-logo.png" alt="" />
          ) : sourceType === "aftereffects" ? (
            <FileAudio aria-hidden="true" />
          ) : (
            <img src="/davinci-resolve-logo.png" alt="" />
          )}
          <span>{title}</span>
          {relative && <span className="as-transcript-date">{relative}</span>}
        </div>
        <h1 className="as-transcript-title">{sourceName}</h1>
        {metadata.length > 0 && <p className="as-transcript-meta">{metadata.join(" · ")}</p>}
      </header>

      <div className="as-transcript-toolbar">
        <SegmentedView value={view} onValueChange={setView} />
        {view === "subtitles" && (
          <Menu.Root open={formatOpen} onOpenChange={setFormatOpen}>
            <Menu.Trigger
              render={
                <button type="button" className="as-transcript-chip as-format-trigger" aria-label={t("actionBar.rows.format")}>
                  <Type />
                  <span>{formatLabel}</span>
                  <ChevronsUpDown />
                </button>
              }
            />
            <MenuPopup className="as-format-menu">
              <div className="as-menu-heading">{t("redesign.transcript.textPerSubtitle")}</div>
              <Menu.RadioGroup value={settings.textDensity} onValueChange={(value: string) => handleDensityChange(value as TextDensity)}>
                {DENSITIES.map((density) => (
                  <MenuRadioItem key={density} value={density} className="as-menu-radio">
                    <Check className="as-menu-check" />
                    <span>{t(`actionBar.format.textDensity.${density}`)}</span>
                    {density !== "single" && density !== "custom" && (
                      <span className="as-format-side-note">
                        {t("actionBar.density.charsShort", { count: limits[density] })}
                      </span>
                    )}
                    {density === "custom" && (
                      <span className="as-format-side-note">
                        {settings.customDensityUnit === "words"
                          ? settings.customMaxWordsPerLine
                          : settings.customMaxCharsPerLine}
                      </span>
                    )}
                  </MenuRadioItem>
                ))}
              </Menu.RadioGroup>
              <MenuSeparator />
              <div className="as-format-lines">
                <div>
                  <span>{t("actionBar.format.lineCountTitle")}</span>
                  <small>{t("actionBar.format.lineCountDescription")}</small>
                </div>
                <div className="as-stepper">
                  <Button
                    variant="icon"
                    aria-label={t("redesign.transcript.decreaseLines")}
                    disabled={settings.maxLinesPerSubtitle <= 1}
                    onClick={() => void handleSettingChange(
                      "maxLinesPerSubtitle",
                      Math.max(1, settings.maxLinesPerSubtitle - 1),
                    )}
                  >
                    <span aria-hidden="true">−</span>
                  </Button>
                  <span>{settings.maxLinesPerSubtitle}</span>
                  <Button
                    variant="icon"
                    aria-label={t("redesign.transcript.increaseLines")}
                    disabled={settings.maxLinesPerSubtitle >= 3}
                    onClick={() => void handleSettingChange(
                      "maxLinesPerSubtitle",
                      Math.min(3, settings.maxLinesPerSubtitle + 1),
                    )}
                  >
                    <span aria-hidden="true">+</span>
                  </Button>
                </div>
              </div>
              <MenuSeparator />
              <TextFormattingPanel
                hideDensity
                showCustomDensityLimit
                hideLineCount
                onSettingChange={handleSettingChange}
              />
              <p className="as-format-footer">{t("redesign.transcript.formatFootnote")}</p>
            </MenuPopup>
          </Menu.Root>
        )}
        {isResolve && (
          <button
            type="button"
            className="as-transcript-chip as-style-chip"
            onClick={onOpenStyles}
          >
            <Type />
            <span>{styleLabel}</span>
            <ChevronRight />
          </button>
        )}
        {speakers.length > 1 && (
          <Popover.Root>
            <Popover.Trigger
              render={
                <button type="button" className="as-transcript-chip as-speakers-trigger">
                  <span className="as-speaker-dots">
                    {speakers.slice(0, 4).map((speaker, index) => (
                      <span key={`${speaker.name}-${index}`} style={{ backgroundColor: speaker.color }} />
                    ))}
                  </span>
                  <span>{t("captions.speakerCount", { count: speakers.length })}</span>
                </button>
              }
            />
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="start" sideOffset={6}>
                <Popover.Popup className="as-speakers-popover">
                  {speakers.map((speaker, index) => (
                    <div key={`${speaker.name}-${index}`} className="as-speaker-settings-row">
                      <span className="as-speaker-row-dot" style={{ backgroundColor: speaker.color }} />
                      <SpeakerSettings
                        speaker={speaker}
                        onSpeakerChange={(updated) => {
                          const next = [...speakers];
                          next[index] = updated;
                          void updateSpeakers(next);
                        }}
                      />
                    </div>
                  ))}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
        <div className="as-transcript-toolbar-spacer" />
        <Button
          variant="icon"
          className="as-transcript-search-toggle"
          aria-label={t("subtitles.searchPlaceholder")}
          aria-pressed={searchOpen}
          onClick={() => setSearchOpen((open) => !open)}
        >
          {searchOpen ? <X /> : <Search />}
        </Button>
      </div>

      {searchOpen && (
        <div className="as-transcript-search-row">
          <div className="as-transcript-search-main">
            <Search />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("subtitles.searchPlaceholder")}
              aria-label={t("subtitles.searchPlaceholder")}
            />
            <span className="as-transcript-match-count">
              {t("redesign.transcript.matches", { count: matchCount })}
            </span>
            <button type="button" aria-pressed={caseSensitive} title={t("subtitles.search.caseMatch")} onClick={() => setCaseSensitive((value) => !value)}>Aa</button>
            <button type="button" aria-pressed={wholeWord} title={t("subtitles.search.wholeWord")} onClick={() => setWholeWord((value) => !value)}>W</button>
            <button type="button" aria-pressed={showReplace} title={t("subtitles.search.replaceAll")} onClick={() => setShowReplace((value) => !value)}>↔</button>
          </div>
          {showReplace && (
            <div className="as-transcript-replace-row">
              <Input
                value={replaceValue}
                onChange={(event) => setReplaceValue(event.target.value)}
                placeholder={t("subtitles.search.replaceWithPlaceholder")}
              />
              <Button variant="ghost" disabled={!query.trim()} onClick={handleReplace}>
                {t("subtitles.search.replace")}
              </Button>
              <Button variant="tone" disabled={!query.trim()} onClick={handleReplaceAll}>
                {t("subtitles.search.replaceAll")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="as-transcript-scroll">
        {view === "subtitles" ? (
          <SubtitleList
            className="as-subtitle-list"
            searchQuery={query}
            searchCaseSensitive={caseSensitive}
            searchWholeWord={wholeWord}
            onMatchCountChange={setMatchCount}
            onJumpToTime={handleJumpToTime}
          />
        ) : (
          <div className="as-original-transcript">
            {segmentGroups.map((group, index) => {
              const first = group.segments[0];
              const name = group.speakerId
                ? speakers[speakerIndex(group.speakerId, subtitles, speakers)]?.name
                : "";
              return (
                <section className="as-original-block" key={`${first?.start}-${index}`}>
                  {speakers.length > 0 && (
                    <div className="as-original-meta">
                      <span>{name || t("subtitles.unknownSpeaker")}</span>
                      <time>{formatTime(first?.start ?? 0)}</time>
                    </div>
                  )}
                  <p>{group.segments.map((segment) => segment.text.trim()).join(" ")}</p>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <footer className="as-action-bar">
        <div className="as-action-inner as-transcript-action-inner">
          <div className="as-transcript-action-left">
            {isResolve && connected && outputTracks.length > 0 && (
              <Menu.Root open={trackMenuOpen} onOpenChange={setTrackMenuOpen}>
                <Menu.Trigger
                  render={
                    <button
                      type="button"
                      className={`as-output-track as-track-trigger${conflictInfo?.hasConflicts ? " is-warning" : ""}`}
                    >
                      <Layers />
                      <span className="as-output-track-hint">{t("redesign.transcript.track")}</span>
                      <span className="as-output-track-label">{trackLabel || t("captions.track.none")}</span>
                      <ChevronsUpDown />
                    </button>
                  }
                />
                <MenuPopup className="as-track-menu">
                  <div className="as-menu-heading">{t("redesign.transcript.putOnTrack")}</div>
                  <Menu.RadioGroup
                    value={settings.selectedOutputTrack}
                    onValueChange={(value: string) => updateSetting("selectedOutputTrack", value)}
                  >
                    {outputTracks.map((track: Track) => (
                      <MenuRadioItem key={track.value} value={track.value} className="as-menu-radio">
                        <Check className="as-menu-check" />
                        <span>{track.label}</span>
                        {track.value === settings.selectedOutputTrack && conflictInfo?.hasConflicts && (
                          <span className="as-track-conflict">{t("redesign.transcript.hasClips")}</span>
                        )}
                      </MenuRadioItem>
                    ))}
                  </Menu.RadioGroup>
                </MenuPopup>
              </Menu.Root>
            )}
          </div>
          <div className="as-transcript-action-right">
            <ExportMenu
              hasSubtitles={hasSubtitles}
              primary={isStandalone || !connected}
              onExport={handleExport}
            />
            {connected && !isStandalone && (
              <Button
                variant="primary"
                className="as-send-button"
                disabled={isAdding || !hasSubtitles}
                onClick={() => {
                  if (needsTrackChoice) {
                    setTrackMenuOpen(true);
                    return;
                  }
                  if (needsStyleChoice) {
                    onOpenStyles();
                    return;
                  }
                  void handleAddToTimeline(
                    settings.selectedOutputTrack,
                    selectedStyle.templateName,
                    selectedStyle.presetSettings,
                  );
                }}
              >
                {isAdding ? (
                  <Loader2 className="animate-spin" />
                ) : justSent ? (
                  <Check />
                ) : null}
                <span className="as-send-full-label">
                  {isAdding
                    ? t("captions.send.adding")
                    : justSent
                      ? t("redesign.transcript.sent")
                      : needsTrackChoice
                        ? t("captions.chooseTrack")
                        : needsStyleChoice
                          ? t("captions.chooseStyle")
                          : isResolve
                            ? t("redesign.transcript.sendToResolve")
                            : selectedIntegration === "aftereffects"
                              ? t("redesign.transcript.sendToAfterEffects")
                              : t("redesign.transcript.sendToPremiere")}
                </span>
                <span className="as-send-compact-label">{t("redesign.transcript.send")}</span>
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function SegmentedView({
  value,
  onValueChange,
}: {
  value: "subtitles" | "original";
  onValueChange: (value: "subtitles" | "original") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="as-transcript-segmented" role="group" aria-label={t("redesign.transcript.view")}>
      {(["subtitles", "original"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onValueChange(option)}
        >
          {t(`redesign.transcript.${option}`)}
        </button>
      ))}
    </div>
  );
}

function ExportMenu({
  hasSubtitles,
  primary,
  onExport,
}: {
  hasSubtitles: boolean;
  primary: boolean;
  onExport: (format: ExportFormat) => Promise<void>;
}) {
  const { t } = useTranslation();
  if (!hasSubtitles) {
    return primary ? (
      <Button variant="tone" disabled>
        <Download />
        {t("importExport.exportTab")}
      </Button>
    ) : null;
  }
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant={primary ? "tone" : "ghost"}
            className={primary ? "as-export-primary" : "as-export-icon"}
            aria-label={t("importExport.exportTab")}
          >
            <Download />
            {primary && <span>{t("importExport.exportTab")}</span>}
          </Button>
        }
      />
      <MenuPopup className="as-export-menu">
        {EXPORT_FORMATS.map(({ format, icon: Icon, titleKey, descriptionKey }) => (
          <MenuItem key={format} onClick={() => void onExport(format)}>
            <Icon />
            <span className="as-export-menu-copy">
              <span>{t(titleKey)}</span>
              <small>{t(descriptionKey)}</small>
            </span>
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu.Root>
  );
}

interface CaptionStylePageProps {
  onBack: () => void;
  templates: {
    templates: Template[];
    loading: boolean;
    loaded: boolean;
    error: string | null;
    refresh: () => void;
  };
}

export function CaptionStylePage({ onBack, templates }: CaptionStylePageProps) {
  const { t } = useTranslation();
  const { timelineInfo } = useResolve();
  const { selectedIntegration } = useIntegration();
  const { currentSubtitleDocumentFilename } = useSubtitleDocument();
  const presets = useCaptionPresets();
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const captionStyle = useSettingsStore((state) => state.captionStyle);
  const connected = selectedIntegration === "davinci" && Boolean(timelineInfo?.timelineId);
  const [editing, setEditing] = React.useState<{ preset: CaptionPreset | null } | null>(null);
  const [deleting, setDeleting] = React.useState<CaptionPreset | null>(null);
  const [applying, setApplying] = React.useState(false);

  async function importPreset() {
    try {
      const file = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!file) return;
      await presets.importJson(await readTextFile(file as string));
      toast.success(t("captions.preset.import"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("captions.preset.errors.invalidJson"));
    }
  }

  async function exportPreset(preset: CaptionPreset) {
    try {
      const path = await save({
        defaultPath: `${await downloadDir()}/${preset.name.replace(/[^a-z0-9-_]+/gi, "-")}.autosubs-preset.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await writeTextFile(path, presets.exportJson(preset.id));
      toast.success(t("captions.preset.export"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("captions.preset.export"));
    }
  }

  async function applyStyles() {
    if (!currentSubtitleDocumentFilename) return;
    const resolved = resolveCaptionStyle(captionStyle, presets.getPreset);
    setApplying(true);
    try {
      const result = await applyStylesToTimeline(
        currentSubtitleDocumentFilename,
        undefined,
        resolved.presetSettings,
      );
      if (result.matched === 0) {
        toast.warning(t("captions.batchStyle.noMatches"));
      } else if (result.failed > 0) {
        toast.warning(t("captions.batchStyle.partial", {
          updated: result.updated,
          failed: result.failed,
        }));
      } else {
        toast.success(t("captions.batchStyle.success", { count: result.updated }));
      }
    } catch (error) {
      toast.error(t("captions.batchStyle.failed"));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="as-styles-page">
      {editing ? (
        <div className="as-styles-editor">
          <FusionPresetEditor preset={editing.preset} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <>
          <header className="as-styles-heading">
            <button type="button" className="as-back-link" onClick={onBack}>
              <ChevronLeft />
              {t("redesign.styles.backTranscript")}
            </button>
            <h1 className="as-content-title">{t("redesign.styles.title")}</h1>
            <p className="as-page-meta">
              {t("redesign.styles.meta", {
                timeline: timelineInfo?.name || t("captions.errors.notConnected"),
              })}
            </p>
          </header>
          <div className="as-styles-scroll">
            <section className="as-style-section">
              <div className="as-style-section-heading">
                <h2>{t("redesign.styles.autoSubs")}</h2>
                <button type="button" className="as-link" onClick={() => void importPreset()}>
                  <FileUp />
                  {t("redesign.styles.importPreset")}
                </button>
              </div>
              <div className="as-style-grid">
                {presets.presets.map((preset) => {
                  const selected =
                    captionStyle.source === "autosubs" &&
                    captionStyle.presetId === preset.id;
                  return (
                    <div
                      className={`as-style-card${selected ? " is-selected" : ""}`}
                      key={preset.id}
                    >
                      <button
                        type="button"
                        className="as-style-card-select"
                        onClick={() => presets.select(preset.id)}
                        aria-pressed={selected}
                      >
                        <PresetThumbnail
                          preset={preset}
                          selected={selected}
                          className="as-style-thumbnail"
                        />
                        <span className="as-style-card-name">{preset.name}</span>
                        <span className="as-style-animated">{t("redesign.styles.animated")}</span>
                      </button>
                      {selected && <span className="as-style-check"><Check /></span>}
                      <Menu.Root>
                        <Menu.Trigger
                          render={
                            <button
                              type="button"
                              className="as-style-more"
                              aria-label={t("captions.preset.moreActions")}
                            >
                              <MoreHorizontal />
                            </button>
                          }
                        />
                        <MenuPopup>
                          <MenuItem onClick={() => setEditing({ preset })} disabled={!connected || preset.builtIn}>
                            {t("redesign.styles.editFusion")}
                          </MenuItem>
                          <MenuItem onClick={() => void presets.duplicate(preset)}>
                            {t("captions.preset.duplicate")}
                          </MenuItem>
                          <MenuItem onClick={() => void exportPreset(preset)}>
                            {t("captions.preset.export")}
                          </MenuItem>
                          <MenuItem onClick={() => void presets.renderPreview(preset)} disabled={!connected}>
                            {t("captions.preset.preview")}
                          </MenuItem>
                          {!preset.builtIn && (
                            <MenuItem onClick={() => setDeleting(preset)}>
                              {t("captions.preset.delete")}
                            </MenuItem>
                          )}
                        </MenuPopup>
                      </Menu.Root>
                      {presets.renderingPreviewId === preset.id && (
                        <span className="as-style-rendering"><Loader2 className="animate-spin" /></span>
                      )}
                    </div>
                  );
                })}
              </div>
              {!connected && <p className="as-style-note">{t("captions.preset.needsResolve")}</p>}
            </section>
            <section className="as-style-section">
              <div className="as-style-section-heading">
                <h2>{t("redesign.styles.mediaPool")}</h2>
                <button
                  type="button"
                  className="as-refresh-button"
                  aria-label={t("redesign.styles.refreshTemplates")}
                  title={t("redesign.styles.refreshTemplates")}
                  onClick={templates.refresh}
                >
                  <RefreshCw />
                </button>
              </div>
              {templates.loading && <p className="as-style-note">{t("captions.templates.loading")}</p>}
              {templates.error && <p className="as-style-note as-style-error">{templates.error}</p>}
              {!templates.loading && templates.loaded && templates.templates.length === 0 && (
                <p className="as-style-note">{t("captions.templates.empty")}</p>
              )}
              {templates.templates.length > 0 && (
                <div className="as-style-grid">
                  {templates.templates.map((template) => {
                    const selected =
                      captionStyle.source === "resolve" &&
                      captionStyle.templateName === template.value;
                    return (
                      <button
                        type="button"
                        className={`as-style-card as-template-card${selected ? " is-selected" : ""}`}
                        key={template.value}
                        onClick={() => updateSetting("captionStyle", {
                          source: "resolve",
                          templateName: template.value,
                        })}
                        aria-pressed={selected}
                      >
                        <span className="as-template-thumbnail">{template.label}</span>
                        <span className="as-style-card-name">{template.label}</span>
                        {selected && <span className="as-style-check"><Check /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <footer className="as-styles-footer">
            <Button
              variant="tone"
              disabled={!connected || applying || !currentSubtitleDocumentFilename}
              onClick={() => void applyStyles()}
            >
              {applying && <Loader2 className="animate-spin" />}
              {t("redesign.styles.apply")}
            </Button>
          </footer>
          {deleting && (
            <div className="as-delete-overlay" role="dialog" aria-modal="true">
              <div className="as-delete-dialog">
                <h2>{t("captions.preset.confirmDeleteTitle")}</h2>
                <p>{t("captions.preset.confirmDelete")}</p>
                <div>
                  <Button variant="ghost" onClick={() => setDeleting(null)}>
                    {t("captions.preset.action.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      void presets.remove(deleting.id);
                      setDeleting(null);
                    }}
                  >
                    {t("captions.preset.confirmDeleteConfirm")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
