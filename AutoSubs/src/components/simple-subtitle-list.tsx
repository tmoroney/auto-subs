import { Subtitle, SubtitleListProps } from '@/types/interfaces'; 

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export function SubtitleList({ subtitles }: SubtitleListProps) {
  return (
    <ScrollArea className="h-full w-full rounded-md border p-4">
      <h4 className="mb-4 text-m font-medium">Generated Subtitles</h4>
      {subtitles.map((subtitle: Subtitle, index: number) => (
        <div key={subtitle.start} className="mb-2">
          <span className="text-s">{subtitle.text}</span>
          {index < subtitles.length - 1 && <Separator className="my-2" />}
        </div>
      ))}
    </ScrollArea>
  )
}