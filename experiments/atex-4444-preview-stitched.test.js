// Tests for ideav/crm#4444 (комментарий) — «Если одно задание заканчивается в 14:38, я ожидаю
// где-то увидеть другое — чтобы начиналось в это же время, а времена вообще никакие не совпадают —
// как проверять?» и «Последнее задание заканчивается в 17:52 — это недопустимо, максимум 16:40».
//
// Предпросмотр «Упорядочить» (#4402) рисовал СЫРОЙ вывод упаковщика: «Дату план» считает упаковщик,
// а длительность карточки — колонки наладки (computeCutSetupUpdates). Это два разных расчёта, и их
// расхождение видно на экране дырами и наложениями: конец одной карточки не совпадает с началом
// следующей, а хвост дня уезжает за конец смены — при том, что СУММА минут дня в норме.
//
// Записываемый план мы сводим встык (#4438, reconcilePlanStarts в applySplitPlan) — значит и
// показывать надо сведённый: предпросмотр обязан показывать ровно то, что запишет «Применить».
// Теперь startPlanPreview сводит проекцию (reconcilePreviewStarts) и тем же сдвигом правит ops.
//
// Run with: node experiments/atex-4444-preview-stitched.test.js

process.env.TZ = 'Europe/Moscow';

// ── Минимальный DOM-стаб (как в atex-4402-optimize-preview.test.js) ──
function StubNode(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.childNodes = []; this.attributes = {}; this.dataset = {}; this.style = {};
    this._className = ''; this._text = ''; this._listeners = {}; this.value = ''; this.disabled = false; this.options = [];
    var self = this;
    this.classList = {
        add: function (c) { if (self._classes().indexOf(c) === -1) self._className = (self._className + ' ' + c).trim(); },
        remove: function (c) { self._className = self._classes().filter(function (x) { return x !== c; }).join(' '); },
        contains: function (c) { return self._classes().indexOf(c) !== -1; },
        toggle: function (c, on) { if (on) this.add(c); else this.remove(c); }
    };
}
StubNode.prototype._classes = function () { return this._className.split(/\s+/).filter(Boolean); };
Object.defineProperty(StubNode.prototype, 'className', { get: function () { return this._className; }, set: function (v) { this._className = String(v || ''); } });
Object.defineProperty(StubNode.prototype, 'textContent', {
    get: function () { if (this.childNodes.length) return this.childNodes.map(function (c) { return c.textContent; }).join(''); return this._text; },
    set: function (v) { this._text = String(v == null ? '' : v); this.childNodes = []; } });
Object.defineProperty(StubNode.prototype, 'innerHTML', { get: function () { return ''; }, set: function (v) { if (v === '') { this.childNodes = []; this._text = ''; } } });
Object.defineProperty(StubNode.prototype, 'firstChild', { get: function () { return this.childNodes[0] || null; } });
StubNode.prototype.appendChild = function (n) { this.childNodes.push(n); n.parentNode = this; if (this.tagName === 'SELECT' && n.tagName === 'OPTION') this.options.push(n); return n; };
StubNode.prototype.removeChild = function (n) { this.childNodes = this.childNodes.filter(function (c) { return c !== n; }); return n; };
StubNode.prototype.setAttribute = function (k, v) { this.attributes[k] = String(v); };
StubNode.prototype.getAttribute = function (k) { return this.attributes[k] == null ? null : this.attributes[k]; };
StubNode.prototype.addEventListener = function () {};
StubNode.prototype.focus = function () {}; StubNode.prototype.setSelectionRange = function () {};
StubNode.prototype._all = function (acc) { this.childNodes.forEach(function (c) { if (c instanceof StubNode) { acc.push(c); c._all(acc); } }); return acc; };
StubNode.prototype.querySelectorAll = function (sel) { var cls = sel.replace(/^\./, ''); return this._all([]).filter(function (n) { return n.classList.contains(cls); }); };
StubNode.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };

global.document = {
    createElement: function (tag) { return new StubNode(tag); },
    createTextNode: function (t) { var n = new StubNode('#text'); n._text = String(t == null ? '' : t); return n; },
    body: new StubNode('body'), readyState: 'loading', getElementById: function () { return null; }, addEventListener: function () {}
};
global.window = { db: 'testdb' };

var api = require('../download/atex/js/production-planning.js');
var Controller = api.Controller;

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

function tsAt(hh, mm) { return Math.floor(new Date(2026, 6, 28, hh, mm, 0, 0).getTime() / 1000); }
var DAY_START = tsAt(8, 0);
function minOf(tsSec) { return Math.round((Number(tsSec) - DAY_START) / 60) + 480; }
function hhmm(tsSec) { var d = new Date(Number(tsSec) * 1000); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

// Задание со СВОИМ хранимым таймингом: занятость = k + m + cut.
function cutOf(id, planTs, o) {
    o = o || {};
    return { id: id, number: String(planTs), planDate: String(planTs),
        slitter: { id: '101', label: 'Станок 101' },
        materialName: o.mat || 'MW308', materialId: o.matId || '500', winding: 'OUT',
        knifeWidths: [110], knifeCount: 1, plannedRuns: o.runs || 6, length: 300,
        duration: o.cut == null ? 40 : o.cut, status: '', startDate: '', endDate: '',
        leaders: [], sleeves: [],
        storedKnifeSetupMin: String(o.k == null ? 0 : o.k),
        storedMaterialWindingMin: String(o.m == null ? 15 : o.m),
        storedCutAndLeaderMin: String(o.cut == null ? 40 : o.cut) };
}
function makeController(cuts) {
    var root = new StubNode('div'); root.attributes['data-db'] = 'testdb';
    var c = new Controller(root);
    c.root = root;
    c.planBarEl = new StubNode('div'); c.formEl = new StubNode('div');
    c.queueEl = new StubNode('div'); c.linkEl = new StubNode('div');
    c.filter = { slitter: '', status: '', date: '2026-07-28', dateTo: '2026-07-29', query: '' };
    c.slitters = [{ id: '101', label: 'Станок 101' }];
    c.activeSlitter = '101';
    c.cuts = cuts;
    c.positions = []; c.genPositions = []; c.supplies = []; c.genBatches = [];
    c.opTimes = { WIND_300: 1.2 };
    c.changeTimes = { KNIFE: 30, MATERIAL_WINDING: 15, BETWEEN_CUTS: 2, CLEANUP_SHIFT: 30 };
    c.footageBySupply = {}; c.consumptionByCut = {};
    c.jumboWidthByMaterial = {}; c.nominalWidthByMaterial = {}; c.actualWidthIndex = null;
    c.daySettings = { DAY_START_HOUR: '8:00', DAY_END_HOUR: '16:30', TOTAL_INTERVALS: '20',
        LUNCH_START: '12:20', LUNCH_DURATION: '40', MAX_OVERWORK_CUTS_MN: '5', MAX_OVERWORK_TUNE_MN: '10' };
    c.prevSetupBySlitter = {};
    c.downtimesBySlitter = {}; c.calendarByDay = {}; c.freezeByDay = {};
    // Без метаданных задания пересчёт колонок и сборка стартов выходят «пустыми» (ранний return).
    c.meta.cut = { id: '1078', reqs: [
        { id: '9001', val: 'Наладка ножей, мин' },
        { id: '9002', val: 'Сырье/намотка, мин' },
        { id: '9003', val: 'Резка и Лидер' },
        { id: '9004', val: 'Длительность, минут' }
    ] };
    c.notices = [];
    c.notify = function (msg, kind) { c.notices.push(kind + ': ' + msg); };
    c.renderLink = function () {};
    return c;
}

// ── 1) Предпросмотр сводит карточки встык: конец одного = начало следующего ────────────────────
(function () {
    // Три задания одного дня, занятость 55 / 109 / 137 мин. Упаковщик (ops) выдал старты вразнобой:
    // дыра 82 мин, затем НАЛОЖЕНИЕ 62 мин — ровно то, что было на экране у оператора.
    var cuts = [
        cutOf('11', tsAt(8, 0), { k: 0, m: 15, cut: 40, runs: 3 }),      // 55 мин
        cutOf('12', tsAt(9, 0), { k: 30, m: 15, cut: 64, runs: 20 }),    // 109 мин
        cutOf('13', tsAt(11, 0), { k: 30, m: 15, cut: 92, runs: 32 })    // 137 мин
    ];
    var c = makeController(cuts);
    var ops = { updates: [
        { cutId: '11', planStartTs: tsAt(8, 0), plannedRuns: 3 },
        { cutId: '12', planStartTs: tsAt(10, 17), plannedRuns: 20 },   // должно быть 08:55 → дыра 82 мин
        { cutId: '13', planStartTs: tsAt(11, 4), plannedRuns: 32 }     // раньше конца предыдущей → наложение
    ], creates: [], deletes: [] };
    c.startPlanPreview({ ops: ops, reassign: null, tailSetup: {}, slitterChange: false,
        coBefore: 100, coAfter: 90, lateBefore: 0, lateAfter: 0 });

    var shown = c.cuts.slice().sort(function (a, b) { return Number(a.planDate) - Number(b.planDate); });
    var starts = shown.map(function (x) { return hhmm(x.planDate); });
    var occ = shown.map(function (x) {
        return Math.round(Number(x.storedKnifeSetupMin)) + Math.round(Number(x.storedMaterialWindingMin))
             + Math.round(Number(x.storedCutAndLeaderMin));
    });
    assertEqual(starts[0], '08:00', '#4444: день начинается с начала смены');
    assert(starts.length === 3, 'все три задания на месте: ' + starts.join(' / '));
    for (var i = 1; i < shown.length; i++) {
        var prevEnd = Number(shown[i - 1].planDate) + occ[i - 1] * 60;
        assertEqual(Number(shown[i].planDate), prevEnd,
            '#4444: задание ' + shown[i].id + ' начинается ровно там, где кончилось предыдущее (' + hhmm(prevEnd) + ')');
    }

    // «Применить» обязан записать РОВНО показанное.
    var byId = {}; ops.updates.forEach(function (u) { byId[String(u.cutId)] = Number(u.planStartTs); });
    shown.forEach(function (x) {
        assertEqual(hhmm(byId[String(x.id)]), hhmm(x.planDate),
            '#4444: в ops у ' + x.id + ' то же время, что на карточке — показанное и записываемое совпали');
    });
})();

// ── 2) Хвост дня не уезжает за конец смены ─────────────────────────────────────────────────────
(function () {
    // Сумма минут дня 55 + 109 + 137 = 301 — в норме. Сырые старты упаковщика тянули последнюю
    // карточку до 17:52 при потолке смены; сведённый день обязан кончиться по сумме минут.
    var cuts = [
        cutOf('21', tsAt(8, 0), { k: 0, m: 15, cut: 40, runs: 3 }),
        cutOf('22', tsAt(9, 0), { k: 30, m: 15, cut: 64, runs: 20 }),
        cutOf('23', tsAt(11, 0), { k: 30, m: 15, cut: 92, runs: 32 })
    ];
    var c = makeController(cuts);
    var ops = { updates: [
        { cutId: '21', planStartTs: tsAt(8, 0), plannedRuns: 3 },
        { cutId: '22', planStartTs: tsAt(15, 40), plannedRuns: 20 },
        { cutId: '23', planStartTs: tsAt(16, 55), plannedRuns: 32 }   // конец 19:12 — за смену
    ], creates: [], deletes: [] };
    c.startPlanPreview({ ops: ops, reassign: null, tailSetup: {}, slitterChange: false,
        coBefore: 100, coAfter: 90, lateBefore: 0, lateAfter: 0 });

    var shown = c.cuts.slice().sort(function (a, b) { return Number(a.planDate) - Number(b.planDate); });
    var last = shown[shown.length - 1];
    var occLast = Math.round(Number(last.storedKnifeSetupMin)) + Math.round(Number(last.storedMaterialWindingMin))
                + Math.round(Number(last.storedCutAndLeaderMin));
    var endMin = minOf(Number(last.planDate)) + occLast;
    assert(endMin <= 16 * 60 + 40,
        '#4444: день кончается не позже потолка смены — ' + hhmm(Number(last.planDate) + occLast * 60) + ' (было 19:12)');
    // Конец дня = начало смены + сумма занятостей (обеда в этом наборе нет — день короткий).
    var sumOcc = shown.reduce(function (acc, x) {
        return acc + Math.round(Number(x.storedKnifeSetupMin)) + Math.round(Number(x.storedMaterialWindingMin))
             + Math.round(Number(x.storedCutAndLeaderMin));
    }, 0);
    assertEqual(endMin, 8 * 60 + sumOcc,
        '#4444: конец дня = сумме минут заданий, а не сырым стартам упаковщика');
})();

// ── 3) Согласованный план предпросмотр не трогает ──────────────────────────────────────────────
(function () {
    var cuts = [
        cutOf('31', tsAt(8, 0), { k: 0, m: 15, cut: 40, runs: 3 }),     // 55 → до 08:55
        cutOf('32', tsAt(8, 55), { k: 30, m: 15, cut: 64, runs: 20 })   // 109 → до 10:44
    ];
    var c = makeController(cuts);
    var ops = { updates: [
        { cutId: '31', planStartTs: tsAt(8, 0), plannedRuns: 3 },
        { cutId: '32', planStartTs: tsAt(8, 55), plannedRuns: 20 }
    ], creates: [], deletes: [] };
    var wasNotices = c.notices.length;
    c.startPlanPreview({ ops: ops, reassign: null, tailSetup: {}, slitterChange: false,
        coBefore: 100, coAfter: 90, lateBefore: 0, lateAfter: 0 });
    var shown = c.cuts.slice().sort(function (a, b) { return Number(a.planDate) - Number(b.planDate); });
    assertEqual(shown.map(function (x) { return hhmm(x.planDate); }), ['08:00', '08:55'],
        '#4444: план, который и так встык, предпросмотр не двигает');
    assertEqual(ops.updates.length, 2, '#4444: лишних записей в ops не появилось');
})();

process.on('exit', function () {
    console.log('\n' + passed + '/' + total + ' passed');
});
