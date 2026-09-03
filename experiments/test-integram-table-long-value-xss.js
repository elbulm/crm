/*
 * Regression test: long cell values must remain data, not inline JavaScript.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'js', 'integram-table');
const renderCell = fs.readFileSync(path.join(root, '06-render-cell.js'), 'utf8');
const inlineEdit = fs.readFileSync(path.join(root, '07-inline-edit.js'), 'utf8');
const tableSettings = fs.readFileSync(path.join(root, '12-table-settings.js'), 'utf8');

for (const source of [renderCell, inlineEdit]) {
    assert(!source.includes('class="show-full-value" onclick='),
        'show-full-value links must not execute a value through inline onclick');
    assert(source.includes('class="show-full-value" data-full-value='),
        'show-full-value links must carry the value as inert data');
}

assert(inlineEdit.includes("event.target.closest('.show-full-value')"),
    'a delegated click handler must open long values');
assert(tableSettings.includes("modal.querySelector('pre').textContent"),
    'the full-value modal must render user content with textContent');
assert(!tableSettings.includes('$' + '{ fullValue }</pre>'),
    'the full-value modal must not interpolate user content into innerHTML');

console.log('PASS long table values stay out of executable HTML/JavaScript contexts');
