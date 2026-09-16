// Run with node scripts/check-orukeet-model.cjs after npm ci.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/lib/models.ts');
const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const moduleExports = {};
vm.runInNewContext(js, { exports: moduleExports, require: createRequire(filename) }, { filename });
const { models, sortedModelsForLanguage, modelSupportsLanguage } = moduleExports;
const model = models.find(m => m.value === 'orukeet');
assert(model);
assert.equal(model.engine, 'parakeet');
assert.equal(model.accuracy, null);
assert.equal(model.speed, null);
assert.equal(model.bestFor.length, 0);
for (const lang of ['auto', ...model.languageSupport.languages]) {
  const full = sortedModelsForLanguage(lang);
  const without = sortedModelsForLanguage(lang, 'recommended', models.filter(m => m.value !== 'orukeet'));
  assert.equal(full[0].value, without[0].value, `default changed for ${lang}`);
  assert(full.some(m => m.value === 'orukeet'));
}
assert.equal(modelSupportsLanguage(model, 'ja'), false);
assert(fs.existsSync(path.join(root, 'public', model.image)));
for (const lang of ['de', 'en', 'es', 'fr', 'ja', 'ko', 'ru', 'zh']) {
  const copy = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales', lang, 'translation.json'))).models.orukeet;
  for (const key of ['label', 'description', 'details', 'badge']) {
    assert.equal(typeof copy[key], 'string');
    assert(copy[key].length <= (key === 'label' ? 25 : 60), `${lang}.${key} too long`);
    assert(!/[—–]/.test(copy[key]));
  }
  assert(copy.details.includes('CC BY-SA 4.0'));
}
console.log('Orukeet routing, language support, unchanged recommendations and all eight locales passed.');
