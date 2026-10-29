import * as React from "react";
import {
  AudioLines,
  Clock3,
  FileAudio,
  FolderOpen,
  Menu as MenuIcon,
  MonitorPlay,
  Settings as SettingsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { GettingStartedOverlay } from "@/components/dialogs/getting-started-overlay";
import { WhatsNewDialog } from "@/components/dialogs/whats-new-dialog";
import { SubtitleViewerPanel } from "@/components/subtitles/subtitle-viewer-panel";
import { TranscriptionPanel } from "@/components/transcription/transcription-panel";
import { ModelPicker } from "@/components/settings/model-picker";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/kit";
import { useAdobe } from "@/contexts/AdobeContext";
import { EditorWorkspaceProviders } from "@/contexts/GlobalProvider";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useModels } from "@/contexts/ModelsContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  listSubtitleDocumentIndex,
  readSubtitleDocument,
  type SubtitleDocumentListItem,
} from "@/utils/file-utils";
import { useSettingsStore } from "@/stores/settings-store";

type AppPage = "setup" | "transcript";

function AppContentBody() {
  const { t, i18n } = useTranslation();
  const { selectedIntegration, setSelectedIntegration } = useIntegration();
  const { timelineInfo: resolveTimeline } = useResolve();
  const { isPremiereConnected, premiereTimeline } = useAdobe();
  const { modelsState } = useModels();
  const {
    flushPendingSubtitleSave,
    openStoredSubtitleDocument,
  } = useSubtitleDocument();
  const model = useSettingsStore((state) => state.model);
  const language = useSettingsStore((state) => state.language);
  const audioInputMode = useSettingsStore((state) => state.audioInputMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const smallScreen = useMediaQuery("(max-width: 640px)");
  const [page, setPage] = React.useState<AppPage>("setup");
  const [sidebarOpen, setSidebarOpen] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth > 640,
  );
  const [modelPickerOpen, setModelPickerOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [documents, setDocuments] = React.useState<SubtitleDocumentListItem[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = React.useState(false);

  const loadDocuments = React.useCallback(async () => {
    try {
      setDocuments(await listSubtitleDocumentIndex());
    } catch (error) {
      console.error("Failed to load subtitle documents:", error);
    } finally {
      setDocumentsLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  React.useEffect(() => {
    const handleResize = () => setSidebarOpen(window.innerWidth > 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const selectResolve = () => {
    setSelectedIntegration("davinci");
    updateSetting("audioInputMode", "timeline");
    setPage("setup");
    if (smallScreen) setSidebarOpen(false);
  };

  const selectPremiere = () => {
    setSelectedIntegration("premiere");
    updateSetting("audioInputMode", "timeline");
    setPage("setup");
    if (smallScreen) setSidebarOpen(false);
  };

  const selectFile = () => {
    setSelectedIntegration("standalone");
    setPage("setup");
    if (smallScreen) setSidebarOpen(false);
  };

  const openDocument = async (document: SubtitleDocumentListItem) => {
    try {
      await flushPendingSubtitleSave();
      const transcript = await readSubtitleDocument(document.filename);
      if (!transcript) return;
      openStoredSubtitleDocument(document.filename, transcript);
      setPage("transcript");
      if (smallScreen) setSidebarOpen(false);
    } catch (error) {
      console.error("Failed to open subtitle document:", error);
    }
  };

  const isFileSource =
    selectedIntegration === "standalone" || audioInputMode === "file";
  const isPremiereSource =
    selectedIntegration === "premiere" || selectedIntegration === "aftereffects";
  const resolveConnected = Boolean(resolveTimeline.timelineId);
  const premiereConnected = isPremiereConnected && Boolean(premiereTimeline.timelineId);
  const activeSource = isFileSource ? "file" : isPremiereSource ? "premiere" : "resolve";

  return (
    <TooltipProvider>
      <div className="relative flex h-screen overflow-hidden bg-[var(--as-bg)] text-[var(--as-fg)]">
        {sidebarOpen && smallScreen && (
          <button
            type="button"
            aria-label={t("common.close")}
            className="fixed inset-0 z-20 bg-black/25"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {sidebarOpen && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col border-r border-[var(--as-line)] bg-[var(--as-side)] sm:relative">
            <div className="flex h-14 items-center gap-2 border-b border-[var(--as-line)] px-4">
              <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--as-primary)] text-white">
                <AudioLines className="size-4" />
              </div>
              <span className="font-semibold tracking-tight">AutoSubs</span>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
              <section>
                <h2 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--as-fg-muted)]">
                  {t("redesign.sources")}
                </h2>
                <div className="space-y-1">
                  <SourceButton
                    active={activeSource === "resolve"}
                    icon={<MonitorPlay className="size-4" />}
                    label={t("titlebar.resolve.productName")}
                    connected={resolveConnected}
                    onClick={selectResolve}
                  />
                  <SourceButton
                    active={activeSource === "premiere"}
                    icon={<MonitorPlay className="size-4" />}
                    label={t("titlebar.premiere.productName")}
                    connected={premiereConnected}
                    onClick={selectPremiere}
                  />
                  <SourceButton
                    active={activeSource === "file"}
                    icon={<FileAudio className="size-4" />}
                    label={t("actionBar.mode.fileInput")}
                    onClick={selectFile}
                  />
                </div>
              </section>

              {/* TODO(redesign stage 2) */}
              <section className="rounded-xl border border-[var(--as-line)] bg-[var(--as-bg)] p-3">
                <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--as-fg-muted)]">
                  {t("actionBar.model")}
                </h2>
                <ModelPicker
                  modelsState={modelsState}
                  selectedModelIndex={model}
                  selectedLanguage={language}
                  onSelectModel={(index) => updateSetting("model", index)}
                  downloadingModel={null}
                  downloadProgress={0}
                  open={modelPickerOpen}
                  onOpenChange={setModelPickerOpen}
                  isSmallScreen={smallScreen}
                  triggerClassName="h-10 w-full justify-between rounded-lg border border-[var(--as-line)] bg-[var(--as-card)] px-2.5"
                />
              </section>

              <section>
                <h2 className="mb-2 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--as-fg-muted)]">
                  <Clock3 className="size-3.5" />
                  {t("redesign.recent")}
                </h2>
                {!documentsLoaded ? (
                  <p className="px-2 py-2 text-xs text-[var(--as-fg-muted)]">
                    {t("titlebar.subtitleHistory.loading")}
                  </p>
                ) : documents.length ? (
                  <div className="space-y-0.5">
                    {documents.slice(0, 6).map((document) => (
                      <button
                        key={document.filename}
                        type="button"
                        onClick={() => void openDocument(document)}
                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[var(--as-fg-secondary)] transition-colors hover:bg-[var(--as-card-hover)] hover:text-[var(--as-fg)]"
                      >
                        <FolderOpen className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {document.displayName}
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--as-fg-muted)]">
                          {document.createdAt.toLocaleDateString(i18n.language, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-2 text-xs text-[var(--as-fg-muted)]">
                    {t("titlebar.subtitleHistory.empty")}
                  </p>
                )}
              </section>
            </div>

            <div className="border-t border-[var(--as-line)] p-3">
              {/* TODO(redesign stage 2) */}
              <Button
                variant="ghost"
                className="w-full justify-start px-2.5"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon className="size-4" />
                {t("settings.title")}
              </Button>
            </div>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--as-line)] px-3 sm:px-4">
            <Button
              variant="icon"
              aria-label={t("redesign.sources")}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <MenuIcon className="size-4" />
            </Button>
            <div className="min-w-0 flex-1 font-serif text-lg text-[var(--as-fg)]" style={{ fontFamily: "var(--as-font-title)" }}>
              {page === "setup" ? t("common.startNewTranscription") : t("titlebar.subtitleHistory.title")}
            </div>
            {page === "transcript" && (
              <Button variant="tone" size="sm" onClick={() => setPage("setup")}>
                {t("common.back")}
              </Button>
            )}
          </header>

          <div className="relative min-h-0 flex-1">
            <div className={page === "setup" ? "h-full" : "hidden"}>
              <TranscriptionPanel
                onViewSubtitles={() => setPage("transcript")}
                onTranscriptCreated={loadDocuments}
              />
            </div>
            <div className={page === "transcript" ? "h-full" : "hidden"}>
              <SubtitleViewerPanel
                isFullScreen
                onClose={() => setPage("setup")}
                transcriptDocuments={documents}
                isLoadingTranscriptDocuments={!documentsLoaded}
                onTranscriptDocumentsRefresh={loadDocuments}
              />
            </div>
          </div>
        </main>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <GettingStartedOverlay />
        <WhatsNewDialog />
      </div>
    </TooltipProvider>
  );
}

function SourceButton({
  active,
  icon,
  label,
  connected,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  connected?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
        active
          ? "bg-[var(--as-card)] text-[var(--as-fg)]"
          : "text-[var(--as-fg-secondary)] hover:bg-[var(--as-card-hover)] hover:text-[var(--as-fg)]"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof connected === "boolean" && (
        <span
          className={`size-1.5 shrink-0 rounded-full ${
            connected ? "bg-emerald-500" : "bg-[var(--as-fg-muted)]"
          }`}
          title={t(
            connected
              ? "titlebar.resolve.tooltip.connected"
              : "titlebar.status.disconnected",
          )}
        />
      )}
    </button>
  );
}

function AppContent() {
  return (
    <EditorWorkspaceProviders>
      <AppContentBody />
    </EditorWorkspaceProviders>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
