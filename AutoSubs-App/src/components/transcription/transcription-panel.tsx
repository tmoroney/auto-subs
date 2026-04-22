import * as React from "react"
import { Speech, Type, AudioLines, Globe, X, PlayCircle } from "lucide-react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { downloadDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs"
import { UploadIcon, type UploadIconHandle } from "@/components/ui/icons/upload"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { ModelPicker } from "@/components/settings/model-picker"
import { LanguageSelector } from "@/components/settings/language-selector"
import { SpeakerSelector } from "@/components/settings/diarize-selector"
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel"
import { TrackSelector } from "@/components/settings/track-selector"
import { ProcessingStepItem } from "@/components/processing/processing-step-item"
import { useModels } from "@/contexts/ModelsContext"
import { useProgress } from "@/contexts/ProgressContext"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useSettings } from "@/contexts/SettingsContext"
import { useResolve } from "@/contexts/ResolveContext"
import { useErrorDialog } from "@/contexts/ErrorDialogContext"
import { ResolveApiError } from "@/api/resolve-api"
import { languages, translateLanguages } from "@/lib/languages"
import { Model, Settings, TimelineInfo, Track, TranscriptionOptions } from "@/types"
import { useTranslation } from "react-i18next"
import { diarizeModel } from "@/lib/models"

 const SUPPORTED_MEDIA_EXTENSIONS = [
   "wav", "mp3", "m4a", "flac", "ogg", "aac", "mp4", "mov", "mkv", "webm", "avi", "wmv", "mpeg", "mpg", "m4v", "3gp", "aiff", "opus", "alac",
 ]

 function isSupportedMediaFile(filePath: string): boolean {
   const extension = filePath.split(".").pop()?.toLowerCase()
   return extension ? SUPPORTED_MEDIA_EXTENSIONS.includes(extension) : false
 }

interface ProcessingStep {
  id?: string
  title: string
  description: string
  progress: number
  isActive: boolean
  isCompleted: boolean
  isCancelled?: boolean
}

interface TranscriptionPanelViewProps {
  modelsState: Model[]
  selectedModelIndex: number
  selectedLanguage: string
  onSelectModel: (modelIndex: number) => void
  downloadingModel: string | null
  downloadProgress: number
  openModelSelector: boolean
  onOpenModelSelectorChange: (open: boolean) => void
  isSmallScreen: boolean
  isStandaloneMode: boolean
  onStandaloneModeChange: (standalone: boolean) => void
  processingSteps: ProcessingStep[]
  progressContainerRef: React.RefObject<HTMLDivElement>
  onExportToFile: () => void
  onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string, presetSettings?: Record<string, unknown>) => Promise<void>
  onViewSubtitles?: () => void
  livePreviewSegments: any[]
  settings: Settings
  timelineInfo: TimelineInfo
  selectedFile?: string | null
  onSelectedFileChange?: (file: string | null) => void
  onStart?: () => void
  onCancel?: () => void
  isProcessing?: boolean
}

function TranscriptionPanelView({
  modelsState,
  selectedModelIndex,
  selectedLanguage,
  onSelectModel,
  downloadingModel,
  downloadProgress,
  openModelSelector,
  onOpenModelSelectorChange,
  isSmallScreen,
  isStandaloneMode,
  onStandaloneModeChange,
  processingSteps,
  progressContainerRef,
  onExportToFile,
  onAddToTimeline,
  onViewSubtitles,
  livePreviewSegments,
  settings,
  timelineInfo,
  selectedFile: selectedFileProp,
  onSelectedFileChange,
  onStart,
  onCancel,
  isProcessing,
}: TranscriptionPanelViewProps) {
  const { t } = useTranslation()
  const { refresh } = useResolve()
  const { settings: currentSettings } = useSettings()
  const uploadIconRef = React.useRef<UploadIconHandle>(null)
  const dropAreaUploadIconRef = React.useRef<UploadIconHandle>(null)
  const [openLanguage, setOpenLanguage] = React.useState(false)
  const [localSelectedFile, setLocalSelectedFile] = React.useState<string | null>(null)
  const [openTrackSelector, setOpenTrackSelector] = React.useState(false)
  const [openSpeakerPopover, setOpenSpeakerPopover] = React.useState(false)
  const [openTextFormattingPopover, setOpenTextFormattingPopover] = React.useState(false)

  const selectedFile = selectedFileProp ?? localSelectedFile

  const setSelectedFile = React.useCallback((file: string | null) => {
    setLocalSelectedFile(file)
    onSelectedFileChange?.(file)
  }, [onSelectedFileChange])

  const inputTracks: Track[] = React.useMemo(() => {
    if (!timelineInfo?.inputTracks) return []
    return timelineInfo.inputTracks
  }, [timelineInfo])

  React.useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      const webview = await getCurrentWebview()
      unlisten = await webview.onDragDropEvent((event: any) => {
        if (event.payload.type === "drop") {
          const files = event.payload.paths as string[] | undefined
          if (files && files.length > 0) {
            const supportedFile = files.find(isSupportedMediaFile)
            if (supportedFile) {
              setSelectedFile(supportedFile)
            }
          }
        }
      })
    })()
    return () => {
      if (unlisten) unlisten()
    }
  }, [setSelectedFile])

  const handleFileSelect = async () => {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{
        name: t("actionBar.fileDialog.mediaFiles"),
        extensions: SUPPORTED_MEDIA_EXTENSIONS,
      }],
      defaultPath: await downloadDir(),
    })
    setSelectedFile(file)
  }

  const handleTrackSelectorOpen = async (open: boolean) => {
    setOpenTrackSelector(open)
    if (open && !currentSettings.isStandaloneMode) {
      try {
        await refresh()
      } catch (error) {
        console.error("Failed to refresh timeline info:", error)
      }
    }
  }

  return (
    <div className="h-full flex flex-col relative pb-4">
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 pb-3 bg-transparent">
        <div className="flex items-center gap-2">
          <ModelPicker
            modelsState={modelsState}
            selectedModelIndex={selectedModelIndex}
            selectedLanguage={selectedLanguage}
            onSelectModel={onSelectModel}
            downloadingModel={downloadingModel}
            downloadProgress={downloadProgress}
            open={openModelSelector}
            onOpenChange={onOpenModelSelectorChange}
            isSmallScreen={isSmallScreen}
          />
        </div>

        <Tabs
          value={isStandaloneMode ? "file" : "timeline"}
          onValueChange={(value) => onStandaloneModeChange(value === "file")}
          data-tour="mode-switcher"
        >
          <TabsList className="p-1 h-auto">
            <TabsTrigger
              value="file"
              className="text-sm px-0"
              onMouseEnter={() => uploadIconRef.current?.startAnimation()}
              onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
            >
              <UploadIcon ref={uploadIconRef} size={14} />
              {t("actionBar.mode.fileInput")}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-sm px-4">
              <img
                src="/davinci-resolve-logo.png"
                alt={t("titlebar.resolve.productName")}
                className="w-5 h-5"
              />
              {t("actionBar.mode.timeline")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          maskImage: "linear-gradient(to bottom, black 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 90%, transparent 100%)",
        }}
      >
        {processingSteps.length > 0 ? (
          <div ref={progressContainerRef} className="w-full px-4 pb-6 relative z-10">
            <div className="flex flex-col gap-2">
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
                    onExportToFile={onExportToFile}
                    onAddToTimeline={onAddToTimeline}
                    onViewSubtitles={onViewSubtitles}
                    livePreviewSegments={livePreviewSegments}
                    settings={settings}
                    timelineInfo={timelineInfo}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full space-y-2 pb-12 text-center">
            <img
              src="/autosubs-logo.png"
              alt="AutoSubs"
              className="w-16 h-16"
            />
            <h2 className="text-lg font-semibold">
              {t("workspace.empty.welcomeTitle")}
            </h2>
            <p className="max-w-72 pb-2">
              {t("workspace.empty.welcomeDescription")}
            </p>
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        <Card className="p-3 sticky bottom-4 mx-4 z-50 shadow-lg bg-card" data-tour="transcription-controls">
          <div className="grid w-full gap-3">
            <div className="flex items-center gap-1.5">
              <Popover open={openLanguage} onOpenChange={setOpenLanguage}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    role="combobox"
                    aria-expanded={openLanguage}
                    className="dark:bg-background dark:hover:bg-accent rounded-full"
                  >
                    <Globe className="h-4 w-4" />
                    <span className="text-xs truncate">
                      {currentSettings.translate
                        ? `${currentSettings.language === "auto" ? t("actionBar.common.auto") : languages.find((l) => l.value === currentSettings.language)?.label} ${t("actionBar.language.arrow")} ${translateLanguages.find((l) => l.value === currentSettings.targetLanguage)?.label}`
                        : currentSettings.language === "auto" ? t("actionBar.common.auto") : languages.find((l) => l.value === currentSettings.language)?.label}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-72" align="start" side="top">
                  <LanguageSelector />
                </PopoverContent>
              </Popover>

              <Popover open={openSpeakerPopover} onOpenChange={setOpenSpeakerPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    role="combobox"
                    aria-expanded={openSpeakerPopover}
                    className="dark:bg-background dark:hover:bg-accent rounded-full"
                  >
                    <Speech className="h-4 w-4" />
                    <span className="text-xs">
                      {currentSettings.enableDiarize
                        ? currentSettings.maxSpeakers === null ? t("actionBar.common.auto") : currentSettings.maxSpeakers
                        : t("actionBar.common.off")}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" side="top">
                  <SpeakerSelector />
                </PopoverContent>
              </Popover>

              <Popover open={openTextFormattingPopover} onOpenChange={setOpenTextFormattingPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    role="combobox"
                    aria-expanded={openTextFormattingPopover}
                    className="dark:bg-background dark:hover:bg-accent rounded-full"
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <TextFormattingPanel />
                </PopoverContent>
              </Popover>
            </div>

            {!currentSettings.isStandaloneMode ? (
              <Popover open={openTrackSelector} onOpenChange={handleTrackSelectorOpen} data-tour="audio-input">
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openTrackSelector}
                    className="w-full h-[120px] justify-center dark:bg-background dark:hover:bg-accent"
                    size="sm"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <AudioLines className="h-6 w-6" />
                      <div className="text-sm font-medium">
                        {currentSettings.selectedInputTracks.length === 0
                          ? t("actionBar.tracks.selectTracks")
                          : currentSettings.selectedInputTracks.length === 1
                            ? t("actionBar.tracks.trackN", { n: currentSettings.selectedInputTracks[0] })
                            : t("actionBar.tracks.countSelected", { count: currentSettings.selectedInputTracks.length })}
                      </div>
                      <span className="text-xs text-muted-foreground">{t("actionBar.tracks.selectMultiple")}</span>
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="min-w-[320px] p-0 overflow-hidden" align="center">
                  <TrackSelector inputTracks={inputTracks} />
                </PopoverContent>
              </Popover>
            ) : (
              <div
                className="w-full h-[120px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-4 px-2 cursor-pointer transition-colors hover:bg-muted/50 hover:dark:bg-muted outline-none"
                data-tour="audio-input"
                tabIndex={0}
                role="button"
                aria-label={t("actionBar.fileDrop.aria")}
                onClick={handleFileSelect}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleFileSelect()
                }}
                onMouseEnter={() => dropAreaUploadIconRef.current?.startAnimation()}
                onMouseLeave={() => dropAreaUploadIconRef.current?.stopAnimation()}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-1">
                    <UploadIcon ref={dropAreaUploadIconRef} size={24} className="text-green-500" />
                    <span className="text-sm font-medium text-muted-foreground truncate max-w-full px-2">
                      {selectedFile.split("/").pop()}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <UploadIcon ref={dropAreaUploadIconRef} size={24} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">{t("actionBar.fileDrop.prompt")}</span>
                    <span className="text-xs text-muted-foreground">{t("actionBar.fileDrop.supports")}</span>
                  </div>
                )}
              </div>
            )}

            {isProcessing ? (
              <Button
                onClick={onCancel}
                size="default"
                variant="destructive"
                className="w-full mt-1"
              >
                <X className="h-4 w-4" />
                {t("common.cancel")}
              </Button>
            ) : (
              <Button
                onClick={onStart}
                size="default"
                variant="default"
                className="w-full mt-1"
                disabled={isProcessing}
              >
                <PlayCircle className="h-4 w-4" />
                {t("common.generateSubtitles")}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

/**
 * Normalise any thrown value (native `Error`, `ResolveApiError`, plain
 * strings from Tauri `invoke`, unknown) into the fields the error dialog
 * expects. `ResolveApiError` carries a richer `detail` from Resolve which
 * we surface in the dialog's collapsible "Show details" section.
 */
function describeError(
  error: unknown,
  fallbackTitle: string,
): { title: string; message: string; detail?: string } {
  if (error instanceof ResolveApiError) {
    return {
      title: fallbackTitle,
      message: error.message,
      detail: error.detail,
    }
  }
  if (error instanceof Error) {
    return { title: fallbackTitle, message: error.message || fallbackTitle }
  }
  if (typeof error === "string") {
    return { title: fallbackTitle, message: error }
  }
  return { title: fallbackTitle, message: fallbackTitle }
}

export function TranscriptionPanel({ onViewSubtitles }: { onViewSubtitles?: () => void } = {}) {
  const { subtitles, speakers, currentTranscriptFilename, processTranscriptionResults, exportSubtitlesAs, loadSubtitles } = useTranscript()
  const { settings, updateSetting } = useSettings()
  const { modelsState, downloadedModelValues, checkDownloadedModels } = useModels()
  const {
    timelineInfo,
    pushToTimeline,
    cancelExport,
    isExporting,
    exportProgress,
    setIsExporting,
    setExportProgress,
    cancelRequestedRef,
    getSourceAudio,
  } = useResolve()
  const {
    processingSteps,
    livePreviewSegments,
    clearProgressSteps,
    completeAllProgressSteps,
    cancelAllProgressSteps,
    updateProgressStep,
    setupEventListeners,
  } = useProgress()
  const { showError } = useErrorDialog()
  const { t: tErr } = useTranslation()

  const [isProcessing, setIsProcessing] = React.useState(false)
  const [, setTranscriptionProgress] = React.useState(0)
  const [, setLabeledProgress] = React.useState<{ progress: number, type?: string, label?: string } | null>(null)
  const [fileInput, setFileInput] = React.useState<string | null>(null)
  const [fileInputSelectionId, setFileInputSelectionId] = React.useState(0)
  const [openModelSelector, setOpenModelSelector] = React.useState(false)
  const isSmallScreen = useMediaQuery("(max-width: 640px)")
  const progressContainerRef = React.useRef<HTMLDivElement>(null)

  const handleSelectedFileChange = React.useCallback((file: string | null) => {
    setFileInput(file)
    setFileInputSelectionId((v) => v + 1)
  }, [])

  React.useEffect(() => {
    const run = async () => {
      if (!settings.isStandaloneMode) return
      if (!fileInput) return

      try {
        await loadSubtitles(true, fileInput, timelineInfo?.timelineId ?? "standalone")
      } catch (error) {
        console.error("Failed to load subtitles for selected file:", error)
      }
    }

    run()
  }, [fileInputSelectionId, fileInput, loadSubtitles, settings.isStandaloneMode, timelineInfo?.timelineId])

  React.useEffect(() => {
    if (processingSteps.length > 0 && progressContainerRef.current) {
      progressContainerRef.current.scrollTop = 0
    }
  }, [processingSteps])

  const isModelCached = modelsState[settings.model]?.isDownloaded ?? false
  const isDiarizeModelDownloaded = downloadedModelValues.includes(diarizeModel.value)
  const hasPendingDownloads = !isModelCached || (settings.enableDiarize && !isDiarizeModelDownloaded)

  React.useEffect(() => {
    const cleanup = setupEventListeners({
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      isResolveMode: !settings.isStandaloneMode,
      hasPendingDownloads,
      enableDiarize: settings.enableDiarize,
    })

    return cleanup
  }, [setupEventListeners, settings.targetLanguage, settings.language, settings.isStandaloneMode, hasPendingDownloads, settings.enableDiarize])

  React.useEffect(() => {
    if (!settings.isStandaloneMode && isExporting) {
      updateProgressStep({
        progress: exportProgress,
        type: 'Export'
      })
    }
  }, [isExporting, exportProgress, settings.isStandaloneMode, updateProgressStep])

  const handleExportToFile = async () => {
    try {
      await exportSubtitlesAs("srt", subtitles, speakers)
    } catch (error) {
      console.error("Export failed:", error)
    }
  }

  const handleAddToTimeline = async (selectedOutputTrack: string, selectedTemplate: string, presetSettings?: Record<string, unknown>) => {
    try {
      if (!currentTranscriptFilename) {
        console.error("No active transcript file to add to timeline")
        return
      }

      await pushToTimeline(
        currentTranscriptFilename,
        selectedTemplate,
        selectedOutputTrack,
        presetSettings,
      )
    } catch (error) {
      console.error("Failed to add to timeline:", error)
      const { title, message, detail } = describeError(
        error,
        tErr("errorDialog.addToTimelineFailed", "Couldn't add subtitles to timeline"),
      )
      showError({ title, message, detail })
    }
  }

  const handleStartTranscription = async () => {
    if (!settings.isStandaloneMode && !timelineInfo.timelineId) {
      console.error("No timeline selected")
      return
    }

    if (settings.isStandaloneMode && !fileInput) {
      console.error("No file selected")
      return
    }

    setIsProcessing(true)
    setTranscriptionProgress(0)
    clearProgressSteps()

    setupEventListeners({
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      isResolveMode: !settings.isStandaloneMode,
      hasPendingDownloads,
      enableDiarize: settings.enableDiarize,
    })

    try {
      const audioInfo = await getSourceAudio(
        settings.isStandaloneMode,
        fileInput,
        settings.selectedInputTracks,
      )

      if (!audioInfo) {
        // `getSourceAudio` returns null only on user-initiated cancellation.
        // Silently clean up without showing an error dialog.
        console.log("Audio source unavailable (cancelled or missing)")
        return
      }

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
        density: settings.textDensity,
        maxLines: settings.maxLinesPerSubtitle,
        textCase: settings.textCase,
        removePunctuation: settings.removePunctuation,
        censoredWords: settings.enableCensor ? settings.censoredWords : [],
      }

      const transcript = await invoke("transcribe_audio", { options })

      completeAllProgressSteps()

      await processTranscriptionResults(
        transcript as any,
        settings,
        fileInput,
        timelineInfo.timelineId,
      )
    } catch (error) {
      console.error("Transcription failed:", error)

      // User-initiated cancellation is a normal path, not an error.
      const isCancellation =
        (error instanceof Error && /cancell?ed/i.test(error.message)) ||
        (typeof error === "string" && /cancell?ed/i.test(error))
      if (isCancellation) {
        return
      }

      // Distinguish export-stage failures (thrown by `getSourceAudio` via
      // `exportAudio`) from transcription-stage failures so the dialog title
      // accurately reflects where things went wrong.
      const isExportFailure =
        error instanceof ResolveApiError &&
        (error.func === "ExportAudio" || error.func === "GetExportProgress")

      const fallbackTitle = isExportFailure
        ? tErr("errorDialog.exportFailed", "Audio export failed")
        : tErr("errorDialog.transcriptionFailed", "Transcription failed")

      const { title, message, detail } = describeError(error, fallbackTitle)
      showError({ title, message, detail })
    } finally {
      setIsProcessing(false)
      setTranscriptionProgress(0)
      setIsExporting(false)
      setExportProgress(0)
      setLabeledProgress(null)
      await checkDownloadedModels()
    }
  }

  const handleCancelTranscription = async () => {
    console.log("Cancelling process...")
    cancelRequestedRef.current = true

    try {
      if (isProcessing) {
        await invoke("cancel_transcription")
        console.log("Transcription cancellation request sent to backend")
      }

      if (isExporting && !isProcessing) {
        const cancelResult = await cancelExport()
        console.log("Export cancellation result:", cancelResult)
      }

      cancelAllProgressSteps()
      setIsProcessing(false)
      setTranscriptionProgress(0)
      setIsExporting(false)
      setExportProgress(0)
      setLabeledProgress(null)
    } catch (error) {
      console.error("Failed to cancel process:", error)
      setIsProcessing(false)
      setTranscriptionProgress(0)
      setIsExporting(false)
      setExportProgress(0)
      setLabeledProgress(null)
    } finally {
      cancelRequestedRef.current = true
    }
  }

  return (
    <TranscriptionPanelView
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
      processingSteps={processingSteps}
      progressContainerRef={progressContainerRef}
      onExportToFile={handleExportToFile}
      onAddToTimeline={handleAddToTimeline}
      onViewSubtitles={onViewSubtitles}
      livePreviewSegments={livePreviewSegments}
      settings={settings}
      timelineInfo={timelineInfo}
      selectedFile={fileInput}
      onSelectedFileChange={handleSelectedFileChange}
      onStart={handleStartTranscription}
      onCancel={handleCancelTranscription}
      isProcessing={isProcessing}
    />
  )
}
