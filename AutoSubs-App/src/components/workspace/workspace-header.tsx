import { HardDrive, MemoryStick, Lightbulb, Feather } from "lucide-react"
import { CircleCheckIcon } from "@/components/ui/icons/circle-check"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs"
import { Label } from "@/components/ui/label"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { useTranslation } from "react-i18next"
import { Model } from "@/types/interfaces"
import * as React from "react"
import { UploadIcon, type UploadIconHandle } from "@/components/ui/icons/upload"
import { ChevronsUpDownIcon, type ChevronsUpDownIconHandle } from "@/components/ui/icons/chevrons-up-down"

function ModelCachedBadge({ isDownloaded }: { isDownloaded: boolean }) {
  const { t } = useTranslation()
  if (!isDownloaded) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <CircleCheckIcon className="text-green-600 dark:text-green-400" size={14} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("modelStatus.cached")}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function MetricIcons({ count, max, Icon, activeClass }: { count: number; max: number; Icon: React.ElementType; activeClass: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Icon
          key={i}
          size={11}
          className={i < count ? activeClass : "text-muted-foreground/25 dark:text-muted-foreground"}
        />
      ))}
    </div>
  )
}

export function WorkspaceHeader({
  modelsState,
  selectedModelIndex,
  selectedLanguage,
  onSelectModel,
  downloadingModel,
  downloadProgress,
  openModelSelector,
  onOpenModelSelectorChange,
  isSmallScreen,
  isStandaloneMode,
  onStandaloneModeChange,
}: {
  modelsState: Model[]
  selectedModelIndex: number
  selectedLanguage: string
  onSelectModel: (modelIndex: number) => void
  downloadingModel: string | null
  downloadProgress: number
  openModelSelector: boolean
  onOpenModelSelectorChange: (open: boolean) => void
  isSmallScreen: boolean
  isStandaloneMode: boolean
  onStandaloneModeChange: (standalone: boolean) => void
}) {
  const { t } = useTranslation()
  const uploadIconRef = React.useRef<UploadIconHandle>(null)
  const chevronsIconRef = React.useRef<ChevronsUpDownIconHandle>(null)

  const modelSupportsLanguage = React.useCallback((model: Model, lang: string) => {
    if (lang === "auto") return true

    switch (model.languageSupport.kind) {
      case "multilingual":
        return true
      case "single_language":
        return model.languageSupport.language === lang
      case "restricted":
        return model.languageSupport.languages.includes(lang)
      default:
        return true
    }
  }, [])

  const filteredModels = React.useMemo(() => {
    return modelsState.filter((model) => modelSupportsLanguage(model, selectedLanguage))
  }, [modelsState, modelSupportsLanguage, selectedLanguage])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 pb-3 bg-transparent">
        {/* Left side: Model Management */}
        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <Popover open={openModelSelector} onOpenChange={onOpenModelSelectorChange}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="default"
                role="combobox"
                className="p-2"
                aria-expanded={openModelSelector}
                onMouseEnter={() => {
                  chevronsIconRef.current?.startAnimation()
                }}
                onMouseLeave={() => {
                  chevronsIconRef.current?.stopAnimation()
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img
                    src={modelsState[selectedModelIndex].image}
                    alt={t(modelsState[selectedModelIndex].label) + " icon"}
                    className="w-6 h-6 object-contain rounded"
                  />
                  <div className="flex items-center">
                    <span className="truncate">{t(modelsState[selectedModelIndex].label)}</span>
                  </div>
                  <ChevronsUpDownIcon ref={chevronsIconRef} />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 overflow-hidden" align="start">
              <Command className="max-h-[350px]">
                <CommandInput placeholder="Search models..." />
                <CommandList>
                  <CommandEmpty>{t("models.noResults")}</CommandEmpty>
                  <CommandGroup>
                    {filteredModels.map((model) => {
                      const actualModelIndex = modelsState.findIndex(m => m.value === model.value)

                      return (
                        <CommandItem
                          key={model.value}
                          value={`${model.value} ${t(model.label)} ${t(model.description)}`}
                          onSelect={() => {
                            onSelectModel(actualModelIndex)
                            onOpenModelSelectorChange(false)
                          }}
                          className="flex items-center justify-between p-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <img src={model.image} alt={t(model.label) + " icon"} className="w-8 h-8 object-contain rounded flex-shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-xs">{t(model.label)}</span>
                                <ModelCachedBadge isDownloaded={model.isDownloaded} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t(model.badge)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center ml-2 flex-shrink-0 gap-2">
                            {downloadingModel === model.value ? (
                              <div className="flex items-center gap-2">
                                <Progress value={downloadProgress} className="h-1 w-12" />
                                <span className="text-xs text-blue-600 dark:text-blue-400">{downloadProgress}%</span>
                              </div>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5">
                                    <MetricIcons count={model.accuracy} max={3} Icon={Lightbulb} activeClass="text-amber-500" />
                                    <MetricIcons count={model.weight} max={3} Icon={Feather} activeClass="text-sky-500" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side={isSmallScreen ? "bottom" : "right"} sideOffset={10} className="max-w-64 p-4 bg-slate-50 dark:bg-slate-950 text-foreground">
                                  <div className="space-y-2.5">
                                    <p className="text-xs">{t(model.details)}</p>
                                    <div className="flex items-center gap-4 text-xs">
                                      <div className="flex items-center gap-1">
                                        <HardDrive size={14} />
                                        <span>{t("modelStatus.storage")}</span>
                                        <span className="font-medium">{model.size}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <MemoryStick size={14} />
                                        <span>{t("modelStatus.ram")}</span>
                                        <span className="font-medium">{model.ram}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                      <div className="flex items-center gap-1.5">
                                        <MetricIcons count={model.accuracy} max={3} Icon={Lightbulb} activeClass="text-amber-500" />
                                        <span>Accuracy</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <MetricIcons count={model.weight} max={3} Icon={Feather} activeClass="text-sky-500" />
                                        <span>Lightweight</span>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>

              {/* Bottom Section */}
              <div className="border-t bg-muted/30">
                <div className="px-4 pt-1 pb-2">
                  <Label className="text-xs text-muted-foreground">
                    Models filtered by selected language
                  </Label>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Right side: File/Timeline Mode Tabs */}
        <Tabs
          value={isStandaloneMode ? "file" : "timeline"}
          onValueChange={(value) => onStandaloneModeChange(value === "file")}
        >
          <TabsList className="p-1 h-auto">
            <TabsTrigger
              value="file"
              className="text-sm"
              onMouseEnter={() => uploadIconRef.current?.startAnimation()}
              onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
            >
              <UploadIcon ref={uploadIconRef} size={14} />
              {t("actionBar.mode.fileInput")}
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="text-sm px-4"
            >
              <img
                src="/davinci-resolve-logo.png"
                alt="DaVinci Resolve logo"
                className="w-5 h-5"
              />
              {t("actionBar.mode.timeline")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
