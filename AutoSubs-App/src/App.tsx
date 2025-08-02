// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Captions, Heart, Moon, Sun } from "lucide-react"
import { useGlobal } from "@/contexts/GlobalContext";
import { Button } from "@/components/ui/button"
import React from "react"
import { TranscriptionSettings } from "@/components/transcription-settings"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileSubtitleViewer } from "@/components/mobile-subtitle-viewer"
import { DesktopSubtitleViewer } from "@/components/desktop-subtitle-viewer"
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
  const [showMobileSubtitles, setShowMobileSubtitles] = React.useState(false)
  const [showWalkthrough, setShowWalkthrough] = React.useState(false)
  const { isStandaloneMode, setIsStandaloneMode } = useGlobal()
  const isMobile = useIsMobile()

  // Check if this is the first time the user opens the app
  React.useEffect(() => {
    const hasCompletedSetup = localStorage.getItem('autosubs-setup-completed')
    if (!hasCompletedSetup) {
      setShowWalkthrough(true)
    }
  }, [])

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
          {isMobile && (
            <header className="sticky top-0 flex shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-sm p-2 sm:p-2.5 z-20 min-w-0">
              <ThemeToggle />
              {/* Left side - Mode switcher (desktop) */}
              <div className="flex-1 flex justify-center px-2">
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMobileSubtitles(true)}
              >
                <Captions className="h-5 w-5" />
              </Button>
            </header>
          )}


          {/* Main Content Area with Resizable Panels */}
          <div className="flex-1 min-h-0">
            {isMobile ? (
              // Mobile: Just show transcription settings
              <div className="h-full overflow-hidden">
                <TranscriptionSettings
                  onShowTutorial={handleShowTutorial}
                />
              </div>
            ) : (
              // Desktop: Resizable panels with transcription settings and subtitle viewer
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={55} className="min-w-[360px]">
                  {!isMobile && (
                    <header className="sticky top-0 flex shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-sm p-2 sm:p-2.5 z-20 min-w-0">
                      <ThemeToggle />
                      {/* Left side - Mode switcher (desktop) */}
                      <div className="flex-1 flex justify-center px-2">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="group rounded-full bg-background hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-all"
                        asChild
                      >
                        <a
                          href="https://buymeacoffee.com/tmoroney"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Support on Buy Me a Coffee"
                        >
                          <Heart className="h-5 w-5 fill-background group-hover:fill-pink-500 group-hover:text-pink-500 group-hover:animate-pulse transition-all"/>
                        </a>
                      </Button>
                    </header>
                  )}

                  <TranscriptionSettings
                    onShowTutorial={handleShowTutorial}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={45} minSize={45}>
                  <DesktopSubtitleViewer />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>

          {/* Mobile Subtitles Viewer */}
          {isMobile && (
            <MobileSubtitleViewer
              isOpen={showMobileSubtitles}
              onClose={() => setShowMobileSubtitles(false)}
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