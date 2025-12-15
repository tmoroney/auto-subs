import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useGlobal } from "@/contexts/GlobalContext"
import { invoke } from "@tauri-apps/api/core"
import { TranscriptionOptions } from "@/types/interfaces"
import { ActionBar } from "@/components/action-bar"
import PixelOverlay, { PixelOverlayRef } from "@/components/pixel-overlay"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { WorkspaceBody } from "@/components/workspace/workspace-body"

export const TranscriptionWorkspace = () => {
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
                    downloadingModel={downloadingModel}
                    downloadProgress={downloadProgress}
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
