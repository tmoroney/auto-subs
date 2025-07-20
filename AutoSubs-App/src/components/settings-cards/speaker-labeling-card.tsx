import * as React from "react"
import { Speech, Info } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface SpeakerLabelingCardProps {
  diarize: boolean
  numSpeakers: string
  onDiarizeChange: (checked: boolean) => void
  onNumSpeakersChange: (value: string) => void
  walkthroughMode?: boolean
}

export const SpeakerLabelingCard = ({
  diarize,
  numSpeakers,
  onDiarizeChange,
  onNumSpeakersChange,
  walkthroughMode = false
}: SpeakerLabelingCardProps) => {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Speech className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium">Speaker Labeling</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      tabIndex={0}
                      className="rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-400 inline-flex items-center justify-center h-4 w-4 text-slate-700 dark:text-slate-300"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="w-56 p-3">
                    <p className="text-xs text-left">
                      Analyses voice patterns to identify and label different speakers in your audio. May slightly increase processing time.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">
                Unique captions for each speaker.
              </p>
            </div>
          </div>
          <Switch checked={diarize} onCheckedChange={onDiarizeChange} />
        </div>
        {diarize && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label className="text-sm font-normal">Auto-detect Speakers</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      tabIndex={0}
                      className="rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 dark:text-slate-300"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" className="w-[220px] p-3">
                    <p className="text-xs text-left text-slate-700 dark:text-slate-200">
                      May hallucinate non-existent speakers, so specifying the exact number of speakers can give better results.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={parseInt(numSpeakers) === 0}
                onCheckedChange={(checked) => onNumSpeakersChange(checked ? "0" : "2")}
              />
            </div>
            {parseInt(numSpeakers) > 0 && (
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-normal">No. of Speakers</Label>
                </div>
                <Input
                  type="number"
                  min="1"
                  value={numSpeakers}
                  onChange={(e) => onNumSpeakersChange(e.target.value)}
                  className="w-20"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
