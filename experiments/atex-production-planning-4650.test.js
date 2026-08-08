// Тесты для ideav/crm#4650 — «влезает в смену → не разрывать задание, сдвигать паровозом».
//
// ПРАВИЛО (заказчик, 07.08.2026). Задание, которое ЦЕЛИКОМ влезает в смену и стои́т на дне своего
// срока, не разрывается по потолку дня: место ему уступают соседи с БОЛЕЕ ПОЗДНИМ сроком — и
// уступают ЦЕЛИКОМ, а не куском. Если задание не влезает даже в пустую смену, правило его не
// касается: рвать такое по границе дня заказчик разрешил прямо (#4519, #4512).
//
// БОЕВОЙ СЛУЧАЙ (ateh, Станок 1, 10.08.2026 — снят 08.08.2026). Заказ 4587: 100 проходов = 336 мин
// при потолке 455, срок 10.08. Задание стояло ЧЕТВЁРТЫМ за тремя зафиксированными (🔒) заданиями
// со сроком 11.08 (23 + 38 + 118 = 179 мин), не влезало в остаток дня и было разорвано 81 / 19 —
// хвост уезжал на 11.08 и становился ПРОСРОЧКОЙ. Диспетчер собрал правильную раскладку руками
// двумя переносами 🗓: 336 + 23 + 38 = 397 на 10.08, а 118 (заказ 4624) целиком на 11.08.
// Здесь проверяется, что планировщик приходит к ней САМ.
//
// Меряем СМЫСЛ раскладки, а не вызовы: сколько записей у заказа, на каком дне, не позже ли срока.
//
//   A — задание своего срока цело: один сегмент, все 100 проходов на дне срока;
//   B — уступивший сосед уехал ЦЕЛИКОМ (не разорван) — дефект не переехал на другой заказ;
//   C — день не длиннее смены (ТЗ §15, DAY_CAPACITY цел);
//   D — просрочки не появилось: ни одно задание не встало позже своего срока;
//   E — план БЕЗ сроков правило не трогает вовсе (прежняя раскладка);
//   F — не влезающее в пустую смену рвётся как раньше (#4519/#4512 целы);
//   G — уступать «в никуда» правило не заставляет: если сосед от переезда ОПОЗДАЕТ, он остаётся.
//
// Run with: node experiments/atex-production-planning-4650.test.js

process.env.TZ = 'UTC';
global.window = { db: 'ateh', xsrf: 'x' };
var P = require('../download/atex/js/production-planning.js').planning;

var passed = 0, total = 0;
function assert(cond, name, extra) {
    total++;
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? '  ' + extra : ''));
    if (cond) passed++; else process.exitCode = 1;
}

var TIMES = { KNIFE: 0, MATERIAL_WINDING: 0, BETWEEN_CUTS: 0 };   // наладки нулевые — меряем чистую ёмкость
var CAP = 455;                                                    // потолок дня боевого станка

// Задание: work минут работы при 1 мин/проход (проходов = work) — чтобы разрыв был возможен
// попроходно и «сколько проходов уехало» читалось прямо.
function cut(id, work, fixed) {
    return { id: id, materialId: 'M1', winding: 'OUT', batchId: 'B1', knifeWidths: [100],
             knifeCount: 1, rollerWidth: 100, isFoil: false, plannedRuns: work, fixed: !!fixed,
             _work: work };
}
function pack(cuts, due, opts) {
    var perPass = {}, runs = {}, anchor = {};
    cuts.forEach(function (c) {
        perPass[String(c.id)] = 1; runs[String(c.id)] = c._work;
        if (c.fixed) anchor[String(c.id)] = 0;
    });
    return P.splitMachineQueue(cuts, Object.assign({
        dayStartMin: 480, dayEndMin: 480 + CAP, dayEndHourMin: 480 + CAP,
        times: TIMES, perPassByCut: perPass, runsByCut: runs, dayAnchorByCut: anchor,
        dueDayByCut: due, gapFill: true, orderAuthoritative: true
    }, opts || {}));
}
function segsOf(rows, id) {
    return rows.filter(function (s) { return String(s.cutId) === String(id) && !s.setupOnly; })
        .sort(function (a, b) { return a.dayOffset - b.dayOffset; });
}
function daysOf(rows, id) { return segsOf(rows, id).map(function (s) { return s.dayOffset; }); }
function runsOf(rows, id, day) {
    return segsOf(rows, id).filter(function (s) { return day == null || s.dayOffset === day; })
        .reduce(function (t, s) { return t + (Number(s.runs) || 0); }, 0);
}
function dayMinutes(rows, day) {
    return rows.filter(function (s) { return s.dayOffset === day; })
        .reduce(function (t, s) { return t + (Number(s.setupMin) || 0) + (Number(s.durationMin) || 0); }, 0);
}
// Просрочка по СМЫСЛУ: хоть один сегмент задания встал позже его срока.
function lateIds(rows, due) {
    var out = [];
    Object.keys(due).forEach(function (id) {
        var last = daysOf(rows, id).slice(-1)[0];
        if (last != null && last > Number(due[id])) out.push(id + '(срок ' + due[id] + ' → день ' + last + ')');
    });
    return out;
}

// ── A/B/C/D: боевая раскладка 4587 ──────────────────────────────────────────────────────────
(function () {
    // Порядок в дне — хранимый (все четыре 🔒), заказ своего срока стои́т ЧЕТВЁРТЫМ.
    var cuts = [cut('4625', 23, true), cut('4617', 38, true), cut('4624', 118, true), cut('4587', 336, true)];
    var due = { '4625': 1, '4617': 1, '4624': 1, '4587': 0 };
    var rows = pack(cuts, due);

    assert(daysOf(rows, '4587').join(',') === '0',
        '#4650-A: задание своего срока ЦЕЛО и стои́т на дне срока (одним сегментом)',
        '(дни: ' + daysOf(rows, '4587').join(',') + ', проходов на дне 0: ' + runsOf(rows, '4587', 0) + ' из 336)');
    assert(runsOf(rows, '4587', 0) === 336,
        '#4650-A: все 336 проходов на дне срока — хвоста нет', '(' + runsOf(rows, '4587', 0) + ')');
    assert(daysOf(rows, '4624').length === 1 && daysOf(rows, '4624')[0] === 1,
        '#4650-B: уступивший сосед уехал ЦЕЛИКОМ — дефект не переехал на другой заказ',
        '(дни 4624: ' + daysOf(rows, '4624').join(',') + ', проходов: ' +
        daysOf(rows, '4624').map(function (d) { return runsOf(rows, '4624', d); }).join('+') + ' из 118)');
    assert(dayMinutes(rows, 0) <= CAP,
        '#4650-C: день не длиннее смены (ТЗ §15)', '(' + dayMinutes(rows, 0) + ' из ' + CAP + ')');
    assert(lateIds(rows, due).length === 0,
        '#4650-D: просрочки не появилось', '(' + (lateIds(rows, due).join(', ') || 'нет') + ')');
})();

// ── E: без сроков правило инертно ───────────────────────────────────────────────────────────
(function () {
    var cuts = [cut('A', 300, true), cut('B', 200, true)];
    var withDue = pack(cuts, {});           // сроков нет
    var noOpt = pack(cuts, {}, { fitInShiftNoSplit: false });
    assert(JSON.stringify(daysOf(withDue, 'B')) === JSON.stringify(daysOf(noOpt, 'B')),
        '#4650-E: план без сроков правило не трогает — раскладка совпадает с выключенным правилом',
        '(дни B: ' + daysOf(withDue, 'B').join(',') + ' против ' + daysOf(noOpt, 'B').join(',') + ')');
})();

// ── F: не влезающее в пустую смену рвётся как раньше (#4519/#4512) ──────────────────────────
(function () {
    var cuts = [cut('X', 600, true)];       // одно задание, длиннее смены, срок сегодня
    var rows = pack(cuts, { X: 0 });
    assert(daysOf(rows, 'X').length > 1,
        '#4650-F: в пустую смену не влезает — рвётся по границе дня, как разрешил заказчик (#4519)',
        '(дни X: ' + daysOf(rows, 'X').join(',') + ')');
})();

// ── G: уступать ценой собственной просрочки правило не заставляет ───────────────────────────
(function () {
    // У соседа СВОЙ срок — тот же день. Уступить он не может: уехать = опоздать. Значит место
    // делится по-старому (разрыв), и правило молчит: опоздание хуже разрыва.
    var cuts = [cut('P', 300, true), cut('Q', 300, true)];
    var due = { P: 0, Q: 0 };
    var rows = pack(cuts, due);
    assert(lateIds(rows, due).length <= 1,
        '#4650-G: правило не создаёт новых просрочек, когда уступать некому',
        '(просрочено: ' + (lateIds(rows, due).join(', ') || 'нет') + ')');
    assert(dayMinutes(rows, 0) <= CAP,
        '#4650-G: день всё равно не длиннее смены', '(' + dayMinutes(rows, 0) + ')');
})();

// ── H: ПОЛНЫЙ путь (planCutOperations), а не только упаковщик ───────────────────────────────
// Проверяем, что срок доходит до упаковщика через контроллерный слой и правило переживает слой
// размещения (§8): у заказа своего срока не должно родиться продолжение, у уступившего — должно.
(function () {
    var BASE = new Date(2026, 7, 10, 0, 0, 0, 0).getTime();
    var DAY0 = Math.floor(BASE / 1000) + 8 * 3600;
    function qc(id, runs, off, fixed) {
        return { id: id, slitter: { id: '1' }, materialId: 'M1', winding: 'OUT', batchId: 'B1',
                 knifeWidths: [100], knifeCount: 1, rollerWidth: 100, plannedRuns: runs,
                 isFoil: false, fixed: !!fixed, status: '', firstPartId: id,
                 planDate: String(DAY0 + off) };
    }
    var cuts = [qc('4625', 23, 0, true), qc('4617', 38, 60, true),
                qc('4624', 118, 120, true), qc('4587', 336, 180, true)];
    var perPass = { '4625': 1, '4617': 1, '4624': 1, '4587': 1 };
    var due = { '4625': 1, '4617': 1, '4624': 1, '4587': 0 };
    var ops = P.planCutOperations(cuts, {
        planBaseMidnightMs: BASE, weights: {}, times: TIMES,
        dayStartMin: 480, dayEndMin: 480 + CAP, dayEndHourMin: 480 + CAP,
        maxOverworkCutsMin: 5, maxOverworkTuneMin: 10, lunchStartMin: 740, lunchDurationMin: 40,
        gapFill: true, preserveOrder: false, slotPlacement: true, firstCutSetup: false,
        prevSetupBySlitter: {}, intraDayResequence: true, perPassByCut: perPass,
        slitterIds: ['1'], dueDayByCut: due, dueKeyByCut: {},
        dayAnchorByCut: { '4625': 0, '4617': 0, '4624': 0, '4587': 0 }
    });
    var contOf = function (id) {
        return (ops.creates || []).filter(function (c) { return String(c.parentCutId) === id; });
    };
    var upd = function (id) {
        return (ops.updates || []).filter(function (u) { return String(u.cutId) === id; })[0];
    };
    assert(contOf('4587').length === 0,
        '#4650-H: полный путь — у задания своего срока продолжений НЕ создаётся (не разорвано)',
        '(продолжений: ' + contOf('4587').length + ')');
    var u87 = upd('4587');
    assert(!u87 || Number(u87.plannedRuns) === 336 || u87.plannedRuns == null,
        '#4650-H: все 336 проходов остались на самом задании',
        '(проходов: ' + (u87 ? u87.plannedRuns : 'запись не менялась') + ')');
    assert(contOf('4624').length === 0,
        '#4650-H: уступивший сосед тоже ЦЕЛ — он переехал, а не разорвался',
        '(продолжений 4624: ' + contOf('4624').length + ')');
})();

console.log('\n' + passed + '/' + total + ' проверок пройдено');
if (passed !== total) process.exitCode = 1;
