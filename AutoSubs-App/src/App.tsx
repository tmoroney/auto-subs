// App.tsx
import { ThemeProvider, useTheme } from "@/components/providers/theme-provider"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import React from "react"
import { TranscriptionPanel } from "@/components/transcription/transcription-panel"
import { SubtitleViewerPanel } from "@/components/subtitles/subtitle-viewer-panel"
import { useTranslation } from "react-i18next"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GettingStartedOverlay } from "@/components/dialogs/getting-started-overlay"
import { OnboardingTour } from "@/components/dialogs/onboarding-tour"
import { WhatsNewDialog } from "@/components/dialogs/whats-new-dialog"
import { useSettings } from "@/contexts/SettingsContext"
import { getVersion } from "@tauri-apps/api/app"
import { UPDATE_RESTART_NOTICE_KEY } from "@/hooks/use-update-status"
import { Server, X } from "lucide-react"
import { EditorWorkspaceProviders } from "@/contexts/GlobalProvider"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const { t } = useTranslation()

  const handleToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleToggle} className="rounded-full">
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 h-5 w-5" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 h-5 w-5" />
      <span className="sr-only">{t("theme.toggle")}</span>
    </Button>
  )
}

function AppContent() {
  const [showSubtitleViewer, setShowSubtitleViewer] = React.useState(true)
  const [subtitlePanelWidth, setSubtitlePanelWidth] = React.useState(520)
  const { t } = useTranslation()
  const { settings, isHydrated } = useSettings()
  const [currentVersion, setCurrentVersion] = React.useState<string>("")
  const [showResolveRestartNotice, setShowResolveRestartNotice] =
    React.useState(false)
  const mainContentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let cancelled = false
    getVersion()
      .then((v) => {
        if (!cancelled) setCurrentVersion(v)
      })
      .catch(() => {
        if (!cancelled) setCurrentVersion("")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Priority gating: only show one onboarding-style dialog at a time.
  const showGettingStarted = isHydrated && !settings.onboardingCompleted
  const showWhatsNew =
    isHydrated &&
    settings.onboardingCompleted &&
    !!currentVersion &&
    settings.lastSeenVersion !== currentVersion
  const shouldShowUpdateResolveNotice =
    localStorage.getItem(UPDATE_RESTART_NOTICE_KEY) === "1" ||
    (showWhatsNew && !!settings.lastSeenVersion)

  React.useEffect(() => {
    if (shouldShowUpdateResolveNotice) {
      localStorage.removeItem(UPDATE_RESTART_NOTICE_KEY)
      setShowResolveRestartNotice(true)
    }
  }, [shouldShowUpdateResolveNotice])

  const handleDismissResolveRestartNotice = React.useCallback(() => {
    localStorage.removeItem(UPDATE_RESTART_NOTICE_KEY)
    setShowResolveRestartNotice(false)
  }, [])

  const showTour =
    isHydrated &&
    settings.onboardingCompleted &&
    settings.tourCompleted === false &&
    !showWhatsNew
  const handleOpenSubtitleViewer = React.useCallback(() => {
    setShowSubtitleViewer(true)
  }, [])

  const getMaxSubtitlePanelWidth = React.useCallback(() => {
    const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? window.innerWidth
    return Math.max(360, containerWidth - 424)
  }, [])

  const handleSubtitleResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()

    const startX = event.clientX
    const startWidth = subtitlePanelWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + startX - moveEvent.clientX
      setSubtitlePanelWidth(Math.min(getMaxSubtitlePanelWidth(), Math.max(360, nextWidth)))
    }

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }, [getMaxSubtitlePanelWidth, subtitlePanelWidth])

  return (
    <EditorWorkspaceProviders>
      <TooltipProvider>
        <div className="flex flex-col h-screen overflow-hidden bg-accent relative">
          {/* Use actual timeline info from Resolve context */}
          <div className="absolute top-0 left-0 right-0 h-11 z-10" data-tauri-drag-region />
          

          {showResolveRestartNotice && (
            <div className="border-b bg-card px-3 py-2 z-15">
              <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                <Server className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-5">
                    {t("update.restartResolveServer.title", "Update installed")}
                  </div>
                  <div className="mt-0.5 max-w-[1100px] text-sm leading-5 text-blue-950/80 dark:text-blue-100/80">
                    {t(
                      "update.restartResolveServer.description",
                      "AutoSubs restarted and disconnected from Resolve. In DaVinci Resolve, run Workspace -> Scripts -> AutoSubs again to start the updated Lua server.",
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-blue-950 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-blue-900"
                  onClick={handleDismissResolveRestartNotice}
                  aria-label={t("common.close", "Close")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Main Content Area with Resizable Panels */}
          <div ref={mainContentRef} className="flex-1 min-h-0 pb-0">
            <div className="flex h-full min-w-0">
              <div className="min-h-0 min-w-[200px] flex-1 overflow-hidden">
                <TranscriptionPanel onViewSubtitles={handleOpenSubtitleViewer} />
              </div>
              {showSubtitleViewer && (
                <div
                  className="relative my-2 mr-2 min-h-0 shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm"
                  style={{ width: subtitlePanelWidth }}
                >
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize subtitles panel"
                    className="absolute inset-y-0 left-0 z-30 w-2 cursor-col-resize touch-none"
                    onPointerDown={handleSubtitleResizeStart}
                  />
                  <SubtitleViewerPanel onClose={() => setShowSubtitleViewer(false)} />
                </div>
              )}
            </div>
          </div>

          {showGettingStarted && <GettingStartedOverlay />}
          {showWhatsNew && <WhatsNewDialog />}
          {showTour && <OnboardingTour />}
        </div>
      </TooltipProvider>
    </EditorWorkspaceProviders>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
