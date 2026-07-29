import * as React from "react"
import { Check, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useIntegration } from "@/contexts/IntegrationContext"
import { CaptionPreset, Template } from "@/types"
import {
    AnimatedPresetPicker,
} from "@/components/dialogs/caption-style/animated-preset-picker"
import { usePresets } from "@/contexts/PresetsContext"
import {
    CreatePresetFlow,
    type CreatePresetSubmit,
} from "@/components/dialogs/caption-style/create-preset-flow"
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

    const regularTemplates = templates.filter(
        (tpl) => tpl.value !== ANIMATED_CAPTION_TEMPLATE,
    )

    // One list, grouped — rather than a mode switch the user has to understand
    // before they can browse. Picking an item implies its mode.
    return (
        <div className="space-y-3">
            <section className="space-y-1.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("addToTimeline.mode.regular")}
                </h4>
                {templatesLoading && (
                    <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>{t("output.style.loading", "Loading templates...")}</span>
                    </div>
                )}
                {!templatesLoading && templatesLoaded && regularTemplates.length === 0 && (
                    <p className="px-1 py-3 text-xs text-muted-foreground">
                        {t("output.style.noTemplates", "No templates found.")}
                    </p>
                )}
                <div className="space-y-1">
                    {!templatesLoading &&
                        templatesLoaded &&
                        regularTemplates.map((template) => {
                            const isSelected =
                                mode === "regular" && templateValue === template.value
                            return (
                                <button
                                    key={template.value}
                                    type="button"
                                    onClick={() => onTemplateChange(template.value)}
                                    className={cn(
                                        "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isSelected
                                            ? "border-primary bg-primary/5 text-foreground"
                                            : "border-border bg-background text-foreground hover:bg-muted/50",
                                    )}
                                >
                                    <span className="min-w-0 truncate">{template.label}</span>
                                    {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
                                </button>
                            )
                        })}
                </div>
            </section>

            {hasAnimatedTemplate && (
                <section className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("addToTimeline.mode.animated")}
                    </h4>
                    <AnimatedPresetPicker
                        presets={animatedPresets}
                        selectedPresetId={mode === "animated" ? presetId : ""}
                        onSelect={onPresetChange}
                        onRequestEdit={onRequestEdit}
                        onDelete={onDeletePreset}
                        onExportJson={onExportPreset}
                        onDuplicate={onDuplicatePreset}
                        onImportJson={onImportPreset}
                        onRequestCreate={onRequestCreate}
                    />
                </section>
            )}
        </div>
    )

}
