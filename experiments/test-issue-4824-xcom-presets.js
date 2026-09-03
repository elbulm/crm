const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const presets = require(path.join(root, 'download/xcom/js/xcom-presets.js'));
const source = fs.readFileSync(path.join(root, 'download/xcom/js/xcom-mass-match.js'), 'utf8');
const sandbox = {
    window: {}, document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console, URL, URLSearchParams, setTimeout() {}, clearTimeout() {}, fetch() { throw new Error('network is not used by helper tests'); }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'xcom-mass-match.js' });
const mass = sandbox.window.XcomMassMatchWorkspace;

assert.deepStrictEqual(presets.presets.map(item => item.id), ['building-materials', 'stationery', 'it-equipment']);
presets.presets.forEach(preset => {
    assert.strictEqual(preset.status, 'starter', 'presets remain explicitly marked as starter until observed pilots');
    assert.deepStrictEqual(presets.validatePreset(preset, mass.validateMatchingConfig), [], `valid preset ${preset.id}`);
    const file = JSON.parse(fs.readFileSync(path.join(root, 'docs/xcom_matching_presets', preset.id + '.json'), 'utf8'));
    assert.strictEqual(file.id, preset.id);
    assert.deepStrictEqual(file.config, preset.config);
});
const base = { column_mapping: { rfp: { name: 'Наименование клиента' }, sku: { name: 'Наименование SKU' } }, llm: { enabled: true } };
const applied = presets.applyPreset(base, 'it-equipment');
assert.strictEqual(applied.category, 'IT-техника');
assert.strictEqual(applied.column_mapping.rfp.name, 'Наименование клиента');
assert.strictEqual(applied.llm.enabled, true);
assert.strictEqual(presets.findPreset('missing'), null);

assert.strictEqual(mass.applyAttributeWeights(60, { 'Бренд RFP': 'HP', 'Бренд SKU': 'hp' }, [
    { rfp_key: 'Бренд RFP', sku_key: 'Бренд SKU', weight: 0.25 }
]), 70);
assert.strictEqual(mass.applyAttributeWeights(60, { 'Бренд RFP': 'HP', 'Бренд SKU': 'Canon' }, [
    { rfp_key: 'Бренд RFP', sku_key: 'Бренд SKU', weight: 0.25 }
]), 60);

console.log('OK: test-issue-4824-xcom-presets');
