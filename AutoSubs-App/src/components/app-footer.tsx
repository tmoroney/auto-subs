import React from "react"
import { Download, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getVersion } from "@tauri-apps/api/app"
import { check } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Model } from "@/types/interfaces"
import { SettingsDialog } from "@/components/settings-dialog"

function ManageModelsDialog({ models, onDeleteModel }: {
  models: Model[]
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
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3 w-3" />
          <span className="text-xs">Manage Models</span>
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
                ? t(models.find((m) => m.value === confirmOpenForModelValue)?.label || "")
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

export function AppFooter({ models, onDeleteModel }: {
  models?: Model[]
  onDeleteModel?: (modelValue: string) => void
}) {
  const [version, setVersion] = React.useState<string>("")
  const [updateAvailable, setUpdateAvailable] = React.useState<boolean>(false)
  const [updateVersion, setUpdateVersion] = React.useState<string>("")
  const [checking, setChecking] = React.useState<boolean>(false)

  React.useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion()
        setVersion(appVersion)
      } catch (error) {
        console.error("Failed to get app version:", error)
      }
    }

    fetchVersion()
  }, [])

  const checkForUpdates = async () => {
    setChecking(true)
    try {
      const update = await check()
      if (update?.available) {
        setUpdateAvailable(true)
        setUpdateVersion(update.version)
      } else {
        setUpdateAvailable(false)
      }
    } catch (error) {
      console.error("Failed to check for updates:", error)
    } finally {
      setChecking(false)
    }
  }

  const installUpdate = async () => {
    try {
      const update = await check()
      if (update?.available) {
        await update.downloadAndInstall()
        await relaunch()
      }
    } catch (error) {
      console.error("Failed to install update:", error)
    }
  }

  React.useEffect(() => {
    checkForUpdates()
  }, [])

  return (
    <footer className="border-t bg-card/50 py-1">
      <div className="flex items-center justify-between pl-1 pr-4">
        {/* Left side - Settings and Manage Models */}
        <div className="flex items-center">
          <SettingsDialog variant="ghost" size="sm" showIcon={true} showText={true} />
          {models && onDeleteModel && (
            <ManageModelsDialog
              models={models}
              onDeleteModel={onDeleteModel}
            />
          )}
        </div>

        {/* Right side - Version and Update Status */}
        <div className="flex items-center gap-3">
          {updateAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={installUpdate}
              className="gap-2 text-pink-500 hover:text-pink-600 dark:text-pink-400 dark:hover:text-pink-300"
            >
              <Download className="h-3 w-3" />
              <span className="text-xs font-medium">
                Update available • v{updateVersion}
              </span>
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {checking ? (
                <span>Checking for updates...</span>
              ) : (
                <>
                  <span className="text-muted-foreground/60">
                    Up to date • v{version}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}
