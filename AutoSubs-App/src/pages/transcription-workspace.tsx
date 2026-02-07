import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSettings } from "@/contexts/SettingsContext"
import { useModels } from "@/contexts/ModelsContext"
import { useResolve } from "@/contexts/ResolveContext"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useProgress } from "@/contexts/ProgressContext"
import { invoke } from "@tauri-apps/api/core"
import { TranscriptionOptions } from "@/types/interfaces"
import { generateTranscriptFilename } from "@/utils/file-utils"
import { ActionBar } from "@/components/action-bar"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { WorkspaceBody } from "@/components/workspace/workspace-body"

export const TranscriptionWorkspace = () => {
    const { subtitles, speakers } = useTranscript()
    const { settings, updateSetting } = useSettings()
    const { modelsState, checkDownloadedModels } = useModels()
    const { 
        timelineInfo, 
        pushToTimeline, 
        cancelExport, 
        isExporting, 
        exportProgress,
        setIsExporting, 
        setExportProgress, 
        cancelRequestedRef, 
        getSourceAudio 
    } = useResolve()
    const {
        processTranscriptionResults,
        exportSubtitlesAs,
        loadSubtitles,
    } = useTranscript()
    const { 
        processingSteps, 
        livePreviewSegments, 
        clearProgressSteps, 
        completeAllProgressSteps, 
        cancelAllProgressSteps, 
        updateProgressStep,
        setupEventListeners 
    } = useProgress()
    
    // Local state that was previously in GlobalContext
    const [isProcessing, setIsProcessing] = React.useState(false)
    const [, setTranscriptionProgress] = React.useState(0)
    const [, setLabeledProgress] = React.useState<{ progress: number, type?: string, label?: string } | null>(null)
    const [,] = React.useState<string | null>(null)
    const [,] = React.useState(0)
    const [fileInput, setFileInput] = React.useState<string | null>(null)
    const [fileInputSelectionId, setFileInputSelectionId] = React.useState(0)

    const handleSelectedFileChange = React.useCallback((file: string | null) => {
        setFileInput(file)
        setFileInputSelectionId((v) => v + 1)
    }, [])

    React.useEffect(() => {
        const run = async () => {
            if (!settings.isStandaloneMode) return
            if (!fileInput) return

            try {
                await loadSubtitles(true, fileInput, timelineInfo?.timelineId ?? 'standalone')
            } catch (error) {
                console.error('Failed to load subtitles for selected file:', error)
            }
        }

        run()
    }, [fileInputSelectionId, fileInput, loadSubtitles, settings.isStandaloneMode, timelineInfo?.timelineId])

    // Model selector state
    const [openModelSelector, setOpenModelSelector] = React.useState(false)
    const isSmallScreen = useMediaQuery('(max-width: 640px)')

    // Ref for auto-scrolling progress steps
    const progressContainerRef = React.useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new steps are added
    React.useEffect(() => {
        if (processingSteps.length > 0 && progressContainerRef.current) {
            progressContainerRef.current.scrollTop = progressContainerRef.current.scrollHeight
        }
    }, [processingSteps])

    // Set up event listeners from progress context
    const isModelCached = modelsState[settings.model]?.isDownloaded ?? false
    React.useEffect(() => {
        const cleanup = setupEventListeners({
            targetLanguage: settings.targetLanguage,
            language: settings.language,
            isResolveMode: !settings.isStandaloneMode,
            isModelCached,
            enableDiarize: settings.enableDiarize,
        });
        return cleanup;
    }, [setupEventListeners, settings.targetLanguage, settings.language, settings.isStandaloneMode, isModelCached, settings.enableDiarize]);

    // Feed export progress into processingSteps for Resolve mode
    React.useEffect(() => {
        if (!settings.isStandaloneMode && isExporting) {
            updateProgressStep({ progress: exportProgress, type: 'Export' })
        }
    }, [isExporting, exportProgress, settings.isStandaloneMode, updateProgressStep])

    /**
     * Main function to handle the transcription process
     */
    // Handle export to file
    const handleExportToFile = async () => {
        try {
            // Trigger export dialog - this will use existing export functionality
            await exportSubtitlesAs('srt', settings.enableDiarize, subtitles, speakers);
        } catch (error) {
            console.error("Export failed:", error);
        }
    };

    // Handle add to timeline
    const handleAddToTimeline = async (selectedOutputTrack: string, selectedTemplate: string) => {
        try {
            await pushToTimeline(
                generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId),
                selectedTemplate,
                selectedOutputTrack
            );
        } catch (error) {
            console.error("Failed to add to timeline:", error);
        }
    };

    const handleStartTranscription = async () => {
        // Validate input requirements first - only proceed if valid
        if (!settings.isStandaloneMode && !timelineInfo.timelineId) {
            console.error("No timeline selected")
            return
        }
        if (settings.isStandaloneMode && !fileInput) {
            console.error("No file selected")
            return
        }

        // Set UI state to processing
        setIsProcessing(true)
        setTranscriptionProgress(0)

        // Clear any previous processing steps before starting new transcription
        clearProgressSteps()

        // Update progress settings with current model cache status
        setupEventListeners({
            targetLanguage: settings.targetLanguage,
            language: settings.language,
            isResolveMode: !settings.isStandaloneMode,
            isModelCached: modelsState[settings.model]?.isDownloaded ?? false,
            enableDiarize: settings.enableDiarize,
        })

        // Get audio path based on mode (triggers export polling in Resolve mode)
        const audioInfo = await getSourceAudio(
            settings.isStandaloneMode,
            fileInput,
            settings.selectedInputTracks
        )
        if (!audioInfo) {
            console.error("Failed to get audio")
            setIsProcessing(false)
            return
        }

        try {
            // Create transcription options
            const options: TranscriptionOptions = {
                audioPath: audioInfo.path,
                offset: Math.round(audioInfo.offset * 1000) / 1000,
                model: modelsState[settings.model].value,
                lang: settings.language,
                translate: settings.translate,
                targetLanguage: settings.targetLanguage,
                enableDtw: settings.enableDTW,
                enableGpu: settings.enableGpu,
                enableDiarize: settings.enableDiarize,
                maxSpeakers: settings.maxSpeakers,
            }
            console.log("Invoking transcribe_audio with options:", options)

            // Perform transcription
            const transcript = await invoke("transcribe_audio", { options })
            console.log("Transcription successful:", transcript)

            // Complete all remaining processing steps since transcription is finished
            completeAllProgressSteps()

            // Process results and get filename
            await processTranscriptionResults(
                transcript as any, 
                settings, 
                fileInput, 
                timelineInfo.timelineId
            )
        } catch (error) {
            console.error("Transcription failed:", error)
            // Handle error, e.g., show an error message to the user
        } finally {
            // Reset UI state
            setIsProcessing(false)
            setTranscriptionProgress(0)
            setIsExporting(false)
            setExportProgress(0)
            setLabeledProgress(null)
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
            setIsProcessing(false)
            setTranscriptionProgress(0)
            setIsExporting(false)
            setExportProgress(0)
            setLabeledProgress(null)
        } catch (error) {
            console.error("Failed to cancel process:", error)
            // Still reset UI state even if backend call fails
            setIsProcessing(false)
            setTranscriptionProgress(0)
            setIsExporting(false)
            setExportProgress(0)
            setLabeledProgress(null)
        } finally {
            // Ensure cancellation flag is set in all cases
            cancelRequestedRef.current = true
        }
    }

    return (
        <>
            <div className="h-full flex flex-col relative pb-4">
                <WorkspaceHeader
                    modelsState={modelsState}
                    selectedModelIndex={settings.model}
                    selectedLanguage={settings.language}
                    onSelectModel={(modelIndex) => {
                        updateSetting("model", modelIndex)
                    }}
                    downloadingModel={null}
                    downloadProgress={0}
                    openModelSelector={openModelSelector}
                    onOpenModelSelectorChange={setOpenModelSelector}
                    isSmallScreen={isSmallScreen}
                    isStandaloneMode={settings.isStandaloneMode}
                    onStandaloneModeChange={(standalone) => updateSetting("isStandaloneMode", standalone)}
                />

                <div className="flex-1 min-h-0 overflow-y-auto" style={{
                    maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
                }}>
                <WorkspaceBody
                    processingSteps={processingSteps}
                    progressContainerRef={progressContainerRef}
                    onExportToFile={handleExportToFile}
                    onAddToTimeline={handleAddToTimeline}
                    livePreviewSegments={livePreviewSegments}
                    settings={settings}
                    timelineInfo={timelineInfo}
                />
                </div>

                {/* Footer */}
                <div className="flex-shrink-0">
                <ActionBar
                    selectedFile={fileInput}
                    onSelectedFileChange={handleSelectedFileChange}
                    onStart={handleStartTranscription}
                    onCancel={handleCancelTranscription}
                    isProcessing={isProcessing}
                />
                </div>
            </div>
        </>
    )
}
