import * as React from "react"
import {
    ChevronDown as ChevronDownIcon,
    Heart,
    Github,
    Captions,
    HelpCircle,
    RefreshCcw,
    History,
    LoaderCircle,
    CirclePlay,
    Copy,
    FolderOpen,
    XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
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
        isRefreshing,
        setIsRefreshing,
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

    function onDismissSurvey() {
        updateSetting("timesDismissedSurvey", settings.timesDismissedSurvey + 1)
        updateSetting("lastSurveyDate", new Date().toISOString())
    }

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-60px)] bg-background">
                {/* Main Content - Scrollable area */}
                <div className="flex-1 p-4 space-y-5 overflow-y-auto">
                    {/* Survey Notification */}
                    {(() => {
                        const SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdt8RyGXsriQA8gH7VVJqua9xPXSuZvjdjH5tKHz8nN3NhT6A/viewform?usp=dialog"; // <-- Replace with your survey link
                        const SURVEY_INTERVAL_DAYS = 10; // Show every 10 days
                        const lastSurveyDate = new Date(settings.lastSurveyDate);
                        const now = new Date();
                        const daysSinceLastSurvey = Math.floor((now.getTime() - lastSurveyDate.getTime()) / (1000 * 60 * 60 * 24));
                        const shouldShowSurvey = settings.timesDismissedSurvey < 3 && (isNaN(daysSinceLastSurvey) || daysSinceLastSurvey >= SURVEY_INTERVAL_DAYS);
                        if (!shouldShowSurvey) return null;
                        return (
                            <SurveyNotification
                                surveyUrl={SURVEY_URL}
                                onDismiss={onDismissSurvey}
                            />
                        );
                    })()}


                    {/* File Source / DaVinci Resolve */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                {settings.isStandaloneMode ? "File Source" : "DaVinci Resolve"}
                            </h3>
                            {!settings.isStandaloneMode && (
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!timelineInfo || !timelineInfo.timelineId ? 'bg-red-500' : 'bg-green-500'}`} />
                                    <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
                                        {!timelineInfo || !timelineInfo.timelineId ? 'Disconnected' : 'Connected'}
                                    </span>
                                </div>
                            )}
                            <div className="flex-1 h-px bg-border ml-1"></div>
                        </div>
                        {settings.isStandaloneMode ? (
                            <div>
                                <AudioFileCard
                                    selectedFile={fileInput}
                                    onFileSelect={(file) => setFileInput(file)}
                                />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <Card className="flex items-center gap-2 px-1.5 py-1 shadow-none rounded bg-secondary">
                                    <img
                                        src="/davinci-resolve-logo.png"
                                        alt="DaVinci Resolve Logo"
                                        className="h-5 w-5 mr-0 inline-block"
                                        style={{
                                            verticalAlign: "middle",
                                            filter: timelineInfo && timelineInfo.timelineId ? undefined : "grayscale(100%)",
                                        }}
                                    />
                                    <div className="flex-1">
                                        <div className="text-xs font-medium font-mono truncate dark:text-gray-300 text-gray-700">
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
                                    callRefresh={() => refresh()}
                                    selectedTracks={settings.selectedInputTracks}
                                    inputTracks={timelineInfo?.inputTracks || []}
                                    onTracksChange={(tracks) => {
                                        updateSetting("selectedInputTracks", tracks)
                                    }}
                                />
                                <SubtitleSettingsCard
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
                            <div className="space-y-3">

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
                                    language={settings.language}
                                    selectedModel={settings.model}
                                    models={modelsState}
                                    downloadingModel={labeledProgress?.type === 'Download' ? labeledProgress.label?.replace('Downloading ', '').replace(' model...', '') : null}
                                    downloadProgress={labeledProgress?.type === 'Download' ? labeledProgress.progress : 0}
                                    onModelChange={(model) => updateSetting('model', model)}
                                    onDeleteModel={(model) => handleDeleteModel(model)}
                                />

                            </div>

                        </CollapsibleContent>
                    </Collapsible>

                    <Collapsible defaultOpen className="space-y-3">
                        <div className="flex items-center gap-4">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto group">
                                    <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                                    <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        Experimental
                                    </h3>
                                </Button>
                            </CollapsibleTrigger>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <CollapsibleContent>
                            <div className="space-y-3">
                                {/* Word Timestamps */}
                                <WordTimestampsCard
                                    enableDTW={settings.enableDTW}
                                    onEnableDTWChange={(checked) => updateSetting("enableDTW", checked)}
                                />

                                {/* GPU Acceleration (only show on windows) */}
                                {platform() === "windows" && (
                                    <div className="border rounded-lg overflow-hidden">
                                        <div className="p-3.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                                                        <Gauge className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1">
                                                            <p className="text-sm font-medium">GPU Acceleration</p>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                           Improves transcription speed
                                                        </p>
                                                    </div>
                                                </div>
                                                <Switch checked={settings.enableGpu} onCheckedChange={(checked) => updateSetting("enableGpu", checked)} />
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                isWalkthroughMode={false}
                            />
                        </CollapsibleContent>
                    </Collapsible>

                    {/* About & Support */}
                    <Collapsible defaultOpen className="space-y-3">
                        <div className="flex items-center gap-4">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto group">
                                    <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                                    <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        About & Support
                                    </h3>
                                </Button>
                            </CollapsibleTrigger>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <CollapsibleContent>
                            <div className="space-y-3.5">
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
                                <Button
                                    size="default"
                                    className="w-full bg-[#24292f] text-white hover:bg-[#57606a] hover:text-white dark:bg-[#161b22] dark:text-[#e6edf3] dark:hover:bg-[#24292f] dark:hover:text-white border border-[#24292f] dark:border-[#30363d] shadow-sm"
                                    asChild
                                >
                                    <a
                                        href="https://github.com/tmoroney/auto-subs"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center w-full h-full"
                                    >
                                        <Github className="h-4 w-4 mr-2" />
                                        Source Code
                                    </a>
                                </Button>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>

                {/* Footer */}
                <div
                    className="sticky bottom-0 p-4 border-t bg-background/5 backdrop-blur-lg shadow-2xl space-y-3.5"
                >
                    {/* Whisper Progress (includes download, transcribe, translate) */}
                    {isTranscribing && labeledProgress && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{labeledProgress.label || "Processing"}</span>
                                <span>{labeledProgress.progress}%</span>
                            </div>
                            <Progress 
                                value={labeledProgress.progress} 
                                className={getProgressColorClass(labeledProgress.type)} 
                            />
                        </div>
                    )}

                    {/* Export Progress (DaVinci Resolve mode only) */}
                    {isExporting && !settings.isStandaloneMode && (
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

                    {/* Diagnostics */}
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={handleCopyBackendLogs} className="w-full">
                            <Copy className="h-4 w-4 mr-2" />
                            {copiedLogs ? "Copied Logs" : "Copy Backend Logs"}
                        </Button>
                        <Button variant="outline" onClick={handleOpenLogsFolder} className="w-full">
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Open Logs Folder
                        </Button>
                    </div>

                    {/* Mobile Subtitles Viewer Button */}
                    {isMobile && (
                        <Button onClick={() => setShowMobileSubtitles(true)} variant="secondary" className="w-full">
                            <Captions className="h-5 w-5 mr-2" />
                            View Subtitles
                        </Button>
                    )}

                    {/* Start Transcription Button */}
                    <div className="flex gap-2">
                        <Button
                            onClick={handleStartTranscription}
                            disabled={isTranscribing || isExporting || labeledProgress?.type === 'Download' || (settings.selectedInputTracks.length === 0 && !settings.isStandaloneMode) || (fileInput === null && settings.isStandaloneMode)}
                            className="flex-1"
                            size={isMobile ? undefined : "lg"}
                        >
                            {isTranscribing || isExporting ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> : <CirclePlay className="mr-2 h-5 w-5" />}
                            {isExporting ? "Exporting Audio..." : isTranscribing ? (labeledProgress?.type === 'Download' ? "Downloading Model..." : "Processing...") : "Start Transcription"}
                        </Button>

                        {(isTranscribing || isExporting) && (
                            <Button
                                onClick={handleCancelTranscription}
                                variant="destructive"
                                size={isMobile ? undefined : "lg"}
                                className="px-3"
                            >
                                <XCircle className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
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
