import * as React from "react"
import { Repeat2, Type, Upload, Users, X } from "lucide-react"
import { LayersIcon } from "@/components/ui/icons/layers"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { SubtitleList } from "@/components/subtitles/subtitle-list"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useResolve } from "@/contexts/ResolveContext"
import { useSettings } from "@/contexts/SettingsContext"
import { ImportExportPopover } from "@/components/common/import-export-popover"
import { Speaker } from "@/types/interfaces"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SpeakerSettings } from "@/components/subtitles/speaker-settings"
import { AddToTimelineDialog } from "@/components/dialogs/add-to-timeline-dialog"
import { useTranslation } from "react-i18next"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TextFormattingPanel } from "@/components/settings/text-formatting-panel"

export function DesktopSubtitleViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false)
  const [searchWholeWord, setSearchWholeWord] = React.useState(false)
  const [showReplace, setShowReplace] = React.useState(false)
  const [replaceValue, setReplaceValue] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles, updateSubtitles, exportSubtitlesAs, importSubtitles, reformatSubtitles, speakers, updateSpeakers } = useTranscript()
  const { pushToTimeline, timelineInfo } = useResolve()
  const { settings } = useSettings()
  const layersIconRef = React.useRef<any>(null)
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
  const [localSpeakers, setLocalSpeakers] = React.useState<Speaker[]>(speakers)
  const [showReformat, setShowReformat] = React.useState(false)

  React.useEffect(() => {
    setLocalSpeakers(speakers)
  }, [speakers])

  function updateLocalSpeaker(index: number, updated: Speaker) {
    const next = [...localSpeakers]
    next[index] = updated
    setLocalSpeakers(next)
  }

  function handleSaveSpeakers() {
    updateSpeakers(localSpeakers)
    setShowSpeakerEditor(false)
  }
  const { t } = useTranslation()

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const buildFindRegExp = React.useCallback(() => {
    const q = (searchQuery ?? "").trim()
    if (!q) return null
    const escaped = escapeRegExp(q)
    const pattern = searchWholeWord ? `\\b${escaped}\\b` : escaped
    const flags = searchCaseSensitive ? "g" : "gi"
    return new RegExp(pattern, flags)
  }, [searchCaseSensitive, searchQuery, searchWholeWord])

  const canReplace = React.useMemo(() => Boolean(replaceValue.trim()), [replaceValue])

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
      // Generate filename and call pushToTimeline with proper parameters
      const { generateTranscriptFilename } = await import('@/utils/file-utils')
      const filename = generateTranscriptFilename(settings.isStandaloneMode, null, timelineInfo.timelineId || '')
      await pushToTimeline(filename, selectedTemplate, selectedOutputTrack)
    } catch (error) {
      console.error("Failed to add to timeline:", error);
      throw error; // Re-throw to let the dialog handle the error
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-card/50">

      {/* Search */}
      <div className="shrink-0 p-3 border-b">
        <ButtonGroup className="w-full">
          <InputGroup>
            <InputGroupInput
              ref={searchInputRef}
              placeholder={t("subtitles.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t("subtitles.searchAria")}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupAddon align="inline-end">
                  <Button
                    type="button"
                    variant={searchCaseSensitive ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 text-xs"
                    onClick={() => setSearchCaseSensitive((v) => !v)}
                  >
                    Aa
                  </Button>
                </InputGroupAddon>
              </TooltipTrigger>
              <TooltipContent side="bottom">Case match</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupAddon align="inline-end">
                  <Button
                    type="button"
                    variant={searchWholeWord ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 text-xs"
                    onClick={() => setSearchWholeWord((v) => !v)}
                  >
                    W
                  </Button>
                </InputGroupAddon>
              </TooltipTrigger>
              <TooltipContent side="bottom">Whole word</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupAddon align="inline-end">
                  <Button
                    type="button"
                    variant={showReplace ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowReplace((v) => !v)}
                  >
                    <Repeat2 className="h-4 w-4" />
                  </Button>
                </InputGroupAddon>
              </TooltipTrigger>
              <TooltipContent side="bottom">Replace all</TooltipContent>
            </Tooltip>
          </InputGroup>
        </ButtonGroup>

        <div className={`transition-all duration-200 ease-out ${showReplace ? "mt-2 max-h-20 opacity-100" : "max-h-0 opacity-0"}`}>
          <ButtonGroup className="w-full">
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
      </div>

      {/* Compact toolbar */}
      <div className="shrink-0 px-3 pb-3 pt-2 flex items-center gap-2 relative z-20">
        <ImportExportPopover
          onImport={() => importSubtitles(settings, null, "")}
          onExport={(format, includeSpeakers) => exportSubtitlesAs(format, includeSpeakers, subtitles, [])}
          hasSubtitles={subtitles.length > 0}
          trigger={
            <Button variant="outline" size="sm" className="h-9 px-3" title={t("importExport.button")}>
              <Upload className="h-4 w-4 mr-0.5" />
              Import/Export
            </Button>
          }
        />

        <Popover open={showSpeakerEditor} onOpenChange={(open) => {
          if (open) setLocalSpeakers(speakers)
          setShowSpeakerEditor(open)
        }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              title={t("subtitles.speakers")}
            >
              <Users className="h-4 w-4 mr-0.5" />
              Speakers
            </Button>
          </PopoverTrigger>
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
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              title="Reformat"
            >
              <Type className="h-4 w-4 mr-0.5" />
              Reformat
            </Button>
          </PopoverTrigger>
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


      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-0 pb-2 relative z-0">
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

      {/* Footer */}
      {!settings.isStandaloneMode && (
        <div className="shrink-0 p-3 flex justify-end gap-2 border-t shadow-2xl">
          <AddToTimelineDialog
            settings={settings}
            timelineInfo={timelineInfo}
            onAddToTimeline={handleAddToTimeline}
          >
            <Button
              variant="secondary"
              size="default"
              className="w-full"
              onMouseEnter={() => layersIconRef.current?.startAnimation()}
              onMouseLeave={() => layersIconRef.current?.stopAnimation()}
            >
              <LayersIcon ref={layersIconRef} className="w-4 h-4" />
              {t("subtitles.addToTimeline")}
            </Button>
          </AddToTimelineDialog>
        </div>
      )}
    </div>
  )
}
