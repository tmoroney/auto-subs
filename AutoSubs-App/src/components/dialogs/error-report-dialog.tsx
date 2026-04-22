import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { openPath, openUrl } from "@tauri-apps/plugin-opener"
import { platform } from "@tauri-apps/plugin-os"
import { getVersion as getAppVersion } from "@tauri-apps/api/app"
import { Check, Copy, ExternalLink, FolderOpen } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

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
 * Reusable error dialog shown when a long-running operation (transcription,
 * add-to-timeline, preview, export) fails. Gives the user a one-line
 * explanation plus three escape hatches:
 *
 *  - Copy the log file path to the clipboard
 *  - Open the log folder in Finder / Explorer
 *  - Open a pre-filled GitHub issue using our bug_report.yml form
 */
export function ErrorReportDialog({
  open,
  onClose,
  title,
  message,
  detail,
}: ErrorReportDialogProps) {
  const { t } = useTranslation()
  const [logDir, setLogDir] = React.useState<string | null>(null)
  const [appVersion, setAppVersion] = React.useState<string>("")
  const [osName, setOsName] = React.useState<string>("")
  const [copied, setCopied] = React.useState(false)
  const [showDetail, setShowDetail] = React.useState(false)

  // Load diagnostics lazily the first time the dialog actually opens, so we
  // don't fire Tauri `invoke` calls at app startup (they can race with the
  // initial Resolve-link fetch and cause noticeable delays). Values don't
  // change for the lifetime of the process, so we only fetch once.
  const loadedRef = React.useRef(false)
  React.useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const [dir, version, plat] = await Promise.all([
          invoke<string>("get_log_dir").catch(() => ""),
          getAppVersion().catch(() => ""),
          Promise.resolve(platform()).catch(() => "" as string),
        ])
        if (cancelled) return
        setLogDir(typeof dir === "string" && dir.length > 0 ? dir : null)
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

  // Reset transient UI state whenever the dialog (re)opens with new content.
  React.useEffect(() => {
    if (open) {
      setCopied(false)
      setShowDetail(false)
    }
  }, [open, title, message, detail])

  const logFilePath = React.useMemo(() => {
    if (!logDir) return ""
    // Rust's log_dir is `<app_log_dir>/logs`. `export_backend_logs` writes to
    // `autosubs-logs.txt` in that dir; that's the snapshot we ask users to
    // attach. (The rolling `autosubs.log.<date>` is also there, but the
    // flat snapshot is easier to grab.)
    const sep = logDir.includes("\\") && !logDir.includes("/") ? "\\" : "/"
    return `${logDir}${logDir.endsWith(sep) ? "" : sep}autosubs-logs.txt`
  }, [logDir])

  const handleCopyPath = React.useCallback(async () => {
    const target = logFilePath || logDir || ""
    if (!target) return
    try {
      await writeText(target)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("[ErrorReportDialog] clipboard write failed:", err)
    }
  }, [logFilePath, logDir])

  const handleOpenLogFolder = React.useCallback(async () => {
    if (!logDir) return
    try {
      // First, make sure a snapshot of the in-memory ring buffer has been
      // written to disk so the user actually has something useful in the
      // folder when they open it.
      try {
        await invoke<string>("export_backend_logs")
      } catch (err) {
        console.warn("[ErrorReportDialog] export_backend_logs failed:", err)
      }
      await openPath(logDir)
    } catch (err) {
      console.error("[ErrorReportDialog] openPath failed:", err)
    }
  }, [logDir])

  const issueUrl = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set("template", "bug_report.yml")
    // Title prefix is already "[Bug]: " from the template; we append the
    // short message so the issue list is scannable.
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
    if (logFilePath) params.set("log-path", logFilePath)

    return `${GITHUB_ISSUE_BASE}?${params.toString()}`
  }, [title, message, detail, osName, appVersion, logFilePath])

  const handleReport = React.useCallback(async () => {
    try {
      await openUrl(issueUrl)
    } catch (err) {
      // If the opener plugin rejects (e.g. capability not granted in a
      // downstream build), fall back to window.open so the user still
      // reaches GitHub.
      console.warn("[ErrorReportDialog] openUrl failed, falling back:", err)
      window.open(issueUrl, "_blank", "noopener,noreferrer")
    }
  }, [issueUrl])

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap break-words">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {detail && detail !== message ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              {showDetail
                ? t("errorDialog.hideDetails", "Hide details")
                : t("errorDialog.showDetails", "Show details")}
            </button>
            {showDetail ? (
              <pre className="max-h-48 overflow-auto rounded border bg-muted/50 p-2 text-xs font-mono whitespace-pre-wrap break-words">
                {detail}
              </pre>
            ) : null}
          </div>
        ) : null}

        {logFilePath ? (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {t("errorDialog.logFileLabel", "Log file")}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs font-mono text-foreground/80">
                {logFilePath}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyPath}
                className="h-7 gap-1.5 text-xs"
                aria-label={t("errorDialog.copyPath", "Copy log file path")}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {t("errorDialog.copied", "Copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    {t("errorDialog.copyPath", "Copy path")}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>
            {t("common.close", "Close")}
          </AlertDialogCancel>
          {logDir ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenLogFolder}
              className="gap-1.5"
            >
              <FolderOpen className="h-4 w-4" />
              {t("errorDialog.openLogFolder", "Open log folder")}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleReport}
            className="gap-1.5"
          >
            <ExternalLink className="h-4 w-4" />
            {t("errorDialog.reportOnGithub", "Report on GitHub")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
