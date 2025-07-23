import * as React from "react"
import { Brain, Check, ChevronsUpDown, Download, HardDrive, MemoryStick, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Model } from "@/types/interfaces"

interface ModelSelectionCardProps {
  selectedModel: number
  models: Model[]
  downloadingModel?: string | null
  downloadProgress?: number
  onModelChange: (model: number) => void
  onDeleteModel?: (modelValue: string) => void
  walkthroughMode?: boolean
}

export const ModelSelectionCard = ({
  selectedModel,
  models,
  downloadingModel = null,
  downloadProgress = 0,
  onModelChange,
  onDeleteModel = () => {},
  walkthroughMode = false
}: ModelSelectionCardProps) => {
  const [openModelSelector, setOpenModelSelector] = React.useState(false)

  if (walkthroughMode) {
    return (
      <div>
        {/* Grid of Models */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
          {models.map((model, index) => (
            <div
              key={index}
              className={`rounded-lg p-3 cursor-pointer transition-all duration-200 border-2 ${selectedModel === index
                ? "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 shadow-sm"
                : "border-gray-200 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
              onClick={() => onModelChange(index)}
            >
              <div className="flex flex-col items-center text-center space-y-1">
                {/* Model Image */}
                <div className="relative">
                  <img src={model.image} alt={model.label + " icon"} className="w-16 h-16 object-contain" />
                </div>

                {/* Model Name */}
                <div className="space-y-1">
                  <span className="font-semibold text-sm">{model.label}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Selected Model Details */}
        <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-900/30">
          <h4 className="font-semibold text-sm mb-2">Model Details</h4>

          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{models[selectedModel].details}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-100/60 dark:bg-indigo-900/40 rounded-md border border-indigo-200 dark:border-indigo-800 min-w-[135px]">
                <HardDrive className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <div className="flex flex-col leading-tight">
                  <span className="font-semibold text-xs">{models[selectedModel].size}</span>
                  <span className="text-[11px]">Disk Space</span>
                </div>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-100/60 dark:bg-indigo-900/40 rounded-md border border-indigo-200 dark:border-indigo-800 min-w-[110px]">
                <MemoryStick className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <div className="flex flex-col leading-tight">
                  <span className="font-semibold text-xs">{models[selectedModel].ram}</span>
                  <span className="text-[11px]">RAM Required</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden dark:from-gray-900 dark:to-purple-950/20">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Transcription Model</p>
              <p className="text-xs text-muted-foreground">Select speech-to-text model</p>
            </div>
          </div>
          {downloadingModel === models[selectedModel].value ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full">
              <Progress value={downloadProgress} className="h-2 w-16" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{downloadProgress}%</span>
            </div>
          ) : models[selectedModel].isDownloaded ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 rounded-lg"
                  title="Delete Model"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:w-[70vw] w-[90vw] p-4 flex flex-col gap-6" onOpenAutoFocus={e => e.preventDefault()}>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="font-semibold text-red-700 dark:text-red-400">Are you sure?</span>
                </DialogTitle>
                <span className="text-sm text-muted-foreground">
                  This will delete the <span className="font-bold">{models[selectedModel].label}</span> model from your device. <br /><br /> If you use this model in future it will need to be downloaded again.
                </span>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost" size="sm">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      onDeleteModel(models[selectedModel].value)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        <Popover open={openModelSelector} onOpenChange={setOpenModelSelector}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openModelSelector}
              className="w-full justify-between font-normal h-auto p-3.5 transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-800/20"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img src={models[selectedModel].image} alt={models[selectedModel].label + " icon"} className="w-16 h-16 object-contain rounded-lg" />
                </div>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-base">{models[selectedModel].label}</span>
                    {models[selectedModel].isDownloaded ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
                        <Check className="h-3 w-3 inline" /> Cached
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        <Download className="h-3 w-3 inline" /> Not Cached
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      <HardDrive className="h-3 w-3" />
                      <span className="font-medium">{models[selectedModel].size}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      <MemoryStick className="h-3 w-3" />
                      <span className="font-medium">{models[selectedModel].ram} RAM</span>
                    </div>
                  </div>
                </div>
              </div>
              <ChevronsUpDown className="mx-1 h-5 w-5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-2" align="start">
            <ScrollArea className="h-[250px]">
              <div className="space-y-1 pr-0">
                {models.map((model, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 cursor-pointer rounded-lg transition-colors duration-200 ${selectedModel === index
                      ? "bg-purple-50 dark:bg-purple-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      }`}
                    onClick={() => {
                      onModelChange(index)
                      setOpenModelSelector(false)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <img src={model.image} alt={model.label + " icon"} className="w-10 h-10 object-contain rounded" />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{model.label}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            <span>{model.size}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MemoryStick className="h-3 w-3" />
                            <span>{model.ram}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {downloadingModel === model.value ? (
                        <div className="flex items-center gap-2">
                          <Progress value={downloadProgress} className="h-2 w-16" />
                          <span className="text-xs text-blue-600 dark:text-blue-400">{downloadProgress}%</span>
                        </div>
                      ) : model.isDownloaded ? (
                        <span className="text-xs font-medium px-2 py-1 ml-6 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Cached
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-1 ml-6 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          Available
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <div className="mt-3 p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-900/30">
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{models[selectedModel].details}</p>
        </div>
      </div>
    </div>
  )
}
