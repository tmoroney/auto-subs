// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Captions, Download, Moon, Sun, Upload } from "lucide-react"
import { useGlobal } from "@/contexts/GlobalContext";
import { Button } from "@/components/ui/button"
import React from "react"
import { TranscriptionSettings } from "@/components/transcription-settings"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileCaptionViewer } from "@/components/mobile-caption-viewer"
import { DesktopCaptionViewer } from "@/components/desktop-caption-viewer"
import { SetupWalkthrough } from "@/components/setup-walkthrough"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { TooltipProvider } from "@/components/ui/tooltip"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  const handleToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleToggle} className="rounded-full">
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 h-5 w-5" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 h-5 w-5" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

function App() {
  const [showMobileCaptions, setShowMobileCaptions] = React.useState(false)
  const [showWalkthrough, setShowWalkthrough] = React.useState(false)
  const { isStandaloneMode, setIsStandaloneMode, exportSubtitles, subtitles } = useGlobal()
  const isMobile = useIsMobile()

  // Check if this is the first time the user opens the app
  React.useEffect(() => {
    const hasCompletedSetup = localStorage.getItem('autosubs-setup-completed')
    if (!hasCompletedSetup) {
      setShowWalkthrough(true)
    }
  }, [])

  // Handle export button click
  const handleExport = async () => {
    try {
      await exportSubtitles();
    } catch (error) {
      // Error is handled by the exportSubtitles function
    }
  }

  const handleWalkthroughClose = () => {
    setShowWalkthrough(false)
    localStorage.setItem('autosubs-setup-completed', 'true')
  }

  const handleShowTutorial = () => {
    setShowWalkthrough(true)
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Top Menu Bar */}
          <header className="sticky top-0 flex shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-sm p-2 sm:p-2.5 z-20 min-w-0">
            {/* Left side - Mode switcher (desktop) */}
            <div className="flex items-center gap-2">
              {!isMobile && (
                <>
                  <Tabs
                    value={isStandaloneMode ? "standalone" : "resolve"}
                    onValueChange={(value) => setIsStandaloneMode(value === "standalone")}
                    className="w-auto max-w-[200px]"
                  >
                    <TabsList className="rounded-full bg-muted">
                      <TabsTrigger value="resolve" className="rounded-full text-sm px-3">
                        Resolve
                      </TabsTrigger>
                      <TabsTrigger value="standalone" className="rounded-full text-sm px-3">
                        Standalone
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </>
              )}
            </div>

            {/* Center - Mode switcher (mobile) */}
            {isMobile && (
              <>
                {/* Left side - Theme toggle */}
                <ThemeToggle />
                <div className="flex-1 flex justify-center px-6">
                  <Tabs
                    value={isStandaloneMode ? "standalone" : "resolve"}
                    onValueChange={(value) => setIsStandaloneMode(value === "standalone")}
                    className="w-full max-w-[400px]"
                  >
                    <TabsList className="w-full rounded-full bg-muted">
                      <TabsTrigger value="resolve" className="flex-1 rounded-full text-sm">
                        Resolve
                      </TabsTrigger>
                      <TabsTrigger value="standalone" className="flex-1 rounded-full text-sm">
                        Standalone
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </>
            )}

            {/* Right side - Theme toggle and buttons */}
            <div className="flex items-center gap-2">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMobileCaptions(true)}
                >
                  <Captions className="h-5 w-5" />
                </Button>
              )}
              {!isMobile && (
                <>
                  <Button
                    onClick={handleExport}
                    size="sm"
                    variant="ghost"
                    className="gap-2"
                    disabled={subtitles.length === 0}
                  >
                    <Upload className="h-4 w-4" />
                    Import
                  </Button>
                  <Button
                    onClick={handleExport}
                    size="sm"
                    variant="ghost"
                    className="gap-2"
                    disabled={subtitles.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <ThemeToggle />
                </>
              )}
            </div>
          </header>

          {/* Main Content Area with Resizable Panels */}
          <div className="flex-1 min-h-0">
            {isMobile ? (
              // Mobile: Just show transcription settings
              <div className="h-full overflow-hidden">
                <TranscriptionSettings
                  isStandaloneMode={isStandaloneMode}
                  onShowTutorial={handleShowTutorial}
                />
              </div>
            ) : (
              // Desktop: Resizable panels with transcription settings and caption viewer
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={55} className="min-w-[380px]">
                  <TranscriptionSettings
                    isStandaloneMode={isStandaloneMode}
                    onShowTutorial={handleShowTutorial}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={45} minSize={25}>
                  <DesktopCaptionViewer />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>

          {/* Mobile Caption Viewer */}
          {isMobile && (
            <MobileCaptionViewer
              isOpen={showMobileCaptions}
              onClose={() => setShowMobileCaptions(false)}
            />
          )}

          {/* Setup Walkthrough */}
          <SetupWalkthrough
            isOpen={showWalkthrough}
            onClose={handleWalkthroughClose}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;