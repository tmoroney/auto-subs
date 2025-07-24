import * as React from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInput } from "@/components/ui/sidebar"
import { CaptionList, Caption } from "@/components/caption-list"
import { useGlobal } from "@/contexts/GlobalContext"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const { exportSubtitles, subtitles, updateCaption } = useGlobal()
  
  // Helper function to format time in HH:MM:SS
  const formatTime = React.useCallback((seconds: number | string): string => {
    const date = new Date(0);
    date.setSeconds(Number(seconds));
    return date.toISOString().substr(11, 8);
  }, []);
  
  // Convert GlobalContext subtitles to Caption format if needed
  const captions = React.useMemo(() => {
    if (!subtitles || subtitles.length === 0) return [];
    return subtitles.map((sub, index) => ({
      id: index,
      speaker: sub.speaker,
      timestamp: formatTime(sub.start),
      text: sub.text,
      color: `hsl(${(index * 137.5) % 360}, 70%, 60%)`
    }));
  }, [subtitles, formatTime])

  const handleExport = async () => {
    try {
      await exportSubtitles();
    } catch (error) {
      // Error is handled by the exportSubtitles function
    }
  }

  const handleEditCaption = async (captionOrId: Caption | number) => {
    const id = typeof captionOrId === 'number' ? captionOrId : captionOrId.id;
    const caption = typeof captionOrId === 'number' 
      ? captions.find(c => c.id === captionOrId)
      : captionOrId;
      
    console.log("Edit caption:", id, "Full caption:", caption);
    
    if (caption && typeof captionOrId !== 'number') {
      // Caption object was passed, so we can save the changes
      try {
        const updatedCaption = {
          id: caption.id,
          start: typeof caption.timestamp === 'string' ? parseFloat(caption.timestamp.split(':').reduce((acc, time) => (60 * acc) + +time, 0).toString()) : 0,
          end: typeof caption.timestamp === 'string' ? parseFloat(caption.timestamp.split(':').reduce((acc, time) => (60 * acc) + +time, 0).toString()) + 5 : 5, // Default 5 second duration
          text: caption.text,
          speaker: caption.speaker,
          words: (caption as any).words || []
        };
        
        // Use the global context to update the caption
        if (updateCaption) {
          await updateCaption(caption.id, updatedCaption);
          console.log("Caption successfully updated!");
        } else {
          console.error("updateCaption function not available");
        }
      } catch (error) {
        console.error("Failed to update caption:", error);
      }
    }
  }

  return (
    <Sidebar side="right" className="border-l" {...props}>
      <SidebarHeader className="gap-3.5 border-b p-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-base font-medium text-foreground">Captions</div>
          <Button
            onClick={handleExport}
            size="sm"
            variant="outline"
            className="h-8 gap-2 bg-transparent"
            disabled={!subtitles || subtitles.length === 0}
          >
            <Download className="h-4 w-4" />
            Export SRT
          </Button>
        </div>
        <SidebarInput
          placeholder="Search captions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </SidebarHeader>
      <SidebarContent>
          <SidebarGroupContent>
            <div className="h-full overflow-y-auto">
              <CaptionList 
                captions={captions}
                onEditCaption={handleEditCaption}
                itemClassName="hover:bg-sidebar-accent"
              />
            </div>
          </SidebarGroupContent>
      </SidebarContent>
    </Sidebar>
  )
}
