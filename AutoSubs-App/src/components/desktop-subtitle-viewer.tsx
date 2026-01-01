import * as React from "react"
import { Layers2, Users, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SubtitleList } from "@/components/subtitle-list"
import { useGlobal } from "@/contexts/GlobalContext"
import { ImportExportPopover } from "@/components/import-export-popover"
import { SpeakerEditor } from "@/components/speaker-editor"
import { ReplaceStringsPanel } from "@/components/replace-strings-dialog"

export function DesktopSubtitleViewer() {
  const { subtitles, exportSubtitlesAs, importSubtitles, pushToTimeline, settings, updateSubtitles } = useGlobal()
  const [showSpeakerEditor, setShowSpeakerEditor] = React.useState(false)
  const [isPushing, setIsPushing] = React.useState(false)
  const [highlightText, setHighlightText] = React.useState("")
  const [highlightedSubtitleIndex, setHighlightedSubtitleIndex] = React.useState<number | undefined>(undefined)
  const [matchCase, setMatchCase] = React.useState(false)

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

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-0 pb-2">
        {subtitles.length > 0 ? (
          <SubtitleList
            itemClassName="hover:bg-sidebar-accent p-3 transition-colors"
            highlightText={highlightText}
            highlightedSubtitleIndex={highlightedSubtitleIndex}
            matchCase={matchCase}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-8">
            <p className="text-lg font-medium mb-2">No subtitles found</p>
            <p className="text-sm">
              No subtitles available. Try importing some first.
            </p>
          </div>
        )}
      </div>

      {/* Search/Replace Words Panel */}
      {subtitles.length > 0 && (
        <ReplaceStringsPanel
          subtitles={subtitles}
          onReplace={async (newSubtitles) => {
            await updateSubtitles(newSubtitles)
            setHighlightText("")
            setHighlightedSubtitleIndex(undefined)
          }}
          onNavigateToOccurrence={(subtitleIndex) => {
            setHighlightedSubtitleIndex(subtitleIndex)
          }}
          onHighlightChange={(text) => {
            setHighlightText(text)
          }}
          onMatchCaseChange={(matchCase) => {
            setMatchCase(matchCase)
          }}
        />
      )}

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
