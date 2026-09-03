const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'download/xcom/js/xcom-review.js'), 'utf8');
const sandbox = {
    window: {},
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console, module: { exports: {} }, fetch() { throw new Error('network is not used by helper tests'); }, setTimeout() {}
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'xcom-review.js' });
const api = sandbox.window.XcomReviewWorkspace;
const plain = value => JSON.parse(JSON.stringify(value));
const report = {
    columns: [{ name: 'SKUID' }, { name: 'Артикул SKU' }, { name: 'Наименование SKU' }, { name: 'Точность' }],
    rows: [
        ['11:Первый', 'A90', 'Первый товар', '90'],
        ['22:Второй', 'A55', 'Второй товар', '55'],
        ['33:Третий', 'A30', 'Третий товар', '30']
    ]
};

assert.deepStrictEqual(plain(api.parseRef('22:Второй')), { id: '22', label: 'Второй' });
const candidate = plain(api.candidateFromRow(report, report.rows[1], 1));
assert.strictEqual(candidate.id, '22');
assert.strictEqual(candidate.article, 'A55');
assert.strictEqual(candidate.accuracy, 55);
assert.deepStrictEqual(plain(api.rowsInGrayZone(report, 45, 75)).map(item => item.index), [1]);
const prompt = api.buildRefinementPrompt({ values: ['Картридж HP 85A'] }, report, 45, 75);
assert(prompt.includes('A55'));
assert(!prompt.includes('A90'));
assert(prompt.includes('Ответь строго JSON'));
assert.deepStrictEqual(plain(api.parseAgentVerdict('```json\n{"selected_index":1,"confidence":0.86,"reason":"совпадает модель"}\n```')),
    { selected_index: 1, confidence: 0.86, reason: 'совпадает модель' });
assert.strictEqual(api.parseAgentVerdict('{"selected_index":1.5,"confidence":2}').selected_index, null);
assert.strictEqual(api.parseAgentVerdict('{"selected_index":null,"confidence":-1}').confidence, 0);

console.log('OK: test-issue-4822-xcom-review');
