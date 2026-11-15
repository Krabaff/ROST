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

  const PROG = {
    pullup_band: ['Резинка слабее', 'Пауза 2 с вверху', 'Медленный негатив 4 с'],
    chinup: ['Пауза 2 с вверху', 'Негатив 4 с', 'Узкий хват'],
    pullup_wide: ['Негатив 4 с', 'Пауза 2 с вверху', 'Хват ещё шире'],
    dips: ['Пауза 2 с внизу', 'Негатив 3–4 с', 'Вес в рюкзаке'],
    dips_tri: ['Пауза 2 с внизу', 'Негатив 3–4 с', 'Вес в рюкзаке'],
    pushup_feet: ['Ноги выше', 'Пауза 2 с внизу', 'Рюкзак с весом'],
    band_row: ['Резинка жёстче', 'Пауза 2 с', 'Одной рукой'],
    pike_pushup: ['Ноги выше', 'Пауза 2 с внизу', 'Негатив 4 с'],
    band_press: ['Резинка жёстче', 'Пауза 2 с', 'Попеременно'],
    band_lateral: ['Резинка жёстче', 'Пауза 2 с вверху', 'Медленный негатив'],
    band_facepull: ['Резинка жёстче', 'Пауза 2 с', 'Больше повторов'],
    band_curl: ['Резинка жёстче', 'Пауза в середине', 'Негатив 4 с'],
    band_hammer: ['Резинка жёстче', 'Пауза в середине', 'Негатив 4 с'],
    band_pushdown: ['Резинка жёстче', 'Пауза 2 с внизу', 'Одной рукой'],
    band_overhead_ext: ['Резинка жёстче', 'Пауза 2 с внизу', 'Одной рукой'],
  };
  for (const id in PROG) EXERCISES[id].prog = PROG[id];

  const WARMUP = [
    ['Круги руками', '20 вперёд и 20 назад, постепенно шире'],
    ['Разведение резинки перед собой', '2×15, лопатки сводить'],
    ['Лопаточные подтягивания на турнике', '2×8: только лопатки вниз, руки прямые'],
    ['Круги кистями и сгибания запястий', '20 секунд'],
    ['Лёгкие отжимания или подтягивания', '1 подход на 50% усилия, 8–10 повторов'],
  ];
  const COOLDOWN = [
    ['Грудь в проёме двери или у брусьев', '2×30 секунд'],
    ['Вис на турнике', '30–45 секунд, плечи расслаблены'],
    ['Трицепс: рука за головой', '2×30 секунд на сторону'],
    ['Бицепс: ладонь на опоре, разворот корпуса', '2×30 секунд на сторону'],
  ];
  const MOBILITY = [
    ['Скольжение по стене (wall slides)', '2×10, спина и локти прижаты'],
    ['Выкруты с резинкой или палкой', '2×10 медленно'],
    ['Разгибание грудного отдела на валике или стуле', '1 минута'],
    ['Круги в плечевом суставе стоя (CARs)', '5 в каждую сторону'],
    ['Вис на турнике', '2×30 секунд'],
  ];
  const PAIN = { elbow: 'Локоть', shoulder: 'Плечо', wrist: 'Запястье', back: 'Спина' };
  const PAIN_EX = {
    elbow: ['band_curl', 'band_hammer', 'band_pushdown', 'band_overhead_ext', 'dips_tri', 'chinup'],
    shoulder: ['pike_pushup', 'band_press', 'band_lateral', 'dips', 'dips_tri', 'pullup_wide'],
    wrist: ['pushup_feet', 'pike_pushup', 'band_curl', 'band_hammer'],
    back: ['pullup_band', 'pullup_wide', 'chinup', 'band_row'],
  };

  // ---------- Даты ----------
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dstr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
  const weekday = (s) => parse(s).getDay(); // 0 = вс

  // ---------- Состояние ----------
  function defaultState() {
    const st = {
      v: 1,
      profile: { weight: 88, height: 195, age: 20, tdee: 3000, level: 0.9, share: 0.45, proteinPerKg: 1.6, fatPerKg: 1.0, trainKcal: 300 },
      schedule: { 1: 'A', 3: 'B', 5: 'C' },
      plan: {},
      deload: null,
      barcodes: {},
      meals: [],
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
    st.meals = defaultMeals(st.foods);
    return st;
  }

  function defaultMeals(foods) {
    const mk = (name, q) => { const f = foods.find((x) => x.name === name); return { name: q === 1 ? f.name : f.name + ' ×' + q, kcal: f.kcal * q, p: f.p * q, c: f.c * q, f: f.f * q }; };
    return [
      { name: 'Завтрак', items: [mk('Овсянка сухая', 0.6), mk('Яйцо', 3), mk('Банан', 1), mk('Молоко 2.5%', 1)] },
      { name: 'Обед', items: [mk('Куриная грудка', 2), mk('Рис варёный', 2)] },
      { name: 'Перекус', items: [mk('Творог 5%', 2), mk('Банан', 1)] },
      { name: 'Шейк', items: [mk('Протеин', 1), mk('Молоко 2.5%', 1), mk('Банан', 1)] },
    ];
  }

  const getLog = (state, date) => state.logs[date] || {};

  // ---------- Качество подхода по запасу повторов (RIR) ----------
  const quality = (rir) => (rir == null ? 1 : rir <= 3 ? 1 : rir <= 5 ? 0.5 : 0);
  const f = (s) => 1 - Math.exp(-s / 6);

  // Отдых между подходами: слишком короткий — меньше повторов в следующих подходах (эвристика)
  const COMPOUND = new Set(['pullup_band', 'chinup', 'pullup_wide', 'dips', 'dips_tri', 'pushup_feet', 'pike_pushup']);
  const restFactor = (id, sec) => { if (!(sec > 0)) return 1; const ideal = COMPOUND.has(id) ? 120 : 60; return 0.8 + 0.2 * Math.min(1, sec / ideal); };

  // Зачётные подходы за один день по группам (запас повторов × отдых)
  function dayRaw(state, d) {
    const out = {}; for (const g in GROUPS) out[g] = 0;
    const log = state.logs[d]; if (!log || !log.ex) return out;
    for (const id in log.ex) {
      const ex = EXERCISES[id]; if (!ex) continue;
      const e = log.ex[id];
      const q = quality(e.rir == null ? 2 : e.rir) * restFactor(id, e.rest);
      const done = (e.sets || []).filter((r) => r > 0).length;
      for (const g in ex.g) out[g] += done * q * (log.deload ? 1.6 : 1) * ex.g[g];
    }
    return out;
  }
  // Убывающая отдача внутри одной тренировки: после ~8 подходов на группу каждый следующий вдвое слабее
  const dim = (s) => (s <= 8 ? s : 8 + 0.5 * (s - 8));
  // Если ту же группу тренировали накануне, подходы засчитываются хуже (до −30%)
  const RECOVERY_MAX = 0.3;

  function windowSets(state, date) {
    const sets = {}, noRec = {};
    for (const g in GROUPS) { sets[g] = 0; noRec[g] = 0; }
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, -i), raw = dayRaw(state, d), prev = dayRaw(state, addDays(d, -1));
      for (const g in GROUPS) {
        if (raw[g] <= 0) continue;
        const p = Math.min(1, prev[g] / 6);
        noRec[g] += dim(raw[g]);
        sets[g] += dim(raw[g] * (1 - RECOVERY_MAX * p));
      }
    }
    return { sets, noRec };
  }
  const groupSets = (state, date) => windowSets(state, date).sets;

  const rawT = (sets) => { let t = 0; for (const g in GROUPS) t += GROUPS[g].w * f(sets[g] || 0); return t; };

  // Объём «идеального» плана (все подходы, RIR 2) за неделю — точка отсчёта 100%
  function planSets() {
    const out = {}; for (const g in GROUPS) out[g] = 0;
    for (const k in PLAN) {
      const s = {}; for (const g in GROUPS) s[g] = 0;
      for (const id of PLAN[k].ex) { const ex = EXERCISES[id]; for (const g in ex.g) s[g] += ex.sets * ex.g[g]; }
      for (const g in GROUPS) out[g] += dim(s[g]);
    }
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
    if (s <= -0.2) return Math.max(0.05, 0.4 * (1 + s) / 0.8);
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

  // ---------- Цели по питанию на конкретный день ----------
  const hasSetsLog = (l) => !!(l && l.ex && Object.values(l.ex).some((e) => (e.sets || []).some((r) => r > 0)));
  const trainingDay = (state, d) => { const wo = workoutOf(state, d); return hasSetsLog(state.logs[d]) || !!(wo && PLAN[wo]); };
  // «Расход» в профиле — средний за неделю с тремя тренировками; день тренировки добавляет trainKcal, день отдыха на столько же меньше среднего
  function dayTDEE(state, d) {
    const pr = state.profile, ex = pr.trainKcal != null ? pr.trainKcal : 300;
    const rest = pr.tdee - (3 * ex) / 7;
    return Math.round(rest + (trainingDay(state, d) ? ex * (deloadOn(state, d) ? 0.6 : 1) : 0));
  }
  function targets(state, d) {
    const pr = state.profile, W = pr.weight, tdee = dayTDEE(state, d), kcal = Math.round(tdee * 1.08);
    const p = Math.round(pr.proteinPerKg * W), fat = Math.round((pr.fatPerKg || 1) * W);
    const carb = Math.max(0, Math.round((kcal - 4 * p - 9 * fat) / 4));
    return { tdee, kcal, train: trainingDay(state, d), p, fat, fatMin: Math.round(0.7 * W), fatMax: Math.round(1.3 * W), carb, carbMin: Math.round(Math.max(3 * W, 0.8 * carb)), carbMax: Math.round(1.2 * carb) };
  }
  function nextWorkout(state, date) {
    for (let i = 1; i <= 7; i++) { const d = addDays(date, i), wo = workoutOf(state, d); if (wo && PLAN[wo]) return { date: d, wo }; }
    return null;
  }

  // ---------- Главный расчёт дня ----------
  function computeDay(state, date) {
    const pr = state.profile;
    const Gmax = gmax(pr);
    const W = windowSets(state, date);
    const sets = W.sets;
    const Traw = rawT(sets), Traw0 = rawT(W.noRec);
    let sr = 0, s0 = 0; for (const g in GROUPS) { sr += GROUPS[g].w * W.sets[g]; s0 += GROUPS[g].w * W.noRec[g]; }
    const R = s0 > 0 ? sr / s0 : 1; // восстановление: доля подходов, засчитанных после учёта предыдущего дня
    const T = Math.min(1, Traw0 / TPLAN) * R;

    const ft = foodTotals(state, date);
    const missing = [];
    const tg = targets(state, date);
    let P, E, Eraw = 0.5, comp = 1, surplus = null;
    if (ft.n === 0) { P = 0.5; E = 0.5; missing.push('food'); }
    else {
      P = Math.min(1, ft.p / (pr.proteinPerKg * pr.weight));
      surplus = (ft.kcal - tg.tdee) / tg.tdee;
      E = Eraw = energyScore(surplus);
      // Состав: углеводы ниже нормы снижают работоспособность, жиры — гормональный фон (до −10% каждый). Только когда день внесён почти целиком и БЖУ сходятся с калориями
      if (ft.kcal >= 0.7 * tg.kcal && 4 * (ft.p + ft.c) + 9 * ft.f >= 0.75 * ft.kcal) {
        const cf = 1 - 0.1 * Math.max(0, Math.min(1, (tg.carbMin - ft.c) / (0.5 * tg.carbMin)));
        const ff = 1 - 0.1 * Math.max(0, Math.min(1, (tg.fatMin - ft.f) / (0.5 * tg.fatMin)));
        comp = cf * ff; E = Eraw * comp;
      }
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

    if (R < 0.95) risks.push('Тренировки идут слишком плотно: одни и те же мышцы не успевают восстановиться (−' + Math.round((1 - R) * 100) + '% к зачёту подходов)');

    // Что ограничивает прирост
    const lim = [];
    const gain = (T2, P2, E2, S2) => Gmax * T2 * Math.pow(P2, 0.4) * Math.pow(E2, 0.3) * Math.pow(S2, 0.3) - M;
    if (tg.train) {
      // Только то, что ещё можно сделать сегодня: недостающие подходы дня, а не вся неделя
      const wo = workoutOf(state, date), L0 = getLog(state, date);
      if (wo && PLAN[wo]) {
        const ex2 = {}; let left = 0;
        for (const id of PLAN[wo].ex) {
          const n = setsFor(state, date, id), e = (L0.ex && L0.ex[id]) || { rir: 2, sets: [] };
          const sets = []; for (let i = 0; i < n; i++) { const v = (e.sets && e.sets[i]) || 0; if (!(v > 0)) left++; sets.push(v > 0 ? v : EXERCISES[id].reps[0]); }
          ex2[id] = Object.assign({}, e, { sets, rir: e.rir == null ? 2 : e.rir });
        }
        if (left > 0) {
          const st2 = Object.assign({}, state, { logs: Object.assign({}, state.logs, { [date]: Object.assign({}, L0, { ex: ex2 }) }) });
          const W2 = windowSets(st2, date);
          let a = 0, b = 0; for (const g in GROUPS) { a += GROUPS[g].w * W2.sets[g]; b += GROUPS[g].w * W2.noRec[g]; }
          const T2 = Math.min(1, rawT(W2.noRec) / TPLAN) * (b > 0 ? a / b : 1);
          const g2 = gain(T2, P, E, S);
          if (g2 > 0.05) lim.push({ key: 'train', gain: g2, text: 'Доделать тренировку: осталось ' + left + ' ' + (left % 10 === 1 && left !== 11 ? 'подход' : left % 10 >= 2 && left % 10 <= 4 && (left < 12 || left > 14) ? 'подхода' : 'подходов') });
        }
      }
    }
    if (P < 0.999) lim.push({ key: 'protein', gain: gain(T, 1, E, S), text: ft.n ? 'Добрать белок до ' + Math.round(pr.proteinPerKg * pr.weight) + ' г' : 'Внести питание за день' });
    if (Eraw < 0.999) lim.push({ key: 'energy', gain: gain(T, P, comp, S), text: ft.n ? (surplus < 0.05 ? 'Добавить калории: цель на сегодня около ' + tg.kcal + ' ккал' : 'Профицит великоват — часть уйдёт в жир') : 'Внести питание за день' });
    if (comp < 0.999) lim.push({ key: 'macro', gain: gain(T, P, Eraw, S), text: ft.c < tg.carbMin ? 'Добрать углеводы до ' + tg.carbMin + ' г' : 'Жиры: не меньше ' + tg.fatMin + ' г' });
    if (S < 0.999) lim.push({ key: 'sleep', gain: gain(T, P, E, 1), text: si.S == null ? 'Внести сон' : 'Спать 7,5 ч и больше' });
    if (R < 0.97) lim.push({ key: 'recovery', gain: Gmax * (T / R) * Q - M, text: 'Давать мышцам около 48 часов между тренировками' });
    lim.sort((a, b) => b.gain - a.gain);

    const tokens = M - pen;
    return { Gmax, sets, Traw, T, P, E, S, R, setsEff: total, setsPlan: planTotal, Q, M, opt: Gmax ? (M / Gmax) * 100 : 0, pen, tokens, surplus, tg, comp, rest: !tg.train, next: tg.train ? null : nextWorkout(state, date), food: ft, sleep: si, missing, limiters: lim.filter((l) => l.gain > 0.05), risks };
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

  // Что запланировано на дату: выбор пользователя > отметка в журнале > расписание по умолчанию
  function workoutOf(state, d) {
    if (state.plan && state.plan[d] !== undefined) return state.plan[d];
    const l = state.logs[d];
    if (l && l.workout !== undefined) return l.workout;
    return (state.schedule || {})[weekday(d)] || '';
  }

  function assumptions(state, from) {
    const pr = state.profile; let k = 0, p = 0, nf = 0, sl = 0, ns = 0;
    for (let i = 1; i <= 7; i++) {
      const d = addDays(from, -i), ft = foodTotals(state, d), h = (state.logs[d] || {}).sleep;
      if (ft.n) { k += ft.kcal; p += ft.p; nf++; }
      if (h > 0) { sl += h; ns++; }
    }
    return { kcal: nf ? k / nf : pr.tdee * 1.08, p: nf ? p / nf : pr.proteinPerKg * pr.weight, sleep: ns ? sl / ns : 7.5, hasFood: nf > 0, hasSleep: ns > 0 };
  }

  // Прогноз токенов на n дней вперёд: планы дней выполнены полностью (RIR 2), питание и сон — как в среднем за неделю
  function projectWeek(state, from, n) {
    n = n || 7;
    const A = assumptions(state, from);
    const st = Object.assign({}, state, { logs: Object.assign({}, state.logs) });
    const dates = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i); dates.push(d);
      const real = state.logs[d] || {}, log = Object.assign({}, real), wo = workoutOf(state, d);
      const hasSets = real.ex && Object.values(real.ex).some((e) => (e.sets || []).some((r) => r > 0));
      if (!hasSets) {
        delete log.ex; log.deload = deloadOn(state, d);
        if (wo && PLAN[wo]) { log.ex = {}; for (const id of PLAN[wo].ex) { const ex = EXERCISES[id]; log.ex[id] = { rir: 2, sets: Array(setsFor(state, d, id)).fill(Math.round((ex.reps[0] + ex.reps[1]) / 2)) }; } }
      }
      const ft = foodTotals(state, d);
      if (i === 0 && ft.n) { if (ft.kcal < A.kcal || ft.p < A.p) log.food = [{ name: 'прогноз', kcal: Math.max(ft.kcal, A.kcal), p: Math.max(ft.p, A.p), c: 0, f: 0 }]; }
      else if (!ft.n) log.food = [{ name: 'прогноз', kcal: A.kcal, p: A.p, c: 0, f: 0 }];
      if (!(log.sleep > 0)) log.sleep = A.sleep;
      st.logs[d] = log;
    }
    return { days: dates.map((d) => ({ date: d, wo: workoutOf(state, d), r: computeDay(st, d) })), assumed: A };
  }

  // ---------- Вес, расход калорий, калибровка ----------
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  function slopeOf(pts) { // МНК: pts = [{x, y}] → наклон y по x
    const n = pts.length; if (n < 2) return null;
    const mx = sum(pts.map((p) => p.x)) / n, my = sum(pts.map((p) => p.y)) / n;
    const den = sum(pts.map((p) => (p.x - mx) * (p.x - mx))); if (!den) return null;
    return sum(pts.map((p) => (p.x - mx) * (p.y - my))) / den;
  }
  function weightSeries(state, date, days) {
    const out = [];
    for (let j = 0; j < days; j++) { const d = addDays(date, -(days - 1 - j)); const w = (state.logs[d] || {}).weight; if (w > 0) out.push({ x: j, y: w, d }); }
    return out;
  }
  const weightTrend = (state, date) => { const W = weightSeries(state, date, 28); if (W.length < 3 || W[W.length - 1].x - W[0].x < 7) return null; const s = slopeOf(W); return s == null ? null : s * 7; }; // кг в неделю

  // Расход = средние калории − (изменение веса × 7700 ккал/кг). Нужно ≥4 взвешиваний на 10+ дней и ≥7 дней питания
  function estimateTDEE(state, date) {
    const W = weightSeries(state, date, 28);
    if (W.length < 4 || W[W.length - 1].x - W[0].x < 10) return null;
    const slope = slopeOf(W); if (slope == null) return null;
    let k = 0, cnt = 0;
    for (let j = W[0].x; j <= W[W.length - 1].x; j++) { const ft = foodTotals(state, addDays(date, -(27 - j))); if (ft.kcal >= 1200) { k += ft.kcal; cnt++; } }
    if (cnt < 7) return null;
    const t = k / cnt - slope * 7700;
    return { tdee: Math.round(Math.min(4500, Math.max(1800, t)) / 10) * 10, perWeek: slope * 7, days: cnt };
  }

  function navyBF(m, height) { const d = m.waist - m.neck; if (!(d > 0) || !(height > 0)) return null; return 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(height)) - 450; }

  // Сравнение токенов за период между первым и последним замером с изменением замеров
  function calibration(state, date) {
    const m = state.meas || []; if (m.length < 2) return null;
    const a = m[0], b = m[m.length - 1];
    const days = Math.round((parse(b.date) - parse(a.date)) / 86400000);
    if (days < 14) return null;
    let tok = 0; for (let i = 0; i < days; i++) tok += computeDay(state, addDays(a.date, i)).tokens;
    const lbm = (mm) => { const bf = navyBF(mm, state.profile.height); const w = weightOn(state, mm.date) || state.profile.weight; return bf == null ? null : w * (1 - bf / 100); };
    const l0 = lbm(a), l1 = lbm(b);
    const dL = l0 != null && l1 != null ? l1 - l0 : null;
    let factor = null;
    if (days >= 84 && dL != null && tok > 50) factor = Math.max(0.5, Math.min(1.5, (dL * 1000) / tok));
    return { days, tokensG: tok, dLbmKg: dL, dBiceps: b.biceps - a.biceps, dChest: b.chest - a.chest, dWaist: b.waist - a.waist, factor };
  }

  // Динамика повторов по упражнениям (суммарные повторы за тренировку)
  function exerciseProgress(state) {
    const out = [];
    for (const id in EXERCISES) {
      const s = exerciseSessions(state, id, '9999-12-31'); if (s.length < 2) continue;
      const tot = s.map((x) => sum(x.sets));
      out.push({ id, n: s.length, first: tot[0], last: tot[tot.length - 1], best: Math.max(...tot) });
    }
    return out;
  }

  // ---------- Итог тренировки ----------
  function workoutSummary(state, date) {
    const log = state.logs[date] || {}, wo = workoutOf(state, date);
    if (!wo || !PLAN[wo]) return null;
    const ex = [], prs = [];
    let planned = 0, done = 0, vol = 0, reps = 0, rirSum = 0, rirN = 0;
    for (const id of PLAN[wo].ex) {
      const n = setsFor(state, date, id), e = (log.ex && log.ex[id]) || { sets: [] };
      const sets = (e.sets || []).slice(0, n).filter((r) => r > 0);
      planned += n; done += sets.length;
      const total = sets.reduce((a, b) => a + b, 0); reps += total;
      if (sets.length) { rirSum += (e.rir == null ? 2 : e.rir) * sets.length; rirN += sets.length; }
      const prev = exerciseSessions(state, id, date);
      const best = prev.length ? Math.max(...prev.map((x) => x.sets.reduce((a, b) => a + b, 0))) : 0;
      const bestSet = prev.length ? Math.max(...prev.map((x) => Math.max(...x.sets))) : 0;
      const pr = sets.length && prev.length ? (total > best ? 'total' : Math.max(...sets) > bestSet ? 'set' : '') : '';
      if (pr) prs.push({ id, kind: pr });
      ex.push({ id, name: EXERCISES[id].name, sets, planned: n, total, pr, prevTotal: prev.length ? prev[prev.length - 1].sets.reduce((a, b) => a + b, 0) : null });
    }
    const dur = log.t0 && log.t1 && log.t1 > log.t0 ? Math.round((log.t1 - log.t0) / 60000) : null;
    const R = computeDay(state, date);
    return { wo, name: PLAN[wo].name, ex, planned, done, reps, avgRir: rirN ? rirSum / rirN : null, dur, prs, M: R.M, opt: R.opt, complete: planned > 0 && done >= planned };
  }

  // ---------- Разгрузка ----------
  const deloadOn = (state, d) => !!(state.deload && d >= state.deload.from && d <= state.deload.to);
  const setsFor = (state, d, id) => (deloadOn(state, d) ? Math.max(2, Math.ceil(EXERCISES[id].sets / 2)) : EXERCISES[id].sets);
  // Разгрузка предлагается, если повторы падают сразу в нескольких упражнениях
  const deloadSuggested = (state, date) => !deloadOn(state, date) && declining(state, date).length >= 2;
  const restIdeal = (id) => (COMPOUND.has(id) ? 120 : 60);

  // ---------- Боль ----------
  function painAdvice(state, date) {
    const tags = new Set();
    for (let i = 0; i < 3; i++) for (const t of (getLog(state, addDays(date, -i)).pain || [])) tags.add(t);
    if (!tags.size) return null;
    const ex = new Set(); tags.forEach((t) => (PAIN_EX[t] || []).forEach((id) => ex.add(id)));
    return { tags: [...tags].map((t) => PAIN[t]), ex: [...ex].map((id) => EXERCISES[id].name) };
  }

  // ---------- Что наверстать сегодня ----------
  function catchup(state, date) {
    const pr = state.profile, tg = targets(state, date), kT = tg.kcal, pT = tg.p;
    const ft = foodTotals(state, date);
    let n = 0, def = 0;
    for (let i = 1; i <= 3; i++) { const f = foodTotals(state, addDays(date, -i)); if (f.n) { n++; def += Math.max(0, pT - f.p); } }
    const si = sleepInfo(state, addDays(date, -1));
    return { kT, pT, left: { kcal: Math.max(0, kT - ft.kcal), p: Math.max(0, pT - ft.p), c: Math.max(0, tg.carb - ft.c), f: Math.max(0, tg.fat - ft.f) }, tg, extraP: n ? Math.min(30, Math.round((def / n) * 0.5)) : 0, sleepMin: si.mean != null && si.mean < 7 ? Math.round(((7.5 - si.mean) * 60) / 2) : 0 };
  }

  // ---------- Разбор недели ----------
  function weeklyReview(state, date) {
    const days = []; for (let i = 6; i >= 0; i--) days.push(computeDay(state, addDays(date, -i)));
    let prev = 0; for (let i = 13; i >= 7; i--) prev += computeDay(state, addDays(date, -i)).tokens;
    const total = sum(days.map((r) => r.tokens)), ideal = days[0].Gmax * 7;
    const lost = { train: 0, protein: 0, energy: 0, sleep: 0, recovery: 0, macro: 0 };
    days.forEach((r) => r.limiters.forEach((l) => { lost[l.key] += l.gain; }));
    const logs = []; for (let i = 0; i < 7; i++) logs.push(state.logs[addDays(date, -i)] || {});
    const sess = logs.filter((l) => l.ex && Object.values(l.ex).some((e) => (e.sets || []).some((r) => r > 0))).length;
    const sl = logs.map((l) => l.sleep).filter((h) => h > 0), fd = []; for (let i = 0; i < 7; i++) { const f = foodTotals(state, addDays(date, -i)); if (f.n) fd.push(f); }
    const avgSleep = sl.length ? sum(sl) / sl.length : null, avgKcal = fd.length ? sum(fd.map((f) => f.kcal)) / fd.length : null, avgP = fd.length ? sum(fd.map((f) => f.p)) / fd.length : null;
    const pr = state.profile, pT = Math.round(pr.proteinPerKg * pr.weight), kT = Math.round(pr.tdee * 1.08);
    const text = {
      train: 'Тренировки: выполнено ' + sess + ' из 3, объём ниже плана',
      protein: 'Белок: в среднем ' + (avgP != null ? Math.round(avgP) : '—') + ' г при цели ' + pT + ' г',
      energy: 'Калории: в среднем ' + (avgKcal != null ? Math.round(avgKcal) : '—') + ' при цели ' + kT,
      sleep: 'Сон: в среднем ' + (avgSleep != null ? avgSleep.toFixed(1).replace('.', ',') : '—') + ' ч, цель от 7,5',
      recovery: 'Тренировки шли слишком плотно, мышцы не успевали восстановиться',
      macro: 'Углеводы или жиры ниже нормы в части дней',
    };
    const items = Object.keys(lost).filter((k) => lost[k] > 0.3).sort((a, b) => lost[b] - lost[a]).map((k) => ({ key: k, g: lost[k], text: text[k] }));
    return { total, prev, ideal, items, sess, avgSleep, avgKcal, avgP, logged: logs.filter((l) => l.ex || (l.food && l.food.length) || l.sleep > 0).length };
  }

  // ---------- Связь сна с силовыми показателями ----------
  function sleepVsPerformance(state) {
    const by = {};
    for (const d of Object.keys(state.logs).sort()) {
      const l = state.logs[d]; if (!l.ex || !(l.sleep > 0)) continue;
      for (const id in l.ex) { const t = sum((l.ex[id].sets || []).filter((r) => r > 0)); if (t > 0) (by[id] = by[id] || []).push({ t, sl: l.sleep }); }
    }
    const pts = [];
    for (const id in by) { if (by[id].length < 3) continue; const m = sum(by[id].map((x) => x.t)) / by[id].length; by[id].forEach((x) => pts.push({ sl: x.sl, rel: x.t / m - 1 })); }
    if (pts.length < 12) return { n: pts.length, enough: false };
    const mx = sum(pts.map((p) => p.sl)) / pts.length, my = sum(pts.map((p) => p.rel)) / pts.length;
    const sxy = sum(pts.map((p) => (p.sl - mx) * (p.rel - my))), sxx = sum(pts.map((p) => (p.sl - mx) ** 2)), syy = sum(pts.map((p) => (p.rel - my) ** 2));
    const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
    const lo = pts.filter((p) => p.sl < 7), hi = pts.filter((p) => p.sl >= 7);
    return { n: pts.length, enough: true, r, lowN: lo.length, highN: hi.length, lowPct: lo.length >= 4 ? (sum(lo.map((p) => p.rel)) / lo.length) * 100 : null, highPct: hi.length >= 4 ? (sum(hi.map((p) => p.rel)) / hi.length) * 100 : null };
  }

  // ---------- Штрихкоды ----------
  // Проверка контрольной цифры GS1 (EAN-8, UPC-A, EAN-13, GTIN-14): ловит опечатки до запроса
  function validBarcode(code) {
    if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
    const d = code.split('').map(Number), chk = d.pop();
    let s = 0; for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) s += d[i] * w;
    return (10 - (s % 10)) % 10 === chk;
  }
  // Ответ Open Food Facts → продукт на 100 г
  function offItem(pr, code) {
    const n = pr.nutriments || {};
    let kcal = Number(n['energy-kcal_100g']);
    if (!(kcal >= 0) || n['energy-kcal_100g'] == null || n['energy-kcal_100g'] === '') { const kj = Number(n['energy_100g']); kcal = n['energy_100g'] != null && kj >= 0 ? kj / 4.184 : NaN; }
    if (!(kcal >= 0)) return null;
    const name = [pr.product_name, pr.brands].filter(Boolean).join(' · ').slice(0, 60) || 'Продукт ' + (code || '');
    const num = (v) => (Number(v) >= 0 ? Number(v) : 0);
    return { name, kcal, p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g) };
  }
  function parseOFF(j) {
    if (!j || j.status !== 1 || !j.product) return { error: 'notfound' };
    return offItem(j.product, j.code) || { error: 'nonutri' };
  }
  // Результат текстового поиска Open Food Facts → список продуктов на 100 г (без дублей и без пустых данных)
  function parseOFFList(j) {
    const out = [], seen = new Set();
    for (const pr of (j && Array.isArray(j.products) ? j.products : [])) {
      if (!pr || !pr.product_name) continue;
      const it = offItem(pr, pr.code); if (!it) continue;
      const key = it.name.toLowerCase() + '|' + Math.round(it.kcal); if (seen.has(key)) continue; seen.add(key);
      if (pr.code && validBarcode(String(pr.code))) it.code = String(pr.code);
      out.push(it);
    }
    return out;
  }
  // Локальный поиск: сохранённые по штрихкоду продукты и свои заготовки
  function searchLocal(state, q) {
    const t = String(q || '').trim().toLowerCase(); if (t.length < 2) return [];
    const out = [];
    state.foods.forEach((f, i) => { if (f.name.toLowerCase().includes(t)) out.push({ src: 'preset', i, name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f, unit: f.unit }); });
    for (const code in state.barcodes || {}) { const it = state.barcodes[code]; if (it.name.toLowerCase().includes(t)) out.push({ src: 'saved', item: Object.assign({ code }, it), name: it.name, kcal: it.kcal, p: it.p, c: it.c, f: it.f }); }
    return out.slice(0, 8);
  }

  return { parseOFFList, searchLocal, targets, dayTDEE, nextWorkout, trainingDay, validBarcode, parseOFF, deloadOn, setsFor, deloadSuggested, restIdeal, painAdvice, catchup, weeklyReview, sleepVsPerformance, WARMUP, COOLDOWN, MOBILITY, PAIN, defaultMeals, slopeOf, weightTrend, estimateTDEE, navyBF, calibration, exerciseProgress, workoutSummary, restFactor, workoutOf, projectWeek, windowSets, dayRaw, GROUPS, EXERCISES, PLAN, PLAN_SETS, TPLAN, defaultState, computeDay, weeklyTokens, declining, lastSets, exerciseSessions, groupSets, foodTotals, energyScore, sleepOne, sleepInfo, quality, gmax, weightOn, dstr, parse, addDays, weekday };
});
