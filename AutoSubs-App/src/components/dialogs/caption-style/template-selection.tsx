import * as React from "react"
import { Check, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/animated-tabs"
import { useIntegration } from "@/contexts/IntegrationContext"
import { DEFAULT_PRESET_ID, usePresets } from "@/contexts/PresetsContext"
import { useSettings } from "@/contexts/SettingsContext"
import { CaptionPreset, Template } from "@/types"
import {
    AnimatedPresetActions,
    AnimatedPresetPicker,
} from "@/components/dialogs/caption-style/animated-preset-picker"
import {
    CreatePresetFlow,
    type CreatePresetSubmit,
} from "@/components/dialogs/caption-style/create-preset-flow"
import { cancelPresetEdit } from "@/api/resolve-api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export const ANIMATED_CAPTION_TEMPLATE = "AutoSubs Caption"

export type CaptionTemplateMode = "regular" | "animated"

export type CreatePresetSession =
    | { kind: "closed" }
    | { kind: "create" }
    | { kind: "edit"; presetId: string }

export type { CreatePresetSubmit }

export interface CaptionTemplateSelection {
    mode: CaptionTemplateMode
    templateValue: string
    presetId: string
}

interface CaptionTemplateSelectionContentProps {
    mode: CaptionTemplateMode
    onModeChange: (mode: CaptionTemplateMode) => void
    templateValue: string
    onTemplateChange: (value: string) => void
    templates: Template[]
    templatesLoading: boolean
    templatesLoaded: boolean
    templateLoadError: string | null
    presetId: string
    onPresetChange: (id: string) => void
    animatedPresets: ReturnType<typeof usePresets>["presets"]
    createSession: CreatePresetSession
    onRequestCreate: () => void
    onRequestEdit: (preset: CaptionPreset) => void
    onCreateFlowExit: () => void
    onSubmitPreset: CreatePresetSubmit
    editingInitialSettings?: Record<string, unknown>
    editingInitialName?: string
    editingInitialDescription?: string
    onDeletePreset: (id: string) => Promise<void> | void
    onDuplicatePreset: (preset: CaptionPreset) => Promise<void> | void
    onImportPreset: (json: string) => Promise<CaptionPreset>
    onExportPreset: (id: string) => string
    hasAnimatedTemplate: boolean
}

export function CaptionTemplateSelectionContent({
    mode,
    onModeChange,
    templateValue,
    onTemplateChange,
    templates,
    templatesLoading,
    templatesLoaded,
    templateLoadError,
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
}: CaptionTemplateSelectionContentProps) {
    const { t } = useTranslation()
    const { selectedIntegration } = useIntegration()

    React.useEffect(() => {
        if (templatesLoaded && mode === "animated" && !hasAnimatedTemplate) {
            onModeChange("regular")
        }
    }, [templatesLoaded, mode, hasAnimatedTemplate, onModeChange])

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

    if (!templatesLoading && templateLoadError) {
        const integrationLabel =
            selectedIntegration === "davinci"
                ? "DaVinci Resolve"
                : selectedIntegration === "premiere"
                  ? "Adobe Premiere Pro"
                  : "Adobe After Effects"
        return (
            <div className="flex h-[296px] items-center justify-center text-center text-sm font-medium text-muted-foreground">
                {t("addToTimeline.template.connectTo", {
                    integration: integrationLabel,
                    defaultValue: "Connect to {{integration}} to customise templates",
                })}
            </div>
        )
    }

    return (
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as CaptionTemplateMode)}>
            <div className="grid gap-2 sm:grid-cols-[minmax(240px,460px)_auto] sm:items-center">
                <div className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="regular">
                            {t("addToTimeline.mode.regular")}
                        </TabsTrigger>
                        <TabsTrigger value="animated" disabled={!hasAnimatedTemplate}>
                            {t("addToTimeline.mode.animated")}
                        </TabsTrigger>
                    </TabsList>
                </div>
                {(mode === "animated" || hasAnimatedTemplate) && (
                    <AnimatedPresetActions
                        onRequestCreate={onRequestCreate}
                        onImportJson={onImportPreset}
                        className={cn(
                            mode !== "animated" && "hidden sm:flex sm:invisible sm:pointer-events-none",
                        )}
                    />
                )}
            </div>

            <TabsContent value="regular" className="mt-0 -mb-4">
                <ScrollArea className="h-[296px] w-full">
                    <div className="space-y-2 pr-3">
                        {templatesLoading && (
                            <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                <span>Loading templates...</span>
                            </div>
                        )}
                        {!templatesLoading && !templateLoadError && templatesLoaded && templates.filter(t => t.value !== ANIMATED_CAPTION_TEMPLATE).map((template) => (
                            <button
                                key={template.value}
                                type="button"
                                onClick={() => onTemplateChange(template.value)}
                                className={cn(
                                    "flex min-h-[56px] w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    templateValue === template.value
                                        ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                                        : "border-border bg-background text-foreground hover:bg-muted/50",
                                )}
                            >
                                <span>{template.label}</span>
                                {templateValue === template.value && (
                                    <Check className="size-4 shrink-0" />
                                )}
                            </button>
                        ))}
                        {!templatesLoading && !templateLoadError && templatesLoaded && templates.filter(t => t.value !== ANIMATED_CAPTION_TEMPLATE).length === 0 && (
                            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                                No regular templates found.
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </TabsContent>

            <TabsContent value="animated" className="mt-0 -mb-4">
                <AnimatedPresetPicker
                    presets={animatedPresets}
                    selectedPresetId={presetId}
                    onSelect={onPresetChange}
                    onRequestEdit={onRequestEdit}
                    onDelete={onDeletePreset}
                    onExportJson={onExportPreset}
                    onDuplicate={onDuplicatePreset}
                />
            </TabsContent>
        </Tabs>
    )
}

interface CaptionTemplateSelectionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    templates: Template[]
    templatesLoading: boolean
    templatesLoaded: boolean
    onLoadTemplates?: () => Promise<Template[]>
}

export function CaptionTemplateSelectionDialog({
    open,
    onOpenChange,
    templates,
    templatesLoading,
    templatesLoaded,
    onLoadTemplates,
}: CaptionTemplateSelectionDialogProps) {
    const { t } = useTranslation()
    const { settings, updateSetting } = useSettings()
    const {
        presets,
        getPreset,
        createPreset,
        updatePreset,
        deletePreset,
        importPreset,
        exportPreset,
    } = usePresets()
    const [selection, setSelection] = React.useState<CaptionTemplateSelection>(() => ({
        mode: settings.captionMode,
        templateValue: settings.selectedTemplate.value,
        presetId: settings.presetId || DEFAULT_PRESET_ID,
    }))
    const [templateLoadError, setTemplateLoadError] = React.useState<string | null>(null)
    const [loadingTimedOut, setLoadingTimedOut] = React.useState(false)
    const [createSession, setCreateSession] = React.useState<CreatePresetSession>({ kind: "closed" })

    const [prevHydrateKey, setPrevHydrateKey] = React.useState(0)
    const hydrateKey = open ? 1 : 0
    if (hydrateKey !== prevHydrateKey) {
        setPrevHydrateKey(hydrateKey)
        if (open) {
            setSelection({
                mode: settings.captionMode,
                templateValue: settings.selectedTemplate.value,
                presetId: settings.presetId || DEFAULT_PRESET_ID,
            })
            setTemplateLoadError(null)
            setLoadingTimedOut(false)
            setCreateSession({ kind: "closed" })
        }
    }

    const effectiveTemplatesLoading = templatesLoading && !loadingTimedOut

    const shouldLoadTemplates = open && !templatesLoaded && !templatesLoading && !!onLoadTemplates
    const [prevShouldLoad, setPrevShouldLoad] = React.useState(false)
    if (shouldLoadTemplates !== prevShouldLoad) {
        setPrevShouldLoad(shouldLoadTemplates)
        if (shouldLoadTemplates) {
            setTemplateLoadError(null)
            setLoadingTimedOut(false)
        }
    }

    React.useEffect(() => {
        if (!shouldLoadTemplates) return
        let cancelled = false

        const timeoutId = setTimeout(() => {
            if (cancelled) return
            cancelled = true
            setLoadingTimedOut(true)
            setTemplateLoadError(
                "Connection timed out. Ensure your editing software is running and try again.",
            )
        }, 15000)

        onLoadTemplates()
            .catch((err) => {
                if (cancelled) return
                clearTimeout(timeoutId)
                const message = err instanceof Error ? err.message : String(err)
                setTemplateLoadError(message)
                setLoadingTimedOut(true)
            })
        return () => {
            cancelled = true
            clearTimeout(timeoutId)
        }
    }, [shouldLoadTemplates, onLoadTemplates])

    function handleOpenChange(next: boolean) {
        if (!next && createSession.kind !== "closed") {
            cancelPresetEdit().catch(() => { })
            setCreateSession({ kind: "closed" })
        }
        onOpenChange(next)
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

    function handleSave() {
        updateSetting("captionMode", selection.mode)
        if (selection.mode === "animated") {
            updateSetting("presetId", selection.presetId)
        } else {
            const matched = templates.find((tpl) => tpl.value === selection.templateValue)
            if (matched) updateSetting("selectedTemplate", matched)
        }
        onOpenChange(false)
    }

    const editingPreset = createSession.kind === "edit" ? getPreset(createSession.presetId) : undefined
    const hasAnimatedTemplate = templates.some((template) => template.value === ANIMATED_CAPTION_TEMPLATE)

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t("actionBar.subtitleStyle", "Caption Style")}</DialogTitle>
                </DialogHeader>
                <CaptionTemplateSelectionContent
                    mode={selection.mode}
                    onModeChange={(mode) => setSelection((s) => ({ ...s, mode }))}
                    templateValue={selection.templateValue}
                    onTemplateChange={(value) => setSelection((s) => ({ ...s, templateValue: value }))}
                    templates={templates}
                    templatesLoading={effectiveTemplatesLoading}
                    templatesLoaded={templatesLoaded}
                    templateLoadError={templateLoadError}
                    presetId={selection.presetId}
                    onPresetChange={(id) => setSelection((s) => ({ ...s, presetId: id, mode: "animated" }))}
                    animatedPresets={presets}
                    createSession={createSession}
                    onRequestCreate={() => setCreateSession({ kind: "create" })}
                    onRequestEdit={(p) => setCreateSession({ kind: "edit", presetId: p.id })}
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
                {createSession.kind === "closed" && (
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t("common.cancel")}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={selection.mode === "regular" ? !selection.templateValue : !selection.presetId}
                        >
                            {t("common.save", "Save")}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
