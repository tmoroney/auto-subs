import * as React from "react"
import { Layers2, Repeat2, Type, Upload, Users, X } from "lucide-react"
import { LayersIcon } from "@/components/ui/icons/layers"
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
import { SpeakerSettings } from "@/components/subtitles/speaker-settings"
import { ImportExportPopover } from "@/components/common/import-export-popover"
import { AddToTimelineDialog } from "@/components/dialogs/add-to-timeline-dialog"
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useResolve } from "@/contexts/ResolveContext"
import { useSettings } from "@/contexts/SettingsContext"
import { Speaker } from "@/types/interfaces"
import { useTranslation } from "react-i18next"

interface SubtitleViewerPanelProps {
  variant: "desktop" | "compact"
  isOpen?: boolean
  onClose?: () => void
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
  const [localSpeakers, setLocalSpeakers] = React.useState<Speaker[]>([])
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const layersIconRef = React.useRef<any>(null)
  const { subtitles, updateSubtitles, exportSubtitlesAs, importSubtitles, reformatSubtitles, speakers, updateSpeakers } = useTranscript()
  const { pushToTimeline, timelineInfo } = useResolve()
  const { settings } = useSettings()
  const { t } = useTranslation()

  React.useEffect(() => {
    setLocalSpeakers(speakers)
  }, [speakers])

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

  function updateLocalSpeaker(index: number, updated: Speaker) {
    const next = [...localSpeakers]
    next[index] = updated
    setLocalSpeakers(next)
  }

  function handleSaveSpeakers() {
    updateSpeakers(localSpeakers)
    setShowSpeakerEditor(false)
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

  const handleAddToTimeline = async (selectedOutputTrack: string, selectedTemplate: string) => {
    try {
      const { generateTranscriptFilename } = await import("@/utils/file-utils")
      const filename = generateTranscriptFilename(settings.isStandaloneMode, null, timelineInfo.timelineId || "")
      await pushToTimeline(filename, selectedTemplate, selectedOutputTrack)
    } catch (error) {
      console.error("Failed to add to timeline:", error)
      throw error
    }
  }

  if (variant === "compact" && !isOpen) return null

  const shellClassName = variant === "desktop"
    ? "flex flex-col h-full border-l bg-card/50"
    : "flex flex-col h-full min-h-0 bg-background"

  const headerClassName = variant === "desktop"
    ? "shrink-0 p-3 border-b"
    : "p-2 border-b shrink-0 sticky top-0 relative z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 space-y-1"

  const isDesktop = variant === "desktop"
  const showClearButton = !isDesktop && Boolean(searchQuery)
  const searchInputClassName = isDesktop ? undefined : "h-10 pr-28"
  const searchActionsClassName = isDesktop
    ? "contents"
    : "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1"
  const replaceContainerClassName = `overflow-hidden transition-all duration-200 ease-out ${showReplace ? `${isDesktop ? "mt-2 " : ""}max-h-20 opacity-100 pointer-events-auto` : "max-h-0 opacity-0 pointer-events-none"}`
  const replaceRowClassName = isDesktop ? "w-full" : "flex items-center gap-2 py-0.5"

  const renderSearchAction = (
    key: string,
    button: React.ReactNode,
    tooltip: string,
    useAddon = false,
  ) => {
    const trigger = useAddon ? <InputGroupAddon align="inline-end">{button}</InputGroupAddon> : button

    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
    )
  }

  const searchActions = [
    showClearButton
      ? renderSearchAction(
          "clear",
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-4 w-4" />
          </Button>,
          "Clear",
        )
      : null,
    renderSearchAction(
      "case-sensitive",
      <Button
        type="button"
        variant={searchCaseSensitive ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7 text-xs"
        onClick={() => setSearchCaseSensitive((v) => !v)}
      >
        Aa
      </Button>,
      "Case match",
      isDesktop,
    ),
    renderSearchAction(
      "whole-word",
      <Button
        type="button"
        variant={searchWholeWord ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7 text-xs"
        onClick={() => setSearchWholeWord((v) => !v)}
      >
        W
      </Button>,
      "Whole word",
      isDesktop,
    ),
    renderSearchAction(
      "replace-toggle",
      <Button
        type="button"
        variant={showReplace ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={() => setShowReplace((v) => !v)}
      >
        <Repeat2 className="h-4 w-4" />
      </Button>,
      "Replace all",
      isDesktop,
    ),
  ].filter(Boolean)

  const searchContainer = isDesktop ? (
    <>
      <ButtonGroup className="w-full">
        <InputGroup>
          <InputGroupInput
            ref={searchInputRef}
            placeholder={t("subtitles.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t("subtitles.searchAria")}
          />
          {searchActions}
        </InputGroup>
      </ButtonGroup>

      <div className={replaceContainerClassName}>
        <ButtonGroup className={replaceRowClassName}>
          <Input
            placeholder="Replace with..."
            value={replaceValue}
            onChange={(e) => setReplaceValue(e.target.value)}
          />
          <Button
            type="button"
            disabled={!canReplace}
            onClick={handleReplaceAll}
            className="text-xs"
          >
            Replace All
          </Button>
        </ButtonGroup>
      </div>
    </>
  ) : (
    <div className={headerClassName}>
      <div className="relative">
        <Input
          ref={searchInputRef}
          placeholder={t("subtitles.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={searchInputClassName}
          aria-label={t("subtitles.searchAria")}
        />
        <div className={searchActionsClassName}>{searchActions}</div>
      </div>

      <div className={replaceContainerClassName}>
        <div className={replaceRowClassName}>
          <Input
            placeholder="Replace with..."
            value={replaceValue}
            onChange={(e) => setReplaceValue(e.target.value)}
            className="h-9"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!canReplace}
            onClick={handleReplaceAll}
            size="sm"
          >
            Replace All
          </Button>
        </div>
      </div>
    </div>
  )

  const toolbarClassName = variant === "desktop"
    ? "shrink-0 px-3 pb-3 pt-2 flex items-center gap-2 relative z-20"
    : "px-3 py-1.5 border-b shrink-0 relative z-20 bg-background"

  const isResolveConnected = Boolean(timelineInfo?.timelineId)

  return (
    <div className={shellClassName}>
      {variant === "desktop" ? (
        <div className={headerClassName}>{searchContainer}</div>
      ) : (
        searchContainer
      )}

      <div className={toolbarClassName}>
        <div className="flex items-center gap-2 w-full">
          {variant === "compact" && (
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

          <ImportExportPopover
            onImport={() => importSubtitles(settings, null, "")}
            onExport={(format, includeSpeakers) => exportSubtitlesAs(format, includeSpeakers, subtitles, [])}
            hasSubtitles={subtitles.length > 0}
            trigger={variant === "desktop" ? (
              <Button variant="outline" size="sm" className="h-9 px-3" title={t("importExport.button")}>
                <Upload className="h-4 w-4 mr-0.5" />
                Import/Export
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" aria-label={t("importExport.button")}>
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("importExport.button")}</TooltipContent>
              </Tooltip>
            )}
          />

          <Popover open={showSpeakerEditor} onOpenChange={(open) => {
            if (open) setLocalSpeakers(speakers)
            setShowSpeakerEditor(open)
          }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size={variant === "desktop" ? "sm" : "icon"}
                    className={variant === "desktop" ? "h-9 px-3" : "h-9 w-9"}
                    title={variant === "desktop" ? t("subtitles.speakers") : undefined}
                    aria-label={variant === "compact" ? t("subtitles.editSpeakers") : undefined}
                  >
                    <Users className={variant === "desktop" ? "h-4 w-4 mr-0.5" : "h-4 w-4"} />
                    {variant === "desktop" ? "Speakers" : null}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              {variant === "compact" && <TooltipContent side="bottom">{t("subtitles.editSpeakers")}</TooltipContent>}
            </Tooltip>
            <PopoverContent align="center" className="w-80 p-0">
              <div className="px-4 pt-4 pb-2">
                <h4 className="font-medium text-sm">{t("speakerEditor.title")}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{t("speakerEditor.description")}</p>
              </div>
              <ScrollArea className="max-h-72">
                <div className="px-4 pb-2 space-y-3">
                  {localSpeakers.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("subtitles.empty.noSubtitlesAvailable")}</p>
                  )}
                  {localSpeakers.map((speaker, index) => (
                    <div key={index} className="border rounded-md">
                      <SpeakerSettings
                        speaker={speaker}
                        onSpeakerChange={(updated) => updateLocalSpeaker(index, updated)}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              {localSpeakers.length > 0 && (
                <div className="p-3 border-t flex justify-end gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowSpeakerEditor(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" onClick={handleSaveSpeakers}>
                    {t("common.saveChanges")}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Popover open={showReformat} onOpenChange={setShowReformat}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size={variant === "desktop" ? "sm" : "icon"}
                    className={variant === "desktop" ? "h-9 px-3" : "h-9 w-9"}
                    title={variant === "desktop" ? "Reformat" : undefined}
                    aria-label={variant === "compact" ? "Reformat" : undefined}
                  >
                    <Type className={variant === "desktop" ? "h-4 w-4 mr-0.5" : "h-4 w-4"} />
                    {variant === "desktop" ? "Reformat" : null}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              {variant === "compact" && <TooltipContent side="bottom">Reformat</TooltipContent>}
            </Tooltip>
            <PopoverContent align="center" className="w-80 p-0">
              <TextFormattingPanel
                showActions
                onCancel={() => setShowReformat(false)}
                onApply={handleApplyReformat}
                applyDisabled={subtitles.length === 0}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className={variant === "desktop" ? "flex-1 overflow-y-auto min-h-0 px-0 pb-2 relative z-0" : "flex-1 overflow-y-auto min-h-0 px-0 pb-2 pt-2 relative z-0"}>
        {subtitles.length > 0 ? (
          <SubtitleList
            searchQuery={searchQuery}
            searchCaseSensitive={searchCaseSensitive}
            searchWholeWord={searchWholeWord}
            selectedIndex={selectedIndex}
            onSelectedIndexChange={setSelectedIndex}
            itemClassName="hover:bg-sidebar-accent p-3 transition-colors"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-8">
            <p className="text-lg font-medium mb-2">{t("subtitles.empty.noSubtitlesFound")}</p>
            <p className="text-sm">
              {searchQuery
                ? t("subtitles.empty.tryDifferentSearch")
                : t("subtitles.empty.noSubtitlesAvailable")}
            </p>
          </div>
        )}
      </div>

      {isResolveConnected && (
        <div className={variant === "desktop" ? "shrink-0 p-3 flex justify-end gap-2 border-t shadow-2xl" : "shrink-0 p-3 flex justify-end gap-2 border-t shadow-2xl"}>
          <AddToTimelineDialog
            settings={settings}
            timelineInfo={timelineInfo}
            onAddToTimeline={handleAddToTimeline}
          >
            <Button
              variant={variant === "desktop" ? "secondary" : "default"}
              size="default"
              className={variant === "desktop" ? "w-full" : "w-full bg-orange-600 hover:bg-orange-500 dark:bg-orange-500 dark:hover:bg-orange-600"}
              onMouseEnter={() => layersIconRef.current?.startAnimation?.()}
              onMouseLeave={() => layersIconRef.current?.stopAnimation?.()}
            >
              {variant === "desktop" ? (
                <LayersIcon ref={layersIconRef} className="w-4 h-4" />
              ) : (
                <Layers2 className="w-4 h-4 mr-2" />
              )}
              {t("subtitles.addToTimeline")}
            </Button>
          </AddToTimelineDialog>
        </div>
      )}
    </div>
  )
}
