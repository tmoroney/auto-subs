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
import { useSettingsStore } from "@/stores/settings-store"
import { getVersion } from "@tauri-apps/api/app"
import { EditorWorkspaceProviders } from "@/contexts/GlobalProvider"
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  listSubtitleDocumentIndex,
  type SubtitleDocumentListItem,
} from "@/utils/file-utils"

const MIN_TRANSCRIPTION_PANEL_WIDTH = 370
const MIN_SUBTITLE_PANEL_WIDTH = 280
const PANEL_GAP = 16
const SUBTITLE_VIEWER_EXIT_ANIMATION_MS = 180

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const { t } = useTranslation()

  const handleToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleToggle} className="rounded-full">
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 size-5" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 size-5" />
      <span className="sr-only">{t("theme.toggle")}</span>
    </Button>
  )
}

function AppContentBody() {
  const [showSubtitleViewer, setShowSubtitleViewer] = React.useState(() => {
    // Open by default on desktop if there's enough screen space
    const minRequiredWidth = MIN_TRANSCRIPTION_PANEL_WIDTH + MIN_SUBTITLE_PANEL_WIDTH + PANEL_GAP
    const hasEnoughSpace = typeof window !== 'undefined' && window.innerWidth >= minRequiredWidth
    return hasEnoughSpace
  })
  const [isSubtitleViewerExpanded, setIsSubtitleViewerExpanded] =
    React.useState(() => {
      const minRequiredWidth = MIN_TRANSCRIPTION_PANEL_WIDTH + MIN_SUBTITLE_PANEL_WIDTH + PANEL_GAP
      const hasEnoughSpace = typeof window !== 'undefined' && window.innerWidth >= minRequiredWidth
      return hasEnoughSpace
    })
  const [isSubtitleViewerClosing, setIsSubtitleViewerClosing] =
    React.useState(false)
  const [isSubtitleViewerResizing, setIsSubtitleViewerResizing] =
    React.useState(false)
  const [isSubtitleViewerResizeHovered, setIsSubtitleViewerResizeHovered] =
    React.useState(false)
  const [subtitlePanelWidth, setSubtitlePanelWidth] = React.useState(340)
  const [transcriptDocuments, setTranscriptDocuments] = React.useState<
    SubtitleDocumentListItem[]
  >([])
  const [hasLoadedTranscriptDocuments, setHasLoadedTranscriptDocuments] =
    React.useState(false)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const tourCompleted = useSettingsStore((s) => s.tourCompleted)
  const lastSeenVersion = useSettingsStore((s) => s.lastSeenVersion)
  const isHydrated = useSettingsStore((s) => s.isHydrated)
  const { subtitles } = useSubtitleDocument()
  const [currentVersion, setCurrentVersion] = React.useState<string>("")
  const isMobile = useIsMobile()
  const mainContentRef = React.useRef<HTMLDivElement>(null)
  const subtitleViewerCloseTimeoutRef = React.useRef<number | null>(null)
  const subtitleViewerOpenTimeoutRef = React.useRef<number | null>(null)

  const loadTranscriptDocuments = React.useCallback(async () => {
    try {
      setTranscriptDocuments(await listSubtitleDocumentIndex())
    } catch (error) {
      console.error("Failed to load subtitle documents:", error)
    } finally {
      setHasLoadedTranscriptDocuments(true)
    }
  }, [])

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

  React.useEffect(() => {
    void loadTranscriptDocuments()
  }, [loadTranscriptDocuments])

  // Priority gating: only show one onboarding-style dialog at a time.
  const showGettingStarted = isHydrated && !onboardingCompleted
  const showWhatsNew =
    isHydrated &&
    onboardingCompleted &&
    !!currentVersion &&
    lastSeenVersion !== currentVersion

  const showTour =
    isHydrated &&
    onboardingCompleted &&
    tourCompleted === false &&
    !showWhatsNew

  const handleCloseSubtitleViewer = React.useCallback(() => {
    if (!showSubtitleViewer || isSubtitleViewerClosing) return

    if (subtitleViewerOpenTimeoutRef.current !== null) {
      window.clearTimeout(subtitleViewerOpenTimeoutRef.current)
      subtitleViewerOpenTimeoutRef.current = null
    }

    setIsSubtitleViewerClosing(true)
    setIsSubtitleViewerExpanded(false)
    subtitleViewerCloseTimeoutRef.current = window.setTimeout(() => {
      setShowSubtitleViewer(false)
      setIsSubtitleViewerClosing(false)
      subtitleViewerCloseTimeoutRef.current = null
    }, SUBTITLE_VIEWER_EXIT_ANIMATION_MS)
  }, [isSubtitleViewerClosing, showSubtitleViewer])

  const handleOpenSubtitleViewer = React.useCallback(() => {
    if (isMobile && subtitles.length === 0) {
      handleCloseSubtitleViewer()
      return
    }

    if (
      showSubtitleViewer &&
      isSubtitleViewerExpanded &&
      !isSubtitleViewerClosing
    ) {
      return
    }

    if (subtitleViewerCloseTimeoutRef.current !== null) {
      window.clearTimeout(subtitleViewerCloseTimeoutRef.current)
      subtitleViewerCloseTimeoutRef.current = null
    }
    if (subtitleViewerOpenTimeoutRef.current !== null) {
      window.clearTimeout(subtitleViewerOpenTimeoutRef.current)
      subtitleViewerOpenTimeoutRef.current = null
    }

    setIsSubtitleViewerClosing(false)
    setIsSubtitleViewerExpanded(false)
    setShowSubtitleViewer(true)

    subtitleViewerOpenTimeoutRef.current = window.setTimeout(() => {
      setIsSubtitleViewerExpanded(true)
      subtitleViewerOpenTimeoutRef.current = null
    }, 20)
  }, [
    handleCloseSubtitleViewer,
    isMobile,
    isSubtitleViewerClosing,
    isSubtitleViewerExpanded,
    showSubtitleViewer,
    subtitles.length,
  ])

  React.useEffect(() => {
    return () => {
      if (subtitleViewerCloseTimeoutRef.current !== null) {
        window.clearTimeout(subtitleViewerCloseTimeoutRef.current)
      }
      if (subtitleViewerOpenTimeoutRef.current !== null) {
        window.clearTimeout(subtitleViewerOpenTimeoutRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    if (isMobile && showSubtitleViewer && subtitles.length === 0) {
      handleCloseSubtitleViewer()
    }
  }, [handleCloseSubtitleViewer, isMobile, showSubtitleViewer, subtitles.length])

  const handleTranscriptCreated = React.useCallback(async () => {
    await loadTranscriptDocuments()
  }, [loadTranscriptDocuments])

  const getMaxSubtitlePanelWidth = React.useCallback(() => {
    const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? window.innerWidth
    return Math.max(
      MIN_SUBTITLE_PANEL_WIDTH,
      containerWidth - MIN_TRANSCRIPTION_PANEL_WIDTH - PANEL_GAP,
    )
  }, [])

  const handleSubtitleResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return

    event.preventDefault()
    setIsSubtitleViewerResizing(true)

    const startX = event.clientX
    const startWidth = subtitlePanelWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + startX - moveEvent.clientX
      setSubtitlePanelWidth(
        Math.min(
          getMaxSubtitlePanelWidth(),
          Math.max(MIN_SUBTITLE_PANEL_WIDTH, nextWidth),
        ),
      )
    }

    const handlePointerUp = () => {
      setIsSubtitleViewerResizing(false)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }, [getMaxSubtitlePanelWidth, isMobile, subtitlePanelWidth])

  // Adjust subtitle panel width when window is resized
  React.useEffect(() => {
    if (isMobile) return

    const handleResize = () => {
      const maxWidth = getMaxSubtitlePanelWidth()
      if (subtitlePanelWidth > maxWidth) {
        setSubtitlePanelWidth(maxWidth)
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [getMaxSubtitlePanelWidth, subtitlePanelWidth, isMobile])

  const subtitleViewerClassName = isMobile
    ? `${isSubtitleViewerClosing ? "animate-subtitle-sidebar-out" : "animate-subtitle-sidebar-in"} absolute inset-0 z-50 min-h-0 overflow-hidden bg-card`
    : `${isSubtitleViewerClosing ? "animate-subtitle-sidebar-out" : "animate-subtitle-sidebar-in"} ${isSubtitleViewerResizing ? "subtitle-sidebar-shell-resizing" : "subtitle-sidebar-shell"} ${isSubtitleViewerResizing || isSubtitleViewerResizeHovered ? "border-foreground/30 dark:border-foreground/25" : "border-border"} relative min-h-0 shrink-0 overflow-hidden border-l transition-color bg-card`

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-background relative">
          {/* Main Content Area with Resizable Panels */}
          <div ref={mainContentRef} className="flex-1 min-h-0 pb-0 relative">
            <div className="flex h-full min-w-0">
              <div className="min-h-0 min-w-[370px] flex-1 overflow-hidden">
                <TranscriptionPanel
                  onViewSubtitles={handleOpenSubtitleViewer}
                  onTranscriptCreated={handleTranscriptCreated}
                  transcriptDocuments={transcriptDocuments}
                  isLoadingTranscriptDocuments={!hasLoadedTranscriptDocuments}
                  onTranscriptDocumentsRefresh={loadTranscriptDocuments}
                  isSubtitleViewerOpen={
                    showSubtitleViewer && !isSubtitleViewerClosing
                  }
                />
              </div>
              {showSubtitleViewer && (
                <div
                  className={subtitleViewerClassName}
                  style={{
                    width: isMobile
                      ? "100%"
                      : isSubtitleViewerExpanded
                        ? subtitlePanelWidth
                        : 0,
                  }}
                >
                  {!isMobile && (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize subtitles panel"
                      className="absolute inset-y-0 -left-2 z-30 w-5 cursor-col-resize touch-none"
                      onPointerDown={handleSubtitleResizeStart}
                      onPointerEnter={() => setIsSubtitleViewerResizeHovered(true)}
                      onPointerLeave={() => setIsSubtitleViewerResizeHovered(false)}
                    />
                  )}
                  <SubtitleViewerPanel
                    isFullScreen={isMobile}
                    onClose={handleCloseSubtitleViewer}
                  />
                </div>
              )}
            </div>
          </div>

          {showGettingStarted && <GettingStartedOverlay />}
          {showWhatsNew && <WhatsNewDialog />}
          {showTour && <OnboardingTour />}
      </div>
    </TooltipProvider>
  )
}

function AppContent() {
  return (
    <EditorWorkspaceProviders>
      <AppContentBody />
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
