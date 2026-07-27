// Tests for ideav/crm#4440 — «Почему не переставляются задания? Выгодно поменять местами 3 и 4».
//
// «Упорядочить» строит два ГЛОБАЛЬНЫХ кандидата (B — порядок/дни на текущих станках, A — со сменой
// станка) и сравнивает их с текущим планом ЦЕЛИКОМ. Если оба вышли хуже, кнопка не делала НИЧЕГО —
// и очевидно выгодная перестановка соседей внутри одного дня оставалась невыполненной. На стенде
// ateh1 (Станок 2, 28.07.2026) день стоял с числом ножей 15 → 15 → 8 → 15 → 8 → 18: четыре смены
// ножей там, где хватает двух, а лог писал «ни один кандидат не лучше текущего, план НЕ трогаем».
//
// Теперь при проигрыше глобальных кандидатов пробуется ЛОКАЛЬНОЕ улучшение — перестановка ВНУТРИ
// дня (`intraDayImprovementOps`): состав дня, его номер и станок не меняются, меняется только
// порядок, поэтому сроки и загрузка дней те же. Порядок считает тот же движок, что при генерации
// (`resequenceWithinDays`, #4139/#3996). Результат показывается обычным предпросмотром #4402.
//
// Run with: node experiments/atex-4440-intraday-improvement.test.js

process.env.TZ = 'Europe/Moscow';

var mod = require('../download/atex/js/production-planning.js');
var Controller = mod.Controller;
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

var BASE = new Date(2026, 6, 28, 0, 0, 0, 0).getTime();   // Вт 28.07.2026
var TIMES = { KNIFE: 30, MATERIAL_WINDING: 15, KNIFE_MOVE: 0, BETWEEN_CUTS: 2, CLEANUP_SHIFT: 30 };
var OP_TIMES = { WIND_300: 1.2 };
var DAY_SETTINGS = { DAY_START_HOUR: '8:00', DAY_END_HOUR: '16:30', LUNCH_START: '12:20',
    LUNCH_DURATION: '40', TOTAL_INTERVALS: '20', MAX_OVERWORK_CUTS_MN: '5', MAX_OVERWORK_TUNE_MN: '10',
    SLOT_PLACEMENT: '1' };

function ts(dayOff, minute) { return String(Math.floor(BASE / 1000) + dayOff * 86400 + minute * 60); }
function widths(n, w) { var a = []; for (var i = 0; i < n; i++) a.push(w); return a; }
function dayKeyOf(dayOff) {
    var d = new Date(BASE + dayOff * 86400000);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
// Задание дня: knives — число ножей (оно же ширина полосы), mat — сырьё.
function cut(id, dayOff, minute, o) {
    o = o || {};
    var runs = o.runs || 10;
    var mins = Math.ceil(runs * 1.2) + 2 * runs;
    return { id: id, orderId: 'O' + id, firstPartId: id,
        slitter: { id: o.sid || '1279', label: 'Станок 2' },
        materialId: o.mat || 'MW308', winding: 'OUT', batchId: '',
        knifeWidths: widths(o.knives, o.width || (900 / o.knives)), knifeCount: o.knives,
        rollerWidth: o.roller || 60, plannedRuns: runs, isFoil: false, length: 300, status: '',
        startDate: '', endDate: '', fixed: false,
        planDate: ts(dayOff, minute), number: ts(dayOff, minute),
        duration: String(Math.ceil(runs * 1.2)),
        storedKnifeSetupMin: String(o.k == null ? 30 : o.k),
        storedMaterialWindingMin: String(o.m == null ? 15 : o.m),
        storedCutAndLeaderMin: String(mins) };
}
function makeSelf(cuts, freezeDays) {
    var self = Object.create(Controller.prototype);
    self.cuts = cuts;
    self.changeTimes = TIMES; self.opTimes = OP_TIMES; self.daySettings = DAY_SETTINGS;
    self.filter = { date: '2026-07-28', dateTo: '2026-08-09' };
    self.supplies = []; self.genPositions = []; self.footageBySupply = {}; self.positionLengthById = {};
    self.slitters = [{ id: '1279', label: 'Станок 2' }];
    self.downtimesBySlitter = {}; self.calendarByDay = {};
    self.freezeByDay = {};
    (freezeDays || []).forEach(function (d) { self.freezeByDay[dayKeyOf(d)] = { id: 'f' + d, notes: '' }; });
    self.meta = { cut: { id: '1078', reqs: [] }, calendar: { id: '1' },
        freeze: (freezeDays && freezeDays.length) ? { id: '2' } : null };
    self.nowMs = function () { return BASE; };
    self.prevSetupBySlitter = {};
    return self;
}
function dayOf(tsSec) { return Math.floor((Number(tsSec) * 1000 - BASE) / 86400000); }
// Реальные минуты переналадки цепочки (та же формула, что у движка).
function chainCost(list) {
    var t = 0, prev = null;
    list.forEach(function (c) { if (prev) t += P.changeoverCost(prev, c, TIMES); prev = c; });
    return t;
}
function orderAfter(self, res, sid, dayOff) {
    var w = {};
    res.updates.forEach(function (u) { w[String(u.cutId)] = Number(u.planStartTs); });
    return self.cuts.filter(function (c) {
        return String(c.slitter.id) === sid && dayOf(c.planDate) === dayOff;
    }).slice().sort(function (a, b) {
        return (w[String(a.id)] || Number(a.planDate)) - (w[String(b.id)] || Number(b.planDate));
    });
}

// ── 1) Сценарий задачи: 15 → 15 → 8 → 15 → 8 → 18 ножей — четыре смены вместо двух ─────────────
(function () {
    var cuts = [
        cut('n1', 0, 480, { knives: 15, mat: 'MW411', k: 0 }),
        cut('n2', 0, 620, { knives: 15, mat: 'MR194', k: 0 }),
        cut('n3', 0, 670, { knives: 8, mat: 'MW411' }),
        cut('n4', 0, 790, { knives: 15, mat: 'MWR200' }),
        cut('n5', 0, 900, { knives: 8, mat: 'MR194' }),
        cut('n6', 0, 970, { knives: 18, mat: 'MW308' })
    ];
    var self = makeSelf(cuts, null);
    var before = cuts.slice();
    var res = Controller.prototype.intraDayImprovementOps.call(self);

    assert(res.updates.length > 0, '#4440: локальное улучшение НАЙДЕНО (раньше «Упорядочить» не делал ничего)');
    var after = orderAfter(self, res, '1279', 0);
    var costBefore = chainCost(before), costAfter = chainCost(after);
    assert(costAfter < costBefore,
        '#4440: реальная переналадка дня СНИЗИЛАСЬ: ' + costBefore + ' → ' + costAfter + ' мин');

    // Смены ножей: было 4 (15→8, 8→15, 15→8, 8→18), должно стать 2.
    function knifeSwitches(list) {
        var n = 0;
        for (var i = 1; i < list.length; i++) if (list[i].knifeCount !== list[i - 1].knifeCount) n++;
        return n;
    }
    assertEqual(knifeSwitches(before), 4, 'исходный день: четыре смены набора ножей');
    assert(knifeSwitches(after) <= 2,
        '#4440: одинаковые наборы ножей собраны в блоки — смен ' + knifeSwitches(after) + ' (было 4): '
            + after.map(function (c) { return c.knifeCount; }).join('→'));
})();

// ── 2) День и станок при перестановке НЕ меняются ──────────────────────────────────────────────
(function () {
    var cuts = [
        cut('a1', 0, 480, { knives: 15, mat: 'MW411', k: 0 }),
        cut('a2', 0, 620, { knives: 8, mat: 'MR194' }),
        cut('a3', 0, 700, { knives: 15, mat: 'MWR200' }),
        cut('b1', 1, 480, { knives: 22, mat: 'MW308' }),
        cut('b2', 1, 600, { knives: 22, mat: 'MW308', k: 0 })
    ];
    var self = makeSelf(cuts, null);
    var byId = {}; cuts.forEach(function (c) { byId[String(c.id)] = c; });
    var res = Controller.prototype.intraDayImprovementOps.call(self);
    assert(res.updates.length > 0, '#4440: перестановка предложена');
    var movedDay = res.updates.filter(function (u) { return dayOf(u.planStartTs) !== dayOf(byId[String(u.cutId)].planDate); });
    assertEqual(movedDay.length, 0, '#4440: НИ ОДНО задание не сменило день');
    var slots = {};
    res.updates.forEach(function (u) { slots[String(u.planStartTs)] = (slots[String(u.planStartTs)] || 0) + 1; });
    assert(Object.keys(slots).every(function (k) { return slots[k] === 1; }),
        '#4440: старты дня переназначены без дублей (перестановка, а не наложение)');
})();

// ── 3) Уже оптимальный день — не трогаем ──────────────────────────────────────────────────────
(function () {
    var cuts = [
        cut('o1', 0, 480, { knives: 15, mat: 'MW411', k: 0 }),
        cut('o2', 0, 620, { knives: 15, mat: 'MR194', k: 0 }),
        cut('o3', 0, 700, { knives: 8, mat: 'MWR200' })
    ];
    var self = makeSelf(cuts, null);
    var res = Controller.prototype.intraDayImprovementOps.call(self);
    assertEqual(res.updates.length, 0, '#4440: в согласованном дне перестановка не предлагается');
    assertEqual(res.gainMin, 0, '#4440: выигрыш 0 — писать нечего');
})();

// ── 4) Замороженный день локальное улучшение не трогает (#4436) ───────────────────────────────
(function () {
    var cuts = [
        cut('f1', 0, 480, { knives: 15, mat: 'MW411', k: 0 }),
        cut('f2', 0, 620, { knives: 8, mat: 'MR194' }),
        cut('f3', 0, 700, { knives: 15, mat: 'MWR200' })
    ];
    var self = makeSelf(cuts, [0]);
    var res = Controller.prototype.intraDayImprovementOps.call(self);
    assertEqual(res.updates.length, 0, '#4440: в замороженном дне порядок не переставляем — замок дня старше');
})();

// ── 5) Начатое задание не переставляем (#4381) ────────────────────────────────────────────────
(function () {
    var cuts = [
        cut('s1', 0, 480, { knives: 15, mat: 'MW411', k: 0 }),
        cut('s2', 0, 620, { knives: 8, mat: 'MR194' }),
        cut('s3', 0, 700, { knives: 15, mat: 'MWR200' })
    ];
    cuts[1].startDate = ts(0, 620);   // второе задание уже идёт на станке
    var self = makeSelf(cuts, null);
    var res = Controller.prototype.intraDayImprovementOps.call(self);
    var touched = res.updates.map(function (u) { return String(u.cutId); });
    assert(touched.indexOf('s2') < 0, '#4440: начатое задание перестановкой не двигаем');
})();

process.on('exit', function () {
    console.log('\n' + passed + '/' + total + ' passed');
});
