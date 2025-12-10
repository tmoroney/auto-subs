// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import React from "react"
import { TranscriptionSettings } from "@/components/transcription-settings"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileSubtitleViewer } from "@/components/mobile-subtitle-viewer"
import { DesktopSubtitleViewer } from "@/components/desktop-subtitle-viewer"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Titlebar } from "@/components/titlebar"

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
  const isMobile = useIsMobile()
  
  // timelineInfo will come from your actual Resolve connection state
  // For now, this will be null until connected

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

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Custom Titlebar for Overlay Mode - Desktop Only */}
          <Titlebar timelineInfo={null} />


          {/* Main Content Area with Resizable Panels */}
          <div className="flex-1 min-h-0 pb-0">
            {isMobile ? (
              // Mobile: Just show transcription settings
              <div className="h-full overflow-hidden">
                <TranscriptionSettings />
              </div>
            ) : (
              // Desktop: Resizable panels with transcription settings and subtitle viewer
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={55} className="min-w-[400px]">
                  <TranscriptionSettings />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={45}>
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
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;