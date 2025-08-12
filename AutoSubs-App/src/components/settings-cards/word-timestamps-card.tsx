import { Zap } from "lucide-react"
import { Switch } from "@/components/ui/switch"

interface WordTimestampsCardProps {
  enableDTW: boolean
  onEnableDTWChange: (checked: boolean) => void
}

export const WordTimestampsCard = ({
  enableDTW,
  onEnableDTWChange,
}: WordTimestampsCardProps) => {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium">Dynamic Time Warping</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Improves subtitle word alignment.
              </p>
            </div>
          </div>
          <Switch checked={enableDTW} onCheckedChange={onEnableDTWChange} />
        </div>
      </div>
    </div>
  )
}
