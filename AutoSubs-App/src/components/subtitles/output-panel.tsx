import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Loader,
  Send,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpeakerChips } from "@/components/subtitles/speaker-chips";
import {
  ANIMATED_CAPTION_TEMPLATE,
  CaptionTemplateSelectionContent,
  type CreatePresetSession,
  type CreatePresetSubmit,
} from "@/components/dialogs/caption-style/template-selection";
import { cancelPresetEdit, checkTrackConflicts, type ConflictInfo } from "@/api/resolve-api";
import { usePresets, DEFAULT_PRESET_ID } from "@/contexts/PresetsContext";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useSettingsStore } from "@/stores/settings-store";
import {
  useOutputPanelStore,
  type OutputSection,
} from "@/stores/output-panel-store";
import { ExportPopover, type ExportFormat } from "@/components/common/export-popover";
import type { Speaker, Template, TimelineInfo } from "@/types";
import { cn } from "@/lib/utils";

interface OutputPanelProps {
  timelineInfo?: TimelineInfo;
  isConnected: boolean;
  selectedIntegration?: "davinci" | "premiere" | "aftereffects";
  templates: Template[];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  onLoadTemplates?: () => Promise<Template[]>;
  onAddToTimeline: (
    selectedOutputTrack: string,
    selectedTemplate: string,
    presetSettings?: Record<string, unknown>,
  ) => Promise<void>;
  onExport: (format: ExportFormat) => Promise<void>;
  isAdding: boolean;
  /** True once a send has completed for the current transcript. */
  justSent: boolean;
}

/**
 * Bottom-anchored output configuration. Renders as two pieces:
 *
 *  - the sheet (only while expanded), which the viewer places in the region
 *    the transcript normally occupies so it gets the full panel height;
 *  - the summary bar + primary action, which is always visible.
 *
 * The summary bar is the whole reason this works: it states what pressing the
 * button will do, so the button can commit immediately instead of opening a
 * confirmation step.
 */
export function OutputPanel({
  timelineInfo,
  isConnected,
  selectedIntegration,
  templates,
  templatesLoading,
  templatesLoaded,
  onLoadTemplates,
  onAddToTimeline,
  onExport,
  isAdding,
  justSent,
}: OutputPanelProps) {
  const { t } = useTranslation();
  const isAdobe =
    selectedIntegration === "premiere" || selectedIntegration === "aftereffects";

  const { subtitles, speakers, updateSpeakers, currentSubtitleDocumentFilename } =
    useSubtitleDocument();

  const {
    selectedTemplate,
    presetId,
    selectedOutputTrack,
    captionMode,
    updateSetting,
  } = useSettingsStore(
    useShallow((s) => ({
      selectedTemplate: s.selectedTemplate,
      presetId: s.presetId,
      selectedOutputTrack: s.selectedOutputTrack,
      captionMode: s.captionMode,
      updateSetting: s.updateSetting,
    })),
  );

  const {
    presets,
    getPreset,
    createPreset,
    updatePreset,
    deletePreset,
    importPreset,
    exportPreset,
  } = usePresets();

  const { expanded, focusSection, open, close, toggle, clearFocusSection } =
    useOutputPanelStore(
      useShallow((s) => ({
        expanded: s.expanded,
        focusSection: s.focusSection,
        open: s.open,
        close: s.close,
        toggle: s.toggle,
        clearFocusSection: s.clearFocusSection,
      })),
    );

  const [createSession, setCreateSession] = React.useState<CreatePresetSession>({
    kind: "closed",
  });
  const [conflictInfo, setConflictInfo] = React.useState<ConflictInfo | null>(null);
  const [templateLoadError, setTemplateLoadError] = React.useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = React.useState(false);

  const outputTracks = timelineInfo?.outputTracks ?? [];
  const hasSubtitles = subtitles.length > 0;

  // ── Preset-edit teardown ────────────────────────────────────────────────
  // A preset edit session drops a temporary track into Resolve, so it must be
  // cancelled whenever the sheet goes away — collapsing, the viewer closing
  // (unmount), or the editor disconnecting. The dialog this replaced could
  // rely on a single close event; a sheet has several exits, so we track the
  // session in a ref and tear down from one place.
  const createSessionRef = React.useRef(createSession);
  createSessionRef.current = createSession;

  const endPresetSession = React.useCallback(() => {
    if (createSessionRef.current.kind === "closed") return;
    cancelPresetEdit().catch(() => {});
    setCreateSession({ kind: "closed" });
  }, []);

  React.useEffect(() => endPresetSession, [endPresetSession]);

  React.useEffect(() => {
    if (!expanded || !isConnected) endPresetSession();
  }, [expanded, isConnected, endPresetSession]);

  // ── Template loading ────────────────────────────────────────────────────
  const shouldLoadTemplates =
    expanded &&
    !isAdobe &&
    !templatesLoaded &&
    !templatesLoading &&
    !!onLoadTemplates;

  React.useEffect(() => {
    if (!shouldLoadTemplates) return;
    let cancelled = false;

    if (!timelineInfo?.timelineId) {
      setTemplateLoadError(t("output.errors.notConnected"));
      setLoadingTimedOut(true);
      return;
    }

    setTemplateLoadError(null);
    setLoadingTimedOut(false);

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setLoadingTimedOut(true);
      setTemplateLoadError(t("output.errors.timedOut"));
    }, 15000);

    onLoadTemplates?.().catch((err) => {
      if (cancelled) return;
      clearTimeout(timeoutId);
      setTemplateLoadError(err instanceof Error ? err.message : String(err));
      setLoadingTimedOut(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [shouldLoadTemplates, onLoadTemplates, timelineInfo?.timelineId, t]);

  // ── Conflict check ──────────────────────────────────────────────────────
  // Runs whether or not the sheet is open: the warning belongs in the summary
  // row so it is read *before* the send button is pressed.
  const shouldCheckConflicts =
    isConnected &&
    !isAdobe &&
    !!currentSubtitleDocumentFilename &&
    !!selectedOutputTrack;

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
  const hasAnimatedTemplate = templates.some(
    (tpl) => tpl.value === ANIMATED_CAPTION_TEMPLATE,
  );
  const effectiveTemplatesLoading = templatesLoading && !loadingTimedOut;

  const trackLabel =
    outputTracks.find((track) => track.value === selectedOutputTrack)?.label ?? "";

  const styleLabel =
    captionMode === "animated"
      ? (getPreset(presetId)?.name ?? t("addToTimeline.mode.animated"))
      : selectedTemplate.label;

  // A saved track can disappear when the user switches timeline. Sending
  // blind in that case would drop subtitles somewhere unexpected.
  const trackIsValid =
    isAdobe ||
    outputTracks.length === 0 ||
    outputTracks.some((track) => track.value === selectedOutputTrack);

  const needsTrackChoice = !trackIsValid;

  const summaryParts: string[] = [];
  if (isAdobe) {
    summaryParts.push(
      selectedIntegration === "aftereffects" ? "After Effects" : "Premiere Pro",
    );
  } else {
    summaryParts.push(trackLabel || t("output.track.none"));
    summaryParts.push(styleLabel);
  }
  if (speakers.length > 1) {
    summaryParts.push(t("output.speakerCount", { count: speakers.length }));
  }

  const showConflictWarning = Boolean(conflictInfo?.hasConflicts);

  // ── Actions ─────────────────────────────────────────────────────────────
  function handleToggle() {
    if (expanded) endPresetSession();
    toggle();
  }

  const handleSubmitPreset: CreatePresetSubmit = async ({
    name,
    description,
    macroSettings,
  }) => {
    try {
      if (createSession.kind === "edit") {
        await updatePreset(createSession.presetId, { name, description, macroSettings });
        updateSetting("presetId", createSession.presetId);
      } else {
        const created = await createPreset(name, macroSettings, description);
        updateSetting("presetId", created.id);
      }
      updateSetting("captionMode", "animated");
      setCreateSession({ kind: "closed" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save preset");
    }
  };

  async function handleDuplicatePreset(id: string) {
    const preset = getPreset(id);
    if (!preset) return;
    const copy = await createPreset(
      `${preset.name} copy`,
      preset.macroSettings,
      preset.description,
    );
    updateSetting("presetId", copy.id);
  }

  function handleSpeakerChange(index: number, updated: Speaker) {
    const next = [...speakers];
    next[index] = updated;
    updateSpeakers(next);
  }

  async function handlePrimaryAction() {
    // The only case where the button navigates instead of committing: it
    // cannot do its job until a valid track is picked, and the label says so.
    if (needsTrackChoice) {
      open("track");
      return;
    }

    const templateName =
      captionMode === "animated" ? ANIMATED_CAPTION_TEMPLATE : selectedTemplate.value;
    const presetSettings =
      captionMode === "animated" ? getPreset(presetId)?.macroSettings : undefined;

    close();
    onAddToTimeline(selectedOutputTrack, templateName, presetSettings).catch((err) => {
      console.error("Failed to add to timeline:", err);
    });
  }

  const actionDisabled = isAdding || !hasSubtitles;

  let actionLabel: React.ReactNode;
  if (isAdding) {
    actionLabel = (
      <>
        <Loader className="size-4 animate-spin will-change-transform" />
        {t("addToTimeline.adding")}
      </>
    );
  } else if (!hasSubtitles) {
    actionLabel = t("output.noSubtitles");
  } else if (needsTrackChoice) {
    actionLabel = t("output.chooseTrack");
  } else if (justSent) {
    // Sending is cheap to repeat and cheap to undo, so confirm what happened
    // and stay ready rather than locking the button.
    actionLabel = (
      <>
        <Check className="size-4" />
        {t("output.sentAgain")}
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
      {expanded && (
        <OutputSheet
          isConnected={isConnected}
          isAdobe={isAdobe}
          focusSection={focusSection}
          onFocusHandled={clearFocusSection}
          outputTracks={outputTracks}
          selectedOutputTrack={selectedOutputTrack}
          onOutputTrackChange={(value) => updateSetting("selectedOutputTrack", value)}
          conflictInfo={conflictInfo}
          captionMode={captionMode}
          onCaptionModeChange={(mode) => updateSetting("captionMode", mode)}
          selectedTemplate={selectedTemplate}
          onTemplateChange={(value) => {
            const matched = templates.find((tpl) => tpl.value === value);
            if (matched) updateSetting("selectedTemplate", matched);
            updateSetting("captionMode", "regular");
          }}
          templates={templates}
          templatesLoading={effectiveTemplatesLoading}
          templatesLoaded={templatesLoaded}
          templateLoadError={templateLoadError}
          presetId={presetId || DEFAULT_PRESET_ID}
          onPresetChange={(id) => {
            updateSetting("presetId", id);
            updateSetting("captionMode", "animated");
          }}
          presets={presets}
          createSession={createSession}
          onRequestCreate={() => setCreateSession({ kind: "create" })}
          onRequestEdit={(id) => setCreateSession({ kind: "edit", presetId: id })}
          onCreateFlowExit={() => setCreateSession({ kind: "closed" })}
          onSubmitPreset={handleSubmitPreset}
          editingPreset={
            createSession.kind === "edit" ? getPreset(createSession.presetId) : undefined
          }
          onDeletePreset={deletePreset}
          onDuplicatePreset={handleDuplicatePreset}
          onImportPreset={async (json) => {
            const imported = await importPreset(json);
            updateSetting("presetId", imported.id);
            updateSetting("captionMode", "animated");
            return imported;
          }}
          onExportPreset={exportPreset}
          hasAnimatedTemplate={hasAnimatedTemplate}
          speakers={speakers}
          onSpeakerChange={handleSpeakerChange}
        />
      )}

      {/* Summary + primary action. Hidden while a preset edit owns the screen
          so its own Cancel/Save buttons are the only way out. */}
      {createSession.kind === "closed" && (
        <div className="shrink-0 border-t bg-card">
          {/* Without an editor there is nothing to summarise; the row is only
              kept so an expanded sheet still has a way to collapse. */}
          {(isConnected || expanded) && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={handleToggle}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                  showConflictWarning
                    ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15"
                    : "border-border bg-muted/40 hover:bg-muted/70",
                )}
              >
                {showConflictWarning && (
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left",
                    showConflictWarning
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  {isConnected ? summaryParts.join(" · ") : t("output.notConnected")}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {expanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronUp className="size-3.5" />
                  )}
                </span>
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 p-3">
            {isConnected && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
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
                isConnected ? (
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
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Sheet
// ----------------------------------------------------------------------------

interface OutputSheetProps {
  isConnected: boolean;
  isAdobe: boolean;
  focusSection: OutputSection | null;
  onFocusHandled: () => void;
  outputTracks: TimelineInfo["outputTracks"];
  selectedOutputTrack: string;
  onOutputTrackChange: (value: string) => void;
  conflictInfo: ConflictInfo | null;
  captionMode: "regular" | "animated";
  onCaptionModeChange: (mode: "regular" | "animated") => void;
  selectedTemplate: Template;
  onTemplateChange: (value: string) => void;
  templates: Template[];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  templateLoadError: string | null;
  presetId: string;
  onPresetChange: (id: string) => void;
  presets: ReturnType<typeof usePresets>["presets"];
  createSession: CreatePresetSession;
  onRequestCreate: () => void;
  onRequestEdit: (presetId: string) => void;
  onCreateFlowExit: () => void;
  onSubmitPreset: CreatePresetSubmit;
  editingPreset?: ReturnType<ReturnType<typeof usePresets>["getPreset"]>;
  onDeletePreset: (id: string) => Promise<void> | void;
  onDuplicatePreset: (id: string) => Promise<void> | void;
  onImportPreset: (json: string) => Promise<any>;
  onExportPreset: (id: string) => string;
  hasAnimatedTemplate: boolean;
  speakers: Speaker[];
  onSpeakerChange: (index: number, speaker: Speaker) => void;
}

function OutputSheet(props: OutputSheetProps) {
  const { t } = useTranslation();
  const {
    isConnected,
    isAdobe,
    focusSection,
    onFocusHandled,
    createSession,
    speakers,
  } = props;

  const trackRef = React.useRef<HTMLDivElement>(null);
  const styleRef = React.useRef<HTMLDivElement>(null);
  const speakersRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!focusSection) return;
    const target =
      focusSection === "track"
        ? trackRef.current
        : focusSection === "style"
          ? styleRef.current
          : focusSection === "speakers"
            ? speakersRef.current
            : null;
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    onFocusHandled();
  }, [focusSection, onFocusHandled]);

  // The preset editor needs the whole sheet — it has its own action buttons.
  if (createSession.kind !== "closed") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <CaptionTemplateSelectionContent
          mode="animated"
          onModeChange={() => {}}
          templateValue={props.selectedTemplate.value}
          onTemplateChange={props.onTemplateChange}
          templates={props.templates}
          templatesLoading={props.templatesLoading}
          templatesLoaded={props.templatesLoaded}
          templateLoadError={props.templateLoadError}
          presetId={props.presetId}
          onPresetChange={props.onPresetChange}
          animatedPresets={props.presets}
          createSession={createSession}
          onRequestCreate={props.onRequestCreate}
          onRequestEdit={(p) => props.onRequestEdit(p.id)}
          onCreateFlowExit={props.onCreateFlowExit}
          onSubmitPreset={props.onSubmitPreset}
          editingInitialSettings={props.editingPreset?.macroSettings}
          editingInitialName={props.editingPreset?.name}
          editingInitialDescription={props.editingPreset?.description}
          onDeletePreset={props.onDeletePreset}
          onDuplicatePreset={(p) => props.onDuplicatePreset(p.id)}
          onImportPreset={props.onImportPreset}
          onExportPreset={props.onExportPreset}
          hasAnimatedTemplate={props.hasAnimatedTemplate}
        />
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 px-4 pb-4 pt-1">
        {!isConnected && (
          <p className="px-1 text-xs text-muted-foreground">
            {t("output.notConnected")}
          </p>
        )}

        {!isAdobe && (
          <section ref={trackRef} className="space-y-1.5">
            <Label className="pl-1 text-xs text-muted-foreground">
              {t("output.track.label")}
            </Label>
            <Select
              value={props.selectedOutputTrack}
              onValueChange={props.onOutputTrackChange}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={t("output.track.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {props.outputTracks.map((track) => (
                  <SelectItem key={track.value} value={track.value}>
                    {track.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {props.conflictInfo?.hasConflicts && (
              <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="pl-1">{t("addToTimeline.conflict.hasConflicts")}</span>
              </div>
            )}
          </section>
        )}

        {speakers.length > 1 && (
          <section ref={speakersRef} className="space-y-1.5">
            <Label className="pl-1 text-xs text-muted-foreground">
              {t("output.speakers.label", { count: speakers.length })}
            </Label>
            <SpeakerChips
              speakers={speakers}
              onSpeakerChange={props.onSpeakerChange}
              tracks={props.outputTracks}
            />
          </section>
        )}

        {/* Style last: it is the only section that grows, so it owns the
            page scroll instead of fighting a nested one. */}
        {!isAdobe && (
          <section ref={styleRef} className="space-y-4">
            <CaptionTemplateSelectionContent
              mode={props.captionMode}
              onModeChange={props.onCaptionModeChange}
              templateValue={props.selectedTemplate.value}
              onTemplateChange={props.onTemplateChange}
              templates={props.templates}
              templatesLoading={props.templatesLoading}
              templatesLoaded={props.templatesLoaded}
              templateLoadError={props.templateLoadError}
              presetId={props.presetId}
              onPresetChange={props.onPresetChange}
              animatedPresets={props.presets}
              createSession={createSession}
              onRequestCreate={props.onRequestCreate}
              onRequestEdit={(p) => props.onRequestEdit(p.id)}
              onCreateFlowExit={props.onCreateFlowExit}
              onSubmitPreset={props.onSubmitPreset}
              onDeletePreset={props.onDeletePreset}
              onDuplicatePreset={(p) => props.onDuplicatePreset(p.id)}
              onImportPreset={props.onImportPreset}
              onExportPreset={props.onExportPreset}
              hasAnimatedTemplate={props.hasAnimatedTemplate}
            />
          </section>
        )}

      </div>
    </ScrollArea>
  );
}
