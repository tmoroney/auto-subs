import * as React from "react"
import {
    ChevronDown as ChevronDownIcon,
    Heart,
    Github,
    Captions,
    AlertTriangle,
    X,
    HelpCircle,
    XCircle,
    RefreshCcw,
    History,
    Film,
    Cable
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"


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
import { exportAudio, addSubtitlesToTimeline, getExportProgress, cancelExport } from "@/api/resolveAPI"
import { Card } from "./ui/card"

interface TranscriptionSettingsProps {
    isStandaloneMode: boolean
    onShowTutorial?: () => void
}

export function TranscriptionSettings({
    isStandaloneMode,
    onShowTutorial
}: TranscriptionSettingsProps) {
    const isMobile = useIsMobile()
    const { timelineInfo, setFileInput, fileInput, settings, updateSetting, updateSubtitles, modelsState, checkDownloadedModels, refresh, resetSettings } = useGlobal()
    const [downloadingModel, setDownloadingModel] = React.useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = React.useState<number>(0)
    const [isModelDownloading, setIsModelDownloading] = React.useState(false)
    const [isUpdateAvailable] = React.useState<boolean>(false)
    const [isUpdateDismissed, setIsUpdateDismissed] = React.useState(false)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [transcriptionProgress, setTranscriptionProgress] = React.useState(0)
    const [isExporting, setIsExporting] = React.useState(false)
    const [exportProgress, setExportProgress] = React.useState(0)
    const [isRefreshing, setIsRefreshing] = React.useState(false)
    // Ref to track cancellation requests - allows interrupting polling loops
    const cancelRequestedRef = React.useRef(false)
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

    /**
     * Validates input requirements before starting transcription
     * @returns {boolean} True if validation passes, false otherwise
     */
    const validateTranscriptionInput = (): boolean => {
        if (!fileInput && isStandaloneMode) {
            console.error("No file selected")
            return false
        }
        if (!timelineInfo && !isStandaloneMode) {
            console.error("No timeline selected")
            return false
        }
        return true
    }

    /**
     * Gets the audio path based on current mode
     * @returns {Promise<string | null>} Path to audio file
     */
    const getSourceAudio = async (): Promise<string | null> => {
        if (timelineInfo && !isStandaloneMode) {
            // Reset cancellation flag at the start of export
            cancelRequestedRef.current = false
            setIsExporting(true)
            setExportProgress(0)

            try {
                // Start the export (non-blocking)
                const exportResult = await exportAudio(settings.selectedInputTracks)
                console.log("Export started:", exportResult)

                // Poll for export progress until completion
                let exportCompleted = false
                let audioInfo = null

                while (!exportCompleted && !cancelRequestedRef.current) {
                    // Check if cancellation was requested before making the next API call
                    if (cancelRequestedRef.current) {
                        console.log("Export polling interrupted by cancellation request")
                        break
                    }

                    const progressResult = await getExportProgress()
                    console.log("Export progress:", progressResult)

                    // Update progress
                    setExportProgress(progressResult.progress || 0)

                    if (progressResult.completed) {
                        exportCompleted = true
                        audioInfo = progressResult.audioInfo
                        console.log("Export completed:", audioInfo)
                    } else if (progressResult.cancelled) {
                        console.log("Export was cancelled")
                        setIsExporting(false)
                        setExportProgress(0)
                        return null
                    } else if (progressResult.error) {
                        console.error("Export error:", progressResult.message)
                        setIsExporting(false)
                        setExportProgress(0)
                        throw new Error(progressResult.message || "Export failed")
                    }

                    // Wait before next poll (avoid overwhelming the server)
                    if (!exportCompleted && !cancelRequestedRef.current) {
                        await new Promise(resolve => setTimeout(resolve, 500))

                        // Check again after timeout in case cancellation happened during the wait
                        if (cancelRequestedRef.current) {
                            console.log("Export polling interrupted during wait interval")
                            break
                        }
                    }
                }

                setIsExporting(false)
                setExportProgress(100)
                return audioInfo?.path || null

            } catch (error) {
                setIsExporting(false)
                setExportProgress(0)
                throw error
            }
        } else {
            return fileInput
        }
    }

    /**
     * Creates transcription options object
     * @param {string} audioPath Path to audio file
     * @returns {object} Options for transcription
     */
    const createTranscriptionOptions = (audioPath: string): object => ({
        audioPath,
        model: modelsState[settings.model].value,
        lang: settings.language === "auto" ? null : settings.language,
        enableDiarize: settings.enableDiarize,
        maxSpeakers: settings.maxSpeakers,
    })

    /**
     * Processes transcription results
     * @param {any} transcript Raw transcript data
     * @returns {Promise<string>} Filename where transcript was saved
     */
    const processTranscriptionResults = async (transcript: any): Promise<string> => {
        // Generate filename for new transcript based on mode and input
        const filename = generateTranscriptFilename(
            isStandaloneMode,
            fileInput,
            timelineInfo?.timelineId
        )

        // Save transcript to JSON file
        const subtitles = await saveTranscript(transcript, filename)
        console.log("Transcript saved to:", filename)

        // Update the global subtitles state to show in sidebar
        updateSubtitles(subtitles)
        console.log("Caption list updated with", subtitles.length, "captions")

        return filename
    }

    /**
     * Main function to handle the transcription process
     */
    const handleStartTranscription = async () => {
        // Validate input requirements
        if (!validateTranscriptionInput()) {
            return
        }

        // Get audio path based on mode
        const audioPath = await getSourceAudio()
        if (!audioPath) {
            console.error("Failed to get audio path")
            return
        }

        // Set UI state to transcribing
        setIsTranscribing(true)
        setTranscriptionProgress(0)

        try {
            // Create and log transcription options
            const options = createTranscriptionOptions(audioPath)
            console.log("Invoking transcribe_audio with options:", options)

            // Perform transcription
            const transcript = await invoke("transcribe_audio", { options })
            console.log("Transcription successful:", transcript)

            // Process results and get filename
            const filename = await processTranscriptionResults(transcript as any)

            // Add subtitles to timeline if in Resolve mode
            if (!isStandaloneMode) {
                await addSubtitlesToTimeline(
                    filename,
                    settings.selectedTemplate.value,
                    settings.selectedOutputTrack
                )
            }
        } catch (error) {
            console.error("Transcription failed:", error)
            // Handle error, e.g., show an error message to the user
        } finally {
            // Reset UI state
            setIsTranscribing(false)
            setTranscriptionProgress(0) // Reset progress
            // Update model download status
            await checkDownloadedModels()
        }
    }

    /**
     * Handle cancellation of the current transcription or export
     * Calls the Tauri backend to interrupt the transcription process
     * Also cancels export if transcription hasn't started yet
     */
    const handleCancelTranscription = async () => {
        console.log("Cancelling process...")
        // Set cancellation flag immediately to interrupt any polling loops
        cancelRequestedRef.current = true

        try {
            // If transcription is active, cancel it
            if (isTranscribing) {
                await invoke("cancel_transcription")
                console.log("Transcription cancellation request sent to backend")
            }

            // If export is active (and transcription hasn't started), cancel export
            if (isExporting && !isTranscribing) {
                const cancelResult = await cancelExport()
                console.log("Export cancellation result:", cancelResult)
            }

            // Reset UI state
            setIsTranscribing(false)
            setTranscriptionProgress(0)
            setIsExporting(false)
            setExportProgress(0)
        } catch (error) {
            console.error("Failed to cancel process:", error)
            // Still reset UI state even if backend call fails
            setIsTranscribing(false)
            setTranscriptionProgress(0)
            setIsExporting(false)
            setExportProgress(0)
        } finally {
            // Ensure cancellation flag is set in all cases
            cancelRequestedRef.current = true
        }
    }

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-60px)] bg-background">
                {/* Main Content - Scrollable area */}
                <div className="flex-1 p-4 space-y-6 overflow-y-auto">
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
                    <div className="space-y-3">
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
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!timelineInfo || !timelineInfo.timelineId ? 'bg-red-500' : 'bg-green-500'}`} />
                                    <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
                                        {!timelineInfo || !timelineInfo.timelineId ? 'Disconnected' : 'Connected'}
                                    </span>
                                </div>
                            )}
                            <div className="flex-1 h-px bg-border ml-1"></div>
                        </div>
                        {isStandaloneMode ? (
                            <div>
                                <AudioFileCard
                                    selectedFile={fileInput}
                                    onFileSelect={(file) => setFileInput(file)}
                                />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <Card className="flex items-center gap-2 px-1.5 py-1 shadow-none rounded bg-slate-100 dark:bg-slate-900">
                                    <div className={`ml-1 rounded ${
                                        !timelineInfo || !timelineInfo.timelineId 
                                            ? 'dark:bg-red-900/20 text-red-500 dark:text-red-500' 
                                            : 'dark:bg-green-900/20 text-green-500 dark:text-green-500'
                                    }`}>
                                        <Cable className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-medium font-mono text-foreground truncate">
                                            {!timelineInfo || !timelineInfo.timelineId ? 'Open a timeline in Resolve.' : timelineInfo.name}
                                        </div>
                                    </div>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={async () => {
                                                    setIsRefreshing(true);
                                                    await refresh();
                                                    setTimeout(() => setIsRefreshing(false), 400);
                                                }}
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                disabled={isRefreshing}
                                            >
                                                <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            Refresh
                                        </TooltipContent>
                                    </Tooltip>
                                </Card>
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
                                    onModelChange={(model) => updateSetting('model', model)}
                                    onDeleteModel={(model) => handleDeleteModel(model)}
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
                    <div className="space-y-3">
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                About & Support
                            </h3>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={onShowTutorial}
                                >
                                    <HelpCircle className="h-4 w-4 mr-2" />
                                    Tutorial
                                </Button>
                                <Button variant="outline" size="default" onClick={resetSettings}>
                                    <History className="h-4 w-4 mr-2" />
                                    Reset Settings
                                </Button>
                            </div>
                            <Button
                                asChild
                                variant="outline"
                                className="w-full text-pink-500 border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors relative overflow-hidden group"
                            >
                                <a
                                    href="https://buymeacoffee.com/tmoroney"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center w-full h-full"
                                >
                                    <Heart className="h-4 w-4 mr-2 group-hover:fill-pink-500 fill-background text-pink-500 transition-colors" />
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
                            <Button size="default" className="w-full bg-slate-200 text-black hover:bg-slate-800 hover:text-white dark:bg-slate-800 dark:text-white dark:hover:bg-slate-200 dark:hover:text-black" asChild>
                                <a href="https://github.com/tmoroney/auto-subs" target="_blank" rel="noopener noreferrer">
                                    <Github className="h-4 w-4 mr-2" />
                                    Source Code
                                </a>
                            </Button>
                        </div>
                    </div>
                </div>
                {/* Footer */}
                <div className="sticky bottom-0 p-4 border-t bg-background/50 backdrop-blur-sm shadow-2xl space-y-3">
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

                    {/* Export Progress (DaVinci Resolve mode only) */}
                    {isExporting && !isStandaloneMode && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Exporting Audio from Timeline</span>
                                <span>{exportProgress}%</span>
                            </div>
                            <Progress
                                value={exportProgress}
                                className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-600"
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
                    <div className="flex gap-2">
                        <Button
                            onClick={handleStartTranscription}
                            disabled={isTranscribing || isExporting || downloadingModel !== null || (settings.selectedInputTracks.length === 0 && !isStandaloneMode) || (fileInput === null && isStandaloneMode)}
                            className="flex-1"
                            size="lg"
                        >
                            {isExporting ? "Exporting Audio..." : isTranscribing ? "Processing..." : "Start Transcription"}
                        </Button>

                        {(isTranscribing || isExporting) && (
                            <Button
                                onClick={handleCancelTranscription}
                                variant="destructive"
                                size="lg"
                                className="px-3"
                            >
                                <XCircle className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile Caption Viewer */}
            {isMobile && <MobileCaptionViewer isOpen={showMobileCaptions} onClose={() => setShowMobileCaptions(false)} />}
        </>
    )
}
