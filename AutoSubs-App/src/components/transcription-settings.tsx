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
import { saveTranscript, generateTranscriptFilename } from "@/utils/fileUtils"
import { AudioFileCard } from "./settings-cards/audio-file-card"
import { AudioInputCard } from "./settings-cards/audio-input-card"
import { CaptionSettingsCard } from "./settings-cards/caption-settings-card"
import { LanguageSettingsCard } from "@/components/settings-cards/language-settings-card"
import { ModelSelectionCard } from "./settings-cards/model-selection-card"
import { SpeakerLabelingCard } from "./settings-cards/speaker-labeling-card"
import { TextFormattingCard } from "./settings-cards/text-formatting-card"

interface TranscriptionSettingsProps {
    isStandaloneMode: boolean
    onShowTutorial?: () => void
}

export function TranscriptionSettings({
    isStandaloneMode,
    onShowTutorial
}: TranscriptionSettingsProps) {
    const isMobile = useIsMobile()
    const {timelineInfo, setFileInput, fileInput, settings, updateSetting, updateSubtitles, modelsState, checkDownloadedModels } = useGlobal()
    const [downloadingModel, setDownloadingModel] = React.useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = React.useState<number>(0)
    const [isModelDownloading, setIsModelDownloading] = React.useState(false)
    const [isUpdateAvailable] = React.useState<boolean>(false)
    const [isUpdateDismissed, setIsUpdateDismissed] = React.useState(false)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [transcriptionProgress, setTranscriptionProgress] = React.useState(0)
    const [showMobileCaptions, setShowMobileCaptions] = React.useState(false)

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

            // Update the models state
            await checkDownloadedModels()

            console.log(`Successfully deleted model: ${modelValue}`)
        } catch (error) {
            console.error(`Failed to delete model ${modelValue}:`, error)
            // You could add a toast notification here to inform the user of the error
        }
    }

    const handleStartTranscription = async () => {
        if (!fileInput) {
            // Or show some error to the user
            console.error("No file selected")
            return
        }

        setIsTranscribing(true)
        setTranscriptionProgress(0)

        const options = {
            // @ts-ignore
            audioPath: fileInput,
            model: modelsState[settings.model].value,
            lang: settings.language === "auto" ? null : settings.language,
            enableDiarize: settings.enableDiarize,
            maxSpeakers: settings.maxSpeakers,
        }

        try {
            console.log("Invoking transcribe_audio with options:", options)
            const transcript = await invoke("transcribe_audio", { options })
            console.log("Transcription successful:", transcript)

            // Generate filename based on mode and input
            const filename = generateTranscriptFilename(
                isStandaloneMode,
                fileInput,
                timelineInfo?.name
            )

            // Save transcript to JSON file
            await saveTranscript(transcript as any, filename)
            console.log("Transcript saved to:", filename)

            // Transform transcript segments to subtitle format and update the caption list
            const subtitles = (transcript as any).segments.map((segment: any, index: number) => ({
                id: index.toString(),
                start: segment.start,
                end: segment.end,
                text: segment.text.trim(),
                speaker: segment.speaker || undefined,
                words: segment.words || []
            }))

            // Update the global subtitles state to show in sidebar
            updateSubtitles(subtitles)
            console.log("Caption list updated with", subtitles.length, "captions")

        } catch (error) {
            console.error("Transcription failed:", error)
            // Handle error, e.g., show an error message to the user
        } finally {
            setIsTranscribing(false)
            setTranscriptionProgress(0) // Reset progress
            // set modelsState to reflect that the model is downloaded
            await checkDownloadedModels()
        }
    }

    // Handle model change - sync with global context
    const handleModelChange = (model: number) => {
        updateSetting('model', model)
    }

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
                                        selectedFile={fileInput}
                                        onFileSelect={(file) => setFileInput(file)}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <AudioInputCard
                                        selectedTracks={settings.selectedInputTracks}
                                        inputTracks={timelineInfo?.inputTracks || []}
                                        onTracksChange={(tracks) => {
                                            updateSetting("selectedInputTracks", tracks)
                                        }}
                                    />
                                    <CaptionSettingsCard
                                        selectedTemplate={settings.selectedTemplate}
                                        onTemplateChange={(template) => {
                                            updateSetting("selectedTemplate", template)
                                        }}
                                        outputTracks={timelineInfo?.outputTracks || []}
                                        templates={timelineInfo?.templates || []}
                                        selectedOutputTrack={settings.selectedOutputTrack}
                                        onOutputTrackChange={(track) => {
                                            updateSetting("selectedOutputTrack", track)
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
                                    sourceLanguage={settings.language}
                                    translate={settings.translate}
                                    onSourceLanguageChange={(language: string) => {
                                        updateSetting('language', language);
                                    }}
                                    onTranslateChange={(translate: boolean) => {
                                        updateSetting('translate', translate);
                                    }}
                                />

                                {/* Speaker Labeling */}
                                <SpeakerLabelingCard
                                    diarize={settings.enableDiarize}
                                    maxSpeakers={settings.maxSpeakers}
                                    onDiarizeChange={(checked) => updateSetting("enableDiarize", checked)}
                                    onMaxSpeakersChange={(value) => updateSetting("maxSpeakers", value)}
                                />

                                {/* Model */}
                                <ModelSelectionCard
                                    selectedModel={settings.model}
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
                                maxWords={settings.maxWords}
                                textFormat={settings.textFormat}
                                removePunctuation={settings.removePunctuation}
                                enableCensor={settings.enableCensor}
                                censorWords={settings.censorWords}
                                onMaxWordsChange={(value) => updateSetting("maxWords", value)}
                                onTextFormatChange={(format) => updateSetting("textFormat", format)}
                                onRemovePunctuationChange={(checked) => updateSetting("removePunctuation", checked)}
                                onEnableCensorChange={(checked) => updateSetting("enableCensor", checked)}
                                onCensorWordsChange={(words) => updateSetting("censorWords", words)}
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
                <div className="sticky bottom-0 p-4 border-t bg-background/95 backdrop-blur-sm z-20 shadow-2xl space-y-3">
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
