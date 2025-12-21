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

interface MobileSubtitleViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileSubtitleViewer({ isOpen, onClose }: MobileSubtitleViewerProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { exportSubtitlesAs, importSubtitles, subtitles } = useTranscript()
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

  // Close on escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-sidebar flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-2 pl-3 border-b bg-sidebar shrink-0">
        <h1 className="text-xl font-medium">Subtitles</h1>
        <Button
          onClick={onClose}
          variant="outline"
          size="icon"
          className="h-8"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Search & Import/Export & Speakers */}
      <div className="p-2 border-b shrink-0 sticky top-0 bg-sidebar space-y-1.5">
        <div className="flex space-x-2 items-center">
          <ImportExportPopover
            onImport={() => importSubtitles(settings, null, '')}
            onExport={(format, includeSpeakers) => exportSubtitlesAs(format, includeSpeakers, subtitles, [])}
            hasSubtitles={subtitles.length > 0}
          />
          <Button variant="outline" className="w-full" onClick={() => setShowSpeakerEditor(true)}>
            <Users className="w-4 h-4 mr-2" />
            Edit Speakers
          </Button>
          <SpeakerEditor afterTranscription={false} open={showSpeakerEditor} onOpenChange={setShowSpeakerEditor} />
        </div>
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
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-0 pb-2 pt-2">
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
            variant="default"
            size="default"
            className="w-full bg-orange-600 hover:bg-orange-500 dark:bg-orange-500 dark:hover:bg-orange-600"
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
