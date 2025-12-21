import * as React from "react"
import { Trash2, AlertTriangle, Check, Download, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { SettingsDialog } from "@/components/settings-dialog"
import { ModelStatusIndicator } from "@/components/ui/model-status-indicator"
import { useTranslation } from "react-i18next"

function ManageModelsDialog({ models, onDeleteModel }: {
  models: any[]
  onDeleteModel: (modelValue: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [confirmOpenForModelValue, setConfirmOpenForModelValue] = React.useState<string | null>(null)
  const downloadedModels = models.filter(model => model.isDownloaded)

  // Helper function to check if model is English-only
  const isEnglishOnlyModel = (modelValue: string) => modelValue.includes('.en')

  // Helper function to get language badge
  const getLanguageBadge = (modelValue: string) => {
    if (isEnglishOnlyModel(modelValue)) {
      return <Badge variant="secondary" className="text-xs py-0 px-1.5 ml-1.5">EN</Badge>
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-tauri-drag-region="false"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("models.manage.title")}</DialogTitle>
          <DialogDescription>
            {t("models.manage.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {downloadedModels.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t("models.manage.empty")}
            </p>
          ) : (
            downloadedModels.map((model) => (
              <div key={model.value} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <img
                    src={model.image}
                    alt={t(model.label)}
                    className="w-10 h-10 object-contain rounded"
                  />
                  <div>
                    <div className="flex items-center">
                      <p className="font-medium">{t(model.label)}</p>
                      {getLanguageBadge(model.value)}
                    </div>
                    <p className="text-xs text-muted-foreground">{model.size}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 rounded-lg"
                  title={t("models.manage.deleteModel")}
                  onClick={() => setConfirmOpenForModelValue(model.value)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>

      <Dialog
        open={confirmOpenForModelValue !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmOpenForModelValue(null)
        }}
      >
        <DialogContent
          className="sm:w-[70vw] w-[90vw] p-4 flex flex-col gap-6"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-semibold text-red-700 dark:text-red-400">{t("models.manage.confirmTitle")}</span>
          </DialogTitle>
          <span className="text-sm text-muted-foreground">
            {t("models.manage.confirmBody", {
              model: confirmOpenForModelValue
                ? t(models.find((m) => m.value === confirmOpenForModelValue)?.label)
                : "",
            })}
          </span>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">{t("common.cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!confirmOpenForModelValue) return
                onDeleteModel(confirmOpenForModelValue)
                setConfirmOpenForModelValue(null)
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

export function WorkspaceHeader({
  modelsState,
  selectedModelIndex,
  onSelectModel,
  downloadingModel,
  downloadProgress,
  openModelSelector,
  onOpenModelSelectorChange,
  showEnglishOnly,
  onShowEnglishOnlyChange,
  isSmallScreen,
  onDeleteModel,
}: {
  modelsState: any[]
  selectedModelIndex: number
  onSelectModel: (modelIndex: number) => void
  downloadingModel: string | null
  downloadProgress: number
  openModelSelector: boolean
  onOpenModelSelectorChange: (open: boolean) => void
  showEnglishOnly: boolean
  onShowEnglishOnlyChange: (value: boolean) => void
  isSmallScreen: boolean
  onDeleteModel: (modelValue: string) => void
}) {
  const { t } = useTranslation()

  // Helper functions for model categorization
  const isEnglishOnlyModel = (modelValue: string) => modelValue.includes('.en')

  // Check if a model has an English-only variant (e.g., "tiny" has "tiny.en")
  const hasEnglishOnlyVariant = (modelValue: string) => {
    return modelsState.some(m => m.value === `${modelValue}.en`)
  }

  // Filter models based on English-only switch
  const getFilteredModels = (models: any[]) => {
    if (showEnglishOnly) {
      // Show English-only models + models that don't have an English-only variant (like large models)
      return models.filter(model =>
        isEnglishOnlyModel(model.value) || !hasEnglishOnlyVariant(model.value)
      )
    } else {
      // Show all models except English-only ones
      return models.filter(model => !isEnglishOnlyModel(model.value))
    }
  }

  const getLanguageBadge = (modelValue: string) => {
    if (isEnglishOnlyModel(modelValue)) {
      return <Badge variant="secondary" className="text-xs py-0 px-1.5">EN</Badge>
    }
    return null
  }

  return (
    <TooltipProvider>
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 bg-transparent">
      {/* Model Selector */}
      <Popover open={openModelSelector} onOpenChange={onOpenModelSelectorChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            role="combobox"
            className="p-2"
            aria-expanded={openModelSelector}
          >
            <div className="flex items-center gap-2">
              <img
                src={modelsState[selectedModelIndex].image}
                alt={t(modelsState[selectedModelIndex].label) + " icon"}
                className="w-6 h-6 object-contain rounded"
              />
              <div className="flex items-center gap-1.5">
                <span className="truncate">{t(modelsState[selectedModelIndex].label)}</span>
                {getLanguageBadge(modelsState[selectedModelIndex].value)}
              </div>
              {modelsState[selectedModelIndex].isDownloaded ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Download className="h-3 w-3 text-gray-500" />
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-2 w-72" align="start" forceMount style={{ display: openModelSelector ? undefined : 'none' }}>
          <div className="space-y-0">
            {/* English-Only Switch */}
            <div className="flex items-center justify-between px-1 py-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="english-only-switch" className="text-xs font-medium cursor-pointer pl-1">
                  {t("models.englishOnly.title")}
                </Label>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </HoverCardTrigger>
                  <HoverCardContent className="w-56 p-3 text-xs">
                    {t("models.englishOnly.description")}
                  </HoverCardContent>
                </HoverCard>
              </div>
              <Switch
                id="english-only-switch"
                checked={showEnglishOnly}
                onCheckedChange={onShowEnglishOnlyChange}
              />
            </div>

            {/* Model List */}
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {getFilteredModels(modelsState).map((model) => {
                  const actualModelIndex = modelsState.findIndex(m => m.value === model.value)

                  return (
                    <div
                          className={`flex items-center justify-between p-2 cursor-pointer rounded-sm transition-colors duration-200 ${selectedModelIndex === actualModelIndex
                            ? "bg-blue-50 dark:bg-blue-900/20"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            }`}
                          onClick={() => {
                            onSelectModel(actualModelIndex)
                            onOpenModelSelectorChange(false)
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <img src={model.image} alt={t(model.label) + " icon"} className="w-8 h-8 object-contain rounded flex-shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-xs">{t(model.label)}</span>
                                {getLanguageBadge(model.value)}
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
                        </div>
                    )
                })}
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>

      {/* Settings and Models Management */}
      <div className="flex items-center">
        <ManageModelsDialog
          models={modelsState}
          onDeleteModel={onDeleteModel}
        />
        <SettingsDialog />
      </div>
    </div>
    </TooltipProvider>
  )
}
