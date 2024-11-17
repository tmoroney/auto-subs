import { Subtitle, SubtitleListProps } from '@/types/interfaces';

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useGlobal } from "@/GlobalContext"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from './ui/badge';

export function SubtitleList({ subtitles }: SubtitleListProps) {
  const { jumpToTime, processingStep } = useGlobal();
  return (
    <ScrollArea className="h-full w-full rounded-md border p-4">
      <Badge variant="destructive" className="absolute right-5 top-4">
        {(processingStep.includes("Transcribing") || processingStep.includes("Diarizing"))  ? "Preview" : `${subtitles.length} lines`}
      </Badge>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <h4 className="mb-3 text-m font-medium">
              Generated Subtitles
            </h4>
          </TooltipTrigger>
          <TooltipContent side="top">Click to jump to subtitle on timeline</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {subtitles.map((subtitle: Subtitle, index: number) => (
        <div key={index} className="mb-2">
          <span className="text-s cursor-pointer" onClick={() => jumpToTime(Number(subtitle.start))}>{subtitle.text}</span>
          {index < subtitles.length - 1 && <Separator className="my-2" />}
        </div>
      ))}
    </ScrollArea>
  )
}