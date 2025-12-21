import { HardDrive, MemoryStick, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ModelStatusIndicatorProps {
  model: {
    details: string
    size: string
    ram: string
  }
  isDownloaded: boolean
  isSmallScreen: boolean
}

export function ModelStatusIndicator({ model, isDownloaded, isSmallScreen }: ModelStatusIndicatorProps) {
  const statusBadge = isDownloaded ? (
    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Cached
    </span>
  ) : (
    <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      Available
    </span>
  )

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side={isSmallScreen ? "top" : "right"} className="max-w-64 p-4">
            <div className="space-y-2">
              <p className="text-xs">{model.details}</p>
              <div className="flex items-center gap-1 text-xs">
                  <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs">
                    <HardDrive className="h-3 w-3" />
                    <span>Storage:</span>
                    <span className="font-medium">{model.size}</span>
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full text-xs">
                    <MemoryStick className="h-3 w-3" />
                    <span>RAM:</span>
                    <span className="font-medium">{model.ram}</span>
                  </span>
                </div>
            </div>
          </TooltipContent>
        </Tooltip>
        {statusBadge}
      </div>
    </TooltipProvider>
  )
}
