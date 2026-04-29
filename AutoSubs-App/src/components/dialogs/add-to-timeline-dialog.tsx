import * as React from "react"
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/animated-tabs"
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
import { Settings, Speaker, TimelineInfo } from "@/types"
import { useTranscript } from "@/contexts/TranscriptContext"
import { usePresets, DEFAULT_PRESET_ID } from "@/contexts/PresetsContext"
import { useSettings } from "@/contexts/SettingsContext"
import { SpeakerSettings } from "@/components/common/speaker-settings"
import { AnimatedPresetPicker } from "@/components/dialogs/add-to-timeline/animated-preset-picker"
import {
    CreatePresetFlow,
    CreatePresetSubmit,
} from "@/components/dialogs/add-to-timeline/create-preset-flow"
import {
    cancelPresetEdit,
    checkTrackConflicts,
    type ConflictInfo,
} from "@/api/resolve-api"
import { toast } from "sonner"

const ANIMATED_CAPTION_TEMPLATE = "AutoSubs Caption"

type Mode = "regular" | "animated"

interface Selection {
    mode: Mode
    templateValue: string  // used when mode === 'regular'
    presetId: string       // used when mode === 'animated'
    outputTrack: string
}

type CreateSession =
    | { kind: "closed" }
    | { kind: "create" }
    | { kind: "edit"; presetId: string }

interface AddToTimelineDialogProps {
    children: React.ReactNode
    settings: Settings
    timelineInfo: TimelineInfo
    onAddToTimeline: (
        selectedOutputTrack: string,
        selectedTemplate: string,
        presetSettings?: Record<string, unknown>,
    ) => Promise<void>
    isAdding?: boolean
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
    onAddToTimeline,
    isAdding = false,
}: AddToTimelineDialogProps) {
    const { t } = useTranslation()
    const { speakers, updateSpeakers, currentTranscriptFilename } = useTranscript()
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
    const [createSession, setCreateSession] = React.useState<CreateSession>({ kind: "closed" })
    const [conflictInfo, setConflictInfo] = React.useState<ConflictInfo | null>(null)

    // Only show the speakers step when we actually have speakers to configure.
    const hasSpeakers = speakers.length > 0
    const activeSteps = React.useMemo<ReadonlyArray<typeof STEPS[number]>>(
        () => (hasSpeakers ? STEPS : [STEPS[0], STEPS[1]]),
        [hasSpeakers],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // Check for track conflicts whenever the selected output track changes.
    React.useEffect(() => {
        if (!open || !currentTranscriptFilename || !selection.outputTrack) {
            setConflictInfo(null)
            return
        }
        let cancelled = false
        checkTrackConflicts(currentTranscriptFilename, selection.outputTrack)
            .then((info) => {
                if (!cancelled) setConflictInfo(info)
            })
            .catch((err) => {
                console.warn("Track conflict check failed:", err)
                if (!cancelled) setConflictInfo(null)
            })
        return () => { cancelled = true }
    }, [open, selection.outputTrack, currentTranscriptFilename])

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
            const matched = timelineInfo.templates.find(
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
    const hasAnimatedTemplate = timelineInfo.templates.some(
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
                />

                {/* Step body */}
                <div className="py-1 min-h-[280px]">
                    {activeSteps[currentStep]?.key === "template" && (
                        <TemplateStep
                            mode={selection.mode}
                            onModeChange={(mode) =>
                                setSelection((s) => ({ ...s, mode }))
                            }
                            templateValue={selection.templateValue}
                            onTemplateChange={(value) =>
                                setSelection((s) => ({ ...s, templateValue: value }))
                            }
                            templates={timelineInfo.templates}
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
                                    <div className="rounded-sm border p-3 bg-card">
                                        <SpeakerSettings
                                            key={index}
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
                                    <ChevronLeft className="w-4 h-4" />
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
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting || isAdding || !canProceed()}
                            >
                                {isSubmitting || isAdding ? (
                                    <>
                                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${isCompleted
                                ? "bg-primary/10 text-primary hover:bg-primary/20"
                                : isCurrent
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                } ${!clickable && !isCurrent ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                            {isCompleted ? (
                                <Check className="w-3.5 h-3.5" />
                            ) : (
                                <Icon className="w-3.5 h-3.5" />
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
// Template step
// ----------------------------------------------------------------------------

interface TemplateStepProps {
    mode: Mode
    onModeChange: (mode: Mode) => void
    templateValue: string
    onTemplateChange: (value: string) => void
    templates: TimelineInfo["templates"]
    presetId: string
    onPresetChange: (id: string) => void
    animatedPresets: ReturnType<typeof usePresets>["presets"]
    createSession: CreateSession
    onRequestCreate: () => void
    onRequestEdit: (preset: import("@/types").CaptionPreset) => void
    onCreateFlowExit: () => void
    onSubmitPreset: CreatePresetSubmit
    editingInitialSettings?: Record<string, unknown>
    editingInitialName?: string
    editingInitialDescription?: string
    onDeletePreset: (id: string) => Promise<void>
    onDuplicatePreset: (preset: import("@/types").CaptionPreset) => Promise<void> | void
    onImportPreset: (json: string) => Promise<import("@/types").CaptionPreset>
    onExportPreset: (id: string) => string
    hasAnimatedTemplate: boolean
}

function TemplateStep({
    mode,
    onModeChange,
    templateValue,
    onTemplateChange,
    templates,
    presetId,
    onPresetChange,
    animatedPresets,
    createSession,
    onRequestCreate,
    onRequestEdit,
    onCreateFlowExit,
    onSubmitPreset,
    editingInitialSettings,
    editingInitialName,
    editingInitialDescription,
    onDeletePreset,
    onDuplicatePreset,
    onImportPreset,
    onExportPreset,
    hasAnimatedTemplate,
}: TemplateStepProps) {
    const { t } = useTranslation()

    // If animated mode is selected but the template is not available, switch to regular mode
    React.useEffect(() => {
        if (mode === "animated" && !hasAnimatedTemplate) {
            onModeChange("regular")
        }
    }, [mode, hasAnimatedTemplate, onModeChange])

    if (createSession.kind !== "closed") {
        return (
            <CreatePresetFlow
                key={createSession.kind === "edit" ? createSession.presetId : "create"}
                initialSettings={editingInitialSettings}
                initialName={editingInitialName}
                initialDescription={editingInitialDescription}
                onSubmit={onSubmitPreset}
                onExit={onCreateFlowExit}
            />
        )
    }

    return (
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as Mode)}>
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="regular">
                    {t("addToTimeline.mode.regular")}
                </TabsTrigger>
                <TabsTrigger value="animated" disabled={!hasAnimatedTemplate}>
                    {t("addToTimeline.mode.animated")}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="regular" className="space-y-3">
                <ScrollArea className="h-[240px] rounded-md border">
                    <div className="p-2 space-y-1">
                        {templates.filter(t => t.value !== ANIMATED_CAPTION_TEMPLATE).map((template) => (
                            <button
                                key={template.value}
                                type="button"
                                onClick={() => onTemplateChange(template.value)}
                                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${templateValue === template.value
                                    ? "bg-secondary text-secondary-foreground"
                                    : "hover:bg-muted"
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span>{template.label}</span>
                                    {templateValue === template.value && (
                                        <Check className="h-4 w-4" />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </TabsContent>

            <TabsContent value="animated" className="space-y-3">
                <AnimatedPresetPicker
                    presets={animatedPresets}
                    selectedPresetId={presetId}
                    onSelect={onPresetChange}
                    onRequestCreate={onRequestCreate}
                    onRequestEdit={onRequestEdit}
                    onDelete={onDeletePreset}
                    onImportJson={onImportPreset}
                    onExportJson={onExportPreset}
                    onDuplicate={onDuplicatePreset}
                />
            </TabsContent>
        </Tabs>
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
                                {selected === track.value && <Check className="h-4 w-4" />}
                            </div>
                        </button>
                    ))}
                </div>
            </ScrollArea>
            {conflictInfo?.hasConflicts && (
                <div className="flex items-start gap-1.5 text-red-500 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t("addToTimeline.conflict.hasConflicts")}</span>
                </div>
            )}
        </div>
    )
}
