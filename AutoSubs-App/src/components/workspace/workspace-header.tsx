import * as React from "react"
import { UploadIcon, type UploadIconHandle } from "@/components/ui/upload"
import { DownloadIcon, type DownloadIconHandle } from "@/components/ui/download"
import { CheckIcon, type CheckIconHandle } from "@/components/ui/check"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/animated-tabs"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ModelStatusIndicator } from "@/components/ui/model-status-indicator"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { useTranslation } from "react-i18next"
import { Model } from "@/types/interfaces"


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
  const checkIconRef = React.useRef<CheckIconHandle>(null)
  const downloadIconRef = React.useRef<DownloadIconHandle>(null)

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

  const getLanguageBadge = (model: Model) => {
    if (model.languageSupport.kind === "single_language") {
      return (
        <Badge variant="secondary" className="text-xs py-0 px-1.5">
          {model.languageSupport.language.toUpperCase()}
        </Badge>
      )
    }
    return null
  }

  const filteredModels = React.useMemo(() => {
    return modelsState.filter((model) => modelSupportsLanguage(model, selectedLanguage))
  }, [modelsState, modelSupportsLanguage, selectedLanguage])

  return (
    <TooltipProvider>
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 bg-transparent">
        {/* Left side: Model Management */}
        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <Popover open={openModelSelector} onOpenChange={onOpenModelSelectorChange}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="default"
                role="combobox"
                className="p-2"
                aria-expanded={openModelSelector}
                onMouseEnter={() => {
                  if (modelsState[selectedModelIndex].isDownloaded) {
                    checkIconRef.current?.startAnimation()
                  } else {
                    downloadIconRef.current?.startAnimation()
                  }
                }}
                onMouseLeave={() => {
                  if (modelsState[selectedModelIndex].isDownloaded) {
                    checkIconRef.current?.stopAnimation()
                  } else {
                    downloadIconRef.current?.stopAnimation()
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <img
                    src={modelsState[selectedModelIndex].image}
                    alt={t(modelsState[selectedModelIndex].label) + " icon"}
                    className="w-6 h-6 object-contain rounded"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{t(modelsState[selectedModelIndex].label)}</span>
                    {getLanguageBadge(modelsState[selectedModelIndex])}
                  </div>
                  {modelsState[selectedModelIndex].isDownloaded ? (
                    <CheckIcon ref={checkIconRef} className="text-green-600" size={16} />
                  ) : (
                    <DownloadIcon ref={downloadIconRef} className="text-gray-500" size={16} />
                  )}
                </div>
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
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
                                {getLanguageBadge(model)}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {t(model.description)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center ml-2 flex-shrink-0">
                            {downloadingModel === model.value ? (
                              <div className="flex items-center gap-2">
                                <Progress value={downloadProgress} className="h-1 w-12" />
                                <span className="text-xs text-blue-600 dark:text-blue-400">{downloadProgress}%</span>
                              </div>
                            ) : (
                              <ModelStatusIndicator
                                model={model}
                                isDownloaded={model.isDownloaded}
                                isSmallScreen={isSmallScreen}
                              />
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
              File
            </TabsTrigger>
            <TabsTrigger 
              value="timeline" 
              className="text-sm px-5"
            >
              <img 
                src="/davinci-resolve-logo.png" 
                alt="DaVinci Resolve logo" 
                className="w-5 h-5"
              />
              Timeline
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
