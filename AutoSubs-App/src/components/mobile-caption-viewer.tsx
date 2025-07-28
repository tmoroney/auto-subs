import * as React from "react"
import { Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CaptionList } from "@/components/caption-list"
import { useGlobal } from "@/contexts/GlobalContext"
import { Subtitle } from "@/types/interfaces"
import { ImportExportPopover } from "@/components/import-export-popover"
import { SpeakerEditor } from "@/components/speaker-editor"

interface MobileCaptionViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileCaptionViewer({ isOpen, onClose }: MobileCaptionViewerProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { exportSubtitles, importSubtitles, subtitles } = useGlobal()

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

  // Auto-focus search input when component mounts or becomes visible
  React.useEffect(() => {
    if (isOpen && searchInputRef.current) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen])



  const handleEditCaption = (captionOrId: Subtitle | number) => {
    const index = typeof captionOrId === 'number' ? captionOrId : subtitles.indexOf(captionOrId);
    const caption = typeof captionOrId === 'number'
      ? subtitles[captionOrId]
      : captionOrId;

    console.log(`Edit caption at index: ${index}`, "Full caption:", caption);
    // Add edit functionality here using the full caption if available
  }

  const handleExport = async () => {
    try {
      await exportSubtitles()
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
        <h1 className="text-lg font-medium">Captions</h1>
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

      {/* Search */}
      <div className="p-2 border-b shrink-0 sticky top-0 bg-sidebar space-y-1.5">
        <div className="flex space-x-2 items-center">
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
