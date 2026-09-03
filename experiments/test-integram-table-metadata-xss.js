/*
 * Regression tests for metadata and URL values used in table HTML.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modules = path.join(__dirname, '..', 'js', 'integram-table');
const read = file => fs.readFileSync(path.join(modules, file), 'utf8');
const core = read('01-core.js');
const renderTable = read('04-render-table.js');
const renderCell = read('06-render-cell.js');
const grouping = read('13-grouping.js');
const urlConfig = read('14-url-config.js');
const formSources = [
    read('07-inline-edit.js'),
    read('19-form-edit.js'),
    read('20-form-create.js'),
    read('21-form-field-settings.js'),
    read('25-create-form-helper.js')
];

assert(core.includes("requestedInstanceName.replace(/[^A-Za-z0-9_$]/g, '_')"),
    'instanceName must be normalized before use in inline handlers');
assert(core.includes('parentId: normalizeNumericId('),
    'parent IDs from the URL must be strictly numeric');
assert(core.includes('recordId: normalizeNumericId('),
    'record IDs from the URL must be strictly numeric');
assert(core.includes('this.escapeHtml(message)'),
    'server error text must be escaped before innerHTML');

const rawColumnName = '$' + '{ col.name }';
for (const source of [renderTable, renderCell, grouping]) {
    assert(!source.includes(rawColumnName),
        'column names must not be interpolated into HTML without escaping');
}
assert(urlConfig.includes('this.escapeHtml(hf.colName)'),
    'hidden-filter column names must be escaped');
assert(urlConfig.includes('this.escapeHtml(displayValue)'),
    'hidden-filter values must be escaped');

for (const source of formSources) {
    assert(!source.includes('const fieldName = attrs.alias || req.val;'),
        'form field names must be escaped before HTML rendering');
}
assert(renderCell.includes('this.sanitizeCellStyle(styleValue)'),
    'STYLE companion values must be allow-list sanitized');

console.log('PASS metadata, URL IDs and server errors are safe for HTML rendering');
