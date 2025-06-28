// App.tsx
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TranscriptionSettings } from "@/components/transcription-settings"
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"

export function ModeToggle() {
  const { setTheme, theme } = useTheme()

  const handleToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleToggle}>
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

function App() {
  const [isStandaloneMode, setIsStandaloneMode] = React.useState(false)
  const isMobile = useIsMobile()

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
    <SidebarProvider
      style={
        {
          "--sidebar-width": "50vw",
          "--sidebar-width-mobile": "100vw",
        } as React.CSSProperties
      }
    >
      <SidebarInset className="flex flex-col min-w-0 w-full">
        {/* Top Menu Bar */}
        <header className="sticky top-0 flex shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-sm p-2 sm:p-4 z-20 min-w-0">
          {/* Left side - Theme toggle */}
          <ModeToggle />

          {/* Center - Settings label */}
          <div className="flex-1 flex items-center justify-center">
            <span className="font-semibold text-base text-foreground">Settings</span>
          </div>

          {/* Right side - Mode tabs and Captions toggle */}
          <div className="shrink-0 flex items-center gap-2">
            <Tabs
              value={isStandaloneMode ? "standalone" : "resolve"}
              onValueChange={(value) => setIsStandaloneMode(value === "standalone")}
            >
              <TabsList className="rounded-full bg-muted">
                <TabsTrigger value="resolve" className="rounded-full text-xs sm:text-sm px-2 sm:px-3">
                  Resolve
                </TabsTrigger>
                <TabsTrigger value="standalone" className="rounded-full text-xs sm:text-sm px-2 sm:px-3">
                  Standalone
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {!isMobile && <CustomSidebarTrigger />}
          </div>
        </header>

        {/* Main Content - Just the transcription settings */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <TranscriptionSettings isStandaloneMode={isStandaloneMode} />
        </div>
      </SidebarInset>
      <AppSidebar />
    </SidebarProvider>
    </ThemeProvider>
  );
}

export default App;