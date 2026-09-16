import * as React from "react";
import { Check, RefreshCw, Sparkles, Type } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { PresetGallery } from "@/components/captions/preset-gallery";
import type { CaptionPresetActions } from "@/components/captions/use-caption-presets";
import type { ResolveTemplatesState } from "@/components/captions/use-resolve-templates";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import type { CaptionPreset, CaptionStyle } from "@/types";

interface CaptionStyleSectionProps {
    captionStyle: CaptionStyle;
    presets: CaptionPresetActions;
    templates: ResolveTemplatesState;
    isConnected: boolean;
    /** Opens the Fusion editor. `null` means "start from the macro defaults". */
    onEditPreset: (preset: CaptionPreset | null) => void;
}

/**
 * The caption style picker: two mutually exclusive sources, then the detail
 * for whichever is chosen.
 *
 * The sources used to be two adjacent lists distinguished only by their group
 * heading, which said where each came from but never what you got. Picking a
 * source first makes the choice explicit, and leaves one obvious place to say
 * what the difference actually is.
 */
export function CaptionStyleSection({
    captionStyle,
    presets,
    templates,
    isConnected,
    onEditPreset,
}: CaptionStyleSectionProps) {
    const { t } = useTranslation();
    const updateSetting = useSettingsStore((s) => s.updateSetting);

    const source = captionStyle.source;

    const selectAutoSubs = () => {
        if (source === "autosubs") return;
        const fallback = presets.presets[0];
        if (!fallback) return;
        presets.select(fallback.id);
    };

    const selectResolve = () => {
        if (source === "resolve") return;
        const first = templates.templates[0];
        updateSetting("captionStyle", {
            source: "resolve",
            templateName: first?.value ?? "",
        });
    };

    return (
        <section className="space-y-3">
            <Label className="pl-1 text-xs text-muted-foreground">
                {t("captions.style.label")}
            </Label>

            {/* One column: the panel lives in a ~330px pane, where two cards
                side by side truncate their own titles. */}
            <div className="grid gap-2">
                <SourceCard
                    icon={<Sparkles className="size-4" />}
                    title={t("captions.style.autosubs.name")}
                    description={t("captions.style.autosubs.description")}
                    selected={source === "autosubs"}
                    disabled={templates.loaded && !templates.hasAutoSubsTemplate}
                    disabledReason={t("captions.style.autosubs.unavailable")}
                    onSelect={selectAutoSubs}
                />
                <SourceCard
                    icon={<Type className="size-4" />}
                    title={t("captions.style.resolve.name")}
                    description={t("captions.style.resolve.description")}
                    selected={source === "resolve"}
                    onSelect={selectResolve}
                />
            </div>

            {source === "autosubs" ? (
                <PresetGallery
                    presets={presets}
                    selectedPresetId={captionStyle.presetId}
                    isConnected={isConnected}
                    onEditPreset={onEditPreset}
                />
            ) : (
                <ResolveTemplateList
                    state={templates}
                    selectedTemplate={captionStyle.templateName}
                    onSelect={(templateName) =>
                        updateSetting("captionStyle", { source: "resolve", templateName })
                    }
                />
            )}
        </section>
    );
}

// ----------------------------------------------------------------------------

function SourceCard({
    icon,
    title,
    description,
    selected,
    disabled,
    disabledReason,
    onSelect,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    selected: boolean;
    disabled?: boolean;
    disabledReason?: string;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={onSelect}
            className={cn(
                "flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/50",
                disabled && "cursor-not-allowed opacity-60 hover:bg-background",
            )}
        >
            <span className="flex items-center gap-2 text-xs font-medium">
                <span className={cn(selected ? "text-primary" : "text-muted-foreground")}>
                    {icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {selected && <Check className="size-3.5 shrink-0 text-primary" />}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
                {disabled && disabledReason ? disabledReason : description}
            </span>
        </button>
    );
}

function ResolveTemplateList({
    state,
    selectedTemplate,
    onSelect,
}: {
    state: ResolveTemplatesState;
    selectedTemplate: string;
    onSelect: (templateName: string) => void;
}) {
    const { t } = useTranslation();
    const { templates, loading, loaded, error, refresh } = state;

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                <span>{t("captions.style.loading")}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-2 px-1 py-3">
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button type="button" variant="outline" size="sm" onClick={refresh}>
                    <RefreshCw className="size-3.5" />
                    {t("captions.style.refresh")}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="space-y-1">
                {loaded && templates.length === 0 && (
                    <p className="px-1 py-3 text-xs text-muted-foreground">
                        {t("captions.style.noTemplates")}
                    </p>
                )}
                {templates.map((template) => {
                    const isSelected = selectedTemplate === template.value;
                    return (
                        <button
                            key={template.value}
                            type="button"
                            onClick={() => onSelect(template.value)}
                            className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isSelected
                                    ? "border-primary bg-primary/5 text-foreground"
                                    : "border-border bg-background text-foreground hover:bg-muted/50",
                            )}
                        >
                            <span className="min-w-0 truncate">{template.label}</span>
                            {isSelected && (
                                <Check className="size-3.5 shrink-0 text-primary" />
                            )}
                        </button>
                    );
                })}
            </div>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                onClick={refresh}
            >
                <RefreshCw className="size-3.5" />
                {t("captions.style.refresh")}
            </Button>
        </div>
    );
}
