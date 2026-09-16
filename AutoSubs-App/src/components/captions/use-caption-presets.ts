import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { copyFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

import { ensureCaptionPreviewDir, generatePreview } from "@/api/resolve-api";
import { usePresets } from "@/contexts/PresetsContext";
import { useSettingsStore } from "@/stores/settings-store";
import { storePresetPreview } from "@/lib/caption-previews";
import { AUTOSUBS_CAPTION_TEMPLATE } from "@/lib/caption-style";
import type { CaptionPreset } from "@/types";

export interface CaptionPresetActions {
    presets: CaptionPreset[];
    getPreset: (id: string) => CaptionPreset | undefined;
    /** Preset whose thumbnail is being rendered in Resolve right now, if any. */
    renderingPreviewId: string | null;
    select: (id: string) => void;
    duplicate: (preset: CaptionPreset) => Promise<void>;
    remove: (id: string) => Promise<void>;
    importJson: (json: string) => Promise<CaptionPreset>;
    exportJson: (id: string) => string;
    renderPreview: (preset: CaptionPreset) => Promise<void>;
}

/**
 * The preset library's actions in one place, so the gallery can take a single
 * object instead of ten callbacks threaded down from the panel.
 *
 * Selecting, duplicating and importing all also make the preset the active
 * caption style, because in every case the user has just expressed interest in
 * that specific preset and would otherwise have to click it again.
 */
export function useCaptionPresets(): CaptionPresetActions {
    const { t } = useTranslation();
    const {
        presets,
        getPreset,
        createPreset,
        deletePreset,
        importPreset,
        exportPreset,
        setPresetPreview,
    } = usePresets();
    const updateSetting = useSettingsStore((s) => s.updateSetting);

    const [renderingPreviewId, setRenderingPreviewId] = React.useState<string | null>(
        null,
    );

    const select = React.useCallback(
        (id: string) => updateSetting("captionStyle", { source: "autosubs", presetId: id }),
        [updateSetting],
    );

    const renderPreview = React.useCallback(
        async (preset: CaptionPreset) => {
            setRenderingPreviewId(preset.id);
            try {
                const dir = await ensureCaptionPreviewDir();
                const result = await generatePreview(
                    AUTOSUBS_CAPTION_TEMPLATE,
                    dir,
                    preset.macroSettings,
                );
                const file = await storePresetPreview(preset.id, result.path);
                await setPresetPreview(preset.id, file);
            } catch (err) {
                toast.error(t("captions.preset.previewFailed"));
                console.warn("Could not render preset preview:", err);
            } finally {
                setRenderingPreviewId(null);
            }
        },
        [setPresetPreview, t],
    );

    const duplicate = React.useCallback(
        async (preset: CaptionPreset) => {
            const copy = await createPreset(
                `${preset.name} copy`,
                preset.macroSettings,
                preset.description,
            );
            if (preset.previewImage) {
                // Copy the thumbnail rather than re-rendering it: the settings
                // are identical, and a render would need Resolve.
                try {
                    const dir = await ensureCaptionPreviewDir();
                    await copyFile(
                        await join(dir, preset.previewImage),
                        await join(dir, `${copy.id}.png`),
                    );
                    await setPresetPreview(copy.id, `${copy.id}.png`);
                } catch (err) {
                    console.warn("Could not copy preset preview:", err);
                }
            }
            select(copy.id);
        },
        [createPreset, setPresetPreview, select],
    );

    const importJson = React.useCallback(
        async (json: string) => {
            const imported = await importPreset(json);
            select(imported.id);
            return imported;
        },
        [importPreset, select],
    );

    return {
        presets,
        getPreset,
        renderingPreviewId,
        select,
        duplicate,
        remove: deletePreset,
        importJson,
        exportJson: exportPreset,
        renderPreview,
    };
}
