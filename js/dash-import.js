// Конвертор Excel → модель дэшборда (issue #4704).
//
// Рабочее место `dash-import`: файл xlsx → распознанная структура → ПРЕДПРОСМОТР → запись в БД.
// Предпросмотр обязателен: структура модели угадывается по форме таблицы, и ошибку распознавания
// оператор должен увидеть ДО того, как в базе появятся записи.
//
// Модель собирается по контракту `docs/kb/dashboard.md`:
//   Дэшборд → Лист → Панель → Строка (+ RG у панели), иерархия — подчинёнными записями (`up`).
//
// Ядро модуля ЧИСТОЕ (никакого DOM и сети) и покрыто тестом на реальном образце из тикета:
//   recognizeModel(grids)     — форма книги → структура модели + журнал непереносимого
//   periodValues(years, +N)   — значения словаря периода: годы файла + запас
//   buildCreateOps(model, …)  — структура → список операций записи (создать/переиспользовать)
//   journalIssueText(entries) — журнал → текст, готовый к вставке в issue репозитория
//
(function () {
    'use strict';

    // ── Разбор формы книги ──────────────────────────────────────────────────────────────────

    // Ячейка сетки: { v: значение, f: формула|null }. Пустая ячейка — null.
    function cellVal(cell) { return cell && cell.v != null ? cell.v : null; }
    function cellText(cell) {
        var v = cellVal(cell);
        return (typeof v === 'string') ? v.trim() : '';
    }
    function cellNum(cell) {
        var v = cellVal(cell);
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
        return null;
    }
    function isYearNum(n) { return n != null && n === Math.round(n) && n >= 1990 && n <= 2100; }

    // ШАПКА ПЕРИОДОВ. Строка, где подряд (с пропусками) стоят ≥ 3 возрастающих года — это ось
    // периодов, и она открывает новую панель. Так секции «P&L» / «Cash Flow» / «DCF» одного листа
    // разделяются без опоры на цвет, жирность и прочее оформление, которого в данных нет.
    // → { cols: [индексы колонок], years: [годы], totalCol: индекс колонки «Итог» | null }
    function periodHeader(row) {
        var cols = [], years = [];
        for (var c = 0; c < row.length; c++) {
            var n = cellNum(row[c]);
            if (isYearNum(n) && (!years.length || n > years[years.length - 1])) { cols.push(c); years.push(n); }
        }
        if (years.length < 3) return null;
        var totalCol = null;
        for (var t = cols[cols.length - 1] + 1; t < row.length && t <= cols[cols.length - 1] + 3; t++) {
            if (/итог/i.test(cellText(row[t]))) { totalCol = t; break; }
        }
        return { cols: cols, years: years, totalCol: totalCol };
    }

    // Подпись строки: текстовые ячейки ЛЕВЕЕ первой колонки периодов. Ближняя к периодам — имя
    // строки («ФОТ», «Выручка»), дальняя — метка/группа («OpEx 1», «COGS»). Одна ячейка — это имя.
    function rowLabels(row, firstPeriodCol) {
        var texts = [];
        for (var c = 0; c < firstPeriodCol && c < row.length; c++) {
            var s = cellText(row[c]);
            if (s !== '') texts.push({ col: c, text: s });
        }
        if (!texts.length) return { name: '', label: '' };
        if (texts.length === 1) return { name: texts[0].text, label: '' };
        return { name: texts[texts.length - 1].text, label: texts[0].text };
    }

    // Ссылки формулы на колонки/строки: A1, $F$3, SUM(F3:F4).
    function formulaRefs(formula) {
        var out = [];
        var re = /\$?([A-Z]{1,3})\$?(\d+)/g, m;
        while ((m = re.exec(String(formula || ''))) !== null) {
            var col = 0, s = m[1];
            for (var i = 0; i < s.length; i++) col = col * 26 + (s.charCodeAt(i) - 64);
            out.push({ col: col - 1, row: Number(m[2]) - 1 });
        }
        return out;
    }

    // РАСПОЗНАВАНИЕ ЛИСТА. grid — массив строк, каждая строка — массив ячеек (0-based).
    // → { panels: [{ title, years, rows: [{ name, label, values, total, formula }] }], journal: [] }
    function recognizeSheet(sheetName, grid, opts) {
        opts = opts || {};
        var panels = [], journal = [];
        var head = null, panel = null, pendingTitle = '', panelIndex = 0;

        function pushJournal(kind, rowIdx, colIdx, what, why) {
            journal.push({
                sheet: sheetName, cell: cellAddr(rowIdx, colIdx), row: rowIdx + 1,
                kind: kind, what: what, why: why
            });
        }

        for (var r = 0; r < grid.length; r++) {
            var row = grid[r] || [];
            var h = periodHeader(row);
            if (h) {
                head = h;
                panel = { title: pendingTitle || ('Панель ' + (++panelIndex)), years: h.years.slice(),
                          totalCol: h.totalCol, rows: [], headRow: r };
                if (pendingTitle) panelIndex++;
                panels.push(panel);
                pendingTitle = '';
                continue;
            }
            if (!head) {                                  // до первой шапки периодов — «шапка листа»
                var pre = rowLabels(row, row.length);
                if (pre.name) pendingTitle = pre.name;
                continue;
            }
            var lab = rowLabels(row, head.cols[0]);
            var values = {}, hasValue = false, formula = null;
            for (var i = 0; i < head.cols.length; i++) {
                var cell = row[head.cols[i]];
                var n = cellNum(cell);
                if (n != null) { values[head.years[i]] = n; hasValue = true; }
                if (cell && cell.f && !formula) formula = cell.f;
            }
            var total = head.totalCol != null ? cellNum(row[head.totalCol]) : null;

            if (!hasValue) {
                // Текст без чисел — заголовок следующей секции.
                if (lab.name) pendingTitle = lab.name;
                continue;
            }
            // СЕКЦИЯ БЕЗ СВОЕЙ ШАПКИ ЛЕТ. «Дисконтированный денежный поток» и сводный блок идут под
            // собственным заголовком, но ось периодов у них та же — новой строки с годами нет.
            // Заголовок + уже набранные строки = начинается новая панель на той же оси.
            if (pendingTitle && panel && panel.rows.length) {
                panel = { title: pendingTitle, years: head.years.slice(), totalCol: head.totalCol,
                          rows: [], headRow: panel.headRow };
                panels.push(panel);
                pendingTitle = '';
            }
            if (!lab.name) {
                pushJournal('unnamed-row', r, head.cols[0], 'строка с числами без подписи',
                    'имя строки модели взять неоткуда — строка не перенесена');
                continue;
            }
            // Формулы: переносимы только ссылки ВНУТРИ своей панели и внутри колонок периодов.
            var moved = null;
            if (formula) {
                var refs = formulaRefs(formula);
                var panelHeadRow = panel.headRow;
                var outside = refs.filter(function (ref) {
                    var inPeriodCols = head.cols.indexOf(ref.col) !== -1 || ref.col === head.totalCol;
                    var inPanel = ref.row > panelHeadRow;
                    return !inPeriodCols || !inPanel;
                });
                if (outside.length) {
                    pushJournal('formula', r, head.cols[0], '=' + formula,
                        'формула ссылается за пределы своей панели (параметры справа или другая секция) — значения перенесены как числа, формула нет');
                } else {
                    moved = formula;
                }
            }
            panel.rows.push({ name: lab.name, label: lab.label, values: values,
                              total: total, formula: moved, srcRow: r + 1 });
        }
        // Объединения в области данных — сетка, которую модель не повторяет.
        (opts.merges || []).forEach(function (m) {
            journal.push({ sheet: sheetName, cell: m, row: null, kind: 'merge',
                what: 'объединённые ячейки ' + m,
                why: 'модель не воспроизводит объединения — колонки строятся по периодам' });
        });
        // Панель без своего заголовка называем меткой первой строки («Cash Inflows»), а не «Панель N»:
        // метка — это то, как секцию называет сам автор файла.
        panels.forEach(function (p) {
            if (!/^Панель \d+$/.test(p.title)) return;
            var first = p.rows.filter(function (r) { return r.label; })[0];
            if (first) p.title = first.label;
        });
        return { panels: panels.filter(function (p) { return p.rows.length; }), journal: journal };
    }

    function cellAddr(rowIdx, colIdx) {
        var n = (colIdx == null ? 0 : colIdx) + 1, s = '';
        while (n) { var rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
        return s + ((rowIdx == null ? 0 : rowIdx) + 1);
    }

    // РАСПОЗНАВАНИЕ КНИГИ. grids — [{ name, grid, merges }]. Имя модели — из имени файла.
    function recognizeModel(fileName, grids) {
        var model = { name: modelNameFromFile(fileName), sheets: [] }, journal = [];
        (grids || []).forEach(function (g) {
            var res = recognizeSheet(g.name, g.grid || [], { merges: g.merges });
            journal = journal.concat(res.journal);
            model.sheets.push({ name: g.name, panels: res.panels });
        });
        model.years = [];
        model.sheets.forEach(function (s) {
            s.panels.forEach(function (p) {
                p.years.forEach(function (y) { if (model.years.indexOf(y) === -1) model.years.push(y); });
            });
        });
        model.years.sort(function (a, b) { return a - b; });
        return { model: model, journal: journal };
    }

    // Имя модели = имя файла без пути и расширения.
    function modelNameFromFile(fileName) {
        var base = String(fileName || '').split(/[\\/]/).pop();
        return base.replace(/\.(xlsx|xlsm|xls)$/i, '').trim() || 'Модель';
    }

    // СЛОВАРЬ ПЕРИОДА: годы файла + запас (решение заказчика 11.08.2026 — «годы файла + 3»).
    function periodValues(years, extra) {
        var list = (years || []).slice().sort(function (a, b) { return a - b; });
        if (!list.length) return [];
        var n = extra == null ? 3 : extra, last = list[list.length - 1], out = list.slice();
        for (var i = 1; i <= n; i++) out.push(last + i);
        return out;
    }

    // ── Операции записи ─────────────────────────────────────────────────────────────────────

    // Структура → операции. Ничего не пишет и не знает про сеть: возвращает список действий,
    // который исполняет контроллер (браузер) или MCP-инструмент.
    // existing — то, что уже есть в базе: { dashboardId, sheetsByName, periodTableId }.
    // Дописывание: лист с тем же именем переиспользуется, новый — создаётся (#4327 — импорт не
    // плодит дубли: перед вставкой ищем существующее по ключу).
    function buildCreateOps(model, schema, existing) {
        existing = existing || {};
        var ops = [], seq = 0;
        function ref() { return '$' + (++seq); }

        var periodOp = null;
        if (!existing.periodTableId) {
            periodOp = { op: 'create-period-dict', ref: ref(), name: schema.periodName || 'Год',
                         values: periodValues(model.years, 3) };
            ops.push(periodOp);
        } else {
            ops.push({ op: 'fill-period-dict', tableId: existing.periodTableId,
                       values: periodValues(model.years, 3) });
        }

        var dashRef;
        if (existing.dashboardId) {
            dashRef = existing.dashboardId;
            ops.push({ op: 'reuse-dashboard', id: existing.dashboardId, name: model.name });
        } else {
            dashRef = ref();
            ops.push({ op: 'create-dashboard', ref: dashRef, table: schema.dashboard, name: model.name,
                       period: periodOp ? periodOp.ref : existing.periodTableId });
        }

        model.sheets.forEach(function (sheet) {
            var known = (existing.sheetsByName || {})[sheet.name];
            var sheetRef;
            if (known) { sheetRef = known; ops.push({ op: 'reuse-sheet', id: known, name: sheet.name }); }
            else {
                sheetRef = ref();
                ops.push({ op: 'create-sheet', ref: sheetRef, table: schema.sheet, up: dashRef, name: sheet.name });
            }
            sheet.panels.forEach(function (panel) {
                var panelRef = ref();
                ops.push({ op: 'create-panel', ref: panelRef, table: schema.panel, up: sheetRef, name: panel.title });
                // Колонки: повтор по периодам (rg) + колонка суммы строки (line), если в файле «Итог:».
                ops.push({ op: 'create-rg', ref: ref(), table: schema.rg, up: panelRef,
                           rgType: schema.rgTypes.rg, ord: 1 });
                if (panel.totalCol != null) {
                    ops.push({ op: 'create-rg', ref: ref(), table: schema.rg, up: panelRef,
                               rgType: schema.rgTypes.line, ord: 2 });
                }
                panel.rows.forEach(function (row) {
                    var rowRef = ref();
                    ops.push({ op: 'create-row', ref: rowRef, table: schema.row, up: panelRef,
                               name: row.name, label: row.label, formula: row.formula });
                    Object.keys(row.values).forEach(function (year) {
                        ops.push({ op: 'create-value', table: schema.values, item: rowRef,
                                   period: Number(year), value: row.values[year] });
                    });
                });
            });
        });
        return ops;
    }

    // ── Журнал непереносимого ───────────────────────────────────────────────────────────────

    // Записи журнала — в текст, готовый к вставке в issue: адрес, содержимое, причина.
    function journalIssueText(entries, fileName) {
        var byKind = {};
        (entries || []).forEach(function (e) { (byKind[e.kind] = byKind[e.kind] || []).push(e); });
        var titles = {
            'formula': 'Формулы, которые не перенеслись',
            'unnamed-row': 'Строки с числами без подписи',
            'merge': 'Объединённые ячейки'
        };
        var out = ['## Не перенеслось из «' + modelNameFromFile(fileName) + '»', ''];
        Object.keys(byKind).forEach(function (kind) {
            out.push('### ' + (titles[kind] || kind), '');
            out.push('| лист | ячейка | что | почему |');
            out.push('|---|---|---|---|');
            byKind[kind].forEach(function (e) {
                out.push('| ' + e.sheet + ' | `' + e.cell + '` | `' + String(e.what).replace(/\|/g, '\\|') +
                         '` | ' + e.why + ' |');
            });
            out.push('');
        });
        if (!entries || !entries.length) out.push('Перенеслось всё.');
        return out.join('\n');
    }

    // ── Адаптер SheetJS → сетка ядра ────────────────────────────────────────────────────────

    // Книга SheetJS → [{ name, grid, merges }]. Формулы берём из `.f`, значения из `.v`.
    function gridsFromWorkbook(XLSX, workbook) {
        return (workbook.SheetNames || []).map(function (name) {
            var ws = workbook.Sheets[name];
            var ref = ws['!ref'] || 'A1';
            var range = XLSX.utils.decode_range(ref);
            var grid = [];
            for (var r = range.s.r; r <= range.e.r; r++) {
                var line = [];
                for (var c = range.s.c; c <= range.e.c; c++) {
                    var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                    line.push(cell ? { v: cell.v, f: cell.f || null } : null);
                }
                grid.push(line);
            }
            var merges = (ws['!merges'] || []).map(function (m) { return XLSX.utils.encode_range(m); });
            return { name: name, grid: grid, merges: merges };
        });
    }

    var api = {
        recognizeModel: recognizeModel,
        recognizeSheet: recognizeSheet,
        periodHeader: periodHeader,
        rowLabels: rowLabels,
        periodValues: periodValues,
        buildCreateOps: buildCreateOps,
        journalIssueText: journalIssueText,
        modelNameFromFile: modelNameFromFile,
        gridsFromWorkbook: gridsFromWorkbook,
        formulaRefs: formulaRefs
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.DashImport = api;
})();
