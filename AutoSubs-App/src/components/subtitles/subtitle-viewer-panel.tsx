import * as React from "react"
import { Loader2, Repeat2, Type, Upload, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SubtitleList } from "@/components/subtitles/subtitle-list"
import { SpeakerSettings } from "@/components/common/speaker-settings"
import { ImportExportPopover } from "@/components/common/import-export-popover"
import { TranscriptSearchPopover } from "@/components/common/transcript-search-popover"
import { AddToTimelineDialog } from "@/components/dialogs/add-to-timeline-dialog"
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useResolve } from "@/contexts/ResolveContext"
import { usePremiere } from "@/contexts/PremiereContext"
import { useSettings } from "@/contexts/SettingsContext"
import { Speaker, Track } from "@/types"
import { useTranslation } from "react-i18next"
import { PlusIcon, type PlusIconHandle } from "../ui/plus"
import { ArchiveIcon } from "../ui/archive"
import type { HistoryIconHandle } from "@/components/ui/history"

type SubtitleViewerVariant = "desktop" | "compact"

interface SubtitleViewerPanelProps {
  variant: SubtitleViewerVariant
  isOpen?: boolean
  onClose?: () => void
}

interface SearchActionButtonProps {
  button: React.ReactNode
  tooltip: string
  useAddon?: boolean
}

function SearchActionButton({ button, tooltip, useAddon = false }: SearchActionButtonProps) {
  const trigger = useAddon ? <InputGroupAddon align="inline-end">{button}</InputGroupAddon> : button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

interface SearchSectionProps {
  variant: SubtitleViewerVariant
  headerClassName: string
  t: (key: string) => string
  searchQuery: string
  replaceValue: string
  searchCaseSensitive: boolean
  searchWholeWord: boolean
  showReplace: boolean
  canReplace: boolean
  searchInputRef: React.RefObject<HTMLInputElement>
  onSearchQueryChange: (value: string) => void
  onReplaceValueChange: (value: string) => void
  onToggleCaseSensitive: () => void
  onToggleWholeWord: () => void
  onToggleReplace: () => void
  onReplaceAll: () => void
  searchPlaceholder: string
  searchAriaLabel: string
}

function SearchSection({
  variant,
  headerClassName,
  t,
  searchQuery,
  replaceValue,
  searchCaseSensitive,
  searchWholeWord,
  showReplace,
  canReplace,
  searchInputRef,
  onSearchQueryChange,
  onReplaceValueChange,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onToggleReplace,
  onReplaceAll,
  searchPlaceholder,
  searchAriaLabel,
}: SearchSectionProps) {
  const isDesktop = variant === "desktop"
  const showClearButton = !isDesktop && Boolean(searchQuery)

  const searchActions = [
    showClearButton ? (
      <SearchActionButton
        key="clear"
        button={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onSearchQueryChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        }
        tooltip={searchAriaLabel}
      />
    ) : null,
    <SearchActionButton
      key="case-sensitive"
      button={
        <Button
          type="button"
          variant={searchCaseSensitive ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7 text-xs"
          onClick={onToggleCaseSensitive}
        >
          Aa
        </Button>
      }
      tooltip={t("subtitles.search.caseMatch")}
      useAddon={isDesktop}
    />,
    <SearchActionButton
      key="whole-word"
      button={
        <Button
          type="button"
          variant={searchWholeWord ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7 text-xs"
          onClick={onToggleWholeWord}
        >
          W
        </Button>
      }
      tooltip={t("subtitles.search.wholeWord")}
      useAddon={isDesktop}
    />,
    <SearchActionButton
      key="replace-toggle"
      button={
        <Button
          type="button"
          variant={showReplace ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleReplace}
        >
          <Repeat2 className="h-4 w-4" />
        </Button>
      }
      tooltip={t("subtitles.search.replaceAll")}
      useAddon={isDesktop}
    />,
  ].filter(Boolean)

  const searchInput = (
    <InputGroup>
      <InputGroupInput
        ref={searchInputRef}
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        aria-label={searchAriaLabel}
        className="text-sm"
      />
      {searchActions}
    </InputGroup>
  )

  const replaceSection = (
    <ButtonGroup className="w-full mt-2">
      <Input
        placeholder={t("subtitles.search.replaceWithPlaceholder")}
        value={replaceValue}
        onChange={(e) => onReplaceValueChange(e.target.value)}
        className="text-sm"
      />
      <Button
        type="button"
        variant={isDesktop ? undefined : "secondary"}
        disabled={!canReplace}
        onClick={onReplaceAll}
        size={isDesktop ? undefined : "sm"}
        className={isDesktop ? "text-xs" : undefined}
      >
        {t("subtitles.search.replaceAll")}
      </Button>
    </ButtonGroup>
  )

  return (
    <div className={headerClassName}>
      {searchInput}
      {showReplace && replaceSection}
    </div>
  )
}

interface SpeakersPopoverProps {
  variant: SubtitleViewerVariant
  open: boolean
  speakers: Speaker[]
  onOpenChange: (open: boolean) => void
  onSpeakerChange: (index: number, speaker: Speaker) => void
  t: (key: string) => string
  tracks?: Track[]
}

function SpeakersPopover({
  variant,
  open,
  speakers,
  onOpenChange,
  onSpeakerChange,
  t,
  tracks,
}: SpeakersPopoverProps) {
  const isDesktop = variant === "desktop"

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true)
        else onOpenChange(false)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size={isDesktop ? "sm" : "icon"}
              className={isDesktop ? "h-9 px-3" : "h-9 w-9"}
              title={isDesktop ? t("subtitles.speakers") : undefined}
              aria-label={variant === "compact" ? t("subtitles.editSpeakers") : undefined}
            >
              <Users className={isDesktop ? "h-4 w-4 mr-0.5" : "h-4 w-4"} />
              {isDesktop ? t("subtitles.speakers") : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {variant === "compact" && <TooltipContent side="bottom">{t("subtitles.editSpeakers")}</TooltipContent>}
      </Tooltip>
      <PopoverContent align="center" className="w-[340px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="pb-3">
          <h4 className="font-medium text-sm">{t("speakerEditor.title")}</h4>
          <p className="text-xs text-muted-foreground">{t("speakerEditor.description")}</p>
        </div>
        <ScrollArea className="h-[320px] pr-4 -mr-4">
          <div className="space-y-3">
            {speakers.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">{t("subtitles.empty.noSubtitlesAvailable")}</p>
            )}
            {speakers.map((speaker, index) => (
              <div key={index} className="border rounded-md p-3 bg-card">
                <SpeakerSettings
                  speaker={speaker}
                  onSpeakerChange={(updated) => onSpeakerChange(index, updated)}
                  tracks={tracks}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

interface ReformatPopoverProps {
  variant: SubtitleViewerVariant
  open: boolean
  subtitleCount: number
  onOpenChange: (open: boolean) => void
  onApply: () => Promise<void>
  t: (key: string) => string
}

function ReformatPopover({ variant, open, subtitleCount, onOpenChange, onApply, t }: ReformatPopoverProps) {
  const isDesktop = variant === "desktop"

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size={isDesktop ? "sm" : "icon"}
              className={isDesktop ? "h-9 px-3" : "h-9 w-9"}
              title={isDesktop ? t("subtitles.reformat") : undefined}
              aria-label={variant === "compact" ? t("subtitles.reformat") : undefined}
            >
              <Type className={isDesktop ? "h-4 w-4 mr-0.5" : "h-4 w-4"} />
              {isDesktop ? t("subtitles.reformat") : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {variant === "compact" && <TooltipContent side="bottom">{t("subtitles.reformat")}</TooltipContent>}
      </Tooltip>
      <PopoverContent align="center" className="w-80 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <TextFormattingPanel
          showActions
          onCancel={() => onOpenChange(false)}
          onApply={onApply}
          applyDisabled={subtitleCount === 0}
        />
      </PopoverContent>
    </Popover>
  )
}

interface SubtitleToolbarProps {
  variant: SubtitleViewerVariant
  onClose?: () => void
  subtitlesLength: number
  settings: ReturnType<typeof useSettings>["settings"]
  speakers: Speaker[]
  showSpeakerEditor: boolean
  showReformat: boolean
  importSubtitles: ReturnType<typeof useTranscript>["importSubtitles"]
  exportSubtitlesAs: ReturnType<typeof useTranscript>["exportSubtitlesAs"]
  subtitles: ReturnType<typeof useTranscript>["subtitles"]
  onSpeakerEditorOpenChange: (open: boolean) => void
  onSpeakerChange: (index: number, speaker: Speaker) => void
  onReformatOpenChange: (open: boolean) => void
  onApplyReformat: () => Promise<void>
  t: (key: string) => string
  tracks?: Track[]
}

function SubtitleToolbar({
  variant,
  onClose,
  subtitlesLength,
  settings,
  speakers,
  showSpeakerEditor,
  showReformat,
  importSubtitles,
  exportSubtitlesAs,
  subtitles,
  onSpeakerEditorOpenChange,
  onSpeakerChange,
  onReformatOpenChange,
  onApplyReformat,
  t,
  tracks,
}: SubtitleToolbarProps) {
  const toolbarClassName = variant === "desktop"
    ? "shrink-0 px-3 pb-3 pt-2 flex items-center gap-2 relative z-20 border-b overflow-x-auto"
    : "px-2 py-1.5 border-b shrink-0 relative z-20 bg-background"

  return (
    <div className={toolbarClassName}>
      <div className="flex items-center gap-2 w-full">
        {variant === "compact" && onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onClose}
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 mr-auto"
                aria-label={t("common.back")}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("common.close")}</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <ImportExportPopover
              onImport={() => importSubtitles(settings, null, "")}
              onExport={(format) => exportSubtitlesAs(format, subtitles, speakers)}
              hasSubtitles={subtitlesLength > 0}
              trigger={variant === "desktop" ? (
                <Button variant="outline" size="sm" className="h-9 px-3" title={t("importExport.button")}>
                  <Upload className="h-4 w-4 mr-0.5" />
                  {t("importExport.button")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={t("importExport.button")}
                  title={t("importExport.button")}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              )}
            />
          </TooltipTrigger>
          {variant === "compact" && <TooltipContent side="bottom">{t("importExport.button")}</TooltipContent>}
        </Tooltip>

        {speakers.length > 0 && (
          <SpeakersPopover
            variant={variant}
            open={showSpeakerEditor}
            speakers={speakers}
            onOpenChange={onSpeakerEditorOpenChange}
            onSpeakerChange={onSpeakerChange}
            t={t}
            tracks={tracks}
          />
        )}

        <ReformatPopover
          variant={variant}
          open={showReformat}
          subtitleCount={subtitlesLength}
          onOpenChange={onReformatOpenChange}
          onApply={onApplyReformat}
          t={t}
        />
      </div>
    </div>
  )
}

interface SubtitleContentProps {
  variant: SubtitleViewerVariant
  subtitlesLength: number
  searchQuery: string
  searchCaseSensitive: boolean
  searchWholeWord: boolean
  selectedIndex: number | null
  onSelectedIndexChange: (index: number | null) => void
  t: (key: string) => string
}

function SubtitleContent({
  variant,
  subtitlesLength,
  searchQuery,
  searchCaseSensitive,
  searchWholeWord,
  selectedIndex,
  onSelectedIndexChange,
  t,
}: SubtitleContentProps) {
  const archiveIconRef = React.useRef<HistoryIconHandle>(null)
  const contentClassName = variant === "desktop"
    ? "flex-1 overflow-y-auto min-h-0 px-0 relative z-0"
    : "flex-1 overflow-y-auto min-h-0 px-0 relative z-0"

  return (
    <div className={contentClassName}>
      {subtitlesLength > 0 ? (
        <SubtitleList
          searchQuery={searchQuery}
          searchCaseSensitive={searchCaseSensitive}
          searchWholeWord={searchWholeWord}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={onSelectedIndexChange}
          itemClassName="hover:bg-sidebar-accent transition-colors"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-8">
          <p className="text-lg font-medium mb-2">{t("subtitles.empty.noSubtitlesFound")}</p>
          <p className="text-sm mb-4">
            {searchQuery
              ? t("subtitles.empty.tryDifferentSearch")
              : t("subtitles.empty.noSubtitlesAvailable")}
          </p>
          {!searchQuery && (
            <TranscriptSearchPopover
              trigger={
                <Button
                  variant="outline"
                  size="default"
                  className="gap-2"
                  onMouseEnter={() => archiveIconRef.current?.startAnimation()}
                  onMouseLeave={() => archiveIconRef.current?.stopAnimation()}
                >
                  <ArchiveIcon ref={archiveIconRef} size={16} />
                  {t("subtitles.previousTranscripts")}
                </Button>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

interface AddToTimelineFooterProps {
  variant: SubtitleViewerVariant
  settings: ReturnType<typeof useSettings>["settings"]
  timelineInfo: ReturnType<typeof useResolve>["timelineInfo"]
  layersIconRef: React.RefObject<PlusIconHandle>
  onAddToTimeline: (selectedOutputTrack: string, selectedTemplate: string, presetSettings?: Record<string, unknown>) => Promise<void>
  t: (key: string) => string
  isAdding: boolean
  selectedIntegration?: "davinci" | "premiere"
}

function AddToTimelineFooter({
  variant,
  settings,
  timelineInfo,
  layersIconRef,
  onAddToTimeline,
  t,
  isAdding,
  selectedIntegration,
}: AddToTimelineFooterProps) {
  return (
    <div className="shrink-0 p-3 flex justify-end gap-2 border-t shadow-2xl">
      <AddToTimelineDialog
        settings={settings}
        timelineInfo={timelineInfo}
        onAddToTimeline={onAddToTimeline}
        isAdding={isAdding}
        selectedIntegration={selectedIntegration}
      >
        <Button
          variant={variant === "desktop" ? "secondary" : "default"}
          size="default"
          disabled={isAdding}
          className={variant === "desktop" ? "w-full" : "w-full bg-orange-600 hover:bg-orange-500 dark:bg-orange-500 dark:hover:bg-orange-600"}
          onMouseEnter={() => !isAdding && layersIconRef.current?.startAnimation?.()}
          onMouseLeave={() => !isAdding && layersIconRef.current?.stopAnimation?.()}
        >
          {isAdding ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("addToTimeline.adding")}
            </>
          ) : (
            <>
              <PlusIcon ref={layersIconRef} className="w-4 h-4" />
              {t("subtitles.addToTimeline")}
            </>
          )}
        </Button>
      </AddToTimelineDialog>
    </div>
  )
}

export function SubtitleViewerPanel({ variant, isOpen = true, onClose }: SubtitleViewerPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false)
  const [searchWholeWord, setSearchWholeWord] = React.useState(false)
  const [showReplace, setShowReplace] = React.useState(false)
  const [replaceValue, setReplaceValue] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
  const [showReformat, setShowReformat] = React.useState(false)
  const [isAddingToTimeline, setIsAddingToTimeline] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const layersIconRef = React.useRef<PlusIconHandle>(null)
  const { subtitles, currentTranscriptFilename, updateSubtitles, exportSubtitlesAs, importSubtitles, reformatSubtitles, speakers, updateSpeakers } = useTranscript()
  const { timelineInfo: resolveTimeline, pushToTimeline: resolvePush } = useResolve()
  const { timelineInfo: premiereTimeline, pushToTimeline: premierePush, isConnected: isPremiereConnected } = usePremiere()
  
  const isPremiereActive = isPremiereConnected;
  const timelineInfo = isPremiereActive ? premiereTimeline : resolveTimeline;
  const pushToTimeline = isPremiereActive 
    ? (filename?: string, _selectedTemplate?: string, _selectedOutputTrack?: string, _presetSettings?: Record<string, unknown>) => premierePush(filename) 
    : resolvePush;
  const { settings } = useSettings()
  const { t } = useTranslation()


  React.useEffect(() => {
    if (variant !== "compact" || !isOpen || !onClose) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose, variant])

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const buildFindRegExp = React.useCallback(() => {
    const q = (searchQuery ?? "").trim()
    if (!q) return null
    const escaped = escapeRegExp(q)
    const pattern = searchWholeWord ? `\\b${escaped}\\b` : escaped
    const flags = searchCaseSensitive ? "g" : "gi"
    return new RegExp(pattern, flags)
  }, [searchCaseSensitive, searchQuery, searchWholeWord])

  const canReplace = variant === "desktop" ? Boolean(replaceValue.trim()) : Boolean(searchQuery.trim())
  const isIntegrationConnected = Boolean(timelineInfo?.timelineId) || isPremiereConnected;
  const shellClassName = variant === "desktop"
    ? "flex flex-col h-full border-l bg-card/50"
    : "flex flex-col h-full min-h-0 bg-background"
  const headerClassName = variant === "desktop"
    ? "shrink-0 p-3 pb-0"
    : "p-2 pb-0 shrink-0 sticky top-0 relative z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 space-y-1"

  function handleSpeakerChange(index: number, updated: Speaker) {
    const next = [...speakers]
    next[index] = updated
    updateSpeakers(next)
  }

  const handleReplaceAll = () => {
    const re = buildFindRegExp()
    if (!re) return
    const next = subtitles.map((s) => ({
      ...s,
      text: (s.text ?? "").replace(re, replaceValue),
    }))
    updateSubtitles(next)
  }

  const handleApplyReformat = async () => {
    const timelineId = timelineInfo?.timelineId || ""
    await reformatSubtitles(settings, null, timelineId)
    setShowReformat(false)
  }

  const handleAddToTimeline = async (selectedOutputTrack: string, selectedTemplate: string, presetSettings?: Record<string, unknown>) => {
    try {
      if (!currentTranscriptFilename) {
        console.error("No active transcript file to add to timeline")
        return
      }

      setIsAddingToTimeline(true)
      await pushToTimeline(currentTranscriptFilename, selectedTemplate, selectedOutputTrack, presetSettings)
    } catch (error) {
      console.error("Failed to add to timeline:", error)
      throw error
    } finally {
      setIsAddingToTimeline(false)
    }
  }

  if (variant === "compact" && !isOpen) return null

  return (
    <div className={shellClassName}>
      <SearchSection
        variant={variant}
        headerClassName={headerClassName}
        t={t}
        searchQuery={searchQuery}
        replaceValue={replaceValue}
        searchCaseSensitive={searchCaseSensitive}
        searchWholeWord={searchWholeWord}
        showReplace={showReplace}
        canReplace={canReplace}
        searchInputRef={searchInputRef}
        onSearchQueryChange={setSearchQuery}
        onReplaceValueChange={setReplaceValue}
        onToggleCaseSensitive={() => setSearchCaseSensitive((value) => !value)}
        onToggleWholeWord={() => setSearchWholeWord((value) => !value)}
        onToggleReplace={() => setShowReplace((value) => !value)}
        onReplaceAll={handleReplaceAll}
        searchPlaceholder={t("subtitles.searchPlaceholder")}
        searchAriaLabel={t("subtitles.searchAria")}
      />

      {subtitles.length > 0 && (
        <SubtitleToolbar
          variant={variant}
          onClose={onClose}
          subtitlesLength={subtitles.length}
          settings={settings}
          speakers={speakers}
          showSpeakerEditor={showSpeakerEditor}
          showReformat={showReformat}
          importSubtitles={importSubtitles}
          exportSubtitlesAs={exportSubtitlesAs}
          subtitles={subtitles}
          onSpeakerEditorOpenChange={setShowSpeakerEditor}
          onSpeakerChange={handleSpeakerChange}
          onReformatOpenChange={setShowReformat}
          onApplyReformat={handleApplyReformat}
          t={t}
          tracks={timelineInfo?.outputTracks}
        />
      )}

      <SubtitleContent
        variant={variant}
        subtitlesLength={subtitles.length}
        searchQuery={searchQuery}
        searchCaseSensitive={searchCaseSensitive}
        searchWholeWord={searchWholeWord}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        t={t}
      />

      {isIntegrationConnected && subtitles.length > 0 && (
        <AddToTimelineFooter
          variant={variant}
          settings={settings}
          timelineInfo={timelineInfo}
          layersIconRef={layersIconRef}
          onAddToTimeline={handleAddToTimeline}
          t={t}
          isAdding={isAddingToTimeline}
          selectedIntegration={isPremiereActive ? "premiere" : "davinci"}
        />
      )}
    </div>
  )
}
