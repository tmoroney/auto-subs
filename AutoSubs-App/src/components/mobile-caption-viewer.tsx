import * as React from "react"
import { X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CaptionList } from "@/components/caption-list"
import { captionData, filterCaptions, exportCaptions } from "@/data/captions"

interface MobileCaptionViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileCaptionViewer({ isOpen, onClose }: MobileCaptionViewerProps) {
  const [captions] = React.useState(captionData)
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredCaptions = React.useMemo(
    () => filterCaptions(captions, searchQuery),
    [captions, searchQuery]
  )

  const handleEditCaption = (id: number) => {
    console.log("Edit caption:", id)
    // Add edit functionality here
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Captions</h2>
          <Button 
            onClick={() => exportCaptions(captions)} 
            size="sm" 
            variant="outline" 
            className="h-8 gap-2 bg-transparent"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
        <Button onClick={onClose} variant="ghost" size="icon">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b shrink-0">
        <Input 
          placeholder="Search captions..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <CaptionList 
          captions={filteredCaptions}
          onEditCaption={handleEditCaption}
          itemClassName="hover:bg-muted/50"
        />
      </div>
    </div>
  )
}
