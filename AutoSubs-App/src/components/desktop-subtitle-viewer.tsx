import * as React from "react"
import { Layers2, Users, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SubtitleList } from "@/components/subtitle-list"
import { useGlobal } from "@/contexts/GlobalContext"
import { ImportExportPopover } from "@/components/import-export-popover"
import { SpeakerEditor } from "@/components/speaker-editor"

export function DesktopSubtitleViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles, exportSubtitlesAs, importSubtitles, pushToTimeline, settings } = useGlobal()
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
  const [isPushing, setIsPushing] = React.useState(false)

  return (
    <div className="flex flex-col h-full border-l bg-sidebar">

      {/* Import/Export Popover & Edit Speakers */}
      <div className="shrink-0 p-3 pb-0 flex gap-2">
        <ImportExportPopover
          onImport={importSubtitles}
          onExport={exportSubtitlesAs}
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
          <Button
            variant="default"
            size="default"
            className="w-full bg-orange-600 hover:bg-orange-500 dark:bg-orange-500 dark:hover:bg-orange-600"
            disabled={isPushing}
            onClick={async () => {
              try {
                setIsPushing(true)
                await pushToTimeline()
              } finally {
                setIsPushing(false)
              }
            }}
          >
            {isPushing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Layers2 className="w-4 h-4 mr-2" />
                Add to Timeline
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
