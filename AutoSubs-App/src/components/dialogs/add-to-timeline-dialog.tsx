import * as React from "react"
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    Layers,
    Layout,
    Palette,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Settings, Speaker, Template, TimelineInfo } from "@/types"
import { useSubtitleDocument } from "@/contexts/SubtitleDocumentContext"
import { usePresets, DEFAULT_PRESET_ID } from "@/contexts/PresetsContext"
import { useSettings } from "@/contexts/SettingsContext"
import { SpeakerSettings } from "@/components/common/speaker-settings"
import {
    ANIMATED_CAPTION_TEMPLATE,
    CaptionTemplateSelectionContent,
    CreatePresetSubmit,
    CreatePresetSession,
    CaptionTemplateMode,
} from "@/components/dialogs/caption-style/template-selection"
import {
    cancelPresetEdit,
    checkTrackConflicts,
    type ConflictInfo,
} from "@/api/resolve-api"
import { toast } from "sonner"

interface Selection {
    mode: CaptionTemplateMode
    templateValue: string  // used when mode === 'regular'
    presetId: string       // used when mode === 'animated'
    outputTrack: string
}

interface AddToTimelineDialogProps {
    children: React.ReactNode
    settings: Settings
    timelineInfo: TimelineInfo
    templates: Template[]
    templatesLoading: boolean
    templatesLoaded: boolean
    onLoadTemplates?: () => Promise<Template[]>
    onAddToTimeline: (
        selectedOutputTrack: string,
        selectedTemplate: string,
        presetSettings?: Record<string, unknown>,
    ) => Promise<void>
    isAdding?: boolean
    selectedIntegration?: "davinci" | "premiere" | "aftereffects"
}

const STEPS = [
    { key: "outputTrack", icon: Layers },
    { key: "template", icon: Layout },
    { key: "speakers", icon: Palette },
] as const

export function AddToTimelineDialog({
    children,
    settings,
    timelineInfo,
    templates,
    templatesLoading,
    templatesLoaded,
    onLoadTemplates,
    onAddToTimeline,
    isAdding = false,
    selectedIntegration,
}: AddToTimelineDialogProps) {
    const isAdobe = selectedIntegration === "premiere" || selectedIntegration === "aftereffects"
    const { t } = useTranslation()
    const { speakers, updateSpeakers, currentSubtitleDocumentFilename } = useSubtitleDocument()
    const { updateSetting } = useSettings()
    const {
        presets,
        getPreset,
        createPreset,
        updatePreset,
        deletePreset,
        importPreset,
        exportPreset,
    } = usePresets()

    const [open, setOpen] = React.useState(false)
    const [currentStep, setCurrentStep] = React.useState(0)
    const [selection, setSelection] = React.useState<Selection>(() => ({
        mode: "regular",
        templateValue: settings.selectedTemplate.value,
        presetId: settings.presetId || DEFAULT_PRESET_ID,
        outputTrack: settings.selectedOutputTrack,
    }))
    const [localSpeakers, setLocalSpeakers] = React.useState<Speaker[]>(speakers)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [templateLoadError, setTemplateLoadError] = React.useState<string | null>(null)
    const [createSession, setCreateSession] = React.useState<CreatePresetSession>({ kind: "closed" })
    const [conflictInfo, setConflictInfo] = React.useState<ConflictInfo | null>(null)

    // Only show the speakers step when we actually have speakers to configure.
    const hasSpeakers = speakers.length > 0
    const activeSteps = React.useMemo<ReadonlyArray<typeof STEPS[number]>>(
        () => {
            if (isAdobe) {
                // Adobe apps (Premiere/AE) handle tracks and templates automatically or differently.
                // We only show the speakers step if available, otherwise it goes straight to submit.
                return hasSpeakers ? [STEPS[2]] : []
            }
            return hasSpeakers ? STEPS : [STEPS[0], STEPS[1]]
        },
        [hasSpeakers, isAdobe],
    )
    const totalSteps = activeSteps.length

    // Keep refs so the open-effect can read the latest values without being
    // re-triggered every time settings/speakers get a new object reference.
    const settingsRef = React.useRef(settings)
    const speakersRef = React.useRef(speakers)
    settingsRef.current = settings
    speakersRef.current = speakers

    // Re-hydrate from settings whenever the dialog opens; a fresh session should
    // not carry over half-baked state from a previous open/close.
    // NOTE: intentionally omit settings/speakers from the dep array — they are
    // objects/arrays whose references change on every parent render. Including
    // them would cause the effect to fire while the dialog is already open,
    // resetting currentStep to 0 mid-session (the "glitch back to step 1" bug).
    // We read their current values through refs instead.
    React.useEffect(() => {
        if (!open) return
        const s = settingsRef.current
        const sp = speakersRef.current
        setCurrentStep(0)
        setSelection({
            mode: s.captionMode,
            templateValue: s.selectedTemplate.value,
            presetId: s.presetId || DEFAULT_PRESET_ID,
            outputTrack: s.selectedOutputTrack,
        })
        // Initialize speakers without tracks to use the global output track
        const initializedSpeakers = sp.map((speaker) => ({
            ...speaker,
            track: speaker.track || s.selectedOutputTrack,
        }))
        setLocalSpeakers(initializedSpeakers)
        setCreateSession({ kind: "closed" })
        setConflictInfo(null)
        setTemplateLoadError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    React.useEffect(() => {
        if (!open || isAdobe || templatesLoaded || templatesLoading || !onLoadTemplates) return
        let cancelled = false
        onLoadTemplates().catch((err) => {
            if (cancelled) return
            const message = err instanceof Error ? err.message : String(err)
            setTemplateLoadError(message)
        })
        return () => { cancelled = true }
    }, [open, isAdobe, templatesLoaded, templatesLoading, onLoadTemplates])


    // Check for track conflicts whenever the selected output track changes.
    const [prevConflictKey, setPrevConflictKey] = React.useState({ open, file: currentSubtitleDocumentFilename, track: selection.outputTrack })
    if (prevConflictKey.open !== open || prevConflictKey.file !== currentSubtitleDocumentFilename || prevConflictKey.track !== selection.outputTrack) {
        setPrevConflictKey({ open, file: currentSubtitleDocumentFilename, track: selection.outputTrack })
        if (!open || !currentSubtitleDocumentFilename || !selection.outputTrack) {
            setConflictInfo(null)
        }
    }

    React.useEffect(() => {
        if (!open || !currentSubtitleDocumentFilename || !selection.outputTrack) {
            return
        }
        let cancelled = false
        checkTrackConflicts(currentSubtitleDocumentFilename, selection.outputTrack)
            .then((info) => {
                if (!cancelled) setConflictInfo(info)
            })
            .catch((err) => {
                console.warn("Track conflict check failed:", err)
                if (!cancelled) setConflictInfo(null)
            })
        return () => { cancelled = true }
    }, [open, selection.outputTrack, currentSubtitleDocumentFilename])

    // Intercept close while a preset-edit session is active so the temporary
    // track is always torn down. We explicitly cancel here rather than relying
    // on CreatePresetFlow's unmount cleanup, because dialog close animations
    // and batched state updates can make unmount timing unreliable.
    function handleOpenChange(next: boolean) {
        if (!next && createSession.kind !== "closed") {
            // Fire-and-forget cancel of the Resolve-side session.
            cancelPresetEdit().catch(() => { })
            setCreateSession({ kind: "closed" })
        }
        setOpen(next)
    }

    function handleCreatePreset() {
        setCreateSession({ kind: "create" })
    }

    function handleEditPreset(presetId: string) {
        setCreateSession({ kind: "edit", presetId })
    }

    const handleSubmitPreset: CreatePresetSubmit = async ({
        name,
        description,
        macroSettings,
    }) => {
        try {
            if (createSession.kind === "edit") {
                await updatePreset(createSession.presetId, {
                    name,
                    description,
                    macroSettings,
                })
                setSelection((s) => ({ ...s, presetId: createSession.presetId }))
            } else {
                const created = await createPreset(name, macroSettings, description)
                setSelection((s) => ({ ...s, presetId: created.id }))
            }
            setCreateSession({ kind: "closed" })
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to save preset")
        }
    }

    async function handleDuplicatePreset(id: string) {
        const p = getPreset(id)
        if (!p) return
        const copy = await createPreset(
            `${p.name} copy`,
            p.macroSettings,
            p.description,
        )
        setSelection((s) => ({ ...s, presetId: copy.id }))
    }

    // Submit: assemble the final template/preset pair and hand it to the parent.
    async function handleSubmit() {
        setIsSubmitting(true)

        if (localSpeakers.length > 0) {
            await updateSpeakers(localSpeakers)
        }

        const templateName =
            selection.mode === "animated"
                ? ANIMATED_CAPTION_TEMPLATE
                : selection.templateValue
        const presetSettings =
            selection.mode === "animated"
                ? getPreset(selection.presetId)?.macroSettings
                : undefined

        // Persist the user's picks so the next run starts from them.
        updateSetting("captionMode", selection.mode)
        if (selection.mode === "animated") {
            updateSetting("presetId", selection.presetId)
        } else {
            const matched = templates.find(
                (tpl) => tpl.value === selection.templateValue,
            )
            if (matched) updateSetting("selectedTemplate", matched)
        }
        updateSetting("selectedOutputTrack", selection.outputTrack)

        // Close dialog immediately
        setOpen(false)

        // Run the operation in background
        onAddToTimeline(selection.outputTrack, templateName, presetSettings)
            .then(() => {
                toast.success(t("addToTimeline.success"))
            })
            .catch((err) => {
                console.error("Failed to add to timeline:", err)
            })
            .finally(() => {
                setIsSubmitting(false)
            })
    }

    function canProceed(): boolean {
        if (isAdobe) return true
        const stepKey = activeSteps[currentStep]?.key
        if (stepKey === "template") {
            if (selection.mode === "regular") return !!selection.templateValue
            return !!selection.presetId
        }
        if (stepKey === "outputTrack") return !!selection.outputTrack
        return true
    }

    const animatedPresets = presets // already ordered: built-ins first
    const editingPreset =
        createSession.kind === "edit" ? getPreset(createSession.presetId) : undefined

    // Check if the AutoSubs Caption template is available in Resolve
    const hasAnimatedTemplate = templates.some(
        (t) => t.value === ANIMATED_CAPTION_TEMPLATE,
    )

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="max-w-xl">
                {/* Stepper */}
                <Stepper
                    steps={activeSteps.map((s) => ({
                        key: s.key,
                        label: t(`addToTimeline.steps.${s.key}.title`),
                        icon: s.icon,
                    }))}
                    currentStep={currentStep}
                    onJump={setCurrentStep}
                    canAdvanceTo={(target) => {
                        if (target <= currentStep) return true
                        return target === currentStep + 1 && canProceed()
                    }}
                    isAdobe={isAdobe}
                />

                {/* Step body */}
                <div className="py-1 min-h-[280px] relative">
                    {activeSteps.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[280px] text-center space-y-4">
                            <div className="bg-primary/10 p-4 rounded-full">
                                <Check className="size-8 text-primary" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-lg font-medium">{t("addToTimeline.ready.title")}</p>
                                <p className="text-sm text-muted-foreground">{t("addToTimeline.ready.description", { app: selectedIntegration === 'aftereffects' ? 'After Effects' : 'Premiere Pro' })}</p>
                            </div>
                        </div>
                    )}
                    {activeSteps[currentStep]?.key === "template" && (
                        <CaptionTemplateSelectionContent
                            mode={selection.mode}
                            onModeChange={(mode) =>
                                setSelection((s) => ({ ...s, mode }))
                            }
                            templateValue={selection.templateValue}
                            onTemplateChange={(value) =>
                                setSelection((s) => ({ ...s, templateValue: value }))
                            }
                            templates={templates}
                            templatesLoading={templatesLoading}
                            templatesLoaded={templatesLoaded}
                            templateLoadError={templateLoadError}
                            presetId={selection.presetId}
                            onPresetChange={(id) =>
                                setSelection((s) => ({ ...s, presetId: id, mode: "animated" }))
                            }
                            animatedPresets={animatedPresets}
                            createSession={createSession}
                            onRequestCreate={handleCreatePreset}
                            onRequestEdit={(p) => handleEditPreset(p.id)}
                            onCreateFlowExit={() => setCreateSession({ kind: "closed" })}
                            onSubmitPreset={handleSubmitPreset}
                            editingInitialSettings={editingPreset?.macroSettings}
                            editingInitialName={editingPreset?.name}
                            editingInitialDescription={editingPreset?.description}
                            onDeletePreset={deletePreset}
                            onDuplicatePreset={(p) => handleDuplicatePreset(p.id)}
                            onImportPreset={async (json) => {
                                const imported = await importPreset(json)
                                setSelection((s) => ({ ...s, presetId: imported.id }))
                                return imported
                            }}
                            onExportPreset={exportPreset}
                            hasAnimatedTemplate={hasAnimatedTemplate}
                        />
                    )}

                    {activeSteps[currentStep]?.key === "speakers" && (
                        <ScrollArea>
                            <div className="space-y-3">
                                {localSpeakers.map((speaker, index) => (
                                    <div key={index} className="rounded-sm border p-3 bg-card">
                                        <SpeakerSettings
                                            speaker={speaker}
                                            onSpeakerChange={(updated) => {
                                                const next = [...localSpeakers]
                                                next[index] = updated
                                                setLocalSpeakers(next)
                                            }}
                                            tracks={timelineInfo.outputTracks}
                                        />
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    {activeSteps[currentStep]?.key === "outputTrack" && (
                        <OutputTrackStep
                            tracks={timelineInfo.outputTracks}
                            selected={selection.outputTrack}
                            onSelect={(value) =>
                                setSelection((s) => ({ ...s, outputTrack: value }))
                            }
                            conflictInfo={conflictInfo}
                        />
                    )}
                </div>

                {/* Footer: hide when a preset edit is in progress so its own
                    Cancel/Save buttons own the flow. */}
                {createSession.kind === "closed" && (
                    <div className="-mx-4 -mb-4 rounded-b-xl border-t bg-muted/40 p-3 flex items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                if (currentStep === 0) setOpen(false)
                                else setCurrentStep((s) => s - 1)
                            }}
                            disabled={isSubmitting}
                        >
                            {currentStep === 0 ? (
                                t("common.cancel")
                            ) : (
                                <>
                                    <ChevronLeft className="size-4" />
                                    {t("common.back")}
                                </>
                            )}
                        </Button>
                        {currentStep < totalSteps - 1 ? (
                            <Button
                                type="button"
                                onClick={() => setCurrentStep((s) => s + 1)}
                                disabled={!canProceed()}
                            >
                                {t("common.next")}
                                <ChevronRight className="size-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting || isAdding || !canProceed()}
                            >
                                {isSubmitting || isAdding ? (
                                    <>
                                        <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        {t("addToTimeline.adding")}
                                    </>
                                ) : (
                                    t("addToTimeline.title")
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

// ----------------------------------------------------------------------------
// Stepper
// ----------------------------------------------------------------------------

interface StepperProps {
    steps: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
    currentStep: number
    onJump: (index: number) => void
    canAdvanceTo: (index: number) => boolean
    isAdobe?: boolean
}

function Stepper({ steps, currentStep, onJump, canAdvanceTo }: StepperProps) {
    return (
        <div className="flex items-center gap-1">
            {steps.map((step, index) => {
                const Icon = step.icon
                const isCompleted = index < currentStep
                const isCurrent = index === currentStep
                const clickable = canAdvanceTo(index)
                return (
                    <React.Fragment key={step.key}>
                        <button
                            type="button"
                            onClick={() => clickable && onJump(index)}
                            disabled={!clickable}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                isCompleted
                                    ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                                    : isCurrent
                                        ? "bg-primary text-primary-foreground cursor-pointer"
                                        : (!clickable ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer")
                                }`}
                        >
                            {isCompleted ? (
                                <Check className="size-3.5" />
                            ) : (
                                <Icon className="size-3.5" />
                            )}
                            <span className="hidden sm:inline">{step.label}</span>
                        </button>
                        {index < steps.length - 1 && (
                            <div
                                className={`h-0.5 w-6 rounded-full ${isCompleted ? "bg-primary" : "bg-muted"
                                    }`}
                            />
                        )}
                    </React.Fragment>
                )
            })}
        </div>
    )
}

// ----------------------------------------------------------------------------
// Output track step
// ----------------------------------------------------------------------------

function OutputTrackStep({
    tracks,
    selected,
    onSelect,
    conflictInfo,
}: {
    tracks: TimelineInfo["outputTracks"]
    selected: string
    onSelect: (value: string) => void
    conflictInfo?: ConflictInfo | null
}) {
    const { t } = useTranslation()
    return (
        <div className="space-y-2">
            <ScrollArea className="h-[240px] rounded-md border">
                <div className="p-2 space-y-1">
                    {tracks.map((track) => (
                        <button
                            key={track.value}
                            type="button"
                            onClick={() => onSelect(track.value)}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${selected === track.value
                                ? "bg-secondary text-secondary-foreground"
                                : "hover:bg-muted"
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <span>{track.label}</span>
                                {selected === track.value && <Check className="size-4" />}
                            </div>
                        </button>
                    ))}
                </div>
            </ScrollArea>
            {conflictInfo?.hasConflicts && (
                <div className="flex items-start gap-1.5 text-red-500 text-sm">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>{t("addToTimeline.conflict.hasConflicts")}</span>
                </div>
            )}
        </div>
    )
}
