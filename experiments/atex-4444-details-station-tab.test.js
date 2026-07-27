// Tests for ideav/crm#4444 — «В таблице по кнопке Детали надо показывать смену станка —
// порядковый номер закладки, не имя. Типа: 3>5 или просто 3, если не менялся».
//
// Список «Деталей» непринятого плана (#4417) писал станок ИМЕНЕМ («Станок 2 → Станок 4») и только
// когда станок сменился. По имени непонятно, на какую вкладку переключаться, а когда станка в
// строке нет вовсе — непонятно, где искать задание («отображаемое время вообще ни с чем не
// совпадает — как понимать что произошло?»).
//
// Теперь станок — отдельная колонка и ВСЕГДА: «станок 3» либо «станок 3 → 5», где число —
// ПОРЯДКОВЫЙ НОМЕР ЗАКЛАДКИ, посчитанный ровно так же, как рисуются вкладки (mergeStationTabs):
// сперва справочник «Слиттер», затем станки, которых в справочнике нет, но задания на них есть.
//
// Run with: node experiments/atex-4444-details-station-tab.test.js

process.env.TZ = 'Europe/Moscow';

var mod = require('../download/atex/js/production-planning.js');
var P = mod.planning;

var passed = 0, total = 0;
function assert(cond, name) {
    total++;
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name);
    if (cond) passed++; else process.exitCode = 1;
}
function assertEqual(actual, expected, name) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    total++;
    console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
    if (ok) { passed++; } else {
        console.log('  expected:', JSON.stringify(expected));
        console.log('  actual:  ', JSON.stringify(actual));
        process.exitCode = 1;
    }
}

var SLITTERS = [
    { id: '1277', label: 'Станок 1' },
    { id: '1279', label: 'Станок 2' },
    { id: '1282', label: 'Станок 3' },
    { id: '1285', label: 'Станок 4' }
];

// ── 1) Номер закладки считается ровно как порядок вкладок ──────────────────────────────────────
(function () {
    var map = P.slitterTabIndexMap(SLITTERS, []);
    assertEqual([map['1277'], map['1279'], map['1282'], map['1285']], [1, 2, 3, 4],
        '#4444: номер закладки = позиция станка в справочнике «Слиттер»');

    // Станок, которого в справочнике нет, но задания на нём есть, — вкладка дописывается в конец
    // (так же делает mergeStationTabs), значит и номер у него следующий.
    var withExtra = P.slitterTabIndexMap(SLITTERS, [{ slitter: { id: '9999' } }, { slitter: { id: '1279' } }]);
    assertEqual(withExtra['9999'], 5, '#4444: станок вне справочника получает следующий номер закладки');
    assertEqual(withExtra['1279'], 2, '#4444: у станка из справочника номер не съезжает');

    // Тот же порядок, что у вкладок очереди.
    var tabs = P.mergeStationTabs(SLITTERS, [{ slitter: { id: '9999', label: 'Чужой' }, cuts: [] }]);
    var order = tabs.map(function (t) { return String(t.slitter.id); });
    assertEqual(order, ['1277', '1279', '1282', '1285', '9999'], 'контроль: вкладки идут в том же порядке');

    assertEqual(P.slitterTabIndexMap([], [])['x'], undefined, 'пустые данные — пустая карта');
})();

// ── 2) Формат колонки: «3 → 5» при смене, «3» без смены ────────────────────────────────────────
(function () {
    assertEqual(P.planChangeStation({ kind: 'moved', slitterTabFrom: 3, slitterTabTo: 5 }), '3 → 5',
        '#4444: станок сменился → «3 → 5»');
    assertEqual(P.planChangeStation({ kind: 'moved', slitterTabFrom: 3, slitterTabTo: 3 }), '3',
        '#4444: станок тот же → просто «3»');
    assertEqual(P.planChangeStation({ kind: 'new', slitterTabFrom: null, slitterTabTo: 2 }), '2',
        '#4444: новый сегмент — номер закладки, где он появится');
    assertEqual(P.planChangeStation({ kind: 'deleted', slitterTabFrom: 4, slitterTabTo: null }), '4',
        '#4444: удаляемая запись — номер закладки, где она стои́т');
    assertEqual(P.planChangeStation({ kind: 'moved', slitterTabFrom: null, slitterTabTo: null }), '—',
        '#4444: номер неизвестен → «—», а не пусто');
    assertEqual(P.planChangeStation(null), '—', 'без строки — «—» (не падаем)');
})();

// ── 3) planChangeRows кладёт номера закладок в строки ──────────────────────────────────────────
(function () {
    function cut(id, sid, ts) {
        return { id: id, slitter: { id: sid }, number: String(ts), planDate: String(ts),
                 materialName: 'MW308', winding: 'OUT', plannedRuns: 5 };
    }
    var T0 = 1785214800;
    var snapshot = [cut('a', '1279', T0), cut('b', '1282', T0 + 3600), cut('c', '1285', T0 + 7200)];
    var projected = [cut('a', '1285', T0), cut('b', '1282', T0 + 5400)];   // a сменила станок, b — время, c удаляется
    var tabIndexById = P.slitterTabIndexMap(SLITTERS, snapshot);
    var res = P.planChangeRows(snapshot, projected, [], { slitterById: {}, tabIndexById: tabIndexById });
    var byId = res.byId;

    assertEqual([byId['a'].slitterTabFrom, byId['a'].slitterTabTo], [2, 4],
        '#4444: у переехавшего задания оба номера закладок (2 → 4)');
    assertEqual(P.planChangeStation(byId['a']), '2 → 4', '#4444: колонка показывает смену станка');
    assertEqual(P.planChangeStation(byId['b']), '3',
        '#4444: у задания без смены станка колонка всё равно есть — просто «3»');
    assertEqual(P.planChangeStation(byId['c']), '4', '#4444: у удаляемой записи — её закладка');
})();

// ── 4) Из текстовой колонки «что ещё» станок убран — он теперь свой столбец ────────────────────
(function () {
    function cut(id, sid, ts) {
        return { id: id, slitter: { id: sid }, number: String(ts), planDate: String(ts),
                 materialName: 'MW308', winding: 'OUT', plannedRuns: 5 };
    }
    var T0 = 1785214800;
    var snapshot = [cut('a', '1279', T0)];
    var projected = [cut('a', '1285', T0)];   // сменился ТОЛЬКО станок
    var res = P.planChangeRows(snapshot, projected, [],
        { slitterById: {}, tabIndexById: P.slitterTabIndexMap(SLITTERS, snapshot) });
    var row = res.byId['a'];
    assert(row.slitterChanged, 'контроль: смена станка распознана');
    var rest = P.planChangeRest(row);
    assert(!/Станок\s/.test(rest), '#4444: имя станка из текстовой колонки убрано (' + rest + ')');
    assertEqual(rest, 'только станок', '#4444: строка без тайминга честно говорит, что сменился станок');
    assert(/станок 2 → 4/.test(P.planChangeTitle(row)),
        '#4444: подсказка на карточке тоже показывает номера закладок: ' + P.planChangeTitle(row));
})();

process.on('exit', function () {
    console.log('\n' + passed + '/' + total + ' passed');
});
