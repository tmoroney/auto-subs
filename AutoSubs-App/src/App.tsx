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
import { SetupWalkthrough } from "@/components/setup-walkthrough"
import { invoke } from "@tauri-apps/api/core"

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
  const [showWalkthrough, setShowWalkthrough] = React.useState(false)
  const [walkthroughSettings, setWalkthroughSettings] = React.useState({
    selectedFile: null as string | null,
    selectedTracks: ['1'] as string[],
    selectedTemplate: { value: "default", label: "Default Text+" },
    sourceLanguage: "en",
    translate: false,
    selectedModel: {
      value: "base",
      label: "Base",
      description: "General use",
      size: "140MB",
      ram: "~1GB",
      image: "/sparrow.png",
      details: "Balanced for most standard tasks. Good speed and accuracy for everyday transcription.",
      isDownloaded: true,
    },
    models: [
      {
        value: "tiny",
        label: "Tiny",
        description: "Fastest",
        size: "75MB",
        ram: "1GB",
        image: "/hummingbird.png",
        details: "Smallest and fastest model. Great for drafts and low-resource devices. Lower accuracy on tough audio.",
        isDownloaded: true,
      },
      {
        value: "base",
        label: "Base",
        description: "General use",
        size: "140MB",
        ram: "1GB",
        image: "/sparrow.png",
        details: "Balanced for most standard tasks. Good speed and accuracy for everyday transcription.",
        isDownloaded: true,
      },
      {
        value: "small",
        label: "Small",
        description: "Balanced",
        size: "480MB",
        ram: "2GB",
        image: "/fox.png",
        details: "Better accuracy than Tiny/Base. Still fast. Good for varied accents and conditions.",
        isDownloaded: false,
      },
      {
        value: "medium",
        label: "Medium",
        description: "Accurate",
        size: "1.5GB",
        ram: "5GB",
        image: "/wolf.png",
        details: "High accuracy, handles difficult audio. Slower and uses more memory.",
        isDownloaded: false,
      },
      {
        value: "large",
        label: "Large",
        description: "Max accuracy",
        size: "3.1GB",
        ram: "10GB",
        image: "/elephant.png",
        details: "Most accurate, best for complex audio or many speakers. Requires lots of RAM and a strong GPU.",
        isDownloaded: false,
      },
    ],
    downloadingModel: null as string | null,
    downloadProgress: 0,
    // Text formatting settings
    maxWordsLine: "10",
    textFormat: "none" as "none" | "uppercase" | "lowercase",
    removePunctuation: false,
    censorWords: false,
    sensitiveWords: [] as string[],
  })
  const isMobile = useIsMobile()

  // Check which models are downloaded when component mounts
  React.useEffect(() => {
    const checkDownloadedModels = async () => {
      try {
        const downloadedModels = await invoke("get_downloaded_models") as string[]
        console.log("Downloaded models:", downloadedModels)

        // Update models state based on downloaded models
        setWalkthroughSettings(prev => ({
          ...prev,
          models: prev.models.map(model => ({
            ...model,
            isDownloaded: downloadedModels.some(downloadedModel =>
              downloadedModel.includes(model.value)
            )
          })),
          selectedModel: {
            ...prev.selectedModel,
            isDownloaded: downloadedModels.some(downloadedModel =>
              downloadedModel.includes(prev.selectedModel.value)
            )
          }
        }))
      } catch (error) {
        console.error("Failed to check downloaded models:", error)
      }
    }

    checkDownloadedModels()
  }, [])

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
      <SidebarProvider
        style={
          {
            "--sidebar-width": "44vw",
            "--sidebar-width-mobile": "100vw",
          } as React.CSSProperties
        }
      >
        <SidebarInset className="flex flex-col min-w-0 w-full h-screen overflow-hidden">
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
            <TranscriptionSettings
              isStandaloneMode={isStandaloneMode}
              onShowTutorial={handleShowTutorial}
              walkthroughSettings={walkthroughSettings}
              onWalkthroughSettingsChange={setWalkthroughSettings}
            />
          </div>
        </SidebarInset>
        <AppSidebar />
        {isMobile && (
          <MobileCaptionViewer
            isOpen={showMobileCaptions}
            onClose={() => setShowMobileCaptions(false)}
          />
        )}
        <SetupWalkthrough
          isOpen={showWalkthrough}
          onClose={handleWalkthroughClose}
          isStandaloneMode={isStandaloneMode}
          onModeChange={setIsStandaloneMode}
          selectedFile={walkthroughSettings.selectedFile}
          onFileSelect={(file) => setWalkthroughSettings(prev => ({ ...prev, selectedFile: file }))}
          selectedTracks={walkthroughSettings.selectedTracks}
          onTracksChange={(tracks) => setWalkthroughSettings(prev => ({ ...prev, selectedTracks: tracks }))}
          selectedTemplate={walkthroughSettings.selectedTemplate}
          onTemplateChange={(template) => setWalkthroughSettings(prev => ({ ...prev, selectedTemplate: template }))}
          sourceLanguage={walkthroughSettings.sourceLanguage}
          translate={walkthroughSettings.translate}
          onSourceLanguageChange={(language) => setWalkthroughSettings(prev => ({ ...prev, sourceLanguage: language }))}
          onTranslateChange={(translate) => setWalkthroughSettings(prev => ({ ...prev, translate: translate }))}
          selectedModel={walkthroughSettings.selectedModel}
          models={walkthroughSettings.models}
          downloadingModel={walkthroughSettings.downloadingModel}
          downloadProgress={walkthroughSettings.downloadProgress}
          onModelChange={(model) => setWalkthroughSettings(prev => ({ ...prev, selectedModel: model }))}
          maxWordsLine={walkthroughSettings.maxWordsLine}
          textFormat={walkthroughSettings.textFormat}
          removePunctuation={walkthroughSettings.removePunctuation}
          censorWords={walkthroughSettings.censorWords}
          sensitiveWords={walkthroughSettings.sensitiveWords}
          onMaxWordsLineChange={(value) => setWalkthroughSettings(prev => ({ ...prev, maxWordsLine: value }))}
          onTextFormatChange={(format) => setWalkthroughSettings(prev => ({ ...prev, textFormat: format }))}
          onRemovePunctuationChange={(checked) => setWalkthroughSettings(prev => ({ ...prev, removePunctuation: checked }))}
          onCensorWordsChange={(checked) => setWalkthroughSettings(prev => ({ ...prev, censorWords: checked }))}
          onSensitiveWordsChange={(words) => setWalkthroughSettings(prev => ({ ...prev, sensitiveWords: words }))}
          onDeleteModel={(modelValue) => {
            setWalkthroughSettings(prev => ({
              ...prev,
              models: prev.models.map(m => m.value === modelValue ? { ...m, isDownloaded: false } : m),
              selectedModel: prev.selectedModel.value === modelValue
                ? { ...prev.selectedModel, isDownloaded: false }
                : prev.selectedModel
            }))
          }}
        />
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default App;