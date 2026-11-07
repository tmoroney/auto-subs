import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { load, Store } from '@tauri-apps/plugin-store';
import { CaptionPreset } from '@/types';
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID, isBuiltInPresetId } from '@/presets/built-in-presets';
import {
    deletePresetPreview,
    isValidPresetId,
    isValidPresetPreviewFilename,
} from '@/lib/caption-previews';
import { parseImportedPreset } from '@/lib/preset-import';

export { parseImportedPreset } from '@/lib/preset-import';

const STORE_FILE = 'autosubs-presets.json';
const STORE_KEY = 'userPresets';
const PREVIEW_IMAGES_KEY = 'previewImages';

type PreviewImageRecord = { file: string; updatedAt: string };
type PreviewImages = Record<string, PreviewImageRecord>;

interface PresetsContextType {
    presets: CaptionPreset[];          // merged, user presets first
    userPresets: CaptionPreset[];
    isHydrated: boolean;
    getPreset: (id: string) => CaptionPreset | undefined;
    createPreset: (name: string, macroSettings: Record<string, unknown>, description?: string) => Promise<CaptionPreset>;
    updatePreset: (id: string, patch: Partial<Pick<CaptionPreset, 'name' | 'description' | 'macroSettings'>>) => Promise<void>;
    deletePreset: (id: string) => Promise<void>;
    setPresetPreview: (id: string, filename: string) => Promise<void>;
    importPreset: (json: string) => Promise<CaptionPreset>;
    exportPreset: (id: string) => string;
}

const PresetsContext = createContext<PresetsContextType | null>(null);

function genId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
    return new Date().toISOString();
}

export function PresetsProvider({ children }: { children: React.ReactNode }) {
    const [store, setStore] = useState<Store | null>(null);
    const [userPresets, setUserPresets] = useState<CaptionPreset[]>([]);
    const [previewImages, setPreviewImages] = useState<PreviewImages>({});
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const loaded = await load(STORE_FILE, { autoSave: false });
                if (cancelled) return;
                setStore(loaded);
                const stored = await loaded.get<CaptionPreset[]>(STORE_KEY);
                const storedPreviews = await loaded.get<PreviewImages>(PREVIEW_IMAGES_KEY);
                if (cancelled) return;
                if (Array.isArray(stored)) {
                    // Defensive: strip any accidental built-ins the user might have tried to overwrite
                    setUserPresets(stored.filter((p) => p && !p.builtIn && !isBuiltInPresetId(p.id)));
                }
                if (storedPreviews && typeof storedPreviews === 'object') {
                    // Sentinel Security: Sanitize stored preview images against path traversal
                    const sanitized: PreviewImages = {};
                    for (const [k, v] of Object.entries(storedPreviews)) {
                        if (isValidPresetId(k) && v && isValidPresetPreviewFilename(v.file)) {
                            sanitized[k] = v;
                        }
                    }
                    setPreviewImages(sanitized);
                }
            } catch (err) {
                console.error('Failed to load presets store:', err);
            } finally {
                if (!cancelled) setIsHydrated(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    async function persist(next: CaptionPreset[]) {
        setUserPresets(next);
        if (!store) return;
        try {
            await store.set(STORE_KEY, next);
            await store.save();
        } catch (err) {
            console.error('Failed to persist presets:', err);
        }
    }

    async function persistPreviewImages(next: PreviewImages) {
        setPreviewImages(next);
        if (!store) return;
        try {
            await store.set(PREVIEW_IMAGES_KEY, next);
            await store.save();
        } catch (err) {
            console.error('Failed to persist preset previews:', err);
        }
    }

    const presets = useMemo<CaptionPreset[]>(
        () => [...userPresets, ...BUILT_IN_PRESETS].map((preset) => {
            const preview = previewImages[preset.id];
            return preview
                ? { ...preset, previewImage: preview.file, previewUpdatedAt: preview.updatedAt }
                : preset;
        }),
        [userPresets, previewImages],
    );

    const getPreset = (id: string) => presets.find((p) => p.id === id);

    async function createPreset(
        name: string,
        macroSettings: Record<string, unknown>,
        description?: string,
    ): Promise<CaptionPreset> {
        const now = nowIso();
        const preset: CaptionPreset = {
            id: genId(),
            name: name.trim() || 'Untitled preset',
            description,
            builtIn: false,
            version: 1,
            createdAt: now,
            updatedAt: now,
            macroSettings,
        };
        await persist([...userPresets, preset]);
        return preset;
    }

    async function updatePreset(
        id: string,
        patch: Partial<Pick<CaptionPreset, 'name' | 'description' | 'macroSettings'>>,
    ) {
        if (isBuiltInPresetId(id)) return; // no-op on built-ins
        const next = userPresets.map((p) =>
            p.id === id
                ? {
                      ...p,
                      ...patch,
                      name: patch.name?.trim() || p.name,
                      updatedAt: nowIso(),
                  }
                : p,
        );
        await persist(next);
    }

    async function deletePreset(id: string) {
        if (isBuiltInPresetId(id)) return;
        const preview = previewImages[id];
        await persist(userPresets.filter((p) => p.id !== id));
        if (preview) {
            await deletePresetPreview(preview.file);
            const next = { ...previewImages };
            delete next[id];
            await persistPreviewImages(next);
        }
    }

    async function setPresetPreview(id: string, filename: string) {
        // Sentinel Security: Validate preset ID and preview filename before storing
        if (!isValidPresetId(id)) {
            throw new Error(`[file-security] Invalid preset id: "${id}"`);
        }
        if (!isValidPresetPreviewFilename(filename)) {
            throw new Error(`[file-security] Invalid preset preview filename: "${filename}"`);
        }
        await persistPreviewImages({
            ...previewImages,
            [id.trim()]: { file: filename.trim(), updatedAt: nowIso() },
        });
    }

    async function importPreset(json: string): Promise<CaptionPreset> {
        const preset = parseImportedPreset(json);
        await persist([...userPresets, preset]);
        return preset;
    }

    function exportPreset(id: string): string {
        const p = getPreset(id);
        if (!p) throw new Error('Preset not found.');
        // Strip instance-specific fields so the export is a clean "template".
        const { id: _id, createdAt: _c, updatedAt: _u, builtIn: _b, ...rest } = p;
        return JSON.stringify(rest, null, 2);
    }

    return (
        <PresetsContext.Provider
            value={{
                presets,
                userPresets,
                isHydrated,
                getPreset,
                createPreset,
                updatePreset,
                deletePreset,
                setPresetPreview,
                importPreset,
                exportPreset,
            }}
        >
            {children}
        </PresetsContext.Provider>
    );
}

export function usePresets() {
    const ctx = useContext(PresetsContext);
    if (!ctx) throw new Error('usePresets must be used within a PresetsProvider');
    return ctx;
}

export { DEFAULT_PRESET_ID };
