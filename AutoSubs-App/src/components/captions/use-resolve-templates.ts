import * as React from "react";
import { useTranslation } from "react-i18next";

import { useResolve } from "@/contexts/ResolveContext";
import { isAutoSubsTemplate } from "@/lib/caption-style";
import type { Template } from "@/types";

/** How long to wait for Resolve before assuming it will not answer. */
const LOAD_TIMEOUT_MS = 15000;

export interface ResolveTemplatesState {
    /** Title templates in the project's media pool, minus the AutoSubs macro. */
    templates: Template[];
    loading: boolean;
    loaded: boolean;
    error: string | null;
    /** Whether the bundled AutoSubs macro was found or imported successfully. */
    hasAutoSubsTemplate: boolean;
    refresh: () => void;
}

/**
 * Loads the project's Fusion title templates when the caption style section
 * becomes visible, and exposes an explicit refresh.
 *
 * Reading the media pool means a round trip into Resolve, so it stays lazy;
 * the timeout lives here rather than in a component so "Resolve never
 * answered" is a piece of state and not a rendering accident.
 */
export function useResolveTemplates(active: boolean): ResolveTemplatesState {
    const { t } = useTranslation();
    const {
        timelineInfo,
        templates,
        templatesLoading,
        templatesLoaded,
        refreshTemplates,
    } = useResolve();

    const [error, setError] = React.useState<string | null>(null);
    const [timedOut, setTimedOut] = React.useState(false);
    const inFlightRef = React.useRef(false);

    const timelineId = timelineInfo?.timelineId;

    const load = React.useCallback(
        async (force: boolean) => {
            if (inFlightRef.current) return;
            if (!timelineId) {
                setError(t("captions.errors.notConnected"));
                setTimedOut(true);
                return;
            }

            inFlightRef.current = true;
            setError(null);
            setTimedOut(false);

            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                setTimedOut(true);
                setError(t("captions.errors.timedOut"));
            }, LOAD_TIMEOUT_MS);

            try {
                await refreshTemplates({ force });
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setTimedOut(true);
            } finally {
                settled = true;
                clearTimeout(timeoutId);
                inFlightRef.current = false;
            }
        },
        [timelineId, refreshTemplates, t],
    );

    React.useEffect(() => {
        if (!active || templatesLoaded || templatesLoading) return;
        void load(false);
    }, [active, templatesLoaded, templatesLoading, load]);

    const refresh = React.useCallback(() => {
        void load(true);
    }, [load]);

    return {
        // The AutoSubs macro is offered as its own source, so it never appears
        // in the list of the user's own titles.
        templates: React.useMemo(
            () => templates.filter((template) => !isAutoSubsTemplate(template)),
            [templates],
        ),
        loading: templatesLoading && !timedOut,
        loaded: templatesLoaded,
        error,
        hasAutoSubsTemplate: templates.some(isAutoSubsTemplate),
        refresh,
    };
}
