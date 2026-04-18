import { CaptionPreset } from '@/types';

const EPOCH = '1970-01-01T00:00:00.000Z';

// Built-in presets ship empty `macroSettings` so the Fusion macro's own defaults
// are used. Users can create custom presets that capture inspector values via
// the `StartPresetEdit` / `CapturePresetSettings` Resolve endpoints.
export const BUILT_IN_PRESETS: CaptionPreset[] = [
    {
        id: 'builtin:default',
        name: 'Default',
        description: 'The standard AutoSubs caption look.',
        builtIn: true,
        version: 1,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        macroSettings: {},
    },
];

export const DEFAULT_PRESET_ID = BUILT_IN_PRESETS[0].id;

export const isBuiltInPresetId = (id: string) => id.startsWith('builtin:');
