import * as React from "react";
import { AlertCircle, MonitorPlay } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
    cancelPresetEdit,
    ensureCaptionPreviewDir,
    openPresetEdit,
    savePresetEdit,
} from "@/api/resolve-api";
import { usePresets } from "@/contexts/PresetsContext";
import { useSettingsStore } from "@/stores/settings-store";
import { storePresetPreview } from "@/lib/caption-previews";
import type { CaptionPreset } from "@/types";

interface FusionPresetEditorProps {
    /** Preset being edited, or `null` to start from the macro's defaults. */
    preset: CaptionPreset | null;
    onDone: () => void;
}

type Phase = "opening" | "editing" | "saving";

/**
 * Editing wrapper around Fusion.
 *
 * The caption's look is edited in Resolve, where the macro's own inspector
 * lives and where the animation actually plays. AutoSubs holds the clip open
 * for the whole session and keeps just the library concerns: what this style
 * is called, and whether to keep it.
 *
 * There is deliberately no "capture settings" step. The session stays live, so
 * Save reads the values whenever the user is ready.
 */
export function FusionPresetEditor({ preset, onDone }: FusionPresetEditorProps) {
    const { t } = useTranslation();
    const { createPreset, updatePreset, setPresetPreview } = usePresets();
    const updateSetting = useSettingsStore((s) => s.updateSetting);

    const [phase, setPhase] = React.useState<Phase>("opening");
    const [error, setError] = React.useState<string | null>(null);
    const [name, setName] = React.useState(preset?.name ?? "");
    const [description, setDescription] = React.useState(preset?.description ?? "");

    // Tracks whether Resolve still holds a clip for us, so every exit path
    // (Cancel, unmount, the panel closing underneath us) can clean it up.
    const hasSessionRef = React.useRef(false);
    // React 18 StrictMode double-mounts in dev, which would otherwise open two
    // sessions and leave one stranded.
    const didOpenRef = React.useRef(false);

    React.useEffect(() => {
        if (didOpenRef.current) return;
        didOpenRef.current = true;

        openPresetEdit(preset?.macroSettings)
            .then((result) => {
                if (result.error) {
                    setError(result.error);
                    return;
                }
                hasSessionRef.current = true;
                setPhase("editing");
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));

        return () => {
            if (!hasSessionRef.current) return;
            // Fire and forget: we are unmounting and cannot await.
            cancelPresetEdit().catch(() => {});
            hasSessionRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleCancel() {
        if (hasSessionRef.current) {
            hasSessionRef.current = false;
            await cancelPresetEdit().catch(() => {});
        }
        onDone();
    }

    async function handleSave() {
        const trimmed = name.trim();
        if (!trimmed) {
            setError(t("captions.preset.errors.nameRequired"));
            return;
        }

        setPhase("saving");
        setError(null);

        let exportDir: string | undefined;
        try {
            exportDir = await ensureCaptionPreviewDir();
        } catch (err) {
            console.warn("Preset preview directory unavailable:", err);
        }

        const result = await savePresetEdit(exportDir).catch((err) => ({
            error: err instanceof Error ? err.message : String(err),
        }));

        // `SavePresetEdit` closes the session on both its success and error
        // paths, so the clip is gone either way.
        hasSessionRef.current = false;

        if ("error" in result && result.error) {
            setError(result.error);
            setPhase("editing");
            return;
        }

        const { settings, previewPath, previewError } =
            result as Awaited<ReturnType<typeof savePresetEdit>>;
        if (previewError) console.warn("Preset preview render failed:", previewError);

        if (!settings) {
            setError(t("captions.preset.errors.captureFailed"));
            setPhase("editing");
            return;
        }

        try {
            let id: string;
            if (preset) {
                id = preset.id;
                await updatePreset(id, { name: trimmed, description, macroSettings: settings });
            } else {
                id = (await createPreset(trimmed, settings, description)).id;
            }

            if (previewPath) {
                try {
                    await setPresetPreview(id, await storePresetPreview(id, previewPath));
                } catch (err) {
                    console.warn("Could not store preset preview:", err);
                }
            }

            updateSetting("captionStyle", { source: "autosubs", presetId: id });
            onDone();
        } catch (err: any) {
            setError(err?.message ?? "Failed to save preset");
            setPhase("editing");
        }
    }

    const busy = phase !== "editing";

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium">
                {preset
                    ? t("captions.preset.editTitle")
                    : t("captions.preset.createTitle")}
            </h3>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="rounded-lg border bg-muted/40 p-5">
                <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-md border bg-background p-2">
                        {busy ? (
                            <Spinner className="size-6 text-primary" />
                        ) : (
                            <MonitorPlay className="size-6 text-primary" />
                        )}
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-sm font-medium">
                            {phase === "opening"
                                ? t("captions.preset.phase.openingTitle")
                                : phase === "saving"
                                  ? t("captions.preset.phase.savingTitle")
                                  : t("captions.preset.phase.editingTitle")}
                        </h4>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            {phase === "saving"
                                ? t("captions.preset.phase.savingBody")
                                : t("captions.preset.phase.editingBody")}
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs" htmlFor="preset-name-input">
                    {t("captions.preset.nameLabel")}
                </Label>
                <Input
                    id="preset-name-input"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("captions.preset.namePlaceholder")}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !busy) void handleSave();
                    }}
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs" htmlFor="preset-desc-input">
                    {t("captions.preset.descriptionLabel")}
                </Label>
                <Textarea
                    id="preset-desc-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("captions.preset.descriptionPlaceholder")}
                    rows={2}
                />
            </div>

            <div className="flex items-center justify-between gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={phase === "saving"}
                >
                    {t("captions.preset.action.cancel")}
                </Button>
                <Button type="button" onClick={handleSave} disabled={busy}>
                    {phase === "saving" && <Spinner className="size-3.5" />}
                    {phase === "saving"
                        ? t("captions.preset.action.saving")
                        : t("captions.preset.action.save")}
                </Button>
            </div>
        </div>
    );
}
