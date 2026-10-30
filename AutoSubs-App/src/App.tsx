import * as React from "react";
import {
  Ear,
  FileAudio,
  PanelLeft,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { GettingStartedOverlay } from "@/components/dialogs/getting-started-overlay";
import { WhatsNewDialog } from "@/components/dialogs/whats-new-dialog";
import { SubtitleViewerPanel } from "@/components/subtitles/subtitle-viewer-panel";
import { TranscriptionPanel } from "@/components/transcription/transcription-panel";
import { ModelsPage } from "@/components/models/models-page";
import { SettingsPage } from "@/components/settings/settings-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/kit";
import { useAdobe } from "@/contexts/AdobeContext";
import { EditorWorkspaceProviders } from "@/contexts/GlobalProvider";
import { useIntegration } from "@/contexts/IntegrationContext";
import { useModels } from "@/contexts/ModelsContext";
import { useProgress } from "@/contexts/ProgressContext";
import { useResolve } from "@/contexts/ResolveContext";
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  listSubtitleDocumentIndex,
  readSubtitleDocument,
  type SubtitleDocumentListItem,
} from "@/utils/file-utils";
import { useSettingsStore } from "@/stores/settings-store";

type AppPage = "setup" | "transcript" | "models" | "settings";

function AppContentBody() {
  const { t, i18n } = useTranslation();
  const { selectedIntegration, setSelectedIntegration } = useIntegration();
  const { timelineInfo: resolveTimeline } = useResolve();
  const { isPremiereConnected, premiereTimeline } = useAdobe();
  const { modelsState } = useModels();
  const { isRunActive, processingSteps } = useProgress();
  const {
    flushPendingSubtitleSave,
    openStoredSubtitleDocument,
  } = useSubtitleDocument();
  const model = useSettingsStore((state) => state.model);
  const audioInputMode = useSettingsStore((state) => state.audioInputMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const smallScreen = useMediaQuery("(max-width: 640px)");
  const [page, setPage] = React.useState<AppPage>("setup");
  const [sidebarOpen, setSidebarOpen] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth > 640,
  );
  const [returnPage, setReturnPage] = React.useState<AppPage>("setup");
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
  const runningStep =
    processingSteps.find((step) => step.isActive) ??
    processingSteps.find((step) => !step.isCompleted);
  const runningItemName = isFileSource
    ? t("actionBar.mode.fileInput")
    : isPremiereSource
      ? premiereTimeline.name || t("titlebar.premiere.productName")
      : resolveTimeline.name || t("titlebar.resolve.productName");

  return (
    <TooltipProvider>
      <div className="as-shell">
        {sidebarOpen && smallScreen && (
          <button
            type="button"
            aria-label={t("common.close")}
            className="as-sidebar-scrim"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {sidebarOpen && (
          <aside className={`as-sidebar ${smallScreen ? "as-sidebar--mobile" : ""}`}>
            <div className="as-sidebar-head" data-tauri-drag-region>
              <Button
                variant="icon"
                aria-label={t("redesign.hideSidebar")}
                className="as-sidebar-toggle"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft className="size-4" />
              </Button>
            </div>

            <div className="as-sidebar-flow">
              <section>
                <h2 className="as-side-label">
                  {t("redesign.newTranscriptFrom")}
                </h2>
                <div className="as-source-list">
                  <SourceButton
                    active={activeSource === "resolve"}
                    icon={
                      <img
                        className="size-4"
                        src="/davinci-resolve-logo.png"
                        alt=""
                      />
                    }
                    label={t("titlebar.resolve.productName")}
                    connected={resolveConnected}
                    onClick={selectResolve}
                  />
                  <SourceButton
                    active={activeSource === "premiere"}
                    icon={
                      <img
                        className="size-4"
                        src="/premiere-logo.png"
                        alt=""
                      />
                    }
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

              <section className="as-recent-section">
                <h2 className="as-side-label">{t("redesign.recent")}</h2>
                {!documentsLoaded && !isRunActive ? (
                  <p className="as-recent-empty">
                    {t("titlebar.subtitleHistory.loading")}
                  </p>
                ) : documents.length || isRunActive ? (
                  <div className="as-recent-list">
                    {isRunActive && (
                      <div
                        className="as-recent-item as-recent-item--running"
                        aria-live="polite"
                      >
                        <span className="as-recent-name as-recent-name--running">
                          <span className="as-running-spinner" />
                          {runningItemName}
                        </span>
                        <span className="as-recent-meta">
                          {t("redesign.transcribing")} ·{" "}
                          {Math.round(runningStep?.progress ?? 0)}%
                        </span>
                      </div>
                    )}
                    {documents.slice(0, 6).map((document) => (
                      <button
                        key={document.filename}
                        type="button"
                        onClick={() => void openDocument(document)}
                        className="as-recent-item"
                      >
                        <span className="as-recent-name">
                          {document.displayName}
                        </span>
                        <span className="as-recent-meta">
                          {recentDocumentMeta(document, i18n.language)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="as-recent-empty">
                    {t("titlebar.subtitleHistory.empty")}
                  </p>
                )}
              </section>
            </div>

            <div className="as-sidebar-footer">
              <section className="as-model-section">
                <button
                  type="button"
                  className={`as-model-card-trigger${page === "models" ? " is-active" : ""}`}
                  onClick={() => {
                    setReturnPage(
                      page === "settings" || page === "models"
                        ? returnPage
                        : page,
                    );
                    setPage("models");
                    if (smallScreen) setSidebarOpen(false);
                  }}
                >
                  <Ear className="as-model-card-icon" strokeWidth={1.9} />
                  <div>
                    <span className="as-model-name">
                      {modelsState[model]
                        ? t(modelsState[model].label)
                        : t("models.manage.title")}
                    </span>
                    <span className="as-model-caption">
                      {t("redesign.transcriptionModel")}
                    </span>
                  </div>
                  <ChevronRight size={14} />
                </button>
              </section>
              <Button
                variant="ghost"
                className={`as-settings-button${page === "settings" ? " is-active" : ""}`}
                onClick={() => {
                  setReturnPage(page === "settings" || page === "models" ? returnPage : page);
                  setPage("settings");
                  if (smallScreen) setSidebarOpen(false);
                }}
              >
                <SettingsIcon className="size-4" />
                {t("settings.title")}
              </Button>
            </div>
          </aside>
        )}

        <main className="as-main">
          <header className={`as-topstrip ${sidebarOpen ? "as-topstrip--sidebar-open" : ""}`} data-tauri-drag-region>
            {(!sidebarOpen || smallScreen) && (
              <Button
                variant="icon"
                aria-label={t("redesign.showSidebar")}
                className="as-sidebar-toggle"
                onClick={() => setSidebarOpen((open) => !open)}
              >
                <PanelLeft className="size-4" />
              </Button>
            )}
          </header>

          <div className="as-main-content">
            <div className={page === "setup" ? "as-page as-page--active" : "as-page as-page--hidden"}>
              <TranscriptionPanel
                onViewSubtitles={() => setPage("transcript")}
                onTranscriptCreated={loadDocuments}
              />
            </div>
            <div className={page === "transcript" ? "as-page as-page--active as-transcript-page" : "as-page as-page--hidden"}>
              <button type="button" className="as-back-link" onClick={() => setPage("setup")}>
                ‹ {t("common.back")}
              </button>
              <div className="as-transcript-view">
                <SubtitleViewerPanel
                  isFullScreen
                  onClose={() => setPage("setup")}
                  transcriptDocuments={documents}
                  isLoadingTranscriptDocuments={!documentsLoaded}
                  onTranscriptDocumentsRefresh={loadDocuments}
                />
              </div>
            </div>
            {page === "models" && (
              <div className="as-page as-page--active">
                <ModelsPage onBack={() => setPage(returnPage)} />
              </div>
            )}
            {page === "settings" && (
              <div className="as-page as-page--active">
                <SettingsPage onBack={() => setPage(returnPage)} />
              </div>
            )}
          </div>
        </main>

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
      className={`as-source-button ${active ? "as-source-button--active" : ""}`}
    >
      <span className="as-source-icon">{icon}</span>
      <span className="as-source-label">{label}</span>
      {typeof connected === "boolean" && (
        <span className={`as-source-status ${connected ? "as-source-status--connected" : ""}`} title={t(connected ? "titlebar.resolve.tooltip.connected" : "titlebar.status.disconnected")} />
      )}
    </button>
  );
}

function recentDocumentMeta(document: SubtitleDocumentListItem, language: string) {
  const date = document.createdAt.toLocaleDateString(language, {
    month: "short",
    day: "numeric",
  });
  const duration =
    document.markOut == null
      ? ""
      : formatDuration(Math.max(0, document.markOut - (document.markIn ?? 0)));
  return [date, duration || document.timelineName].filter(Boolean).join(" · ");
}

function formatDuration(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
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
