import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { openUrl } from "@tauri-apps/plugin-opener"
import { platform } from "@tauri-apps/plugin-os"
import { getVersion as getAppVersion } from "@tauri-apps/api/app"
import { AlertCircle, ExternalLink } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ErrorReportDialogProps {
  open: boolean
  onClose: () => void
  title: string
  message: string
  detail?: string
}

const GITHUB_ISSUE_BASE = "https://github.com/tmoroney/auto-subs/issues/new"

/**
 * Map Tauri's platform() name to the `os` dropdown values defined in
 * `.github/ISSUE_TEMPLATE/bug_report.yml`.
 */
function mapOsForIssue(p: string | undefined): string {
  switch (p) {
    case "macos":
      return "macOS"
    case "windows":
      return "Windows"
    case "linux":
      return "Linux"
    default:
      return ""
  }
}

/**
 * Simplified error dialog shown when an operation fails.
 * Provides two options:
 *  - Close the dialog
 *  - Copy logs to clipboard and open a pre-filled GitHub issue
 */
export function ErrorReportDialog({
  open,
  onClose,
  title,
  message,
  detail,
}: ErrorReportDialogProps) {
  const { t } = useTranslation()
  const [appVersion, setAppVersion] = React.useState<string>("")
  const [osName, setOsName] = React.useState<string>("")
  const [isCopying, setIsCopying] = React.useState(false)

  // Load diagnostics lazily the first time the dialog opens
  const loadedRef = React.useRef(false)
  React.useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    let cancelled = false
      ; (async () => {
        try {
          const [version, plat] = await Promise.all([
            getAppVersion().catch(() => ""),
            Promise.resolve(platform()).catch(() => "" as string),
          ])
          if (cancelled) return
          setAppVersion(version || "")
          setOsName(mapOsForIssue(plat))
        } catch (err) {
          console.warn("[ErrorReportDialog] failed to load diagnostics:", err)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [open])

  const handleCopyAndReport = React.useCallback(async () => {
    setIsCopying(true)

    try {
      // Get log contents from the backend (avoids permission issues)
      const logContents = await invoke<string>("get_backend_logs")

      // Copy logs to clipboard
      await writeText(logContents)

      // Build GitHub issue URL with pre-filled fields
      const params = new URLSearchParams()
      params.set("template", "bug_report.yml")
      params.set("title", `[Bug]: ${message || title}`.slice(0, 200))

      const descriptionParts: string[] = []
      if (message) descriptionParts.push(message)
      if (detail && detail !== message) {
        descriptionParts.push("", "Details:", "```", detail, "```")
      }
      if (descriptionParts.length > 0) {
        params.set("description", descriptionParts.join("\n"))
      }

      if (osName) params.set("os", osName)
      if (appVersion) params.set("autosubs-version", appVersion)

      const issueUrl = `${GITHUB_ISSUE_BASE}?${params.toString()}`

      // Open the issue
      await openUrl(issueUrl)
    } catch (err) {
      console.error("[ErrorReportDialog] copy and report failed:", err)
    } finally {
      setIsCopying(false)
    }
  }, [title, message, detail, osName, appVersion])

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-red-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-lg">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="pt-3">
          <AlertDialogCancel>{t("common.close", "Close")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCopyAndReport}
            disabled={isCopying}
          >
            {isCopying ? (
              "Copying..."
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Copy Logs & Report
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
