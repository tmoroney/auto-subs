import * as React from "react"
import { ChevronLeft, ChevronRight, X, Check, Clapperboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AudioFileCard } from "./settings-cards/audio-file-card"
import { AudioInputCard } from "./settings-cards/audio-input-card"
import { CaptionSettingsCard } from "./settings-cards/caption-settings-card"
import { LanguageSettingsCard } from "./settings-cards/language-settings-card"
import { ModelSelectionCard, Model } from "./settings-cards/model-selection-card"
import { TextFormattingCard } from "./settings-cards/text-formatting-card"

interface SetupWalkthroughProps {
  isOpen: boolean
  onClose: () => void
  isStandaloneMode: boolean
  onModeChange: (isStandalone: boolean) => void
  // Settings state and handlers
  selectedFile: string | null
  onFileSelect: (file: string | null) => void
  selectedTracks: string[]
  onTracksChange: (tracks: string[]) => void
  selectedTemplate: { value: string; label: string }
  onTemplateChange: (template: { value: string; label: string }) => void
  sourceLanguage: string
  translate: boolean
  onSourceLanguageChange: (language: string) => void
  onTranslateChange: (translate: boolean) => void
  selectedModel: Model
  models: Model[]
  downloadingModel: string | null
  downloadProgress: number
  onModelChange: (model: Model) => void
  onDeleteModel: (modelValue: string) => void
  // Text formatting settings
  maxWordsLine: string
  textFormat: "none" | "uppercase" | "lowercase"
  removePunctuation: boolean
  censorWords: boolean
  sensitiveWords: string[]
  onMaxWordsLineChange: (value: string) => void
  onTextFormatChange: (format: "none" | "uppercase" | "lowercase") => void
  onRemovePunctuationChange: (checked: boolean) => void
  onCensorWordsChange: (checked: boolean) => void
  onSensitiveWordsChange: (words: string[]) => void
}

interface WalkthroughSlide {
  id: string
  title: string
  description: string
  component: React.ReactNode
  canProceed: boolean
}

export const SetupWalkthrough = ({
  isOpen,
  onClose,
  isStandaloneMode,
  onModeChange,
  selectedFile,
  onFileSelect,
  selectedTracks,
  onTracksChange,
  selectedTemplate,
  onTemplateChange,
  sourceLanguage,
  translate,
  onSourceLanguageChange,
  onTranslateChange,
  selectedModel,
  models,
  downloadingModel,
  downloadProgress,
  onModelChange,
  onDeleteModel,
  maxWordsLine,
  textFormat,
  removePunctuation,
  censorWords,
  sensitiveWords,
  onMaxWordsLineChange,
  onTextFormatChange,
  onRemovePunctuationChange,
  onCensorWordsChange,
  onSensitiveWordsChange,
}: SetupWalkthroughProps) => {
  const [currentSlide, setCurrentSlide] = React.useState(0)

  const slides: WalkthroughSlide[] = React.useMemo(() => {
    const baseSlides: WalkthroughSlide[] = [
      {
        id: "welcome",
        title: "Welcome to AutoSubs",
        description: "Let's set up your transcription preferences. This will only take a minute and you can change these settings anytime.",
        component: (
          <Card className="p-8 text-center max-w-md mx-auto">
            <div className="space-y-4">
              <Clapperboard className="h-14 w-14  mx-auto" />
              <h2 className="text-2xl font-bold">Ready to get started?</h2>
              <p className="text-muted-foreground">
                We'll guide you through the essential settings to get you transcribing quickly and accurately.
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
                  onValueChange={(value) => onModeChange(value === "standalone")}
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
                      Connect to DaVinci Resolve and add captions directly to your timeline.
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

    if (isStandaloneMode) {
      baseSlides.push({
        id: "audio-file",
        title: "Select Your Audio File",
        description: "Choose the audio file you want to transcribe. We support WAV and MP3 formats.",
        component: (
          <div className="max-w-lg mx-auto">
            <AudioFileCard
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
            />
          </div>
        ),
        canProceed: selectedFile !== null,
      })
    } else {
      baseSlides.push({
        id: "audio-input",
        title: "Select Audio Tracks",
        description: "Choose the audio tracks in your current timeline to transcribe.",
        component: (
          <div className="max-w-lg mx-auto">
            <AudioInputCard
              selectedTracks={selectedTracks}
              onTracksChange={onTracksChange}
              walkthroughMode={true}
            />
          </div>
        ),
        canProceed: selectedTracks.length > 0,
      })

      baseSlides.push({
        id: "caption-settings",
        title: "Caption Settings",
        description: "Configure where your captions will appear and choose a template (Fusion Text+).",
        component: (
          <div className="max-w-lg mx-auto">
            <CaptionSettingsCard
              selectedTemplate={selectedTemplate}
              onTemplateChange={onTemplateChange}
            />
          </div>
        ),
        canProceed: true,
      })
    }

    baseSlides.push(
      {
        id: "language",
        title: "Input Language",
        description: "Select the language spoken in your audio. Choose 'Auto' if you're unsure.",
        component: (
          <div className="max-w-lg mx-auto">
            <LanguageSettingsCard
              sourceLanguage={sourceLanguage}
              translate={translate}
              onSourceLanguageChange={onSourceLanguageChange}
              onTranslateChange={onTranslateChange}
            />
          </div>
        ),
        canProceed: true,
      },
      {
        id: "model",
        title: "Choose AI Model",
        description: "Choose a Speech-to-Text model. 'Small' is fast and accurate for most users.",
        component: (
          <div className="max-w-2xl mx-auto">
            <ModelSelectionCard
              selectedModel={selectedModel}
              models={models}
              downloadingModel={downloadingModel}
              downloadProgress={downloadProgress}
              onModelChange={onModelChange}
              onDeleteModel={onDeleteModel}
              walkthroughMode={true}
            />
          </div>
        ),
        canProceed: true,
      },
      {
        id: "text-formatting",
        title: "Text Formatting Options",
        description: "Configure text formatting options like maximum words per line, text case, punctuation removal, and content filtering.",
        component: (
          <div className="max-w-lg mx-auto">
            <TextFormattingCard
              maxWordsLine={maxWordsLine}
              textFormat={textFormat}
              removePunctuation={removePunctuation}
              censorWords={censorWords}
              sensitiveWords={sensitiveWords}
              onMaxWordsLineChange={onMaxWordsLineChange}
              onTextFormatChange={onTextFormatChange}
              onRemovePunctuationChange={onRemovePunctuationChange}
              onCensorWordsChange={onCensorWordsChange}
              onSensitiveWordsChange={onSensitiveWordsChange}
            />
          </div>
        ),
        canProceed: true,
      },
      {
        id: "complete",
        title: "Setup Complete",
        description: "All your preferences are saved. You’re ready to start transcribing!",
        component: (
          <Card className="p-8 text-center max-w-md mx-auto">
            <div className="space-y-4">
              <Check className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto" />
              <h2 className="text-2xl font-bold">Setup Complete</h2>
              <p className="text-muted-foreground">
                You can revisit this walkthrough or adjust your preferences anytime from the main settings.
              </p>
            </div>
          </Card>
        ),
        canProceed: true,
      }
    )

    return baseSlides
  }, [
    isStandaloneMode,
    selectedFile,
    selectedTracks,
    selectedTemplate,
    sourceLanguage,
    translate,
    selectedModel,
    models,
    downloadingModel,
    downloadProgress,
    onFileSelect,
    onTracksChange,
    onTemplateChange,
    maxWordsLine,
    textFormat,
    removePunctuation,
    censorWords,
    sensitiveWords,
    onMaxWordsLineChange,
    onTextFormatChange,
    onRemovePunctuationChange,
    onCensorWordsChange,
    onSensitiveWordsChange,
    onSourceLanguageChange,
    onTranslateChange,
    onModelChange,
    onDeleteModel,
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
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0 relative">
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
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentSlide
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

          {/* Close Button (right) */}
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
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
        <div className="flex items-center justify-between p-6 border-t bg-muted/30 flex-shrink-0">
          <Button
            variant="outline"
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
