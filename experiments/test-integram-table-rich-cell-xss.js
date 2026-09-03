/*
 * Regression tests for executable rich-cell content.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'js', 'integram-table');
const renderCellSource = fs.readFileSync(path.join(root, '06-render-cell.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(root, '22-utils.js'), 'utf8');

function extractMethod(source, name) {
    const marker = '\n        ' + name + '(';
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new Error('Could not find method ' + name);
    const start = markerIndex + 1;
    const brace = source.indexOf('{', start);
    let depth = 0;
    for (let index = brace; index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error('Could not find method end for ' + name);
}

const Host = new Function(
    'class Host {' +
    extractMethod(utilsSource, 'escapeHtml') +
    extractMethod(utilsSource, 'sanitizeCellStyle') +
    extractMethod(utilsSource, 'sanitizeCellHtml') +
    extractMethod(utilsSource, 'parseButtonAction') +
    '} return Host;'
)();
const host = new Host();

assert.strictEqual(
    host.sanitizeCellHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;',
    'HTML sanitizer must fail closed when no DOM parser is available'
);

assert.strictEqual(
    host.sanitizeCellStyle('color: red; text-align: center; position: fixed'),
    'color: red; text-align: center',
    'STYLE allow-list must drop layout-breaking properties'
);
assert.strictEqual(
    host.sanitizeCellStyle('color: red" onmouseover="alert(1); background: url(https://evil.invalid/x)'),
    '',
    'STYLE values must not escape the attribute or load attacker resources'
);

assert.deepStrictEqual(
    host.parseButtonAction("newApi('POST','_m_set/42?JSON','','reloadAllIntegramTables')"),
    ['POST', '_m_set/42?JSON', '', 'reloadAllIntegramTables'],
    'literal newApi BUTTON actions remain supported without eval'
);
assert.strictEqual(host.parseButtonAction('alert(1)'), null,
    'arbitrary function calls must be blocked');
assert.strictEqual(host.parseButtonAction("newApi('GET','x',window.alert)"), null,
    'BUTTON arguments must be scalar literals');

assert(renderCellSource.includes('this.sanitizeCellHtml(displayValue)'),
    'HTML cells must pass through the rich-content sanitizer');
assert(renderCellSource.includes('this.sanitizeCellHtml(value)'),
    'server-provided FILE anchors must pass through the sanitizer');
assert(!renderCellSource.includes('btnOnclick'),
    'BUTTON values must never be copied into inline onclick');

console.log('PASS rich table cells reject executable HTML, CSS and BUTTON values');
