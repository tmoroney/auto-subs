import * as React from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CaptionList, Caption } from "@/components/caption-list"
import { useGlobal } from "@/contexts/GlobalContext"

export function DesktopCaptionViewer() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const { subtitles } = useGlobal()

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
      speaker: sub.speaker,
      timestamp: formatTime(sub.start),
      text: sub.text,
      color: `hsl(${(index * 137.5) % 360}, 70%, 60%)`,
      // Include words array if it exists in the subtitle
      words: sub.words || []
    }));
  }, [subtitles])

  // Filter captions based on search query
  const filteredCaptions = React.useMemo(() => {
    if (!searchQuery.trim()) return captions;
    const query = searchQuery.toLowerCase();
    return captions.filter(caption => 
      caption.text.toLowerCase().includes(query) || 
      (caption.speaker && caption.speaker.toLowerCase().includes(query))
    );
  }, [captions, searchQuery])

  const handleEditCaption = (captionOrId: Caption | number) => {
    const id = typeof captionOrId === 'number' ? captionOrId : captionOrId.id;
    const caption = typeof captionOrId === 'number' 
      ? captions.find(c => c.id === captionOrId)
      : captionOrId;
      
    console.log(`Edit caption with id: ${id}`, "Full caption:", caption);
    // Add edit functionality here using the full caption if available
  }

  // Export functionality moved to App.tsx header

  return (
    <div className="flex flex-col h-full border-l">

      {/* Search */}
      <div className="p-3 border-b shrink-0 sticky top-0 z-10">
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
            captions={filteredCaptions}
            onEditCaption={handleEditCaption}
            itemClassName="hover:bg-sidebar-accent p-3 transition-colors"
            showEditOnHover={false}
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
