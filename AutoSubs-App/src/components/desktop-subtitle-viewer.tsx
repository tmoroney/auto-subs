import * as React from "react"
import { Layers2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SubtitleList } from "@/components/subtitle-list"
import { useTranscript } from "@/contexts/TranscriptContext"
import { useResolve } from "@/contexts/ResolveContext"
import { useSettings } from "@/contexts/SettingsContext"
import { ImportExportPopover } from "@/components/import-export-popover"
import { SpeakerEditor } from "@/components/speaker-editor"
import { AddToTimelineDialog } from "@/components/add-to-timeline-dialog"

export function DesktopSubtitleViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles, exportSubtitlesAs, importSubtitles } = useTranscript()
  const { pushToTimeline, timelineInfo } = useResolve()
  const { settings } = useSettings()
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)

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
          Speakers
        </Button>
        <SpeakerEditor afterTranscription={false} open={showSpeakerEditor} onOpenChange={() => setShowSpeakerEditor(false)} />
      </div>

      {/* Search */}
      <div className="shrink-0 p-3 border-b">
        <div className="relative">
          <Input
            ref={searchInputRef}
            placeholder="Search subtitles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
            aria-label="Search subtitles"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>


      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-0 pb-2">
        {subtitles.length > 0 ? (
          <SubtitleList
            searchQuery={searchQuery}
            itemClassName="hover:bg-sidebar-accent p-3 transition-colors"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-8">
            <p className="text-lg font-medium mb-2">No subtitles found</p>
            <p className="text-sm">
              {searchQuery
                ? 'Try a different search term'
                : 'No subtitles available. Try importing some first.'}
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
              Add to Timeline
            </Button>
          </AddToTimelineDialog>
        </div>
      )}
    </div>
  )
}
