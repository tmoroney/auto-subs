import { HardDrive, MemoryStick, Info, Check, Download } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()

  const statusIcon = isDownloaded ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("modelStatus.cached")}</p>
      </TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <Download className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("modelStatus.available")}</p>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {statusIcon}
        <Tooltip>
          <TooltipTrigger asChild className="m-2">
            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side={isSmallScreen ? "top" : "right"} className="max-w-64 p-4">
            <div className="space-y-2">
              <p className="text-xs">{t(model.details)}</p>
              <div className="flex items-center gap-1 text-xs">
                  <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs">
                    <HardDrive className="h-3 w-3" />
                    <span>{t("modelStatus.storage")}</span>
                    <span className="font-medium">{model.size}</span>
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full text-xs">
                    <MemoryStick className="h-3 w-3" />
                    <span>{t("modelStatus.ram")}</span>
                    <span className="font-medium">{model.ram}</span>
                  </span>
                </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
