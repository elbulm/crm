const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'download/xcom/js/xcom-export.js'), 'utf8');
const sandbox = {
    window: {},
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console, module: { exports: {} }, URL, fetch() { throw new Error('network is not used by helper tests'); }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'xcom-export.js' });
const api = sandbox.window.XcomExportWorkspace;
const plain = value => JSON.parse(JSON.stringify(value));

const objectRows = plain(api.normalizeResponse([{ A: 'x', B: 1 }, { B: 2, C: 'z' }]));
assert.deepStrictEqual(objectRows.columns, ['A', 'B', 'C']);
assert.deepStrictEqual(objectRows.rows[1], { A: '', B: 2, C: 'z' });

const matrixRows = plain(api.normalizeResponse({
    columns: [{ name: 'Артикул' }, { name: 'Точность' }],
    data: [['A1', 'A2'], [82, 74]]
}));
assert.deepStrictEqual(matrixRows.rows, [{ Артикул: 'A1', Точность: 82 }, { Артикул: 'A2', Точность: 74 }]);
assert.strictEqual(api.buildApiUrl('demo db', 'matching_export', 100), '/demo%20db/report/matching_export?JSON_KV&LIMIT=0,100');
assert.strictEqual(api.exportFileName(new Date(2026, 8, 1, 9, 5), 'xlsx'), '2026-09-01_09-05_сопоставление.xlsx');
const payload = plain(api.buildJsonPayload(matrixRows.rows, matrixRows.columns, { database: 'demo', report: 'matching_export', exported_at: '2026-09-01T00:00:00Z' }));
assert.strictEqual(payload.format, 'integram-xcom-matching');
assert.strictEqual(payload.count, 2);
assert.strictEqual(payload.rows[0].Артикул, 'A1');
assert.deepStrictEqual(plain(api.normalizeResponse(null)), { columns: [], rows: [] });

console.log('OK: test-issue-4821-xcom-export');
