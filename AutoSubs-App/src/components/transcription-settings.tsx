import * as React from "react"
import {
    ChevronDown as ChevronDownIcon,
    Heart,
    Github,
    Captions,
    HelpCircle,
    History,
    LoaderCircle,
    CirclePlay,
    Copy,
    FolderOpen,
    XCircle,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { ActionBar } from "./action-bar"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"


import { useIsMobile } from "@/hooks/use-mobile"
import { MobileSubtitleViewer } from "@/components/mobile-subtitle-viewer"
import { useGlobal } from "@/contexts/GlobalContext"
import { invoke } from "@tauri-apps/api/core"
import { AudioFileCard } from "./settings-cards/audio-file-card"
import { AudioInputCard } from "./settings-cards/audio-input-card"
import { SubtitleSettingsCard } from "./settings-cards/subtitle-settings-card"
import { LanguageSettingsCard } from "@/components/settings-cards/language-settings-card"
import { ModelSelectionCard } from "./settings-cards/model-selection-card"
import { SpeakerLabelingCard } from "./settings-cards/speaker-labeling-card"
import { TextFormattingCard } from "./settings-cards/text-formatting-card"
import { SpeakerEditor } from "./speaker-editor"
import { TranscriptionOptions } from "@/types/interfaces"
import { SurveyNotification } from "./survey-notification";
import { WordTimestampsCard } from "./settings-cards/word-timestamps-card"
import { Gauge } from "lucide-react"
import { platform } from "@tauri-apps/plugin-os"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { openPath } from "@tauri-apps/plugin-opener"

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

interface TranscriptionSettingsProps {
    onShowTutorial?: () => void
}

export const TranscriptionSettings = ({
    onShowTutorial
}: TranscriptionSettingsProps) => {
    const isMobile = useIsMobile()
    const {
        settings,
        modelsState,
        timelineInfo,
        updateSetting,
        checkDownloadedModels,
        handleDeleteModel,
        getSourceAudio,
        validateTranscriptionInput,
        createTranscriptionOptions,
        processTranscriptionResults,
        refresh,
        resetSettings,
        setFileInput,
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
    // Ref to track cancellation requests - allows interrupting polling loops
    const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
    const [showNonDiarizedDialog, setShowNonDiarizedDialog] = React.useState(false)
    const [copiedLogs, setCopiedLogs] = React.useState(false)

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

    // Diagnostics helpers
    const handleCopyBackendLogs = async () => {
        try {
            const logs = await invoke<string>("get_backend_logs")
            await writeText(logs || "")
            setCopiedLogs(true)
            setTimeout(() => setCopiedLogs(false), 1800)
        } catch (e) {
            console.error("Failed to copy backend logs:", e)
        }
    }

    const handleOpenLogsFolder = async () => {
        try {
            // Export current backend logs to a file to ensure something is present
            try {
                await invoke<string>("export_backend_logs")
            } catch (e) {
                // Non-fatal: still attempt to open folder
                console.warn("Failed to export backend logs before opening folder:", e)
            }

            const dir = await invoke<string>("get_log_dir")
            if (dir) {
                await openPath(dir)
            }
        } catch (e) {
            console.error("Failed to open logs folder:", e)
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
                <div className="flex-1 p-4 space-y-5 overflow-auto pb-8"
                    style={{
                        maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
                    }}>
                    <div className="flex flex-col items-center justify-center h-full space-y-3">
                        <img 
                            src="/autosubs-logo.png" 
                            alt="AutoSubs" 
                            className="w-20 h-20 opacity-80"
                        />
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-semibold text-foreground">
                                Welcome to AutoSubs
                            </h2>
                            <p className="text-muted-foreground max-w-72">
                                Select an audio source to start generating subtitles.
                            </p>
                            <div className="flex items-center justify-center gap-2 pt-2 pb-8">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span className="text-sm text-muted-foreground">
                                    Ready to generate
                                </span>
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
