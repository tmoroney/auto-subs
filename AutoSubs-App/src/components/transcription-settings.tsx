import * as React from "react"
import { Trash2, AlertTriangle, Check, Download, HardDrive, MemoryStick, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useGlobal } from "@/contexts/GlobalContext"
import { invoke } from "@tauri-apps/api/core"
import { SpeakerEditor } from "./speaker-editor"
import { TranscriptionOptions } from "@/types/interfaces"
import { SettingsDialog } from "./settings-dialog"
import { ActionBar } from "./action-bar"
import { MobileSubtitleViewer } from "./mobile-subtitle-viewer"
import { useIsMobile } from "@/hooks/use-mobile"

function ManageModelsDialog({ models, onDeleteModel }: { 
  models: any[], 
  onDeleteModel: (modelValue: string) => void 
}) {
  const downloadedModels = models.filter(model => model.isDownloaded);
  
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
                    <p className="font-medium">{model.label}</p>
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

// Pre-computed progress bar color classes (constant lookup, no string comparison)
const PROGRESS_COLOR_CLASSES: Record<string, string> = {
    "Download": "h-2 [&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-500",
    "Transcribe": "h-2 [&>div]:bg-gradient-to-r [&>div]:from-blue-400 [&>div]:to-blue-600",
    "Translate": "h-2 [&>div]:bg-gradient-to-r [&>div]:from-green-400 [&>div]:to-green-600",
} as const;

const DEFAULT_PROGRESS_CLASS = "h-2";

// Helper function to get progress bar color based on progress type (O(1) lookup)
function getProgressColorClass(progressType?: string) {
    return progressType ? (PROGRESS_COLOR_CLASSES[progressType] || DEFAULT_PROGRESS_CLASS) : DEFAULT_PROGRESS_CLASS;
}

export const TranscriptionSettings = () => {
    const isMobile = useIsMobile()
    const {
        settings,
        updateSetting,
        modelsState,
        downloadingModel,
        downloadProgress,
        checkDownloadedModels,
        handleDeleteModel,
        getSourceAudio,
        validateTranscriptionInput,
        createTranscriptionOptions,
        processTranscriptionResults,
        fileInput,
        setTranscriptionProgress,
        setLabeledProgress,
        setupEventListeners,
        cancelExport,
        isExporting,
        setIsExporting,
        exportProgress,
        setExportProgress,
        isTranscribing,
        setIsTranscribing,
        showMobileSubtitles,
        setShowMobileSubtitles,
        labeledProgress,
        pushToTimeline,
        cancelRequestedRef,
    } = useGlobal()
    
    // Model selector state
    const [openModelSelector, setOpenModelSelector] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState('all')
    const isSmallScreen = useMediaQuery('(max-width: 640px)')
    // Ref to track cancellation requests - allows interrupting polling loops
    const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
    const [showNonDiarizedDialog, setShowNonDiarizedDialog] = React.useState(false)
    
    
    // Set up event listeners from global context
    React.useEffect(() => {
        const cleanup = setupEventListeners();
        return cleanup;
    }, [setupEventListeners]);

    /**
     * Main function to handle the transcription process
     */
    const handleStartTranscription = async () => {
        // Validate input requirements
        if (!validateTranscriptionInput()) {
            return
        }

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
        setIsTranscribing(true)
        setTranscriptionProgress(0)

        try {
            // Create and log transcription options
            const options: TranscriptionOptions = createTranscriptionOptions(audioInfo)
            console.log("Invoking transcribe_audio with options:", options)

            // Perform transcription
            const transcript = await invoke("transcribe_audio", { options })
            console.log("Transcription successful:", transcript)

            // Process results and get filename
            await processTranscriptionResults(transcript as any)

            if (!settings.isStandaloneMode && options.enableDiarize) {
                console.log("Enabling speaker editor")
                setShowSpeakerEditor(true)
            } else if (!settings.isStandaloneMode && !options.enableDiarize) {
                console.log("Showing non-diarized dialog")
                setShowNonDiarizedDialog(true)
            }
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
        setIsTranscribing(false)
        setTranscriptionProgress(0)
        setIsExporting(false)
        setExportProgress(0)
        setLabeledProgress(null)
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
            <div className="h-full flex flex-col bg-card/50">
                {/* Main Content */}
                <div className="flex-1 p-3 space-y-5 overflow-auto pb-8"
                    style={{
                        maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
                    }}>
                    <div className="relative h-full">
                        {/* Top Controls Bar */}
                        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between">
                            {/* Model Selector */}
                            <Popover open={openModelSelector} onOpenChange={setOpenModelSelector}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="default"
                                        role="combobox"
                                        className="p-3"
                                        aria-expanded={openModelSelector}
                                    >
                                        <div className="flex items-center gap-2">
                                            <img 
                                                src={modelsState[settings.model].image} 
                                                alt={modelsState[settings.model].label + " icon"} 
                                                className="w-6 h-6 object-contain rounded" 
                                            />
                                            <span className="truncate max-w-20">{modelsState[settings.model].label}</span>
                                            {modelsState[settings.model].isDownloaded ? (
                                                <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                                <Download className="h-3 w-3 text-gray-500" />
                                            )}
                                        </div>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-1" align="start">
                                    <Tabs defaultValue="all" className="w-full" value={activeTab} onValueChange={setActiveTab}>
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="all" className="text-xs p-2">All Languages</TabsTrigger>
                                            <TabsTrigger value="en" className="text-xs p-2">English-Only</TabsTrigger>
                                        </TabsList>
                                        <ScrollArea className="my-1.5">
                                            <div className="space-y-1 pr-0">
                                                {modelsState.filter(model => {
                                                    if (activeTab === 'all') {
                                                        return !model.value.includes('.en');
                                                    } else {
                                                        return model.value.includes('.en') || model.value === 'large-v3' || model.value === 'large-v3-turbo';
                                                    }
                                                }).map((model) => {
                                                    const originalIndex = modelsState.findIndex(m => m.value === model.value);
                                                    return (
                                                        <HoverCard key={originalIndex}>
                                                            <HoverCardTrigger asChild>
                                                                <div
                                                                    className={`flex items-center justify-between p-2 cursor-pointer rounded-lg transition-colors duration-200 ${settings.model === originalIndex
                                                                        ? "bg-blue-50 dark:bg-blue-900/20"
                                                                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                                        }`}
                                                                    onClick={() => {
                                                                        updateSetting("model", originalIndex)
                                                                        setOpenModelSelector(false)
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <img src={model.image} alt={model.label + " icon"} className="w-8 h-8 object-contain rounded" />
                                                                        <div className="flex flex-col">
                                                                            <span className="font-medium text-xs">{model.label}</span>
                                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                                                                    <div className="flex items-center gap-2">
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
                                                                    <div className="space-y-1">
                                                                        <h4 className="text-sm font-semibold">{model.label}</h4>
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
                                    </Tabs>
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
                        
                        {/* Welcome Content */}
                        <div className="flex flex-col items-center justify-center h-full space-y-3">
                            <img 
                                src="/autosubs-logo.png" 
                                alt="AutoSubs" 
                                className="w-20 h-20 opacity-80"
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
                    </div>
                </div>

                {/* Footer */}
                <ActionBar
                    isTranscribing={isTranscribing}
                    isExporting={isExporting}
                    labeledProgress={labeledProgress}
                    exportProgress={exportProgress}
                    isMobile={isMobile}
                    fileInput={fileInput}
                    onShowMobileSubtitles={() => setShowMobileSubtitles(true)}
                    onStartTranscription={handleStartTranscription}
                    onCancelTranscription={handleCancelTranscription}
                    getProgressColorClass={getProgressColorClass}
                />
            </div >

            {/* Mobile Subtitles Viewer */}
            {isMobile && <MobileSubtitleViewer isOpen={showMobileSubtitles} onClose={() => setShowMobileSubtitles(false)} />}

            {/* Speaker Editor */}
            {
                showSpeakerEditor && (
                    <SpeakerEditor afterTranscription={true} open={showSpeakerEditor} onOpenChange={setShowSpeakerEditor} />
                )
            }

            {/* Non-diarized completion dialog */}
            <AlertDialog open={showNonDiarizedDialog} onOpenChange={setShowNonDiarizedDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Transcription Complete</AlertDialogTitle>
                        <AlertDialogDescription>
                            If you would like to edit the subtitles, click continue editing. When you're ready, click the orange button to add them to the timeline.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button variant="outline" onClick={() => setShowNonDiarizedDialog(false)}>
                                Continue Editing
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button onClick={() => {
                                setShowNonDiarizedDialog(false)
                                pushToTimeline()
                            }}>
                                Add to Timeline
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
