// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Captions, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TranscriptionSettings } from "@/components/transcription-settings"
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileCaptionViewer } from "@/components/mobile-caption-viewer"

export function ModeToggle() {
  const { setTheme, theme } = useTheme()

  const handleToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleToggle} className="h-10 w-10">
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 h-5 w-5" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 h-5 w-5" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

function App() {
  const [isStandaloneMode, setIsStandaloneMode] = React.useState(false)
  const [showMobileCaptions, setShowMobileCaptions] = React.useState(false)
  const isMobile = useIsMobile()

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <SidebarProvider
        style={
          {
            "--sidebar-width": "48vw",
            "--sidebar-width-mobile": "100vw",
          } as React.CSSProperties
        }
      >
        <SidebarInset className="flex flex-col min-w-0 w-full">
          {/* Top Menu Bar */}
          <header className="sticky top-0 flex shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-sm p-2 sm:p-2.5 z-20 min-w-0">
            {/* Left side - Theme toggle */}
            <ModeToggle />

            {/* Center - Mode switcher */}
            <div className="flex-1 flex justify-center px-4">
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

            {/* Right side - Sidebar toggle and mobile captions button */}
            <div className="shrink-0 flex items-center gap-2 justify-center">
              {isMobile ? (
                <Button 
                  onClick={() => setShowMobileCaptions(true)} 
                  variant="ghost" 
                  size="icon" 
                  className="h-10 w-10"
                >
                  <Captions className="h-5 w-5" />
                  <span className="sr-only">View Captions</span>
                </Button>
              ) : (
                <CustomSidebarTrigger />
              )}
            </div>
          </header>

          {/* Main Content - Just the transcription settings */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <TranscriptionSettings isStandaloneMode={isStandaloneMode} />
          </div>
        </SidebarInset>
        <AppSidebar />
        {isMobile && (
          <MobileCaptionViewer 
            isOpen={showMobileCaptions} 
            onClose={() => setShowMobileCaptions(false)} 
          />
        )}
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default App;