// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import React from "react"
import { TranscriptionWorkspace } from "@/pages/transcription-workspace"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileSubtitleViewer } from "@/components/mobile-subtitle-viewer"
import { LanguagePickerModal } from "@/components/language-picker-modal"
import { useTranslation } from "react-i18next"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Titlebar } from "@/components/titlebar"
import { ResolveStatus } from "@/components/titlebar"
import { getVersion } from "@tauri-apps/api/app"
import { check } from "@tauri-apps/plugin-updater"
import { useResolve } from "@/contexts/ResolveContext"

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
  const [showMobileSubtitles, setShowMobileSubtitles] = React.useState(false)
  const isMobile = useIsMobile()
  const [appVersion, setAppVersion] = React.useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = React.useState<{ available: boolean; version?: string } | null>(null)
  const { timelineInfo } = useResolve()

  React.useEffect(() => {
    let isActive = true

    const loadVersionInfo = async () => {
      try {
        const version = await getVersion()
        if (isActive) {
          setAppVersion(version)
        }
      } catch (error) {
        console.error("Failed to load app version", error)
      }
    }

    const checkForUpdates = async () => {
      try {
        const update = await check()
        if (!isActive) return
        if (update) {
          setUpdateInfo({ available: true, version: update.version })
        } else {
          setUpdateInfo({ available: false })
        }
      } catch (error) {
        console.error("Failed to check for updates", error)
        if (isActive) {
          setUpdateInfo({ available: false })
        }
      }
    }

    loadVersionInfo()
    checkForUpdates()

    return () => {
      isActive = false
    }
  }, [])

  const updateLabel = updateInfo?.available
    ? "Update available"
    : "Up to date"
  const updateClassName = updateInfo?.available
    ? "text-pink-500"
    : "text-muted-foreground"

  return (
    <TooltipProvider>
      <LanguagePickerModal />
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Use actual timeline info from Resolve context */}
        <Titlebar />
            {/* Main Content Area - Full Width Transcription Workspace */}
            <div className="flex-1 min-h-0 pb-0">
              <div className="h-full overflow-hidden">
                <TranscriptionWorkspace />
              </div>
            </div>

            {/* Mobile Subtitles Viewer */}
            {isMobile && (
              <MobileSubtitleViewer
                isOpen={showMobileSubtitles}
                onClose={() => setShowMobileSubtitles(false)}
              />
            )}

            <footer className="h-10 border-t bg-card/50 px-4 flex items-center justify-between text-xs">
              <ResolveStatus timelineInfo={timelineInfo} />
              <div className="flex items-center gap-1 text-xs">
                <span className={updateClassName}>{updateLabel}</span>
                {appVersion && (
                  <span className="text-muted-foreground">· v{appVersion}</span>
                )}
              </div>
            </footer>
          </div>
        </TooltipProvider>
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