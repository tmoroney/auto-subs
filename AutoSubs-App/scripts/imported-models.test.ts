import assert from 'node:assert/strict';
import {
    clampModelIndex,
    fileNameOf,
    importedModelToModel,
    isImportedModelId,
    resolveImportedModelName,
    sanitizeImportedModels,
    selectionAfterRemoval,
} from '../src/lib/imported-models.ts';
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
