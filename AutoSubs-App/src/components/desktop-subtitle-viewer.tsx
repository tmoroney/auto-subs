import * as React from "react"
import { Layers2, MoreVertical, Repeat2, Type, Upload, Users, X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export function DesktopSubtitleViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false)
  const [searchWholeWord, setSearchWholeWord] = React.useState(false)
  const [showReplace, setShowReplace] = React.useState(false)
  const [replaceValue, setReplaceValue] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles, updateSubtitles, exportSubtitlesAs, importSubtitles, reformatSubtitles } = useTranscript()
  const { pushToTimeline, timelineInfo } = useResolve()
  const { settings, updateSetting } = useSettings()
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
  const [showReformat, setShowReformat] = React.useState(false)
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
      <div className="shrink-0 p-3 border-b relative z-20 bg-card/50">
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

      {/* Compact toolbar */}
      <div className="shrink-0 px-3 pb-3 pt-2 flex items-center gap-2 relative z-20 bg-card/50">
        <ImportExportPopover
          onImport={() => importSubtitles(settings, null, "")}
          onExport={(format, includeSpeakers) => exportSubtitlesAs(format, includeSpeakers, subtitles, [])}
          hasSubtitles={subtitles.length > 0}
          trigger={
            <Button variant="outline" size="icon" className="h-9 w-9" title={t("importExport.button")}>
              <Upload className="h-4 w-4" />
            </Button>
          }
        />

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => setShowSpeakerEditor(true)}
          title={t("subtitles.speakers")}
        >
          <Users className="h-4 w-4" />
        </Button>
        <SpeakerEditor afterTranscription={false} open={showSpeakerEditor} onOpenChange={() => setShowSpeakerEditor(false)} />

        <Popover open={showReformat} onOpenChange={setShowReformat}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              disabled={settings.isStandaloneMode}
              title="Reformat"
            >
              <Type className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96 p-0">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Remove punctuation</Label>
                </div>
                <Switch
                  checked={settings.removePunctuation}
                  onCheckedChange={(checked) => updateSetting("removePunctuation", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Split on punctuation</Label>
                </div>
                <Switch
                  checked={settings.splitOnPunctuation}
                  onCheckedChange={(checked) => updateSetting("splitOnPunctuation", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Text case</Label>
                </div>
                <div className="w-44">
                  <Select
                    value={settings.textCase}
                    onValueChange={(val) => updateSetting("textCase", val as "none" | "uppercase" | "lowercase" | "titlecase")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="none">Normal</SelectItem>
                      <SelectItem value="lowercase">Lowercase</SelectItem>
                      <SelectItem value="uppercase">Uppercase</SelectItem>
                      <SelectItem value="titlecase">Title Case</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Max chars per line</Label>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={String(settings.maxCharsPerLine)}
                  onChange={(e) => updateSetting("maxCharsPerLine", Number(e.target.value))}
                  className="w-24"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Max lines per subtitle</Label>
                </div>
                <Input
                  type="number"
                  min="1"
                  value={String(settings.maxLinesPerSubtitle)}
                  onChange={(e) => updateSetting("maxLinesPerSubtitle", Number(e.target.value))}
                  className="w-24"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowReformat(false)}>Cancel</Button>
                <Button onClick={handleApplyReformat} disabled={subtitles.length === 0 || settings.isStandaloneMode}>Apply</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <Button variant="ghost" size="icon" className="h-9 w-9" disabled title="More">
          <MoreVertical className="h-4 w-4" />
        </Button>
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
