import * as React from "react"
import { ChevronLeft, ChevronRight, Check, ChevronLast } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SubtitleSettingsCard } from "@/components/settings-cards/subtitle-settings-card"
import { LanguageSettingsCard } from "@/components/settings-cards/language-settings-card"
import { ModelSelectionCard } from "@/components/settings-cards/model-selection-card"
import { TextFormattingCard } from "@/components/settings-cards/text-formatting-card"
import { useGlobal } from "@/contexts/GlobalContext"

interface WalkthroughSlide {
  id: string
  title: string
  description: string
  component: React.ReactNode
  canProceed: boolean
}

interface SetupWalkthroughProps {
  isOpen: boolean
  onClose: () => void
}

export const SetupWalkthrough = ({
  isOpen,
  onClose,
}: SetupWalkthroughProps) => {
  const [currentSlide, setCurrentSlide] = React.useState(0)
  const { settings, updateSetting, modelsState, timelineInfo, isStandaloneMode, setIsStandaloneMode } = useGlobal()

  const slides: WalkthroughSlide[] = React.useMemo(() => {
    const baseSlides: WalkthroughSlide[] = [
      {
        id: "welcome",
        title: "Welcome to AutoSubs 🎉",
        description: "Let's set up your preferences. This will only take a minute 😀",
        component: (
          <Card className="p-8 text-center max-w-md mx-auto">
            <div className="space-y-4">
              <img src="/autosubs-logo.png" alt="AutoSubs logo" className="mx-auto w-24 h-24 mb-4" />
              <h2 className="text-2xl font-bold">Ready to get started?</h2>
              <p className="text-muted-foreground">
                We'll guide you through the basics. You can change these settings anytime, so no pressure!
              </p>
            </div>
          </Card>
        ),
        canProceed: true,
      },
      {
        id: "mode-selection",
        title: "Choose Your Mode",
        description: "Switch between Resolve and Standalone modes.",
        component: (
          <Card className="p-8 max-w-xl mx-auto">
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">How do you want to use AutoSubs?</h3>
              </div>

              <div className="flex justify-center">
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

              <div className="text-center space-y-2">
                {isStandaloneMode ? (
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Standalone Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Upload audio files directly and generate subtitle files
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium text-sm">DaVinci Resolve Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Connect to DaVinci Resolve and add subtitles directly to your timeline.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ),
        canProceed: true,
      },
    ]

    baseSlides.push(
      {
        id: "model",
        title: "Choose AI model",
        description: "'Small' is fast and accurate for most users.",
        component: (
          <div className="max-w-2xl mx-auto">
            <ModelSelectionCard
              language={settings.language}
              selectedModel={settings.model}
              models={modelsState}
              onModelChange={(model) => updateSetting("model", model)}
              walkthroughMode={true}
            />
          </div>
        ),
        canProceed: true,
      },
      {
        id: "language",
        title: "Input Language",
        description: "What language is spoken in the audio?",
        component: (
          <div className="max-w-lg mx-auto">
            <LanguageSettingsCard
              sourceLanguage={settings.language}
              translate={settings.translate}
              onSourceLanguageChange={(language) => updateSetting("language", language)}
              onTranslateChange={(translate) => updateSetting("translate", translate)}
            />
          </div>
        ),
        canProceed: true,
      },
      {
        id: "text-formatting",
        title: "Text Formatting Options",
        description: "Choose how you want your subtitles formatted.",
        component: (
          <div className="max-w-lg mx-auto">
            <TextFormattingCard
              maxWordsPerLine={settings.maxWordsPerLine}
              maxCharsPerLine={settings.maxCharsPerLine}
              maxLinesPerSubtitle={settings.maxLinesPerSubtitle}
              textCase={settings.textCase}
              removePunctuation={settings.removePunctuation}
              splitOnPunctuation={settings.splitOnPunctuation}
              enableCensor={settings.enableCensor}
              censoredWords={settings.censoredWords}
              onMaxWordsPerLineChange={(value) => updateSetting("maxWordsPerLine", value)}
              onMaxCharsPerLineChange={(value) => updateSetting("maxCharsPerLine", value)}
              onMaxLinesPerSubtitleChange={(value) => updateSetting("maxLinesPerSubtitle", value)}
              onTextCaseChange={(textCase) => updateSetting("textCase", textCase)}
              onRemovePunctuationChange={(checked) => updateSetting("removePunctuation", checked)}
              onSplitOnPunctuationChange={(checked) => updateSetting("splitOnPunctuation", checked)}
              onEnableCensorChange={(checked) => updateSetting("enableCensor", checked)}
              onCensoredWordsChange={(words) => updateSetting("censoredWords", words)}
            />
          </div>
        ),
        canProceed: true,
      },
      {
        id: "complete",
        title: "",
        description: "",
        component: (
          <Card className="p-8 text-center max-w-md mx-auto">
            <div className="space-y-4">
              <Check className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto" />
              <h2 className="text-2xl font-bold">Setup Complete</h2>
              <p className="text-muted-foreground">
                You’re ready to start transcribing!
              </p>
              <p className="text-muted-foreground">
                You can revisit this walkthrough or adjust your preferences anytime from the main settings.
              </p>
            </div>
          </Card>
        ),
        canProceed: true,
      }
    )

    if (!isStandaloneMode) {
      baseSlides.push({
        id: "subtitle-settings",
        title: "Subtitle Settings",
        description: "Choose a template (Fusion Text+) and where subtitles appear.",
        component: (
          <div className="max-w-lg mx-auto">
            <SubtitleSettingsCard
              selectedTemplate={settings.selectedTemplate}
              onTemplateChange={(template) => updateSetting("selectedTemplate", template)}
              outputTracks={timelineInfo?.outputTracks || []}
              templates={timelineInfo?.templates || []}
              selectedOutputTrack="1"
              onOutputTrackChange={(track) => {
                // Handle output track change if needed
                console.log("Selected output track:", track);
              }}
            />
          </div>
        ),
        canProceed: true,
      })
    }

    return baseSlides
  }, [
    isStandaloneMode,
    modelsState,
    settings,
    updateSetting,
  ])

  const currentSlideData = slides[currentSlide]
  const isLastSlide = currentSlide === slides.length - 1
  const isFirstSlide = currentSlide === 0

  const handleNext = () => {
    if (currentSlideData.canProceed) {
      if (isLastSlide) {
        onClose()
      } else {
        setCurrentSlide(prev => prev + 1)
      }
    }
  }

  const handlePrevious = () => {
    if (!isFirstSlide) {
      setCurrentSlide(prev => prev - 1)
    }
  }

  const handleClose = () => {
    setCurrentSlide(0)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
      <div className="bg-background w-full h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0 relative">
          {/* Title (left) */}
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-xl font-semibold whitespace-nowrap">Setup</h1>
          </div>

          {/* Progress Bar (centered absolutely) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currentSlide + 1} of {slides.length}
              </span>
              <div className="flex gap-1">
                {slides.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${index === currentSlide
                      ? "bg-primary"
                      : index < currentSlide
                        ? "bg-green-500"
                        : "bg-muted"
                      }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Skip Button (right) */}
          <Button variant="secondary" size="default" onClick={handleClose}>
            Skip
            <ChevronLast className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center justify-center w-full max-w-2xl px-8">
            <div className="text-center mb-5">
              <h2 className="text-2xl font-bold mb-2">{currentSlideData.title}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {currentSlideData.description}
              </p>
            </div>

            <div className="w-full">
              {currentSlideData.component}
            </div>
          </div>
        </div>

        {/* Footer - Stuck to bottom */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30 flex-shrink-0">
          <Button
            variant="outline"
            size="default"
            onClick={handlePrevious}
            disabled={isFirstSlide}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {!currentSlideData.canProceed && (
              <span className="text-sm text-muted-foreground">
                Complete this step to continue
              </span>
            )}
          </div>

          <Button
            onClick={handleNext}
            size="default"
            disabled={!currentSlideData.canProceed}
            className="flex items-center gap-2"
          >
            {isLastSlide ? (
              <>
                <Check className="h-4 w-4" />
                Finish
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
