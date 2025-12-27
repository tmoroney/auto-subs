import * as React from "react"
import { Layers2, Repeat2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SubtitleList } from "@/components/subtitle-list"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useResolve } from "@/contexts/ResolveContext"
import { useSettings } from "@/contexts/SettingsContext"
import { ImportExportPopover } from "@/components/import-export-popover"
import { SpeakerEditor } from "@/components/speaker-editor"
import { AddToTimelineDialog } from "@/components/add-to-timeline-dialog"
import { useTranslation } from "react-i18next"

export function DesktopSubtitleViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false)
  const [searchWholeWord, setSearchWholeWord] = React.useState(false)
  const [showReplace, setShowReplace] = React.useState(false)
  const [replaceValue, setReplaceValue] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles, updateSubtitles, exportSubtitlesAs, importSubtitles } = useTranscript()
  const { pushToTimeline, timelineInfo } = useResolve()
  const { settings } = useSettings()
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
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

  const canReplace = Boolean(searchQuery.trim())

  const handleReplaceAll = () => {
    const re = buildFindRegExp()
    if (!re) return
    const next = subtitles.map((s) => ({
      ...s,
      text: (s.text ?? "").replace(re, replaceValue),
    }))
    updateSubtitles(next)
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
    <div className="flex flex-col h-full border-l">

      {/* Import/Export Popover & Edit Speakers */}
      <div className="shrink-0 p-3 pb-0 flex gap-2">
        <ImportExportPopover
          onImport={() => importSubtitles(settings, null, '')}
          onExport={(format, includeSpeakers) => exportSubtitlesAs(format, includeSpeakers, subtitles, [])}
          hasSubtitles={subtitles.length > 0}
        />
        <Button variant="outline" className="w-full" onClick={() => setShowSpeakerEditor(true)}>
          <Users className="w-4 h-4 mr-2" />
          {t("subtitles.speakers")}
        </Button>
        <SpeakerEditor afterTranscription={false} open={showSpeakerEditor} onOpenChange={() => setShowSpeakerEditor(false)} />
      </div>

      {/* Search */}
      <div className="shrink-0 p-3 border-b">
        <div className="relative">
          <Input
            ref={searchInputRef}
            placeholder={t("subtitles.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-28"
            aria-label={t("subtitles.searchAria")}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Clear</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={searchCaseSensitive ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setSearchCaseSensitive((v) => !v)}
                >
                  Aa
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Case match</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={searchWholeWord ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setSearchWholeWord((v) => !v)}
                >
                  W
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Whole word</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={showReplace ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowReplace((v) => !v)}
                >
                  <Repeat2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Replace all</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className={`transition-all duration-200 ease-out ${showReplace ? "mt-2 max-h-20 opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="flex items-center gap-2 py-1">
            <Input
              placeholder="Replace with..."
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!canReplace}
              onClick={handleReplaceAll}
            >
              Replace All
            </Button>
          </div>
        </div>
      </div>


      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-0 pb-2">
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
            >
              <Layers2 className="w-4 h-4 mr-2" />
              {t("subtitles.addToTimeline")}
            </Button>
          </AddToTimelineDialog>
        </div>
      )}
    </div>
  )
}
