const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const integrator = fs.readFileSync(path.join(root, 'docs/xcom-matching/guide-integrator.md'), 'utf8');
const user = fs.readFileSync(path.join(root, 'docs/xcom-matching/guide-user.md'), 'utf8');
const pilot = fs.readFileSync(path.join(root, 'docs/xcom-matching/pilot-protocol.md'), 'utf8');

['DryRun', 'мастер', 'диагност', 'эскалир', 'кастом', 'верс'].forEach(marker =>
    assert(integrator.toLowerCase().includes(marker.toLowerCase()), `integrator guide contains ${marker}`));
['RFP', 'SKU', 'Excel', 'JSON', 'принять', 'отклонить', 'повторн'].forEach(marker =>
    assert(user.toLowerCase().includes(marker.toLowerCase()), `user guide contains ${marker}`));
['60 минут', 'без подсказок', 'тикет', 'медиан', 'xcom-pilot-metrics.js'].forEach(marker =>
    assert(pilot.toLowerCase().includes(marker.toLowerCase()), `pilot protocol contains ${marker}`));

console.log('OK: test-issue-4820-xcom-guides');
