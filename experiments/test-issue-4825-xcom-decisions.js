const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'download/xcom/js/xcom-mass-match.js'), 'utf8');
const sandbox = {
    window: {}, document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console, URL, URLSearchParams, setTimeout() {}, clearTimeout() {}, fetch() { throw new Error('network is not used by helper tests'); }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'xcom-mass-match.js' });
const api = sandbox.window.XcomMassMatchWorkspace;
const plain = value => JSON.parse(JSON.stringify(value));
const metadata = {
    val: 'Решение по паре',
    reqs: ['RFP ID', 'SKU ID', 'Решение', 'Дата', 'Кто', 'Наименование RFP', 'Наименование SKU', 'Артикул SKU', 'Точность', 'Источник']
        .map((val, index) => ({ id: String(index + 1), val }))
};
const row = (pair, values) => ({ r: [pair].concat(values) });
const index = api.buildDecisionIndex(metadata, [
    row('42:7', ['42', '7', 'Отклонено', '2026-09-01T09:00:00Z', 'user', 'RFP', 'Bad', 'BAD-7', '50', 'manual']),
    row('42:8', ['42', '8', 'Принято', '2026-09-01T09:05:00Z', 'user', 'RFP', 'Good', 'GOOD-8', '88', 'manual']),
    row('43:9', ['43', '9', 'ИИ-рекомендация', '2026-09-01T09:06:00Z', 'agent', 'RFP2', 'Maybe', 'MAYBE-9', '70', 'llm']),
    row('44:10', ['44', '10', 'Отклонено', '2026-09-01T09:07:00Z', 'user', 'RFP3', 'No', 'NO-10', '40', 'manual'])
]);

const accepted = api.applyDecisionLog('42', [{ SKUID: '7', Артикул: 'BAD-7' }], index);
assert.strictEqual(accepted.accepted.fromDecisionLog, true);
assert.strictEqual(accepted.accepted.our.id, '8');
assert.strictEqual(accepted.accepted.our.article, 'GOOD-8');
assert.strictEqual(accepted.accepted.accuracy, 88);
assert.deepStrictEqual(plain(accepted.rows), []);

const llmOnly = api.applyDecisionLog('43', [{ SKUID: '9', Артикул: 'MAYBE-9' }], index);
assert.strictEqual(llmOnly.accepted, null, 'LLM recommendation never becomes an automatic decision');
assert.strictEqual(llmOnly.rows.length, 1);

api._state.skuIdKey = 'SKUID';
api._state.skuArticleKey = 'Артикул';
const rejected = api.applyDecisionLog('44', [
    { SKUID: '10', Артикул: 'NO-10' },
    { SKUID: '11', Артикул: 'YES-11' }
], index);
assert.deepStrictEqual(plain(rejected.rows), [{ SKUID: '11', Артикул: 'YES-11' }]);

console.log('OK: test-issue-4825-xcom-decisions');
