import * as React from "react"
import { AudioLines, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Track } from "@/types/interfaces"

interface AudioInputCardProps {
  selectedTracks: string[]
  onTracksChange: (tracks: string[]) => void
  walkthroughMode?: boolean
  inputTracks?: Track[]
}

export const AudioInputCard = ({ selectedTracks, onTracksChange, walkthroughMode = false, inputTracks = [] }: AudioInputCardProps) => {
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
            {inputTracks.length > 0 ? (
              <>
                {/* Header with Select All/Clear All */}
                <div className="flex items-center justify-between px-2 py-2 bg-gradient-to-br from-red-50/80 to-orange-50/80 dark:from-red-950/50 dark:to-orange-950/50 rounded-lg border">
                  <span className="text-sm text-muted-foreground">
                    {selectedTracks.length > 0
                      ? (selectedTracks.length === 1
                        ? `${inputTracks.find(track => track.value === selectedTracks[0])?.label || `Track ${selectedTracks[0]}`} selected`
                        : `${selectedTracks.length} tracks selected`)
                      : 'No tracks selected'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                    onClick={() => {
                      if (selectedTracks.length === inputTracks.length) {
                        onTracksChange([]);
                      } else {
                        onTracksChange(inputTracks.map(track => track.value));
                      }
                    }}
                  >
                    {selectedTracks.length === inputTracks.length ? "Clear All" : "Select All"}
                  </Button>
                </div>
                
                {/* Scrollable Track List */}
                <ScrollArea className="h-[200px] w-full">
                  <div className="flex flex-col gap-2 pr-3">
                    {inputTracks.map((track) => {
                    const trackId = track.value;
                    const isChecked = selectedTracks.includes(trackId);
                    return (
                      <div
                        key={trackId}
                        className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200 w-full cursor-pointer select-none
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
                          {track.label}
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
                      </div>
                    );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center p-6 bg-red-50/30 dark:bg-red-900/10 rounded-lg border border-red-200/50 dark:border-red-800/30">
                <p className="text-sm text-center text-muted-foreground">
                  No Audio Tracks in this timeline. Create an audio track to start transcribing.
                </p>
              </div>
            )}
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
              {inputTracks.length > 0 ? (
                <div className="px-4 py-3 bg-gradient-to-br from-red-50/80 to-orange-50/80 dark:from-red-950/50 dark:to-orange-950/50 border-b">
                  <div className="flex items-center justify-between min-h-[28px]">
                    <span className="text-sm text-muted-foreground">
                      {selectedTracks.length > 0
                        ? (selectedTracks.length === 1
                          ? `${inputTracks.find(track => track.value === selectedTracks[0])?.label || `Track ${selectedTracks[0]}`} selected`
                          : `${selectedTracks.length} tracks selected`)
                        : 'No tracks selected'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 hover:bg-white/80 dark:hover:bg-zinc-800/80"
                      onClick={() => {
                        if (selectedTracks.length === inputTracks.length) {
                          onTracksChange([]);
                        } else {
                          onTracksChange(inputTracks.map(track => track.value));
                        }
                      }}
                    >
                      {selectedTracks.length === inputTracks.length ? "Clear All" : "Select All"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 bg-red-50/30 dark:bg-red-900/10 border-b">
                  <p className="text-sm text-center text-muted-foreground">
                    No audio tracks found.
                  </p>
                </div>
              )}
              {inputTracks.length > 0 ? (
                <ScrollArea className="h-[200px] w-full">
                  <div className="flex flex-col gap-1 p-2">
                    {inputTracks.map((track) => {
                      const trackId = track.value;
                      const isChecked = selectedTracks.includes(trackId);
                    return (
                      <div
                        key={trackId}
                        className={`group relative flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-200 w-full cursor-pointer select-none
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
                          {track.label}
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
                      </div>
                    );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="p-6 flex items-center justify-center">
                  <p className="text-sm text-center text-muted-foreground">
                    Create an audio track in your current timeline to start transcribing.
                  </p>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </Card>
  )
}
