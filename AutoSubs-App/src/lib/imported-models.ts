import type { ImportedModel, Model } from "../types";

/**
 * Whisper model files the user imported from disk.
 *
 * They are used where they are saved, never copied into the model cache, and
 * listed after the built-in models. The selected model is persisted as an
 * index into that combined list, so adding or removing an imported model has
 * to keep the index pointing at the same model, and so does an update that
 * changes how many built-in models there are (the saved built-in count lets
 * loading rebase the index). That logic lives here, free of React and Tauri,
 * so it can be tested on its own.
 */

/** Prefix that keeps imported ids from colliding with catalogue ids. */
export const IMPORTED_MODEL_PREFIX = "custom:";

const FALLBACK_NAME = /^ImportedModel_(\d+)$/;

export function isImportedModelId(id: string): boolean {
  return id.startsWith(IMPORTED_MODEL_PREFIX);
}

/**
 * The name to store for an imported model: what the user typed, or
 * `ImportedModel_N` when that is blank, with N one above the highest number
 * already in use so a removed model's number isn't handed to a new one while
 * later ones remain.
 */
export function resolveImportedModelName(input: string, existing: ImportedModel[]): string {
  const name = input.trim();
  if (name) return name;
  const highest = existing.reduce((max, m) => {
    const match = FALLBACK_NAME.exec(m.name);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `ImportedModel_${highest + 1}`;
}

/** The file name at the end of `path`, on any platform. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Build the picker entry for an imported model. */
export function importedModelToModel(m: ImportedModel): Model {
  return {
    value: m.id,
    // A plain name, not an i18n key: read it with `modelLabel`.
    label: m.name,
    description: "",
    size: "",
    ramMb: 0,
    image: "/owl.png",
    details: "models.imported.details",
    badge: m.multilingual ? "models.imported.badge" : "models.imported.englishBadge",
    engine: "whisper",
    languageSupport: m.multilingual
      ? { kind: "multilingual" }
      : { kind: "single_language", language: "en" },
    accuracy: null,
    speed: null,
    bestFor: [],
    isDownloaded: true,
    importedPath: m.path,
  };
}

/**
 * The selected index after removing the imported model with `id`, given how
 * many built-in models come first. Removing the selected model falls back to
 * `defaultIndex`; removing one listed above it shifts the index down by one so
 * it stays on the same model. Returns the input unchanged for an unknown id.
 */
export function selectionAfterRemoval(
  selected: number,
  imported: ImportedModel[],
  id: string,
  builtInCount: number,
  defaultIndex: number,
): number {
  const position = imported.findIndex((m) => m.id === id);
  if (position === -1) return selected;
  const removedIndex = builtInCount + position;
  if (selected === removedIndex) return defaultIndex;
  if (selected > removedIndex) return selected - 1;
  return selected;
}

/**
 * Keep a persisted selection inside the list it indexes. Settings saved before
 * an imported model was lost (or hand-edited) could point past the end.
 */
export function clampModelIndex(selected: unknown, total: number, defaultIndex: number): number {
  return typeof selected === "number" && Number.isInteger(selected) && selected >= 0 && selected < total
    ? selected
    : defaultIndex;
}

/**
 * The persisted selection and imported models, cleaned up for loading.
 *
 * The built-in catalogue changes size between releases, so the saved index is
 * read against `savedBase`, the built-in count of the version that wrote it,
 * and rebased onto `builtInCount`. Malformed entries are dropped, which moves
 * the ones after them, so a saved imported selection is re-found by entry
 * rather than kept as a number. A dropped entry, an index outside the list, or
 * a built-in selection the catalogue no longer reaches falls back to
 * `defaultIndex`. A `savedBase` that isn't a non-negative integer (files from
 * before it was saved, which have no imported models) counts as `builtInCount`.
 */
export function restoreImportedSelection(
  selected: unknown,
  rawImported: unknown,
  savedBase: unknown,
  builtInCount: number,
  defaultIndex: number,
): { model: number; importedModels: ImportedModel[] } {
  const importedModels = sanitizeImportedModels(rawImported);
  const base = isIndex(savedBase) ? savedBase : builtInCount;
  if (!isIndex(selected)) return { model: defaultIndex, importedModels };
  if (selected >= base) {
    const entry = Array.isArray(rawImported) ? rawImported[selected - base] : undefined;
    const position = importedModels.findIndex((m) => m === entry);
    return { model: position === -1 ? defaultIndex : builtInCount + position, importedModels };
  }
  return { model: selected < builtInCount ? selected : defaultIndex, importedModels };
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Drop persisted entries that don't have the shape this version expects. */
export function sanitizeImportedModels(value: unknown): ImportedModel[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is ImportedModel =>
      !!m &&
      typeof m === "object" &&
      typeof m.id === "string" &&
      isImportedModelId(m.id) &&
      typeof m.name === "string" &&
      typeof m.path === "string" &&
      typeof m.multilingual === "boolean",
  );
}
