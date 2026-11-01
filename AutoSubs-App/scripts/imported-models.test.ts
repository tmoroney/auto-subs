import assert from 'node:assert/strict';
import {
    clampModelIndex,
    fileNameOf,
    importedModelToModel,
    isImportedModelId,
    resolveImportedModelName,
    restoreImportedSelection,
    sanitizeImportedModels,
    selectionAfterRemoval,
} from '../src/lib/imported-models.ts';
import { tryClaimRun } from '../src/lib/run-lock.ts';
import type { ImportedModel } from '../src/types.ts';

const imported = (n: number, name = `Model ${n}`): ImportedModel =>
    ({ id: `custom:${n}`, name, path: `/models/${n}.bin`, multilingual: true });

// #413: a blank name falls back to ImportedModel_N, one above the highest in use.
assert.equal(resolveImportedModelName('  NB Whisper Small ', []), 'NB Whisper Small');
assert.equal(resolveImportedModelName('', []), 'ImportedModel_1');
assert.equal(resolveImportedModelName('   \t', []), 'ImportedModel_1');
assert.equal(resolveImportedModelName('', [imported(1, 'ImportedModel_1'), imported(2, 'Norsk')]), 'ImportedModel_2');
// After ImportedModel_1 is removed, ImportedModel_3 still exists: the next is 4, not 1.
assert.equal(resolveImportedModelName('', [imported(2, 'ImportedModel_2'), imported(3, 'ImportedModel_3')]), 'ImportedModel_4');
// Names that only look similar don't count.
assert.equal(resolveImportedModelName('', [imported(1, 'ImportedModel_9 copy'), imported(2, 'importedmodel_5')]), 'ImportedModel_1');

// Removing the selected model resets to the default.
const list = [imported(1), imported(2), imported(3)];
const builtIn = 10;
assert.equal(selectionAfterRemoval(11, list, 'custom:2', builtIn, 0), 0);
// Removing one listed above the selection moves the index down to stay on the same model.
assert.equal(selectionAfterRemoval(12, list, 'custom:1', builtIn, 0), 11);
assert.equal(selectionAfterRemoval(12, list, 'custom:2', builtIn, 0), 11);
// Removing one listed below the selection leaves it alone, built-in or imported.
assert.equal(selectionAfterRemoval(4, list, 'custom:1', builtIn, 0), 4);
assert.equal(selectionAfterRemoval(10, list, 'custom:3', builtIn, 0), 10);
// An unknown id changes nothing.
assert.equal(selectionAfterRemoval(12, list, 'custom:404', builtIn, 0), 12);

// A persisted index outside the list falls back to the default.
assert.equal(clampModelIndex(3, 5, 0), 3);
assert.equal(clampModelIndex(5, 5, 0), 0);
assert.equal(clampModelIndex(-1, 5, 0), 0);
assert.equal(clampModelIndex(1.5, 5, 0), 0);
assert.equal(clampModelIndex('2', 5, 0), 0);
assert.equal(clampModelIndex(undefined, 5, 0), 0);

// Persisted entries with the wrong shape are dropped.
assert.deepEqual(sanitizeImportedModels(undefined), []);
assert.deepEqual(sanitizeImportedModels('nope'), []);
assert.deepEqual(
    sanitizeImportedModels([imported(1), null, { id: 'small', name: 'x', path: '/x', multilingual: true },
        { id: 'custom:9', name: 'x', path: '/x' }]),
    [imported(1)],
);

// Picker entries: downloaded, Whisper, English-only from the header flag, label kept raw.
assert.equal(isImportedModelId('custom:abc'), true);
assert.equal(isImportedModelId('large-v3'), false);
const english = importedModelToModel({ ...imported(1, 'nb: small.en'), multilingual: false });
assert.equal(english.label, 'nb: small.en');
assert.equal(english.isDownloaded, true);
assert.equal(english.engine, 'whisper');
assert.equal(english.importedPath, '/models/1.bin');
assert.deepEqual(english.languageSupport, { kind: 'single_language', language: 'en' });
assert.equal(english.accuracy, null);
assert.equal(english.speed, null);
assert.deepEqual(importedModelToModel(imported(2)).languageSupport, { kind: 'multilingual' });

assert.equal(fileNameOf('/Users/me/nb-whisper-small/ggml-model.bin'), 'ggml-model.bin');
assert.equal(fileNameOf('C:\\Models\\ggml-model-q5_0.bin'), 'ggml-model-q5_0.bin');

// Loading settings: dropping a malformed entry must not move the selection onto
// a different model. With [null, A, B], the saved index for A is builtIn + 1.
const A = imported(1, 'A');
const B = imported(2, 'B');
const saved = [null, A, B];
assert.deepEqual(restoreImportedSelection(builtIn + 1, saved, builtIn, builtIn, 0), { model: builtIn, importedModels: [A, B] });
assert.deepEqual(restoreImportedSelection(builtIn + 2, saved, builtIn, builtIn, 0), { model: builtIn + 1, importedModels: [A, B] });
// The selection was the malformed entry itself: back to the default.
assert.equal(restoreImportedSelection(builtIn, saved, builtIn, builtIn, 0).model, 0);
// Past the end, or with no imported list at all: back to the default.
assert.equal(restoreImportedSelection(builtIn + 3, saved, builtIn, builtIn, 0).model, 0);
assert.deepEqual(restoreImportedSelection(builtIn, undefined, builtIn, builtIn, 0), { model: 0, importedModels: [] });
// Built-in selections are untouched; invalid ones fall back.
assert.equal(restoreImportedSelection(4, saved, builtIn, builtIn, 0).model, 4);
assert.equal(restoreImportedSelection(-1, saved, builtIn, builtIn, 0).model, 0);
assert.equal(restoreImportedSelection('3', saved, builtIn, builtIn, 0).model, 0);
// Nothing malformed: every index stays where it was.
assert.equal(restoreImportedSelection(builtIn + 1, [A, B], builtIn, builtIn, 0).model, builtIn + 1);

// An app update changes how many built-in models there are. The saved index is
// read against the built-in count it was saved with and rebased onto today's.
// Grows by one: imported selections stay on the same entry.
assert.deepEqual(restoreImportedSelection(26, [A, B], 26, 27, 0), { model: 27, importedModels: [A, B] });
assert.equal(restoreImportedSelection(27, [A, B], 26, 27, 0).model, 28);
// Shrinks by one: still the same entry.
assert.equal(restoreImportedSelection(27, [A, B], 26, 25, 0).model, 26);
assert.equal(restoreImportedSelection(26, [A, B], 26, 25, 0).model, 25);
// Shrinks past a built-in selection: the default, never the first imported model.
assert.equal(restoreImportedSelection(25, [A, B], 26, 25, 0).model, 0);
assert.equal(restoreImportedSelection(25, [A, B], 26, 25, 3).model, 3);
// Built-in selections the catalogue still reaches are kept as they are.
assert.equal(restoreImportedSelection(24, [A, B], 26, 25, 0).model, 24);
assert.equal(restoreImportedSelection(25, [A, B], 26, 27, 0).model, 25);
// The catalogue changes and a malformed entry before the selection is dropped:
// both shifts apply. With [null, A, B] saved on base 26, B was 28.
assert.equal(restoreImportedSelection(28, saved, 26, 27, 0).model, 28);
assert.equal(restoreImportedSelection(27, saved, 26, 27, 0).model, 27);
assert.equal(restoreImportedSelection(28, saved, 26, 25, 0).model, 26);
// The selection was the dropped entry: the default.
assert.equal(restoreImportedSelection(26, saved, 26, 25, 0).model, 0);
// No saved base (files from before it existed) or an invalid one counts as
// today's built-in count.
for (const base of [undefined, -1, '26', 1.5, null, NaN]) {
    assert.equal(restoreImportedSelection(27, [A, B], base, 27, 0).model, 27);
    assert.equal(restoreImportedSelection(28, [A, B], base, 27, 0).model, 28);
    assert.equal(restoreImportedSelection(29, [A, B], base, 27, 0).model, 0);
    assert.equal(restoreImportedSelection(4, [A, B], base, 27, 0).model, 4);
}
// Nothing changed: same base, same index.
assert.equal(restoreImportedSelection(27, [A, B], 26, 26, 0).model, 27);
assert.equal(restoreImportedSelection(5, [A, B], 26, 26, 0).model, 5);

// Generate: a second click while the first run (or its model file check) is
// still in flight can't start another run; once released, it can.
const lock = { current: false };
const release = tryClaimRun(lock);
assert.ok(release);
assert.equal(tryClaimRun(lock), null);
release();
const again = tryClaimRun(lock);
assert.ok(again);
// The first run finishing later (a second release) must not free the lock the
// newer run holds, or a third click could start alongside it.
release();
assert.equal(lock.current, true);
assert.equal(tryClaimRun(lock), null);
again();
assert.equal(lock.current, false);
