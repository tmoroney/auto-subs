import * as React from "react"
import {
    ChevronDown as ChevronDownIcon,
    Heart,
    Github,
    Captions,
    AlertTriangle,
    X,
    HelpCircle
} from "lucide-react"

import { Button } from "@/components/ui/button"

import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"


import { useIsMobile } from "@/hooks/use-mobile"
import { MobileCaptionViewer } from "@/components/mobile-caption-viewer"
import { useGlobal } from "@/contexts/GlobalContext"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { AudioFileCard } from "./settings-cards/audio-file-card"
import { AudioInputCard } from "./settings-cards/audio-input-card"
import { CaptionSettingsCard } from "./settings-cards/caption-settings-card"
import { LanguageSettingsCard } from "@/components/settings-cards/language-settings-card"
import { ModelSelectionCard, Model } from "./settings-cards/model-selection-card"
import { SpeakerLabelingCard } from "./settings-cards/speaker-labeling-card"
import { TextFormattingCard } from "./settings-cards/text-formatting-card"

const models = [
    {
        value: "tiny",
        label: "Tiny",
        description: "Fastest",
        size: "75MB",
        ram: "1GB",
        image: "/hummingbird.png",
        details: "Smallest and fastest model. Great for quick drafts or low-resource devices. Lower accuracy on tough audio.",
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
]



interface TranscriptionSettingsProps {
    isStandaloneMode: boolean
    onShowTutorial?: () => void
    walkthroughSettings?: {
        selectedFile: string | null
        selectedTracks: string[]
        selectedTemplate: { value: string; label: string }
        sourceLanguage: string
        translate: boolean
        selectedModel: {
            value: string
            label: string
            description: string
            size: string
            ram: string
            image: string
            details: string
            isDownloaded: boolean
        }
        models: Array<{
            value: string
            label: string
            description: string
            size: string
            ram: string
            image: string
            details: string
            isDownloaded: boolean
        }>
        downloadingModel: string | null
        downloadProgress: number
    }
    onWalkthroughSettingsChange?: (settings: any) => void
}

export const TranscriptionSettings = ({
    isStandaloneMode,
    onShowTutorial,
    walkthroughSettings,
    onWalkthroughSettingsChange
}: TranscriptionSettingsProps) => {
    const { timelineInfo } = useGlobal()
    const [selectedTemplate, setSelectedTemplate] = React.useState<{ value: string; label: string }>({ value: "default", label: "Default Text+" })

    const [selectedModel, setSelectedModel] = React.useState(walkthroughSettings?.selectedModel || models[1])
    const [downloadingModel, setDownloadingModel] = React.useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = React.useState<number>(0)
    const [isModelDownloading, setIsModelDownloading] = React.useState(false)
    const [isUpdateAvailable] = React.useState<boolean>(false)
    const [isUpdateDismissed, setIsUpdateDismissed] = React.useState(false)
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [transcriptionProgress, setTranscriptionProgress] = React.useState(0)
    const [modelsState, setModelsState] = React.useState(walkthroughSettings?.models || models)
    const [showMobileCaptions, setShowMobileCaptions] = React.useState(false)
    const [selectedTracks, setSelectedTracks] = React.useState<string[]>(['1']) // Default to Track 1 selected
    const [openTrackSelector, setOpenTrackSelector] = React.useState(false)
    const isMobile = useIsMobile()



    const [settings, setSettings] = React.useState({
        diarize: true,
        translate: false,
        numSpeakers: "3",
        sourceLanguage: "en",
        maxWordsLine: "10",
        removePunctuation: false,
        textFormat: "none" as const,
        censorWords: false,
        sensitiveWords: [] as string[],
    })

    const updateSetting = (key: string, value: any) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }

    // Listen for transcription and model download progress events from the backend
    React.useEffect(() => {
        let unlistenTranscription: (() => void) | null = null;
        let unlistenModelStart: (() => void) | null = null;
        let unlistenModelProgress: (() => void) | null = null;
        let unlistenModelComplete: (() => void) | null = null;
        let unlistenModelCache: (() => void) | null = null;

        const setupEventListeners = async () => {
            try {
                // Transcription progress listener
                unlistenTranscription = await listen<number>('transcription-progress', (event) => {
                    console.log('Received transcription progress:', event.payload);
                    setTranscriptionProgress(event.payload);
                });

                // Model download start listener
                unlistenModelStart = await listen<[string, string, number]>('model-download-start', (event) => {
                    const [modelName] = event.payload;
                    setDownloadingModel(modelName);
                    setIsModelDownloading(true);
                    setDownloadProgress(0);
                });

                // Model download progress listener
                unlistenModelProgress = await listen<number>('model-download-progress', (event) => {
                    setDownloadProgress(event.payload);
                });

                // Model download complete listener
                unlistenModelComplete = await listen<string>('model-download-complete', () => {
                    setDownloadingModel(null);
                    setIsModelDownloading(false);
                    setDownloadProgress(0);
                });

                // Model found in cache listener
                unlistenModelCache = await listen<string>('model-found-in-cache', () => {
                    // No action needed when model is found in cache
                });
            } catch (error) {
                console.error('Failed to setup event listeners:', error);
            }
        };

        setupEventListeners();

        return () => {
            if (unlistenTranscription) unlistenTranscription();
            if (unlistenModelStart) unlistenModelStart();
            if (unlistenModelProgress) unlistenModelProgress();
            if (unlistenModelComplete) unlistenModelComplete();
            if (unlistenModelCache) unlistenModelCache();
        };
    }, []);

    const handleDeleteModel = async (modelValue: string) => {
        try {
            // Call the backend to delete the model files
            await invoke('delete_model', { model: modelValue })
            
            // Update the local state to reflect the deletion
            setModelsState((prevModels) => prevModels.map((m) => (m.value === modelValue ? { ...m, isDownloaded: false } : m)))
            if (selectedModel.value === modelValue) {
                setSelectedModel((prev) => ({ ...prev, isDownloaded: false }))
            }
            
            console.log(`Successfully deleted model: ${modelValue}`)
        } catch (error) {
            console.error(`Failed to delete model ${modelValue}:`, error)
            // You could add a toast notification here to inform the user of the error
        }
    }

    const handleStartTranscription = async () => {
        if (!selectedFile) {
            // Or show some error to the user
            console.error("No file selected")
            return
        }

        setIsTranscribing(true)
        setTranscriptionProgress(0)

        const options = {
            // @ts-ignore
            audioPath: selectedFile,
            model: selectedModel.value,
            lang: settings.sourceLanguage === "auto" ? null : settings.sourceLanguage,
            enableDiarize: settings.diarize,
            maxSpeakers: settings.diarize
                ? (parseInt(settings.numSpeakers) === 0 ? null : parseInt(settings.numSpeakers))
                : null,
        }

        try {
            console.log("Invoking transcribe_audio with options:", options)
            const transcript = await invoke("transcribe_audio", { options })
            console.log("Transcription successful:", transcript)
            // Handle successful transcription, e.g., display the transcript
        } catch (error) {
            console.error("Transcription failed:", error)
            // Handle error, e.g., show an error message to the user
        } finally {
            setIsTranscribing(false)
            setTranscriptionProgress(0) // Reset progress
            // set modelsState to reflect that the model is downloaded
            setModelsState((prevModels) => prevModels.map((m) => (m.value === selectedModel.value ? { ...m, isDownloaded: true } : m)))
            // set selectedModel to reflect that the model is downloaded
            setSelectedModel((prev) => ({ ...prev, isDownloaded: true }))
        }
    }

    // Handle model change - sync with walkthrough settings
    const handleModelChange = (model: Model) => {
        setSelectedModel(model)
        if (onWalkthroughSettingsChange && walkthroughSettings) {
            onWalkthroughSettingsChange({
                ...walkthroughSettings,
                selectedModel: model
            })
        }
    }

    // Check which models are downloaded when component mounts
    React.useEffect(() => {
        const checkDownloadedModels = async () => {
            try {
                const downloadedModels = await invoke("get_downloaded_models") as string[]
                console.log("Downloaded models:", downloadedModels)

                // Update modelsState based on downloaded models
                const updatedModels = (walkthroughSettings?.models || models).map(model => ({
                    ...model,
                    isDownloaded: downloadedModels.some(downloadedModel =>
                        downloadedModel.includes(model.value)
                    )
                }))
                setModelsState(updatedModels)

                // Also update walkthrough settings if available
                if (onWalkthroughSettingsChange && walkthroughSettings) {
                    onWalkthroughSettingsChange({
                        ...walkthroughSettings,
                        models: updatedModels
                    })
                }

                // Update selectedModel if it's in the downloaded models
                const currentSelected = walkthroughSettings?.selectedModel || selectedModel
                const isSelectedDownloaded = downloadedModels.some(downloadedModel =>
                    downloadedModel.includes(currentSelected.value)
                )
                const updatedSelectedModel = {
                    ...currentSelected,
                    isDownloaded: isSelectedDownloaded
                }
                setSelectedModel(updatedSelectedModel)

                // Also update walkthrough settings if available
                if (onWalkthroughSettingsChange && walkthroughSettings) {
                    onWalkthroughSettingsChange({
                        ...walkthroughSettings,
                        selectedModel: updatedSelectedModel
                    })
                }
            } catch (error) {
                console.error("Failed to check downloaded models:", error)
            }
        }

        checkDownloadedModels()
    }, [])

    // Sync local state with walkthrough settings when they change
    React.useEffect(() => {
        if (walkthroughSettings) {
            setSelectedModel(walkthroughSettings.selectedModel)
            setModelsState(walkthroughSettings.models)
        }
    }, [walkthroughSettings?.selectedModel, walkthroughSettings?.models])

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-60px)] bg-background overflow-y-auto">
                {/* Main Content */}
                <div className="flex-1 p-4 space-y-6">
                    {/* Update Alert */}
                    {!isUpdateDismissed && isUpdateAvailable && (
                        <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                            <AlertTriangle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="flex items-center justify-between">
                                <div>
                                    <strong className="text-green-800 dark:text-green-200">Update Available!</strong>
                                    <p className="text-xs text-green-700 dark:text-green-300">
                                        Click the link to get the latest version.
                                    </p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsUpdateDismissed(true)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* File Source / DaVinci Resolve */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                {!isStandaloneMode && (
                                    <img
                                        src="/davinci-resolve-logo.png"
                                        alt="DaVinci Resolve Logo"
                                        className="h-5 w-5 mr-0 inline-block"
                                        style={{ verticalAlign: "middle" }}
                                    />
                                )}
                                {isStandaloneMode ? "File Source" : "DaVinci Resolve"}
                            </h3>
                            {!isStandaloneMode && (
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${!timelineInfo || !timelineInfo.timelineId ? 'bg-red-500' : 'bg-green-500'}`}
                                        title={!timelineInfo || !timelineInfo.timelineId ? "Disconnected" : "Connected"}
                                    />
                                    <span
                                        className="text-xs font-medium text-muted-foreground truncate max-w-[120px]"
                                        title={!timelineInfo || !timelineInfo.timelineId ? 'Disconnected' : timelineInfo.name || 'Current Timeline'}
                                    >
                                        {!timelineInfo || !timelineInfo.timelineId ? 'Disconnected' : timelineInfo.name || 'Current Timeline'}
                                    </span>
                                </div>
                            )}
                            <div className="flex-1 h-px bg-border ml-4"></div>
                        </div>
                        <div className="space-y-4">
                            {isStandaloneMode ? (
                                <div>
                                    <AudioFileCard
                                        selectedFile={walkthroughSettings?.selectedFile ?? selectedFile}
                                        onFileSelect={(file) => {
                                            setSelectedFile(file)
                                            if (onWalkthroughSettingsChange && walkthroughSettings) {
                                                onWalkthroughSettingsChange({
                                                    ...walkthroughSettings,
                                                    selectedFile: file
                                                })
                                            }
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <AudioInputCard
                                        selectedTracks={walkthroughSettings?.selectedTracks ?? selectedTracks}
                                        onTracksChange={(tracks) => {
                                            setSelectedTracks(tracks)
                                            if (onWalkthroughSettingsChange && walkthroughSettings) {
                                                onWalkthroughSettingsChange({
                                                    ...walkthroughSettings,
                                                    selectedTracks: tracks
                                                })
                                            }
                                        }}
                                    />
                                    <CaptionSettingsCard
                                        selectedTemplate={walkthroughSettings?.selectedTemplate ?? selectedTemplate}
                                        onTemplateChange={(template) => {
                                            setSelectedTemplate(template)
                                            if (onWalkthroughSettingsChange && walkthroughSettings) {
                                                onWalkthroughSettingsChange({
                                                    ...walkthroughSettings,
                                                    selectedTemplate: template
                                                })
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>



                    {/* Processing */}
                    <Collapsible defaultOpen className="space-y-3">
                        <div className="flex items-center gap-4">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto group">
                                    <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                                    <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        Processing
                                    </h3>
                                </Button>
                            </CollapsibleTrigger>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <CollapsibleContent>
                            <div className="space-y-4">

                                {/* Language */}
                                <LanguageSettingsCard
                                    sourceLanguage={walkthroughSettings?.sourceLanguage || settings.sourceLanguage}
                                    translate={walkthroughSettings?.translate || settings.translate}
                                    onSourceLanguageChange={(language: string) => {
                                        updateSetting('sourceLanguage', language);
                                        if (onWalkthroughSettingsChange && walkthroughSettings) {
                                            onWalkthroughSettingsChange({
                                                ...walkthroughSettings,
                                                sourceLanguage: language
                                            });
                                        }
                                    }}
                                    onTranslateChange={(translate: boolean) => {
                                        updateSetting('translate', translate);
                                        if (onWalkthroughSettingsChange && walkthroughSettings) {
                                            onWalkthroughSettingsChange({
                                                ...walkthroughSettings,
                                                translate: translate
                                            });
                                        }
                                    }}
                                />

                                {/* Speaker Labeling */}
                                <SpeakerLabelingCard
                                    diarize={settings.diarize}
                                    numSpeakers={settings.numSpeakers}
                                    onDiarizeChange={(checked) => updateSetting("diarize", checked)}
                                    onNumSpeakersChange={(value) => updateSetting("numSpeakers", value)}
                                />

                                {/* Model */}
                                <ModelSelectionCard
                                    selectedModel={selectedModel}
                                    models={modelsState}
                                    downloadingModel={downloadingModel}
                                    downloadProgress={downloadProgress}
                                    onModelChange={handleModelChange}
                                    onDeleteModel={handleDeleteModel}
                                />
                            </div>

                        </CollapsibleContent>
                    </Collapsible>



                    {/* Text Formatting */}
                    <Collapsible defaultOpen className="space-y-3">
                        <div className="flex items-center gap-4">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto group">
                                    <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                                    <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        Text Formatting
                                    </h3>
                                </Button>
                            </CollapsibleTrigger>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <CollapsibleContent>
                            <TextFormattingCard
                                maxWordsLine={settings.maxWordsLine}
                                textFormat={settings.textFormat}
                                removePunctuation={settings.removePunctuation}
                                censorWords={settings.censorWords}
                                sensitiveWords={settings.sensitiveWords}
                                onMaxWordsLineChange={(value) => updateSetting("maxWordsLine", value)}
                                onTextFormatChange={(format) => updateSetting("textFormat", format)}
                                onRemovePunctuationChange={(checked) => updateSetting("removePunctuation", checked)}
                                onCensorWordsChange={(checked) => updateSetting("censorWords", checked)}
                                onSensitiveWordsChange={(words) => updateSetting("sensitiveWords", words)}
                            />
                        </CollapsibleContent>
                    </Collapsible>

                    {/* About & Support */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                About & Support
                            </h3>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <div className="space-y-4">
                            <Button
                                asChild
                                variant="outline"
                                className="w-full text-pink-500 border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/20 transition-colors relative overflow-hidden group"
                            >
                                <a
                                    href="https://buymeacoffee.com/tmoroney"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center w-full h-full"
                                >
                                    <Heart className="h-4 w-4 mr-2 group-hover:fill-pink-500 transition-colors" />
                                    <span>Support AutoSubs</span>

                                    {/* Bursting hearts animation */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        {[
                                            { tx: '-80px', ty: '-80px', s: 1.5, r: '-20deg', d: '0s' },
                                            { tx: '70px', ty: '-90px', s: 1.2, r: '25deg', d: '0.05s' },
                                            { tx: '-30px', ty: '-120px', s: 1.4, r: '5deg', d: '0.1s' },
                                            { tx: '90px', ty: '-70px', s: 1.1, r: '-15deg', d: '0.15s' },
                                            { tx: '0px', ty: '-110px', s: 1.6, r: '0deg', d: '0.2s' },
                                            { tx: '-90px', ty: '-60px', s: 1.2, r: '15deg', d: '0.25s' },
                                            { tx: '60px', ty: '-110px', s: 1.3, r: '-5deg', d: '0.3s' },
                                        ].map((p, i) => (
                                            <Heart
                                                key={i}
                                                className="heart-anim absolute top-1/2 left-1/2 h-3 w-3 text-pink-400 opacity-0"
                                                style={{
                                                    '--tx': p.tx,
                                                    '--ty': p.ty,
                                                    '--s': p.s,
                                                    '--r': p.r,
                                                    animationDelay: p.d,
                                                } as React.CSSProperties}
                                            />
                                        ))}
                                    </div>
                                </a>
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant="outline"
                                    className="w-full bg-transparent"
                                    onClick={onShowTutorial}
                                >
                                    <HelpCircle className="h-4 w-4 mr-2" />
                                    Tutorial
                                </Button>
                                <Button variant="outline" className="w-full bg-transparent" asChild>
                                    <a href="https://github.com/tmoroney/auto-subs" target="_blank" rel="noopener noreferrer">
                                        <Github className="h-4 w-4 mr-2" />
                                        Source
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Footer */}
                <div className="sticky bottom-0 p-4 border-t bg-background/95 backdrop-blur-sm z-20 shadow-lg space-y-2">
                    {/* Mobile Caption Viewer Button */}
                    {isMobile && (
                        <Button onClick={() => setShowMobileCaptions(true)} variant="outline" className="w-full" size="lg">
                            <Captions className="h-5 w-5 mr-2" />
                            View Captions
                        </Button>
                    )}

                    {/* Model Download Progress */}
                    {isModelDownloading && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Downloading {downloadingModel} model...</span>
                                <span>{downloadProgress}%</span>
                            </div>
                            <Progress 
                                value={downloadProgress} 
                                className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-purple-500 [&>div]:to-violet-600" 
                            />
                        </div>
                    )}

                    {/* Transcription Progress */}
                    {isTranscribing && !isModelDownloading && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Transcription Progress</span>
                                <span>{transcriptionProgress}%</span>
                            </div>
                            <Progress value={transcriptionProgress} className="h-2" />
                        </div>
                    )}

                    {/* Start Transcription Button */}
                    <Button
                        onClick={handleStartTranscription}
                        disabled={isTranscribing || downloadingModel !== null}
                        className="w-full"
                        size="lg"
                    >
                        {isTranscribing ? "Processing..." : "Start Transcription"}
                    </Button>
                </div>
            </div>

            {/* Mobile Caption Viewer */}
            {isMobile && <MobileCaptionViewer isOpen={showMobileCaptions} onClose={() => setShowMobileCaptions(false)} />}
        </>
    )
}
