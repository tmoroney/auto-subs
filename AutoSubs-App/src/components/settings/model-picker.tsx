import { HardDrive, MemoryStick, Lightbulb, Feather } from "lucide-react"
import { CircleCheckIcon } from "@/components/ui/icons/circle-check"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { useTranslation } from "react-i18next"
import { Model } from "@/types"
import { sortedModelsForLanguage, type ModelSort } from "@/lib/models"
import { cn } from "@/lib/utils"
import * as React from "react"
import { ChevronsUpDownIcon, type ChevronsUpDownIconHandle } from "@/components/ui/icons/chevrons-up-down"

/** Tick-only cached marker; the label lives in the tooltip to keep the row quiet. */
function ModelCachedBadge({ isDownloaded }: { isDownloaded: boolean }) {
  const { t } = useTranslation()
  if (!isDownloaded) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <CircleCheckIcon className="text-green-600 dark:text-green-400" size={13} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("modelStatus.cached")}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Tags sit inline with the model name, so they are sized to the 12px name text
 * rather than the Badge default (text-xs + py-0.5), which is 20px tall and
 * stretches the row.
 */
const TAG_CLASS = "h-[15px] rounded px-1 py-0 text-[10px] font-medium leading-none"

/**
 * One rating on a 1-5 scale, drawn as filled segments. Two of these stacked
 * (accuracy and speed) replace the old single "balance" meter: that one
 * collapsed both into a derived position, which couldn't answer either of the
 * questions users actually have — is this model good, and will it be slow.
 */
function RatingMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 h-[12px]">
      <span className="text-[11px] leading-none text-muted-foreground w-[50px]">{label}</span>
      <span className="flex gap-[2px]" role="img" aria-label={`${label} ${value}/5`}>
        {[1, 2, 3, 4, 5].map((segment) => {
          // Ratings move in half steps, so a segment can be partly filled.
          const fill = Math.max(0, Math.min(1, value - (segment - 1)))
          return (
            <span key={segment} className="h-[5px] w-[9px] rounded-[1px] bg-muted-foreground/25 overflow-hidden">
              {fill > 0 && <span className="block h-full bg-primary" style={{ width: `${fill * 100}%` }} />}
            </span>
          )
        })}
      </span>
    </div>
  )
}

/** Human-readable RAM figure. Values are whole MB from the manifest. */
function formatRam(ramMb: number): string {
  return ramMb >= 1024 ? `${Math.round((ramMb / 1024) * 10) / 10}GB` : `${ramMb}MB`
}

const SORTS: ModelSort[] = ["recommended", "accuracy", "speed"]

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
  triggerClassName?: string
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
  triggerClassName,
}: ModelPickerProps) {
  const { t } = useTranslation()
  const chevronsIconRef = React.useRef<ChevronsUpDownIconHandle>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [activeSort, setActiveSort] = React.useState<ModelSort>('recommended')

  // Ordering is derived from the manifest (accuracy, then proven-for-language,
  // then speed, then footprint), so nothing here needs to know about specific
  // models. Search narrows the result; it never reorders it.
  const filteredModels = React.useMemo(() => {
    const ordered = sortedModelsForLanguage(selectedLanguage, activeSort, modelsState)

    const query = searchQuery.trim().toLowerCase()
    if (!query) return ordered

    return ordered.filter(model =>
      t(model.label).toLowerCase().includes(query) ||
      t(model.description).toLowerCase().includes(query) ||
      t(model.badge).toLowerCase().includes(query)
    )
  }, [modelsState, selectedLanguage, searchQuery, activeSort, t])

  return (
    <TooltipProvider delayDuration={400}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="lg"
            aria-haspopup="listbox"
            className={cn(
              "p-3 bg-muted/30 dark:bg-muted select-none w-full justify-start",
              triggerClassName,
            )}
            aria-expanded={open}
            data-tour="model-picker"
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
                className="size-6 object-contain rounded"
              />
              <div className="flex items-center gap-1">
                <span className="truncate">{t(modelsState[selectedModelIndex].label)}</span>
              </div>
            </div>
            <ChevronsUpDownIcon ref={chevronsIconRef} className="ml-auto" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0 overflow-hidden" align="center">
          <div className="relative">
            <Command className="max-h-[350px]">
              <CommandInput
                placeholder={t("models.searchPlaceholder")}
                value={searchQuery}
                onValueChange={setSearchQuery}
                className="flex-1 border-0 focus:ring-0"
              />
              {/* The sort changes the whole list order, so it stays visible
                  rather than hiding behind an icon. */}
              <div className="flex gap-1 px-2 py-1.5 border-b">
                {SORTS.map((sort) => (
                  <Button
                    key={sort}
                    variant="ghost"
                    size="sm"
                    aria-pressed={activeSort === sort}
                    onClick={() => setActiveSort(sort)}
                    className={cn(
                      "h-6 px-2.5 text-[11px] font-normal rounded-md",
                      activeSort === sort && "bg-accent text-accent-foreground",
                    )}
                  >
                    {t(`models.filters.${sort}`)}
                  </Button>
                ))}
              </div>
              <CommandList>
                <CommandEmpty>{t("models.noResults")}</CommandEmpty>
                {(() => {
                  const renderItem = (model: Model, index: number) => {
                    const actualModelIndex = modelsState.findIndex(m => m.value === model.value)
                    return (
                      <CommandItem
                        key={model.value}
                        value={`${model.value} ${t(model.label)} ${t(model.description)}`}
                        onSelect={() => {
                          onSelectModel(actualModelIndex)
                          onOpenChange(false)
                        }}
                        className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <img src={model.image} alt={t(model.label) + " icon"} className="size-8 object-contain rounded flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 leading-none">
                              <span className="font-medium text-xs leading-none">{t(model.label)}</span>
                              {/* The top row earns a badge: the sort that put it
                                  there is otherwise invisible. */}
                              {index === 0 && activeSort === 'recommended' && !searchQuery && (
                                <Badge className={cn(TAG_CLASS, "border-transparent shadow-none")}>
                                  {t("models.bestPick")}
                                </Badge>
                              )}
                              {model.languageSupport.kind === "single_language" && (
                                <Badge variant="outline" className={cn(TAG_CLASS, "font-normal text-muted-foreground")}>
                                  {t(model.badge)}
                                </Badge>
                              )}
                              <ModelCachedBadge isDownloaded={model.isDownloaded} />
                            </div>
                            {/* Facts about the user's machine, as plain text.
                                "download" rather than "storage" so it can't be
                                misread as memory. RAM leads so its value sits at
                                the same x on every row; the download size is
                                appended only while it still matters. */}
                            <p className="text-[11px] text-muted-foreground mt-[3px] leading-none truncate">
                              {t("modelStatus.ramShort", { size: formatRam(model.ramMb) })}
                              {!model.isDownloaded && ` · ${t("modelStatus.downloadShort", { size: model.size })}`}
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
                                <div className="flex flex-col gap-1">
                                  <RatingMeter label={t("modelStatus.accuracy")} value={model.accuracy} />
                                  <RatingMeter label={t("modelStatus.speed")} value={model.speed} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side={isSmallScreen ? "bottom" : "right"} sideOffset={10} className="max-w-64 p-4 bg-slate-50 dark:bg-slate-950 text-foreground">
                                <div className="space-y-2.5">
                                  <p className="text-xs">{t(model.details)}</p>
                                  <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1">
                                      <MemoryStick size={14} />
                                      <span>{t("modelStatus.ram")}</span>
                                      <span className="font-medium">{formatRam(model.ramMb)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <HardDrive size={14} />
                                      <span>{t("modelStatus.storage")}</span>
                                      <span className="font-medium">{model.size}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <Lightbulb size={12} className="text-amber-500" />
                                      <span>{t("modelStatus.accuracy")}</span>
                                      <span className="font-medium">{model.accuracy}/5</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Feather size={12} className="text-sky-500" />
                                      <span>{t("modelStatus.speed")}</span>
                                      <span className="font-medium">{model.speed}/5</span>
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
                    <CommandGroup>
                      {filteredModels.map(renderItem)}
                    </CommandGroup>
                  )
                })()}
              </CommandList>
            </Command>

            <div className="border-t bg-muted/30 px-3 pb-1 pt-0.5">
              <span className="text-xs text-muted-foreground">
                {t("models.availableCount", { count: filteredModels.length })}
              </span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}
