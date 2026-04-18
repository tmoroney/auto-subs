import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    AlertCircle,
    ArrowRight,
    ChevronLeft,
    MonitorPlay,
    Sparkles,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
    cancelPresetEdit,
    capturePresetSettings,
    startPresetEdit,
} from "@/api/resolve-api"

export type CreatePresetSubmit = (args: {
    name: string
    description?: string
    macroSettings: Record<string, unknown>
}) => Promise<void> | void

type Phase =
    | { kind: "launching" }
    | { kind: "editing" }
    | { kind: "capturing" }
    | { kind: "naming"; settings: Record<string, unknown> }

interface CreatePresetFlowProps {
    // Optional starting settings when editing an existing user preset.
    // `undefined` means "create a new preset from macro defaults".
    initialSettings?: Record<string, unknown>
    initialName?: string
    initialDescription?: string
    submitLabel?: string
    onSubmit: CreatePresetSubmit
    onExit: () => void
}

/**
 * Three-phase flow that walks the user through creating (or editing) a caption
 * preset via a live round-trip to Resolve:
 *
 *   1. launching  - StartPresetEdit call in flight.
 *   2. editing    - temp caption is on the timeline; user tweaks in Fusion.
 *   3. naming     - settings captured, user confirms name + saves.
 *
 * The flow owns calling `cancelPresetEdit` whenever the user bails out so we
 * never leave an orphan track behind.
 */
export function CreatePresetFlow({
    initialSettings,
    initialName,
    initialDescription,
    submitLabel,
    onSubmit,
    onExit,
}: CreatePresetFlowProps) {
    const { t } = useTranslation()
    const [phase, setPhase] = React.useState<Phase>({ kind: "launching" })
    const [error, setError] = React.useState<string | null>(null)
    const [name, setName] = React.useState(initialName ?? "")
    const [description, setDescription] = React.useState(initialDescription ?? "")
    const [isSaving, setIsSaving] = React.useState(false)

    // Track whether we still hold an active session so unmount/ESC can clean it up.
    const hasActiveSessionRef = React.useRef(false)
    // Guard against React 18 StrictMode's intentional double-mount in dev,
    // which would otherwise fire two StartPresetEdit calls at Resolve.
    const didStartRef = React.useRef(false)

    const startEdit = React.useCallback(
        async (seedSettings?: Record<string, unknown>) => {
            setPhase({ kind: "launching" })
            setError(null)
            const result = await startPresetEdit(seedSettings)
            if (result.error) {
                setError(result.error)
                hasActiveSessionRef.current = false
                return
            }
            hasActiveSessionRef.current = true
            setPhase({ kind: "editing" })
        },
        [],
    )

    // Kick off the first session on mount.
    React.useEffect(() => {
        if (didStartRef.current) return
        didStartRef.current = true
        startEdit(initialSettings)
        return () => {
            if (hasActiveSessionRef.current) {
                // Fire-and-forget: we're unmounting, can't await.
                cancelPresetEdit().catch(() => {})
                hasActiveSessionRef.current = false
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function handleCancel() {
        if (hasActiveSessionRef.current) {
            await cancelPresetEdit().catch(() => {})
            hasActiveSessionRef.current = false
        }
        onExit()
    }

    async function handleCapture() {
        setPhase({ kind: "capturing" })
        setError(null)
        const result = await capturePresetSettings()
        // `CapturePresetSettings` tears down the session itself on both the
        // success and error paths.
        hasActiveSessionRef.current = false
        if (result.error || !result.settings) {
            setError(result.error ?? t("addToTimeline.preset.errors.captureFailed"))
            setPhase({ kind: "editing" })
            return
        }
        setPhase({ kind: "naming", settings: result.settings })
    }

    async function handleBackToEditing() {
        if (phase.kind !== "naming") return
        // Re-open in Resolve seeded with the captured settings so the user
        // doesn't lose their work.
        await startEdit(phase.settings)
    }

    async function handleSave() {
        if (phase.kind !== "naming") return
        const trimmed = name.trim()
        if (!trimmed) {
            setError(t("addToTimeline.preset.errors.nameRequired"))
            return
        }
        setIsSaving(true)
        try {
            await onSubmit({
                name: trimmed,
                description: description.trim() || undefined,
                macroSettings: phase.settings,
            })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {phase.kind === "launching" && (
                <PhaseCard
                    icon={<Sparkles className="h-6 w-6 text-primary animate-pulse" />}
                    title={t("addToTimeline.preset.phase.launchingTitle")}
                    body={t("addToTimeline.preset.phase.launchingHint")}
                />
            )}

            {phase.kind === "capturing" && (
                <PhaseCard
                    icon={<Sparkles className="h-6 w-6 text-primary animate-pulse" />}
                    title={t("addToTimeline.preset.phase.capturingTitle")}
                    body={t("addToTimeline.preset.phase.launchingHint")}
                />
            )}

            {phase.kind === "editing" && (
                <PhaseCard
                    icon={<MonitorPlay className="h-6 w-6 text-primary" />}
                    title={t("addToTimeline.preset.phase.editingTitle")}
                    body={t("addToTimeline.preset.phase.editingBody")}
                />
            )}

            {phase.kind === "naming" && (
                <div className="space-y-3">
                    <div>
                        <h3 className="text-sm font-medium">
                            {t("addToTimeline.preset.phase.nameTitle")}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t("addToTimeline.preset.phase.nameHint")}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs" htmlFor="preset-name-input">
                            {t("addToTimeline.preset.nameLabel")}
                        </Label>
                        <Input
                            id="preset-name-input"
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t("addToTimeline.preset.namePlaceholder")}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave()
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs" htmlFor="preset-desc-input">
                            {t("addToTimeline.preset.descriptionLabel")}
                        </Label>
                        <Textarea
                            id="preset-desc-input"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t("addToTimeline.preset.descriptionPlaceholder")}
                            rows={2}
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-2">
                {phase.kind === "naming" ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleBackToEditing}
                        disabled={isSaving}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        {t("addToTimeline.preset.action.back")}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCancel}
                        disabled={phase.kind === "capturing"}
                    >
                        {t("addToTimeline.preset.action.cancel")}
                    </Button>
                )}

                {phase.kind === "editing" && (
                    <Button type="button" onClick={handleCapture}>
                        {t("addToTimeline.preset.action.captureSettings")}
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                )}

                {phase.kind === "naming" && (
                    <Button type="button" onClick={handleSave} disabled={isSaving}>
                        {isSaving && (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        )}
                        {submitLabel ?? t("addToTimeline.preset.action.save")}
                    </Button>
                )}
            </div>
        </div>
    )
}

function PhaseCard({
    icon,
    title,
    body,
}: {
    icon: React.ReactNode
    title: string
    body: string
}) {
    return (
        <div className="rounded-lg border bg-muted/40 p-5">
            <div className="flex items-start gap-4">
                <div className="shrink-0 rounded-md bg-background p-2 border">{icon}</div>
                <div className="space-y-1">
                    <h3 className="text-sm font-medium">{title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
                </div>
            </div>
        </div>
    )
}
