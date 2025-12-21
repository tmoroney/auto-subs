// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import React from "react"
import { TranscriptionWorkspace } from "@/pages/transcription-workspace"
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
import { GlobalProvider } from "@/contexts/GlobalProvider"
import { useResolve } from "@/contexts/ResolveContext"

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

function AppContent() {
  const [showMobileSubtitles, setShowMobileSubtitles] = React.useState(false)
  const isMobile = useIsMobile()
  const { timelineInfo } = useResolve()

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Use actual timeline info from Resolve context */}
        <Titlebar timelineInfo={timelineInfo} />


            {/* Main Content Area with Resizable Panels */}
            <div className="flex-1 min-h-0 pb-0">
              {isMobile ? (
                // Mobile: Just show transcription settings
                <div className="h-full overflow-hidden">
                  <TranscriptionWorkspace />
                </div>
              ) : (
                // Desktop: Resizable panels with transcription settings and subtitle viewer
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={55} className="min-w-[400px]">
                    <TranscriptionWorkspace />
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
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <GlobalProvider>
        <AppContent />
      </GlobalProvider>
    </ThemeProvider>
  );
}

export default App;