import { HardDrive, MemoryStick, Lightbulb, Feather, ListFilter, X, Star, ArrowDown } from "lucide-react"
import { CircleCheckIcon } from "@/components/ui/icons/circle-check"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { useTranslation } from "react-i18next"
import { Model } from "@/types"
import { modelFilterOrders } from "@/lib/models"
import * as React from "react"
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

function FilterBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="text-xs px-2 py-0.5">
      <ArrowDown size={14} className="mr-1" />
      {children}
    </Badge>
  )
}

/**
 * Single trade-off spectrum between "lightweight" (low memory use) and
 * "accurate". Position is derived from accuracy vs. weight so that balanced
 * models (high accuracy AND low memory use, e.g. Parakeet) land in the middle.
 */
function BalanceMeter({ accuracy, weight }: { accuracy: number; weight: number }) {
  // accuracy: 1-4 (higher = more accurate)
  // weight:   1-4 (higher = more lightweight / less memory)
  // position: 0 (pure light) ... 6 (pure accurate)
  const position = Math.max(0, Math.min(6, 3 + (accuracy - weight)))
  const pct = (position / 6) * 100

  return (
    <div className="flex items-center gap-1.5 w-[110px]">
      <Feather size={11} className="text-sky-500 flex-shrink-0" aria-hidden />
      <div className="relative flex-1 h-1 rounded-full bg-gradient-to-r from-sky-500/30 via-muted to-amber-500/30">
        <div
          className="absolute top-1/2 h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground shadow-sm"
          style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>
      <Lightbulb size={11} className="text-amber-500 flex-shrink-0" aria-hidden />
    </div>
  )
}

type FilterType = 'weight' | 'accuracy' | 'recommended' | null

interface ModelPickerProps {
  modelsState: Model[]
  selectedModelIndex: number
  selectedLanguage: string
  onSelectModel: (modelIndex: number) => void
  downloadingModel: string | null
  downloadProgress: number
  open: boolean
  onOpenChange: (open: boolean) => void
  isSmallScreen: boolean
}

export function ModelPicker({
  modelsState,
  selectedModelIndex,
  selectedLanguage,
  onSelectModel,
  downloadingModel,
  downloadProgress,
  open,
  onOpenChange,
  isSmallScreen,
}: ModelPickerProps) {
  const { t } = useTranslation()
  const chevronsIconRef = React.useRef<ChevronsUpDownIconHandle>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [activeFilter, setActiveFilter] = React.useState<FilterType>('recommended')

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
    let models

    // When language is "auto", only show Whisper models and Parakeet
    if (selectedLanguage === "auto") {
      models = modelsState.filter((model) => {
        // Include Parakeet and all Whisper models (multilingual or restricted)
        return model.value === "parakeet" ||
          model.languageSupport.kind === "multilingual" ||
          model.languageSupport.kind === "restricted"
      })
    } else {
      // For specific languages, use existing language support logic
      models = modelsState.filter((model) => modelSupportsLanguage(model, selectedLanguage))
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      models = models.filter(model =>
        t(model.label).toLowerCase().includes(query) ||
        t(model.description).toLowerCase().includes(query) ||
        t(model.badge).toLowerCase().includes(query)
      )
    }

    // Apply sorting/filtering using predefined orders
    if (activeFilter && modelFilterOrders[activeFilter]) {
      const order = modelFilterOrders[activeFilter]

      models.sort((a, b) => {
        const aIndex = order.indexOf(a.value)
        const bIndex = order.indexOf(b.value)
        // If model not found in order array, put it at the end
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1

        return aIndex - bIndex
      })
    }

    return models
  }, [modelsState, modelSupportsLanguage, selectedLanguage, searchQuery, activeFilter, t])

  return (
    <TooltipProvider delayDuration={400}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="default"
            role="combobox"
            className="p-2"
            aria-expanded={open}
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
        <PopoverContent className="w-96 p-0 overflow-hidden" align="start">
          <div className="relative">
            <Command className="max-h-[350px]">
              <div className="relative">
                <CommandInput
                  placeholder={t("models.searchPlaceholder")}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  className="flex-1 border-0 focus:ring-0 pr-10"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 absolute right-1 top-1"
                    >
                      <ListFilter size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48" align="end">
                    <DropdownMenuItem
                      onClick={() => setActiveFilter(activeFilter === 'weight' ? null : 'weight')}
                      className={`text-xs cursor-pointer ${activeFilter === 'weight' ? 'bg-accent' : ''}`}
                    >
                      <Feather size={12} className="mr-1 text-sky-500" />
                      {t("models.filters.weight")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setActiveFilter(activeFilter === 'accuracy' ? null : 'accuracy')}
                      className={`text-xs cursor-pointer ${activeFilter === 'accuracy' ? 'bg-accent' : ''}`}
                    >
                      <Lightbulb size={12} className="mr-1 text-amber-500" />
                      {t("models.filters.accuracy")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setActiveFilter(activeFilter === 'recommended' ? null : 'recommended')}
                      className={`text-xs cursor-pointer ${activeFilter === 'recommended' ? 'bg-accent' : ''}`}
                    >
                      <Star size={12} className="mr-1 text-purple-500" />
                      {t("models.filters.recommended")}
                    </DropdownMenuItem>
                    {activeFilter && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setActiveFilter(null)}
                          className="text-xs cursor-pointer text-muted-foreground"
                        >
                          <X size={12} className="mr-1" />
                          {t("models.filters.clear")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CommandList>
                <CommandEmpty>{t("models.noResults")}</CommandEmpty>
                {(() => {
                  const isSpecific = selectedLanguage !== "auto"
                  const specializedModels = isSpecific
                    ? filteredModels.filter(m =>
                        (m.languageSupport.kind === "single_language" && m.languageSupport.language === selectedLanguage) ||
                        (m.languageSupport.kind === "restricted" && m.languageSupport.languages.includes(selectedLanguage))
                      )
                    : []
                  const otherModels = isSpecific
                    ? filteredModels.filter(m =>
                        !(m.languageSupport.kind === "single_language" && m.languageSupport.language === selectedLanguage) &&
                        !(m.languageSupport.kind === "restricted" && m.languageSupport.languages.includes(selectedLanguage))
                      )
                    : filteredModels

                  const renderItem = (model: Model) => {
                    const actualModelIndex = modelsState.findIndex(m => m.value === model.value)
                    return (
                      <CommandItem
                        key={model.value}
                        value={`${model.value} ${t(model.label)} ${t(model.description)}`}
                        onSelect={() => {
                          onSelectModel(actualModelIndex)
                          onOpenChange(false)
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
                        <div className="flex items-center mx-1 flex-shrink-0 gap-2">
                          {downloadingModel === model.value ? (
                            <div className="flex items-center gap-2">
                              <Progress value={downloadProgress} className="h-1 w-12" />
                              <span className="text-xs text-blue-600 dark:text-blue-400">{t("modelStatus.downloadProgress", { progress: downloadProgress })}</span>
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <BalanceMeter accuracy={model.accuracy} weight={model.weight} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side={isSmallScreen ? "bottom" : "right"} sideOffset={10} className="max-w-64 p-4 bg-slate-50 dark:bg-slate-950 text-foreground">
                                <div className="space-y-2.5">
                                  <p className="text-xs">{t(model.details)}</p>
                                  <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1">
                                      <MemoryStick size={14} />
                                      <span>{t("modelStatus.ram")}</span>
                                      <span className="font-medium">{model.ram}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <HardDrive size={14} />
                                      <span>{t("modelStatus.storage")}</span>
                                      <span className="font-medium">{model.size}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <Feather size={12} className="text-sky-500" />
                                      <span>{t("modelStatus.lightweight")}</span>
                                      <span className="font-medium">{model.weight}/4</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Lightbulb size={12} className="text-amber-500" />
                                      <span>{t("modelStatus.accuracy")}</span>
                                      <span className="font-medium">{model.accuracy}/4</span>
                                    </div>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </CommandItem>
                    )
                  }

                  return (
                    <>
                      {specializedModels.length > 0 && (
                        <CommandGroup heading={t("models.groups.specialized")}>
                          {specializedModels.map(renderItem)}
                        </CommandGroup>
                      )}
                      <CommandGroup heading={specializedModels.length > 0 ? t("models.groups.general") : undefined}>
                        {otherModels.map(renderItem)}
                      </CommandGroup>
                    </>
                  )
                })()}
              </CommandList>
            </Command>

            {/* Bottom Section */}
            <div className="border-t bg-muted/30">
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {t("models.filteredByLanguage")}
                  </Label>
                  {(activeFilter || searchQuery) && (
                    <div className="flex items-center">
                      {activeFilter && (
                        <FilterBadge>
                          {t(`models.filters.${activeFilter}`)}
                        </FilterBadge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}
