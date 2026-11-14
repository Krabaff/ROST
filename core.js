/* Ядро расчётов: план, токены роста. Без зависимостей от DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Группы мышц и их вес в оценке ----------
  const GROUPS = {
    back: { name: 'Спина', w: 0.25 },
    chest: { name: 'Грудь', w: 0.2 },
    shoulders: { name: 'Плечи', w: 0.2 },
    biceps: { name: 'Бицепс', w: 0.15 },
    triceps: { name: 'Трицепс', w: 0.2 },
  };

  // ---------- Упражнения (g: вклад в группы; 1 = основная, 0.5 = вторичная) ----------
  const EXERCISES = {
    pullup_band: { name: 'Подтягивания с резинкой', g: { back: 1, biceps: 0.5 }, sets: 4, reps: [6, 10], tip: 'Хват чуть шире плеч, грудь к перекладине' },
    chinup: { name: 'Подтягивания обратным хватом', g: { back: 1, biceps: 1 }, sets: 4, reps: [6, 10], tip: 'Хват на ширине плеч, без раскачки' },
    pullup_wide: { name: 'Подтягивания широким хватом', g: { back: 1, biceps: 0.5 }, sets: 4, reps: [5, 9], tip: 'Хват шире плеч, лопатки вниз' },
    dips: { name: 'Отжимания на брусьях', g: { chest: 1, triceps: 1 }, sets: 4, reps: [8, 12], tip: 'Корпус слегка вперёд, опускаться до 90° в локтях' },
    dips_tri: { name: 'Брусья, акцент на трицепс', g: { triceps: 1, chest: 0.5 }, sets: 3, reps: [8, 12], tip: 'Корпус вертикально, локти назад' },
    pushup_feet: { name: 'Отжимания с упором ног на возвышение', g: { chest: 1, shoulders: 0.5, triceps: 0.5 }, sets: 3, reps: [10, 15], tip: 'Ноги выше уровня рук' },
    band_row: { name: 'Тяга резинки к поясу', g: { back: 1, biceps: 0.5 }, sets: 3, reps: [12, 15], tip: 'Сводить лопатки, пауза 1 с' },
    pike_pushup: { name: 'Отжимания «домиком»', g: { shoulders: 1, triceps: 0.5 }, sets: 3, reps: [8, 12], tip: 'Бёдра вверх, голова между руками' },
    band_press: { name: 'Жим резинки над головой', g: { shoulders: 1, triceps: 0.5 }, sets: 3, reps: [10, 15], tip: 'Корпус ровно, не прогибать поясницу' },
    band_lateral: { name: 'Разведения резинки в стороны', g: { shoulders: 1 }, sets: 3, reps: [12, 20], tip: 'До уровня плеч, без рывков' },
    band_facepull: { name: 'Тяга резинки к лицу', g: { shoulders: 1, back: 0.5 }, sets: 3, reps: [12, 20], tip: 'Локти высоко, развести кисти у лица' },
    band_curl: { name: 'Сгибания на бицепс с резинкой', g: { biceps: 1 }, sets: 3, reps: [10, 15], tip: 'Локти прижаты, медленный негатив' },
    band_hammer: { name: 'Молотковые сгибания с резинкой', g: { biceps: 1 }, sets: 3, reps: [10, 15], tip: 'Нейтральный хват' },
    band_pushdown: { name: 'Разгибания на трицепс с резинкой', g: { triceps: 1 }, sets: 3, reps: [12, 15], tip: 'Резинка на турнике, локти у корпуса' },
    band_overhead_ext: { name: 'Французский жим с резинкой', g: { triceps: 1 }, sets: 3, reps: [10, 15], tip: 'Локти смотрят вверх' },
  };

  const PLAN = {
    A: { name: 'Верх A · тяга и жим', ex: ['pullup_band', 'dips', 'band_row', 'pike_pushup', 'band_curl', 'band_pushdown'] },
    B: { name: 'Верх B · бицепс и грудь', ex: ['chinup', 'pushup_feet', 'dips_tri', 'band_facepull', 'band_hammer', 'band_overhead_ext'] },
    C: { name: 'Верх C · плечи и спина', ex: ['pullup_wide', 'dips', 'band_press', 'band_lateral', 'band_curl', 'band_pushdown'] },
  };

  // ---------- Даты ----------
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dstr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
  const weekday = (s) => parse(s).getDay(); // 0 = вс

  // ---------- Состояние ----------
  function defaultState() {
    return {
      v: 1,
      profile: { weight: 88, height: 195, age: 20, tdee: 3000, level: 0.9, share: 0.45, proteinPerKg: 1.6 },
      schedule: { 1: 'A', 3: 'B', 5: 'C' },
      logs: {},
      foods: [
        { name: 'Куриная грудка', unit: '100 г', kcal: 165, p: 31, c: 0, f: 3.6 },
        { name: 'Рис варёный', unit: '100 г', kcal: 130, p: 2.7, c: 28, f: 0.3 },
        { name: 'Гречка варёная', unit: '100 г', kcal: 110, p: 4, c: 21, f: 1 },
        { name: 'Овсянка сухая', unit: '100 г', kcal: 370, p: 13, c: 60, f: 7 },
        { name: 'Творог 5%', unit: '100 г', kcal: 121, p: 17, c: 1.8, f: 5 },
        { name: 'Яйцо', unit: '1 шт', kcal: 70, p: 6, c: 0.5, f: 5 },
        { name: 'Молоко 2.5%', unit: '250 мл', kcal: 130, p: 7.5, c: 12, f: 6.3 },
        { name: 'Банан', unit: '1 шт', kcal: 105, p: 1.3, c: 27, f: 0.4 },
        { name: 'Протеин', unit: '1 порция', kcal: 120, p: 24, c: 3, f: 1.5 },
        { name: 'Макароны варёные', unit: '100 г', kcal: 158, p: 5.8, c: 31, f: 0.9 },
      ],
    };
  }

  const getLog = (state, date) => state.logs[date] || {};

  // ---------- Качество подхода по запасу повторов (RIR) ----------
  const quality = (rir) => (rir == null ? 1 : rir <= 3 ? 1 : rir <= 5 ? 0.5 : 0);
  const f = (s) => 1 - Math.exp(-s / 6);

  // Число «рабочих подходов» по группам за 7 дней, заканчивая датой date
  function groupSets(state, date) {
    const out = {};
    for (const g in GROUPS) out[g] = 0;
    for (let i = 0; i < 7; i++) {
      const log = state.logs[addDays(date, -i)];
      if (!log || !log.ex) continue;
      for (const id in log.ex) {
        const ex = EXERCISES[id];
        if (!ex) continue;
        const e = log.ex[id];
        const q = quality(e.rir == null ? 2 : e.rir);
        const done = (e.sets || []).filter((r) => r > 0).length;
        for (const g in ex.g) out[g] += done * q * ex.g[g];
      }
    }
    return out;
  }

  const rawT = (sets) => { let t = 0; for (const g in GROUPS) t += GROUPS[g].w * f(sets[g] || 0); return t; };

  // Объём «идеального» плана (все подходы, RIR 2) за неделю — точка отсчёта 100%
  function planSets() {
    const out = {};
    for (const g in GROUPS) out[g] = 0;
    for (const k in PLAN) for (const id of PLAN[k].ex) { const ex = EXERCISES[id]; for (const g in ex.g) out[g] += ex.sets * ex.g[g]; }
    return out;
  }
  const PLAN_SETS = planSets();
  const TPLAN = rawT(PLAN_SETS);

  // ---------- Питание ----------
  function foodTotals(state, date) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, n: 0 };
    for (const it of getLog(state, date).food || []) { t.kcal += it.kcal; t.p += it.p; t.c += it.c; t.f += it.f; t.n++; }
    return t;
  }

  function energyScore(surplus) {
    const s = surplus;
    if (s <= -0.2) return 0.4;
    if (s < 0) return 0.4 + 0.45 * (s + 0.2) / 0.2;
    if (s < 0.05) return 0.85 + 0.15 * (s / 0.05);
    if (s <= 0.15) return 1;
    if (s < 0.3) return 1 - 0.15 * (s - 0.15) / 0.15;
    return 0.85;
  }

  const sleepOne = (h) => Math.max(0, Math.min(1, (h - 4) / 3.5));

  function sleepInfo(state, date) {
    const hs = [];
    for (let i = 0; i < 7; i++) { const h = getLog(state, addDays(date, -i)).sleep; if (h > 0) hs.push(h); }
    const last = getLog(state, date).sleep;
    if (!hs.length) return { S: null, mean: null, last: null };
    const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    const S = last > 0 ? 0.7 * sleepOne(mean) + 0.3 * sleepOne(last) : sleepOne(mean);
    return { S, mean, last: last > 0 ? last : null };
  }

  const gmax = (p) => (p.level / 100) * p.weight * p.share / 30 * 1000;

  // ---------- Главный расчёт дня ----------
  function computeDay(state, date) {
    const pr = state.profile;
    const Gmax = gmax(pr);
    const sets = groupSets(state, date);
    const Traw = rawT(sets);
    const T = Math.min(1, Traw / TPLAN);

    const ft = foodTotals(state, date);
    const missing = [];
    let P, E, surplus = null;
    if (ft.n === 0) { P = 0.5; E = 0.5; missing.push('food'); }
    else {
      P = Math.min(1, ft.p / (pr.proteinPerKg * pr.weight));
      surplus = (ft.kcal - pr.tdee) / pr.tdee;
      E = energyScore(surplus);
    }
    const si = sleepInfo(state, date);
    let S = si.S;
    if (S == null) { S = 0.5; missing.push('sleep'); }

    const Q = Math.pow(P, 0.4) * Math.pow(E, 0.3) * Math.pow(S, 0.3);
    const M = Gmax * T * Q;

    // Риск регресса (штраф в граммах, до −3 г/день)
    const total = Object.values(sets).reduce((a, b) => a + b, 0);
    const planTotal = Object.values(PLAN_SETS).reduce((a, b) => a + b, 0);
    let pen = 0; const risks = [];
    if (total > 1.4 * planTotal) { const k = Math.min(2, (total / planTotal - 1.4) * 5); pen += k; risks.push('Объём за неделю заметно выше плана — риск перетренированности'); }
    if (si.mean != null && si.mean < 5.5) { pen += 1; risks.push('Средний сон за неделю меньше 5,5 ч'); }
    if (surplus != null && surplus < -0.2 && T > 0.3) { pen += 0.5; risks.push('Глубокий дефицит калорий при тренировках'); }
    pen = Math.min(3, pen);
    const dec = declining(state, date);
    if (dec.length) risks.push('Повторы падают в последних тренировках: ' + dec.map((id) => EXERCISES[id].name).join(', ') + ' — подумайте о разгрузочной неделе (половина подходов)');

    // Что ограничивает прирост
    const lim = [];
    const gain = (T2, P2, E2, S2) => Gmax * T2 * Math.pow(P2, 0.4) * Math.pow(E2, 0.3) * Math.pow(S2, 0.3) - M;
    if (T < 0.999) lim.push({ key: 'train', gain: gain(1, P, E, S), text: 'Выполнить план тренировок полностью' });
    if (P < 0.999) lim.push({ key: 'protein', gain: gain(T, 1, E, S), text: ft.n ? 'Добрать белок до ' + Math.round(pr.proteinPerKg * pr.weight) + ' г' : 'Внести питание за день' });
    if (E < 0.999) lim.push({ key: 'energy', gain: gain(T, P, 1, S), text: ft.n ? (surplus < 0.05 ? 'Добавить калории: цель около ' + Math.round(pr.tdee * 1.08) + ' ккал' : 'Профицит великоват — часть уйдёт в жир') : 'Внести питание за день' });
    if (S < 0.999) lim.push({ key: 'sleep', gain: gain(T, P, E, 1), text: si.S == null ? 'Внести сон' : 'Спать 7,5 ч и больше' });
    lim.sort((a, b) => b.gain - a.gain);

    const tokens = M - pen;
    return { Gmax, sets, Traw, T, P, E, S, R: 1, Q, M, opt: Gmax ? (M / Gmax) * 100 : 0, pen, tokens, surplus, food: ft, sleep: si, missing, limiters: lim.filter((l) => l.gain > 0.05), risks };
  }

  function weeklyTokens(state, date) {
    let s = 0;
    for (let i = 0; i < 7; i++) s += computeDay(state, addDays(date, -i)).tokens;
    return s;
  }

  // ---------- Тренды ----------
  function exerciseSessions(state, id, before) {
    const dates = Object.keys(state.logs).filter((d) => d < before && state.logs[d].ex && state.logs[d].ex[id] && (state.logs[d].ex[id].sets || []).some((r) => r > 0)).sort();
    return dates.map((d) => ({ date: d, sets: state.logs[d].ex[id].sets.filter((r) => r > 0) }));
  }
  const lastSets = (state, id, before) => { const s = exerciseSessions(state, id, before); return s.length ? s[s.length - 1] : null; };

  // Упражнения, у которых суммарные повторы падали три тренировки подряд
  function declining(state, date) {
    const out = [];
    const next = addDays(date, 1);
    for (const id in EXERCISES) {
      const s = exerciseSessions(state, id, next).slice(-4).map((x) => x.sets.reduce((a, b) => a + b, 0));
      if (s.length === 4 && s[1] < s[0] && s[2] < s[1] && s[3] < s[2]) out.push(id);
    }
    return out;
  }

  function weightOn(state, date) {
    for (let i = 0; i < 60; i++) { const w = getLog(state, addDays(date, -i)).weight; if (w > 0) return w; }
    return null;
  }

  return { GROUPS, EXERCISES, PLAN, PLAN_SETS, TPLAN, defaultState, computeDay, weeklyTokens, declining, lastSets, exerciseSessions, groupSets, foodTotals, energyScore, sleepOne, sleepInfo, quality, gmax, weightOn, dstr, parse, addDays, weekday };
});
