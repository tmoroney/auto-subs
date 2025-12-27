import * as React from "react"
import { Trash2, AlertTriangle, Check, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { SettingsDialog } from "@/components/settings-dialog"
import { ModelStatusIndicator } from "@/components/ui/model-status-indicator"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { useTranslation } from "react-i18next"
import { Model } from "@/types/interfaces"

function ManageModelsDialog({ models, onDeleteModel }: {
  models: any[]
  onDeleteModel: (modelValue: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [confirmOpenForModelValue, setConfirmOpenForModelValue] = React.useState<string | null>(null)
  const downloadedModels = models.filter(model => model.isDownloaded)

  const getLanguageBadge = (model: Model) => {
    if (model.languageSupport.kind === "single_language") {
      return (
        <Badge variant="secondary" className="text-xs py-0 px-1.5 ml-1.5">
          {model.languageSupport.language.toUpperCase()}
        </Badge>
      )
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
                      {getLanguageBadge(model)}
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
  selectedLanguage,
  onSelectModel,
  downloadingModel,
  downloadProgress,
  openModelSelector,
  onOpenModelSelectorChange,
  isSmallScreen,
  onDeleteModel,
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
  onDeleteModel: (modelValue: string) => void
}) {
  const { t } = useTranslation()

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
                  {getLanguageBadge(modelsState[selectedModelIndex])}
                </div>
                {modelsState[selectedModelIndex].isDownloaded ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Download className="h-3 w-3 text-gray-500" />
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
