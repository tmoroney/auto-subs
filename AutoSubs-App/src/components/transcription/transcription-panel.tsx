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
import { languages, translateLanguages } from "@/lib/languages"
import { generateTranscriptFilename } from "@/utils/file-utils"
import { Model, Settings, TimelineInfo, Track, TranscriptionOptions } from "@/types/interfaces"
import { useTranslation } from "react-i18next"

interface ProcessingStep {
  id?: string
  title: string
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
  onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string) => Promise<void>
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
            setSelectedFile(files[0])
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
        extensions: [
          "wav", "mp3", "m4a", "flac", "ogg", "aac", "mp4", "mov", "mkv", "webm", "avi", "wmv", "mpeg", "mpg", "m4v", "3gp", "aiff", "opus", "alac", "*",
        ],
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
        <Card className="p-3 sticky bottom-4 mx-4 z-50 shadow-lg bg-card">
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
                <PopoverContent className="w-80 p-0" align="center">
                  <TextFormattingPanel />
                </PopoverContent>
              </Popover>
            </div>

            {!currentSettings.isStandaloneMode ? (
              <Popover open={openTrackSelector} onOpenChange={handleTrackSelectorOpen}>
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

export function TranscriptionPanel({ onViewSubtitles }: { onViewSubtitles?: () => void } = {}) {
  const { t } = useTranslation()
  const { subtitles, speakers, processTranscriptionResults, exportSubtitlesAs, loadSubtitles } = useTranscript()
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
      progressContainerRef.current.scrollTop = progressContainerRef.current.scrollHeight
    }
  }, [processingSteps])

  const isModelCached = modelsState[settings.model]?.isDownloaded ?? false

  React.useEffect(() => {
    const cleanup = setupEventListeners({
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      isResolveMode: !settings.isStandaloneMode,
      isModelCached,
      enableDiarize: settings.enableDiarize,
    })

    return cleanup
  }, [setupEventListeners, settings.targetLanguage, settings.language, settings.isStandaloneMode, isModelCached, settings.enableDiarize])

  React.useEffect(() => {
    if (!settings.isStandaloneMode && isExporting) {
      updateProgressStep({ progress: exportProgress, type: t("progressSteps.export") })
    }
  }, [isExporting, exportProgress, settings.isStandaloneMode, updateProgressStep])

  const handleExportToFile = async () => {
    try {
      await exportSubtitlesAs("srt", settings.enableDiarize, subtitles, speakers)
    } catch (error) {
      console.error("Export failed:", error)
    }
  }

  const handleAddToTimeline = async (selectedOutputTrack: string, selectedTemplate: string) => {
    try {
      await pushToTimeline(
        generateTranscriptFilename(settings.isStandaloneMode, fileInput, timelineInfo.timelineId),
        selectedTemplate,
        selectedOutputTrack,
      )
    } catch (error) {
      console.error("Failed to add to timeline:", error)
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
      isModelCached: modelsState[settings.model]?.isDownloaded ?? false,
      enableDiarize: settings.enableDiarize,
    })

    const audioInfo = await getSourceAudio(
      settings.isStandaloneMode,
      fileInput,
      settings.selectedInputTracks,
    )

    if (!audioInfo) {
      console.error("Failed to get audio")
      setIsProcessing(false)
      return
    }

    try {
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
