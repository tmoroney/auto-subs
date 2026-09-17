import * as React from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Loader,
  Pencil,
  RefreshCw,
  Send,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { OutputSheet } from "@/components/captions/output-sheet";
import { FusionPresetEditor } from "@/components/captions/fusion-preset-editor";
import { useCaptionPresets } from "@/components/captions/use-caption-presets";
import { useResolveTemplates } from "@/components/captions/use-resolve-templates";
import {
  applyStylesToTimeline,
  checkTrackConflicts,
  type ConflictInfo,
} from "@/api/resolve-api";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useSettingsStore } from "@/stores/settings-store";
import {
  OUTPUT_SHEET_ANIMATION_MS,
  useOutputPanelStore,
} from "@/stores/output-panel-store";
import { ExportPopover, type ExportFormat } from "@/components/common/export-popover";
import {
  describeCaptionStyle,
  isStyleAvailable,
  resolveCaptionStyle,
} from "@/lib/caption-style";
import type { CaptionPreset, Speaker, TimelineInfo } from "@/types";
import { cn } from "@/lib/utils";

interface OutputPanelProps {
  timelineInfo?: TimelineInfo;
  isConnected: boolean;
  onAddToTimeline: (
    selectedOutputTrack: string,
    templateName: string,
    presetSettings?: Record<string, unknown>,
  ) => Promise<void>;
  onExport: (format: ExportFormat) => Promise<void>;
  isAdding: boolean;
  /** True once a send has completed for the current transcript. */
  justSent: boolean;
  /**
   * The transcript region. It is passed in rather than rendered as a sibling
   * so the sheet can sit on top of it as a real overlay, which keeps the
   * transcript mounted and stops the two fighting over the same flex space.
   */
  children?: React.ReactNode;
}

/**
 * Bottom-anchored output configuration. Renders as two pieces: the sheet
 * (only while expanded), and the always-visible summary bar plus primary
 * action.
 *
 * The summary bar is the whole reason this works: it states what pressing the
 * button will do, so the button can commit immediately instead of opening a
 * confirmation step.
 */
export function OutputPanel({
  timelineInfo,
  isConnected,
  onAddToTimeline,
  onExport,
  isAdding,
  justSent,
  children,
}: OutputPanelProps) {
  const { t } = useTranslation();
  const { selectedIntegration } = useIntegration();

  // Caption styles are a Resolve feature. Gating on the chosen integration
  // rather than on a live connection means Resolve users keep the section when
  // Resolve happens to be closed, and Adobe users never see a control they
  // cannot use.
  const isResolve = selectedIntegration === "davinci";
  const isStandalone = selectedIntegration === "standalone";

  // Standalone has no editor to send to: it is always "disconnected" for
  // output purposes, which hides the send button and the summary row while
  // leaving file export available.
  const editorConnected = isConnected && !isStandalone;

  const { subtitles, speakers, updateSpeakers, currentSubtitleDocumentFilename } =
    useSubtitleDocument();

  const { captionStyle, selectedOutputTrack } = useSettingsStore(
    useShallow((s) => ({
      captionStyle: s.captionStyle,
      selectedOutputTrack: s.selectedOutputTrack,
    })),
  );

  const {
    expanded,
    closing,
    focusSection,
    open,
    requestClose,
    finishClose,
    toggle,
    clearFocusSection,
  } = useOutputPanelStore(
    useShallow((s) => ({
      expanded: s.expanded,
      closing: s.closing,
      focusSection: s.focusSection,
      open: s.open,
      requestClose: s.requestClose,
      finishClose: s.finishClose,
      toggle: s.toggle,
      clearFocusSection: s.clearFocusSection,
    })),
  );

  const presets = useCaptionPresets();
  const templates = useResolveTemplates(expanded && isResolve);

  // `null` is a valid value here (create from macro defaults), so the session
  // is a tagged state rather than a nullable preset.
  const [editing, setEditing] = React.useState<
    { preset: CaptionPreset | null } | null
  >(null);
  const [conflictInfo, setConflictInfo] = React.useState<ConflictInfo | null>(null);
  const [isApplyingStyles, setIsApplyingStyles] = React.useState(false);

  // Tear the sheet down only after its exit animation has run. `expanded`
  // stays true throughout, which is what keeps the transcript from popping in
  // behind the sheet mid-slide.
  React.useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(finishClose, OUTPUT_SHEET_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [closing, finishClose]);

  // An edit session puts a clip on the user's timeline, so it must not outlive
  // the surface that owns it: collapsing the sheet or losing the editor both
  // end it. The editor itself handles telling Resolve.
  React.useEffect(() => {
    if (!expanded || !editorConnected) setEditing(null);
  }, [expanded, editorConnected]);

  // ── Conflict check ──────────────────────────────────────────────────────
  // Runs whether or not the sheet is open: the warning belongs in the summary
  // row so it is read *before* the send button is pressed.
  const shouldCheckConflicts =
    editorConnected && isResolve && !!currentSubtitleDocumentFilename && !!selectedOutputTrack;

  React.useEffect(() => {
    if (!shouldCheckConflicts) {
      setConflictInfo(null);
      return;
    }
    let cancelled = false;
    checkTrackConflicts(currentSubtitleDocumentFilename!, selectedOutputTrack)
      .then((info) => {
        if (!cancelled) setConflictInfo(info);
      })
      .catch((err) => {
        console.warn("Track conflict check failed:", err);
        if (!cancelled) setConflictInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldCheckConflicts, currentSubtitleDocumentFilename, selectedOutputTrack]);

  // ── Derived state ───────────────────────────────────────────────────────
  const outputTracks = timelineInfo?.outputTracks ?? [];
  const hasSubtitles = subtitles.length > 0;

  const trackLabel =
    outputTracks.find((track) => track.value === selectedOutputTrack)?.label ?? "";

  const styleLabel = describeCaptionStyle(
    captionStyle,
    presets.getPreset,
    t("captions.style.unavailable"),
  );

  const styleIsAvailable = isStyleAvailable(
    captionStyle,
    presets.presets,
    templates.templates,
    templates.loaded,
  );

  // A saved track can disappear when the user switches timeline. Sending blind
  // in that case would drop subtitles somewhere unexpected.
  const trackIsValid =
    outputTracks.length === 0 ||
    outputTracks.some((track) => track.value === selectedOutputTrack);

  const needsTrackChoice = !trackIsValid;
  const needsStyleChoice = isResolve && !styleIsAvailable;

  const summaryParts: string[] = [];
  if (!isResolve && !isStandalone) {
    summaryParts.push(
      selectedIntegration === "aftereffects" ? "After Effects" : "Premiere Pro",
    );
  } else {
    summaryParts.push(trackLabel || t("captions.track.none"));
    summaryParts.push(styleLabel);
  }
  if (speakers.length > 1) {
    summaryParts.push(t("captions.speakerCount", { count: speakers.length }));
  }

  const showWarning = Boolean(conflictInfo?.hasConflicts) || needsStyleChoice;

  // ── Actions ─────────────────────────────────────────────────────────────
  function handleToggle() {
    if (expanded) setEditing(null);
    toggle();
  }

  async function handlePrimaryAction() {
    // The only cases where the button navigates instead of committing: it
    // cannot do its job until these are resolved, and the label says so.
    if (needsTrackChoice) {
      open("track");
      return;
    }
    if (needsStyleChoice) {
      open("style");
      return;
    }

    const { templateName, presetSettings } = resolveCaptionStyle(
      captionStyle,
      presets.getPreset,
    );

    requestClose();
    onAddToTimeline(selectedOutputTrack, templateName, presetSettings).catch((err) => {
      console.error("Failed to add to timeline:", err);
    });
  }

  async function handleApplyStyles() {
    if (!currentSubtitleDocumentFilename) return;

    const { presetSettings } = resolveCaptionStyle(captionStyle, presets.getPreset);

    setIsApplyingStyles(true);
    try {
      const result = await applyStylesToTimeline(
        currentSubtitleDocumentFilename,
        undefined,
        presetSettings,
      );

      if (result.matched === 0) {
        toast.warning(t("captions.batchStyle.noMatches"));
      } else if (result.failed > 0) {
        toast.warning(
          t("captions.batchStyle.partial", {
            updated: result.updated,
            failed: result.failed,
          }),
        );
      } else {
        toast.success(t("captions.batchStyle.success", { count: result.updated }));
      }
    } catch (err) {
      console.error("Failed to update timeline styles:", err);
      toast.error(t("captions.batchStyle.failed"));
    } finally {
      setIsApplyingStyles(false);
    }
  }

  function handleSpeakerChange(index: number, updated: Speaker) {
    const next = [...speakers];
    next[index] = updated;
    updateSpeakers(next);
  }

  // ── Primary action label ────────────────────────────────────────────────
  const actionDisabled = isAdding || !hasSubtitles;

  let actionLabel: React.ReactNode;
  if (isAdding) {
    actionLabel = (
      <>
        <Loader className="size-4 animate-spin will-change-transform" />
        {t("captions.send.adding")}
      </>
    );
  } else if (!hasSubtitles) {
    actionLabel = t("captions.noSubtitles");
  } else if (needsTrackChoice) {
    actionLabel = t("captions.chooseTrack");
  } else if (needsStyleChoice) {
    actionLabel = t("captions.chooseStyle");
  } else if (justSent) {
    // Sending is cheap to repeat and cheap to undo, so confirm what happened
    // and stay ready rather than locking the button.
    actionLabel = (
      <>
        <Check className="size-4" />
        {t("captions.sentAgain")}
      </>
    );
  } else {
    actionLabel = (
      <>
        <Send className="size-4" />
        {t("subtitles.addToTimeline")}
      </>
    );
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {children}
        {expanded &&
          (editing ? (
            <div className="absolute inset-0 z-10 overflow-y-auto bg-background px-4 py-3">
              <FusionPresetEditor
                preset={editing.preset}
                onDone={() => setEditing(null)}
              />
            </div>
          ) : (
            <OutputSheet
              closing={closing}
              isConnected={editorConnected}
              showCaptionStyle={isResolve && !isStandalone}
              focusSection={focusSection}
              onFocusHandled={clearFocusSection}
              onBack={handleToggle}
              outputTracks={outputTracks}
              conflictInfo={conflictInfo}
              speakers={speakers}
              onSpeakerChange={handleSpeakerChange}
              captionStyle={captionStyle}
              presets={presets}
              templates={templates}
              onEditPreset={(preset) => setEditing({ preset })}
            />
          ))}
      </div>

      {/* Summary + primary action. Hidden while the preset editor owns the
          screen so its own Cancel/Save buttons are the only way out. */}
      {!editing && (
        <div className="shrink-0 border-t bg-card">
          {/* Without an editor there is nothing to summarise; the row is only
              kept so an expanded sheet still has a way to collapse. */}
          {editorConnected && (!expanded || closing) && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={handleToggle}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                  showWarning
                    ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15"
                    : "border-border bg-muted/40 hover:bg-muted/70",
                )}
              >
                {showWarning && (
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left",
                    showWarning
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  {summaryParts.join(" · ")}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  <Pencil className="size-3.5" />
                </span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 p-3">
            {editorConnected && isResolve && expanded && !closing && (
              <Button
                type="button"
                variant="outline"
                className="min-w-44 flex-[1_1_11rem]"
                disabled={
                  isApplyingStyles || !hasSubtitles || !currentSubtitleDocumentFilename
                }
                onClick={handleApplyStyles}
              >
                {isApplyingStyles ? (
                  <Loader className="size-4 animate-spin will-change-transform" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {isApplyingStyles
                  ? t("captions.batchStyle.updating")
                  : t("captions.batchStyle.applyAll")}
              </Button>
            )}
            {/* Send and export are one unit: the wrap boundary falls before
                this group, so the export icon can never end up alone on its
                own line. */}
            <div className="flex flex-[1_1_12rem] justify-end gap-2">
              {editorConnected && (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-w-36 flex-1"
                  disabled={actionDisabled}
                  onClick={handlePrimaryAction}
                >
                  {actionLabel}
                </Button>
              )}
              <ExportPopover
                onExport={onExport}
                hasSubtitles={hasSubtitles}
                trigger={
                  editorConnected ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      title={t("importExport.exportTab")}
                    >
                      <Download />
                    </Button>
                  ) : (
                    <Button variant="secondary" size="default" className="w-full">
                      <Download className="size-4" />
                      {t("importExport.exportTab")}
                    </Button>
                  )
                }
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
