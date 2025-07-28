import * as React from "react"
import { Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CaptionList } from "@/components/caption-list"
import { useGlobal } from "@/contexts/GlobalContext"
import { Subtitle } from "@/types/interfaces"
import { ImportExportPopover } from "@/components/import-export-popover"
import { SpeakerEditor } from "@/components/speaker-editor"

export function DesktopCaptionViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles, exportSubtitlesAs, importSubtitles } = useGlobal()

  // Helper function to format time in HH:MM:SS
  const formatTime = (seconds: number | string): string => {
    const date = new Date(0);
    date.setSeconds(Number(seconds));
    return date.toISOString().substr(11, 8);
  };

  // Convert GlobalContext subtitles to Caption format if needed
  const captions = React.useMemo(() => {
    if (!subtitles || subtitles.length === 0) return [];
    return subtitles.map((sub, index) => ({
      id: index,
      speaker_id: sub.speaker_id,
      timestamp: formatTime(sub.start),
      text: sub.text,
      color: `hsl(${(index * 137.5) % 360}, 70%, 60%)`,
      // Include words array if it exists in the subtitle
      words: sub.words || []
    }));
  }, [subtitles])

  // Filter captions based on search query
  const filteredCaptions = React.useMemo(() => {
    if (!searchQuery.trim()) return subtitles;
    const query = searchQuery.toLowerCase();
    return subtitles.filter(caption =>
      caption.text.toLowerCase().includes(query) ||
      (caption.speaker_id && caption.speaker_id.toLowerCase().includes(query))
    );
  }, [subtitles, searchQuery])

  const handleEditCaption = (captionOrId: Subtitle | number) => {
    const index = typeof captionOrId === 'number' ? captionOrId : subtitles.indexOf(captionOrId);
    const caption = typeof captionOrId === 'number'
      ? subtitles[captionOrId]
      : captionOrId;

    console.log(`Edit caption at index: ${index}`, "Full caption:", caption);
    // Add edit functionality here using the full caption if available
  }

  const handleExport = async (format: 'srt' | 'json' = 'srt') => {
    try {
      await exportSubtitlesAs(format)
    } catch (error) {
      console.error("Failed to export subtitles:", error)
    }
  }

  const handleImport = async () => {
    try {
      await importSubtitles()
    } catch (error) {
      console.error("Failed to import subtitles:", error)
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-sidebar">

      {/* Import/Export Popover & Edit Speakers */}
      <div className="shrink-0 p-3 pb-0 flex gap-2">
        <ImportExportPopover
          onImport={handleImport}
          onExport={handleExport}
          hasCaptions={captions.length > 0}
        />
        <SpeakerEditor afterTranscription={false}>
          <Button variant="outline" className="w-full">
            <Users className="w-4 h-4 mr-2" />
            Edit Speakers
          </Button>
        </SpeakerEditor>
      </div>

      {/* Search */}
      <div className="shrink-0 p-3 border-b">
        <div className="relative">
          <Input
            ref={searchInputRef}
            placeholder="Search captions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
            aria-label="Search captions"
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
        {filteredCaptions.length > 0 ? (
          <CaptionList
            onEditCaption={handleEditCaption}
            itemClassName="hover:bg-sidebar-accent p-3 transition-colors"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-8">
            <p className="text-lg font-medium mb-2">No captions found</p>
            <p className="text-sm">
              {searchQuery
                ? 'Try a different search term'
                : 'No captions available. Try importing some first.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
