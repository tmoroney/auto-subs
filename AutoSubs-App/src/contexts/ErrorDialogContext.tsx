import * as React from "react"
import { ErrorReportDialog } from "@/components/dialogs/error-report-dialog"

export interface ErrorPayload {
  /** Short, human-friendly title (e.g. "Transcription failed"). */
  title: string
  /** One-line summary shown as the dialog description. */
  message: string
  /**
   * Optional longer detail (e.g. the raw error from Resolve or the
   * transcription engine). Shown in a collapsible "Details" section so
   * the dialog stays compact.
   */
  detail?: string
}

interface ErrorDialogContextValue {
  showError: (payload: ErrorPayload) => void
  dismissError: () => void
}

const ErrorDialogContext = React.createContext<ErrorDialogContextValue | null>(
  null,
)

/**
 * App-wide provider that mounts a single `<ErrorReportDialog>` and exposes
 * a `showError` imperative API. Use `useErrorDialog()` in any child to surface
 * user-visible failures (transcription, timeline ops, preview, etc.) with a
 * consistent "copy log path / open log folder / report on GitHub" UX.
 */
export function ErrorDialogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [payload, setPayload] = React.useState<ErrorPayload | null>(null)

  const showError = React.useCallback((next: ErrorPayload) => {
    setPayload(next)
  }, [])

  const dismissError = React.useCallback(() => {
    setPayload(null)
  }, [])

  const value = React.useMemo(
    () => ({ showError, dismissError }),
    [showError, dismissError],
  )

  return (
    <ErrorDialogContext.Provider value={value}>
      {children}
      <ErrorReportDialog
        open={payload !== null}
        onClose={dismissError}
        title={payload?.title ?? ""}
        message={payload?.message ?? ""}
        detail={payload?.detail}
      />
    </ErrorDialogContext.Provider>
  )
}

export function useErrorDialog(): ErrorDialogContextValue {
  const ctx = React.useContext(ErrorDialogContext)
  if (!ctx) {
    // Soft-fail so callers outside the provider don't crash; log and no-op.
    // (In practice this should never happen because the provider mounts at
    // the app root, but it's a cheap safeguard while wiring call sites.)
    return {
      showError: (p) =>
        console.error(
          "[useErrorDialog] Provider missing; would have shown:",
          p,
        ),
      dismissError: () => {},
    }
  }
  return ctx
}
