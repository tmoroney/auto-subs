import * as React from "react"
import { AudioLines, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

interface AudioInputCardProps {
  selectedTracks: string[]
  onTracksChange: (tracks: string[]) => void
  walkthroughMode?: boolean
}

export const AudioInputCard = ({ selectedTracks, onTracksChange, walkthroughMode = false }: AudioInputCardProps) => {
  const [openTrackSelector, setOpenTrackSelector] = React.useState(false)

  return (
    <Card className="p-3.5 shadow-none">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
            <AudioLines className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-medium">Audio Input</p>
            <p className="text-xs text-muted-foreground">Select tracks to be transcribed</p>
          </div>
        </div>
        {walkthroughMode ? (
          <div className="space-y-3">
            {/* Header with Select All/Clear All */}
            <div className="flex items-center justify-between px-2 py-2 bg-gradient-to-br from-red-50/80 to-orange-50/80 dark:from-red-950/50 dark:to-orange-950/50 rounded-lg border">
              <span className="text-sm text-muted-foreground">
                {selectedTracks.length > 0
                  ? (selectedTracks.length === 1
                    ? `Track ${selectedTracks[0]} selected`
                    : `${selectedTracks.length} tracks selected`)
                  : 'No tracks selected'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                onClick={() => {
                  if (selectedTracks.length === 8) {
                    onTracksChange([]);
                  } else {
                    onTracksChange(['1', '2', '3', '4', '5', '6', '7', '8']);
                  }
                }}
              >
                {selectedTracks.length === 8 ? "Clear All" : "Select All"}
              </Button>
            </div>
            
            {/* Scrollable Track List */}
            <ScrollArea className="h-[200px] w-full">
              <div className="flex flex-col gap-2 pr-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((trackNum) => {
                  const trackId = trackNum.toString();
                  const isChecked = selectedTracks.includes(trackId);
                  return (
                    <button
                      type="button"
                      key={trackId}
                      tabIndex={0}
                      className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200  w-full
                        ${isChecked
                          ? 'bg-gradient-to-br from-red-50 to-orange-50/70 dark:from-red-900/40 dark:to-orange-900/40 border-red-200 dark:border-red-800'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800'}`}
                      onClick={() => {
                        if (isChecked) {
                          onTracksChange(selectedTracks.filter(id => id !== trackId));
                        } else {
                          onTracksChange([...selectedTracks, trackId]);
                        }
                      }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                        ${isChecked
                          ? 'bg-red-100 dark:bg-red-900/50'
                          : 'bg-zinc-100 dark:bg-zinc-800'}`}
                      >
                        <AudioLines className={`h-4 w-4 ${isChecked ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <span className={`text-sm font-medium flex-1 text-left ${isChecked ? 'text-red-600 dark:text-red-400' : ''}`}>
                        Track {trackNum}
                      </span>
                      <Checkbox
                        id={`track-${trackId}`}
                        checked={isChecked}
                        tabIndex={-1}
                        className="transition-transform duration-150"
                        onCheckedChange={(checked) => {
                          if (checked) {
                            onTracksChange([...selectedTracks, trackId]);
                          } else {
                            onTracksChange(selectedTracks.filter(id => id !== trackId));
                          }
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <Popover open={openTrackSelector} onOpenChange={setOpenTrackSelector}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openTrackSelector}
                className="w-full justify-between"
              >
                {selectedTracks.length === 0
                  ? "Select tracks..."
                  : selectedTracks.length === 1
                    ? `Track ${selectedTracks[0]}`
                    : `${selectedTracks.length} tracks selected`
                }
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="min-w-[320px] p-0 overflow-hidden" align="start">
              <div className="px-4 py-3 bg-gradient-to-br from-red-50/80 to-orange-50/80 dark:from-red-950/50 dark:to-orange-950/50 border-b">
                <div className="flex items-center justify-between min-h-[28px]">
                  <span className="text-sm text-muted-foreground">
                    {selectedTracks.length > 0
                      ? (selectedTracks.length === 1
                        ? `Track ${selectedTracks[0]} selected`
                        : `${selectedTracks.length} tracks selected`)
                      : 'No tracks selected'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                    onClick={() => {
                      if (selectedTracks.length === 8) {
                        onTracksChange([]);
                      } else {
                        onTracksChange(['1', '2', '3', '4', '5', '6', '7', '8']);
                      }
                    }}
                  >
                    {selectedTracks.length === 8 ? "Clear All" : "Select All"}
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[280px] w-full">
                <div className="flex flex-col gap-1 p-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((trackNum) => {
                    const trackId = trackNum.toString();
                    const isChecked = selectedTracks.includes(trackId);
                    return (
                      <button
                        type="button"
                        key={trackId}
                        tabIndex={0}
                        className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200 w-full
                          ${isChecked
                            ? 'bg-red-50/50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800'}`}
                        onClick={() => {
                          if (isChecked) {
                            onTracksChange(selectedTracks.filter(id => id !== trackId));
                          } else {
                            onTracksChange([...selectedTracks, trackId]);
                          }
                        }}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                          ${isChecked
                            ? 'bg-red-100 dark:bg-red-900/50'
                            : 'bg-zinc-100 dark:bg-zinc-800'}`}
                        >
                          <AudioLines className={`h-4 w-4 ${isChecked ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                        </div>
                        <span className={`text-sm font-medium flex-1 text-left ${isChecked ? 'text-red-600 dark:text-red-400' : ''}`}>
                          Track {trackNum}
                        </span>
                        <Checkbox
                          id={`track-${trackId}`}
                          checked={isChecked}
                          tabIndex={-1}
                          className="transition-transform duration-150"
                          onCheckedChange={(checked) => {
                            if (checked) {
                              onTracksChange([...selectedTracks, trackId]);
                            } else {
                              onTracksChange(selectedTracks.filter(id => id !== trackId));
                            }
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </Card>
  )
}
