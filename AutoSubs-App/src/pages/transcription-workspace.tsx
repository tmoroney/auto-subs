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
import PixelOverlay, { PixelOverlayRef } from "@/components/pixel-overlay"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { WorkspaceBody } from "@/components/workspace/workspace-body"

export const TranscriptionWorkspace = () => {
    const { subtitles, speakers } = useTranscript()
    const { settings, updateSetting } = useSettings()
    const { modelsState, checkDownloadedModels, handleDeleteModel } = useModels()
    const { 
        timelineInfo, 
        pushToTimeline, 
        cancelExport, 
        isExporting, 
        setIsExporting, 
        setExportProgress, 
        cancelRequestedRef, 
        getSourceAudio 
    } = useResolve()
    const { 
        processTranscriptionResults, 
        exportSubtitlesAs 
    } = useTranscript()
    const { 
        processingSteps, 
        livePreviewSegments, 
        clearProgressSteps, 
        completeAllProgressSteps, 
        cancelAllProgressSteps, 
        setupEventListeners 
    } = useProgress()
    
    // Local state that was previously in GlobalContext
    const [isProcessing, setIsProcessing] = React.useState(false)
    const [, setTranscriptionProgress] = React.useState(0)
    const [, setLabeledProgress] = React.useState<{ progress: number, type?: string, label?: string } | null>(null)
    const [,] = React.useState<string | null>(null)
    const [,] = React.useState(0)
    const [fileInput] = React.useState<string | null>(null)

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

    // Set up event listeners from progress context
    React.useEffect(() => {
        const cleanup = setupEventListeners({
            targetLanguage: settings.targetLanguage,
            language: settings.language
        });
        return cleanup;
    }, [setupEventListeners, settings.targetLanguage, settings.language]);

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
    const handleAddToTimeline = async () => {
        try {
            await pushToTimeline(
                generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId),
                settings.selectedTemplate.value,
                settings.selectedOutputTrack
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
            // Also hide loading message when resetting
            setShowLoadingMessage(false)

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
            <div className="h-full flex flex-col bg-card/50 relative">
                {/* Pixel Animation Overlay */}
                <PixelOverlay ref={pixelOverlayRef} />
                <WorkspaceHeader
                    modelsState={modelsState}
                    selectedModelIndex={settings.model}
                    onSelectModel={(modelIndex) => {
                        updateSetting("model", modelIndex)
                    }}
                    downloadingModel={null}
                    downloadProgress={0}
                    openModelSelector={openModelSelector}
                    onOpenModelSelectorChange={setOpenModelSelector}
                    showEnglishOnly={showEnglishOnly}
                    onShowEnglishOnlyChange={setShowEnglishOnly}
                    isSmallScreen={isSmallScreen}
                    onDeleteModel={handleDeleteModel}
                />

                <WorkspaceBody
                    processingSteps={processingSteps}
                    showLoadingMessage={showLoadingMessage}
                    progressContainerRef={progressContainerRef}
                    onExportToFile={handleExportToFile}
                    onAddToTimeline={handleAddToTimeline}
                    livePreviewSegments={livePreviewSegments}
                />

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
