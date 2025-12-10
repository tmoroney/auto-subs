import * as React from "react"
import { Trash2, AlertTriangle, Check, Download, HardDrive, MemoryStick, Heart, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useGlobal } from "@/contexts/GlobalContext"
import { invoke } from "@tauri-apps/api/core"
import { TranscriptionOptions } from "@/types/interfaces"
import { SettingsDialog } from "./settings-dialog"
import { ActionBar } from "./action-bar"
import { ProcessingStepItem } from "./processing-step-item"
import PixelOverlay, { PixelOverlayRef } from "./PixelOverlay"

function ManageModelsDialog({ models, onDeleteModel }: {
    models: any[],
    onDeleteModel: (modelValue: string) => void
}) {
    const downloadedModels = models.filter(model => model.isDownloaded);
    
    // Helper function to check if model is English-only
    const isEnglishOnlyModel = (modelValue: string) => modelValue.includes('.en')
    
    // Helper function to get language badge
    const getLanguageBadge = (modelValue: string) => {
        if (isEnglishOnlyModel(modelValue)) {
            return <Badge variant="secondary" className="text-xs py-0 px-1.5 ml-1.5">EN</Badge>
        }
        return null
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    data-tauri-drag-region="false"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Manage Downloaded Models</DialogTitle>
                    <DialogDescription>
                        Delete cached models to free up disk space.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {downloadedModels.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            No downloaded models found
                        </p>
                    ) : (
                        downloadedModels.map((model) => (
                            <div key={model.value} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <img
                                        src={model.image}
                                        alt={model.label}
                                        className="w-10 h-10 object-contain rounded"
                                    />
                                    <div>
                                        <div className="flex items-center">
                                            <p className="font-medium">{model.label}</p>
                                            {getLanguageBadge(model.value)}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{model.size}</p>
                                    </div>
                                </div>
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 rounded-lg"
                                            title="Delete Model"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:w-[70vw] w-[90vw] p-4 flex flex-col gap-6" onOpenAutoFocus={e => e.preventDefault()}>
                                        <DialogTitle className="flex items-center gap-2">
                                            <AlertTriangle className="h-5 w-5 text-red-500" />
                                            <span className="font-semibold text-red-700 dark:text-red-400">Are you sure?</span>
                                        </DialogTitle>
                                        <span className="text-sm text-muted-foreground">
                                            This will delete the <span className="font-bold">{model.label}</span> model from your device. <br /><br /> If you use this model in future it will need to be downloaded again.
                                        </span>
                                        <div className="flex justify-end gap-2">
                                            <DialogClose asChild>
                                                <Button variant="ghost" size="sm">Cancel</Button>
                                            </DialogClose>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => {
                                                    onDeleteModel(model.value)
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export const TranscriptionSettings = () => {
    const {
        settings,
        updateSetting,
        modelsState,
        fileInput,
        setTranscriptionProgress,
        setLabeledProgress,
        setupEventListeners,
        cancelExport,
        isExporting,
        setIsExporting,
        setExportProgress,
        processingSteps,
        livePreviewSegments,
        clearProgressSteps,
        completeAllProgressSteps,
        cancelAllProgressSteps,
        isProcessing,
        setIsProcessing,
        setShowMobileSubtitles,
        pushToTimeline,
        cancelRequestedRef,
        exportSubtitlesAs,
        validateTranscriptionInput,
        getSourceAudio,
        createTranscriptionOptions,
        processTranscriptionResults,
        checkDownloadedModels,
        downloadingModel,
        downloadProgress,
        handleDeleteModel,
    } = useGlobal()

    // Model selector state
    const [openModelSelector, setOpenModelSelector] = React.useState(false)
    const [showEnglishOnly, setShowEnglishOnly] = React.useState(false)
    const isSmallScreen = useMediaQuery('(max-width: 640px)')

    // Ref for auto-scrolling progress steps
    const progressContainerRef = React.useRef<HTMLDivElement>(null)

    // Ref for pixel overlay animation
    const pixelOverlayRef = React.useRef<PixelOverlayRef>(null)

    // State for showing loading message during model warmup
    const [showLoadingMessage, setShowLoadingMessage] = React.useState(false)

    // Helper functions for model categorization
    const isEnglishOnlyModel = (modelValue: string) => modelValue.includes('.en')

    // Check if a model has an English-only variant (e.g., "tiny" has "tiny.en")
    const hasEnglishOnlyVariant = (modelValue: string) => {
        return modelsState.some(m => m.value === `${modelValue}.en`)
    }

    // Filter models based on English-only switch
    const getFilteredModels = (models: any[]) => {
        if (showEnglishOnly) {
            // Show English-only models + models that don't have an English-only variant (like large models)
            return models.filter(model =>
                isEnglishOnlyModel(model.value) || !hasEnglishOnlyVariant(model.value)
            )
        } else {
            // Show all models except English-only ones
            return models.filter(model => !isEnglishOnlyModel(model.value))
        }
    }

    const getLanguageBadge = (modelValue: string) => {
        if (isEnglishOnlyModel(modelValue)) {
            return <Badge variant="secondary" className="text-xs py-0 px-1.5">EN</Badge>
        }
        return null
    }

    // Auto-scroll to bottom when new steps are added, and stop animation when first step appears
    React.useEffect(() => {
        if (processingSteps.length > 0) {
            // Stop the pixel animation and hide loading message when steps start appearing
            pixelOverlayRef.current?.stopAnimation()
            setShowLoadingMessage(false)

            // Scroll to the bottom smoothly
            if (progressContainerRef.current) {
                progressContainerRef.current.scrollTop = progressContainerRef.current.scrollHeight
            }
        }
    }, [processingSteps])


    // Set up event listeners from global context
    React.useEffect(() => {
        const cleanup = setupEventListeners();
        return cleanup;
    }, [setupEventListeners]);

    // Preload model images on mount to prevent loading delay when popover opens
    React.useEffect(() => {
        const uniqueImages = [...new Set(modelsState.map(m => m.image))];
        uniqueImages.forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }, []);

    /**
     * Main function to handle the transcription process
     */
    // Handle export to file
    const handleExportToFile = async () => {
        try {
            // Trigger export dialog - this will use existing export functionality
            await exportSubtitlesAs('srt', settings.enableDiarize);
        } catch (error) {
            console.error("Export failed:", error);
        }
    };

    // Handle add to timeline
    const handleAddToTimeline = async () => {
        try {
            await pushToTimeline();
        } catch (error) {
            console.error("Failed to add to timeline:", error);
        }
    };

    const handleStartTranscription = async () => {
        // Validate input requirements first - only proceed if valid
        if (!validateTranscriptionInput()) {
            return
        }

        // Trigger pixel animation and show loading message only after validation passes
        pixelOverlayRef.current?.triggerAnimation()
        setShowLoadingMessage(true)

        // Get audio path based on mode
        const audioInfo = await getSourceAudio(
            settings.isStandaloneMode,
            fileInput,
            settings.selectedInputTracks
        )
        if (!audioInfo) {
            console.error("Failed to get audio")
            return
        }

        // Set UI state to transcribing
        setIsProcessing(true)
        setTranscriptionProgress(0)

        // Clear any previous processing steps before starting new transcription
        clearProgressSteps()

        try {
            // Create and log transcription options
            const options: TranscriptionOptions = createTranscriptionOptions(audioInfo)
            console.log("Invoking transcribe_audio with options:", options)

            // Perform transcription
            const transcript = await invoke("transcribe_audio", { options })
            console.log("Transcription successful:", transcript)

            // Complete all remaining processing steps since transcription is finished
            completeAllProgressSteps()

            // Process results and get filename
            await processTranscriptionResults(transcript as any)
        } catch (error) {
            console.error("Transcription failed:", error)
            // Handle error, e.g., show an error message to the user
        } finally {
            // Reset UI state
            resetUIState()
            // Update model download status
            await checkDownloadedModels()
        }
    }

    const resetUIState = () => {
        setIsProcessing(false)
        setTranscriptionProgress(0)
        setIsExporting(false)
        setExportProgress(0)
        setLabeledProgress(null)
        // Also hide loading message when resetting
        setShowLoadingMessage(false)
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

        // Stop pixel animation immediately
        pixelOverlayRef.current?.stopAnimation()
        setShowLoadingMessage(false)

        try {
            // If transcription is active, cancel it
            if (isProcessing) {
                await invoke("cancel_transcription")
                console.log("Transcription cancellation request sent to backend")
            }

            // If export is active (and transcription hasn't started), cancel export
            if (isExporting && !isProcessing) {
                const cancelResult = await cancelExport()
                console.log("Export cancellation result:", cancelResult)
            }

            // Mark progress steps as cancelled
            cancelAllProgressSteps()

            // Reset UI state
            resetUIState()
        } catch (error) {
            console.error("Failed to cancel process:", error)
            // Still reset UI state even if backend call fails
            resetUIState()
        } finally {
            // Ensure cancellation flag is set in all cases
            cancelRequestedRef.current = true
        }
    }

    return (
        <>
            <div className="h-full flex flex-col bg-card/50 relative">
                {/* Pixel Animation Overlay */}
                <PixelOverlay ref={pixelOverlayRef} />
                {/* Fixed Top Controls Bar */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 bg-transparent">
                    {/* Model Selector */}
                    <Popover open={openModelSelector} onOpenChange={setOpenModelSelector}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="default"
                                role="combobox"
                                className="p-2"
                                aria-expanded={openModelSelector}
                            >
                                <div className="flex items-center gap-2">
                                    <img
                                        src={modelsState[settings.model].image}
                                        alt={modelsState[settings.model].label + " icon"}
                                        className="w-6 h-6 object-contain rounded"
                                    />
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate">{modelsState[settings.model].label}</span>
                                        {getLanguageBadge(modelsState[settings.model].value)}
                                    </div>
                                    {modelsState[settings.model].isDownloaded ? (
                                        <Check className="h-3 w-3 text-green-600" />
                                    ) : (
                                        <Download className="h-3 w-3 text-gray-500" />
                                    )}
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-2 w-72" align="start" forceMount style={{ display: openModelSelector ? undefined : 'none' }}>
                            <div className="space-y-0">
                                {/* English-Only Switch */}
                                <div className="flex items-center justify-between px-1 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="english-only-switch" className="text-xs font-medium cursor-pointer pl-1">
                                            English-Only Models
                                        </Label>
                                        <HoverCard>
                                            <HoverCardTrigger asChild>
                                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </HoverCardTrigger>
                                            <HoverCardContent className="w-56 p-3 text-xs">
                                                Show specialised English models with higher accuracy for English transcription.
                                            </HoverCardContent>
                                        </HoverCard>
                                    </div>
                                    <Switch
                                        id="english-only-switch"
                                        checked={showEnglishOnly}
                                        onCheckedChange={setShowEnglishOnly}
                                    />
                                </div>

                                {/* Model List */}
                                <ScrollArea className="h-64">
                                    <div className="space-y-1">
                                        {getFilteredModels(modelsState).map((model, idx) => {
                                            const actualModelIndex = modelsState.findIndex(m => m.value === model.value)

                                            return (
                                                <HoverCard key={idx} openDelay={500}>
                                                    <HoverCardTrigger asChild>
                                                        <div
                                                            className={`flex items-center justify-between p-2 cursor-pointer rounded-sm transition-colors duration-200 ${settings.model === actualModelIndex
                                                                ? "bg-blue-50 dark:bg-blue-900/20"
                                                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                                }`}
                                                            onClick={() => {
                                                                updateSetting("model", actualModelIndex)
                                                                setOpenModelSelector(false)
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <img src={model.image} alt={model.label + " icon"} className="w-8 h-8 object-contain rounded flex-shrink-0" />
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-medium text-xs">{model.label}</span>
                                                                        {getLanguageBadge(model.value)}
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                                        {model.description}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center ml-2 flex-shrink-0">
                                                                {downloadingModel === model.value ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <Progress value={downloadProgress} className="h-1 w-12" />
                                                                        <span className="text-xs text-blue-600 dark:text-blue-400">{downloadProgress}%</span>
                                                                    </div>
                                                                ) : model.isDownloaded ? (
                                                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                                        Cached
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                                                        Available
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </HoverCardTrigger>
                                                    <HoverCardContent className="w-80" side={isSmallScreen ? "top" : "right"}>
                                                        <div className="flex items-start gap-3">
                                                            <img
                                                                src={model.image}
                                                                alt={model.label + " icon"}
                                                                className="h-12 w-12 object-contain rounded"
                                                            />
                                                            <div className="space-y-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <h4 className="text-sm font-semibold">{model.label}</h4>
                                                                    {getLanguageBadge(model.value)}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground">{model.details}</p>
                                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                                    <div className="flex items-center gap-1">
                                                                        <HardDrive className="h-3 w-3" />
                                                                        <span>{model.size}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <MemoryStick className="h-3 w-3" />
                                                                        <span>{model.ram}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </HoverCardContent>
                                                </HoverCard>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Settings and Models Management */}
                    <div className="flex items-center">
                        <ManageModelsDialog
                            models={modelsState}
                            onDeleteModel={handleDeleteModel}
                        />
                        <SettingsDialog />
                    </div>
                </div>

                {/* Progress Indicators Top Bar */}
                {processingSteps.length > 0 ? (
                    <div ref={progressContainerRef} className="w-full px-4 pb-8 overflow-y-auto h-full relative z-10" style={{
                        maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
                    }}>
                        <div className="flex flex-col gap-3">
                            {processingSteps.map((step) => (
                                <div key={step.id} className="w-full">
                                    <ProcessingStepItem
                                        id={step.id}
                                        title={step.title}
                                        description={step.description}
                                        progress={step.progress}
                                        isActive={step.isActive}
                                        isCompleted={step.isCompleted}
                                        isCancelled={step.isCancelled}
                                        onExportToFile={handleExportToFile}
                                        onAddToTimeline={handleAddToTimeline}
                                        livePreviewSegments={livePreviewSegments}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : showLoadingMessage ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-3 pb-14 relative z-10">
                        <div className="bg-background/10 backdrop-blur-sm rounded-md px-3 py-2">
                            <p className="text-base font-medium text-foreground animate-pulse">
                                Loading model into memory...
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full space-y-3 pb-14">
                        <img
                            src="/autosubs-logo.png"
                            alt="AutoSubs"
                            className="w-20 h-20"
                        />
                        <div className="text-center space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">
                                Welcome to AutoSubs
                            </h2>
                            <p className="text-muted-foreground max-w-72">
                                Select an audio source to start generating subtitles.
                            </p>

                            {/* Support Button */}
                            <a
                                href="https://buymeacoffee.com/tmoroney"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group relative inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-pink-200 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors"
                            >
                                <Heart className="h-3 w-3 group-hover:fill-pink-500 fill-background transition-colors" />
                                Support AutoSubs

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
                                            className="heart-anim absolute top-1/2 left-1/2 h-5 w-5 text-pink-400 opacity-0"
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
                        </div>
                    </div>
                )}

                {/* Footer */}
                <ActionBar
                    isProcessing={isProcessing}
                    onStart={handleStartTranscription}
                    onCancel={handleCancelTranscription}
                />
            </div>
        </>
    )
}
