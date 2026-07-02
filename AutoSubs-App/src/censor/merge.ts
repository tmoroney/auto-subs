import { Settings } from '@/types';
import { BUILT_IN_CENSOR_LISTS } from './built-in-lists';

export function getActiveCensorWords(
    settings: Pick<Settings, 'enableCensor' | 'censoredWords' | 'activeCensorLists'>,
): string[] {
    if (!settings.enableCensor) return [];

    const custom = settings.censoredWords ?? [];
    const active = settings.activeCensorLists ?? [];

    const fromLists = BUILT_IN_CENSOR_LISTS.filter((l) => active.includes(l.id))
        .flatMap((l) => l.words);

    // Deduplicate, preserving order
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const w of [...fromLists, ...custom]) {
        const lower = w.toLowerCase().trim();
        if (lower && !seen.has(lower)) {
            seen.add(lower);
            merged.push(w);
        }
    }
    return merged;
}
