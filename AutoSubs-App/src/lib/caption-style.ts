import type { CaptionPreset, CaptionStyle, Template } from "@/types";

/**
 * Display name of the bundled Fusion macro template in Resolve's media pool.
 *
 * The clip itself is versioned ("AutoSubs Caption 2026-01-01"); the Lua server
 * maps this display name onto whichever version is installed, so this is the
 * only form the frontend ever needs to know.
 */
export const AUTOSUBS_CAPTION_TEMPLATE = "AutoSubs Caption";

/** What the Lua server needs in order to place captions for a given style. */
export interface ResolvedCaptionStyle {
    templateName: string;
    /** Macro input values. Only meaningful for the AutoSubs macro. */
    presetSettings?: Record<string, unknown>;
}

export function resolveCaptionStyle(
    style: CaptionStyle,
    getPreset: (id: string) => CaptionPreset | undefined,
): ResolvedCaptionStyle {
    if (style.source === "resolve") {
        return { templateName: style.templateName };
    }
    return {
        templateName: AUTOSUBS_CAPTION_TEMPLATE,
        presetSettings: getPreset(style.presetId)?.macroSettings,
    };
}

/**
 * Label for the summary bar. Falls back to the style's own identifier so a
 * preset deleted on another machine still reads as something, rather than
 * leaving the summary silently blank.
 */
export function describeCaptionStyle(
    style: CaptionStyle,
    getPreset: (id: string) => CaptionPreset | undefined,
    fallback: string,
): string {
    if (style.source === "resolve") {
        return style.templateName || fallback;
    }
    return getPreset(style.presetId)?.name ?? fallback;
}

/**
 * Whether the selected style can actually be sent right now. A saved selection
 * outlives the project it was made in: presets are deleted, and templates live
 * in a media pool that changes when the user switches project.
 *
 * Templates are only judged once they have loaded, because an empty list
 * during loading is indistinguishable from a genuinely missing template, and
 * reporting "unavailable" for a second of loading is worse than staying quiet.
 */
export function isStyleAvailable(
    style: CaptionStyle,
    presets: CaptionPreset[],
    templates: Template[],
    templatesLoaded: boolean,
): boolean {
    if (style.source === "autosubs") {
        return presets.some((preset) => preset.id === style.presetId);
    }
    if (!templatesLoaded) return true;
    return templates.some((template) => template.value === style.templateName);
}

/** True when this template entry is the bundled AutoSubs macro. */
export const isAutoSubsTemplate = (template: Template) =>
    template.value === AUTOSUBS_CAPTION_TEMPLATE;
