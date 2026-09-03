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
const state = read('16-state.js');
const refFilter = read('17-ref-filter.js');
const columnSettings = read('11-column-settings.js');
const utils = read('22-utils.js');
const formFieldSettings = read('21-form-field-settings.js');
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
assert((urlConfig.match(/this\.normalizeNumericId\(key\.substring/g) || []).length === 3,
    'FR_, F_ and TO_ URL filter keys must have strictly numeric column IDs');
assert(state.includes('typeId = this.normalizeNumericId(typeId);'),
    'metadata IDs must be validated before metadata requests');
assert(state.includes('requisiteId = this.normalizeNumericId(requisiteId);'),
    'requisite IDs must be validated before reference requests');
assert(!renderTable.includes('data-column-id="${ column.id }"'),
    'filter column IDs must be escaped in DOM attributes');
assert(!columnSettings.includes('data-column-id="${ col.id }"'),
    'column settings IDs must be escaped in DOM attributes');
assert(columnSettings.includes('const refTypeId = this.normalizeNumericId(col.ref || col.orig || col.ref_id);'),
    'column-edit dictionary links must validate reference type IDs');
assert(columnSettings.includes('if (!col || !this.normalizeNumericId(col.id))'),
    'column edit actions must reject invalid column IDs');
assert(utils.includes('objId = this.normalizeNumericId(objId);'),
    'warning record links must reject non-numeric object IDs');
assert(formFieldSettings.includes('const escapedValue = this.escapeHtml(currentValue ||'),
    'duplicate-value inputs must use complete HTML attribute escaping');
assert(refFilter.includes('data-id="${this.escapeHtml(id)}"'),
    'reference filter option IDs must be escaped in DOM attributes');

for (const source of formSources) {
    assert(!source.includes('const fieldName = attrs.alias || req.val;'),
        'form field names must be escaped before HTML rendering');
}
const combinedFormSource = formSources.join('\n');
assert((combinedFormSource.match(/!req\.arr_id && this\.normalizeNumericId\(req\.id\)/g) || []).length >= 6,
    'every form renderer must reject non-numeric requisite IDs before building attributes');
assert(!combinedFormSource.includes('data-id="${id}"') && !combinedFormSource.includes('data-id="${ id }"'),
    'reference option IDs must not be inserted into form attributes without escaping');
assert(renderCell.includes('this.sanitizeCellStyle(styleValue)'),
    'STYLE companion values must be allow-list sanitized');

console.log('PASS metadata, URL IDs and server errors are safe for HTML rendering');
