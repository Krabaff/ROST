/* Интерфейс. Зависит от core.js (глобальный Core). */
(function () {
  'use strict';
  const C = window.Core;
  const KEY = 'gymapp.v1';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  const r0 = (x) => Math.round(x);
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  // ---------- Хранилище ----------
  let mem = null;
  function load() {
    let st = null;
    try { const raw = localStorage.getItem(KEY); if (raw) st = JSON.parse(raw); } catch (e) { st = mem; }
    if (!st) st = mem;
    const def = C.defaultState();
    if (!st) { def.meas = []; return def; }
    st.profile = Object.assign({}, def.profile, st.profile);
    st.logs = st.logs || {}; st.foods = st.foods || def.foods; st.schedule = st.schedule || def.schedule; st.meas = st.meas || []; st.plan = st.plan || {};
    return st;
  }
  let S = load();
  function save() { mem = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ } }

  let view = 'today';
  let date = C.dstr(new Date());
  let TODAY = date;
  const scrollY = {};
  let sheet = null;
  let enter = true, popKey = null, sheetNew = false;
  const prev = {}; // {type:'food'|'custom', food, qty}

  const log = () => (S.logs[date] = S.logs[date] || {});
  const workoutOf = (d) => C.workoutOf(S, d);
  const fmtDate = (d) => { const x = C.parse(d); return DAYS[x.getDay()] + ', ' + x.getDate() + ' ' + MONTHS[x.getMonth()]; };

  // ---------- Мелкие компоненты ----------
  const bar = (v, cls) => '<div class="bar"><i class="' + (cls || '') + '" style="width:' + Math.max(0, Math.min(100, v * 100)) + '%"></i></div>';
  const stepper = (a, id, val, extra) => '<div class="step"><button data-a="' + a + '" data-id="' + id + '" data-d="-1" ' + (extra || '') + '>−</button><b>' + val + '</b><button data-a="' + a + '" data-id="' + id + '" data-d="1" ' + (extra || '') + '>+</button></div>';

  // ---------- Экран: Сегодня ----------
  function viewToday() {
    const R = C.computeDay(S, date);
    const wk = C.weeklyTokens(S, date);
    const R_ = 74, circ = 2 * Math.PI * R_;
    const pct = Math.max(0, Math.min(100, R.opt));
    const col = pct >= 85 ? 'ok' : pct >= 60 ? 'mid' : 'low';
    const wo = workoutOf(date);
    let planned = 0, done = 0;
    if (wo && C.PLAN[wo]) {
      const L = log().ex || {};
      for (const id of C.PLAN[wo].ex) { planned += C.EXERCISES[id].sets; done += ((L[id] && L[id].sets) || []).filter((x) => x > 0).length; }
    }
    let h = '<div class="datenav"><button data-a="day" data-d="-1">‹</button><div><b>' + (date === TODAY ? 'Сегодня' : fmtDate(date)) + '</b><span>' + fmtDate(date) + '</span></div><button data-a="day" data-d="1" ' + (date >= TODAY ? 'disabled' : '') + '>›</button></div>';
    h += '<div class="ringwrap"><svg viewBox="0 0 180 180" class="ring"><circle cx="90" cy="90" r="' + R_ + '" class="rbg"/><circle cx="90" cy="90" r="' + R_ + '" class="rfg ' + col + '" stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - pct / 100)) + '" transform="rotate(-90 90 90)"/></svg><div class="ringtxt"><div class="big">' + r0(R.opt) + '<small>%</small></div><div class="tok">' + (R.tokens >= 0 ? '+' : '−') + r1(Math.abs(R.tokens)) + ' г</div></div></div>';
    h += '<p class="cap">оптимальность дня · потенциал роста мышц, граммы (модельная оценка)</p>';
    if (R.missing.length) h += '<div class="note">Не внесено: ' + R.missing.map((m) => (m === 'food' ? 'питание' : 'сон')).join(', ') + '. Пока это считается как наполовину выполненное.</div>';
    h += '<div class="card"><div class="row"><span>Тренировки <small>' + r1(R.setsEff) + ' из ' + r0(R.setsPlan) + ' зачётных подходов за 7 дней</small></span><b>' + r0(R.T * 100) + '%</b></div>' + bar(R.T) +
      '<div class="row"><span>Белок <small>' + r0(R.food.p) + ' / ' + Math.round(S.profile.proteinPerKg * S.profile.weight) + ' г</small></span><b>' + r0(R.P * 100) + '%</b></div>' + bar(R.P) +
      '<div class="row"><span>Калории <small>' + r0(R.food.kcal) + ' / ' + Math.round(S.profile.tdee * 1.08) + '</small></span><b>' + r0(R.E * 100) + '%</b></div>' + bar(R.E) +
      '<div class="row"><span>Сон <small>' + (R.sleep.last ? r1(R.sleep.last) + ' ч ночью · ' : '') + (R.sleep.mean ? 'среднее ' + r1(R.sleep.mean) + ' ч за неделю' : 'не внесён') + '</small></span><b>' + r0(R.S * 100) + '%</b></div>' + bar(R.S) +
      (R.R < 0.98 ? '<div class="row"><span>Восстановление <small>тренировки идут слишком плотно</small></span><b>' + r0(R.R * 100) + '%</b></div>' + bar(R.R) : '') + '</div>';
    if (wo && C.PLAN[wo]) h += '<button class="card link" data-a="tab" data-id="train"><div class="row"><span>' + esc(C.PLAN[wo].name) + '</span><b>' + done + ' / ' + planned + '</b></div>' + bar(planned ? done / planned : 0) + '</button>';
    else h += '<div class="card"><div class="row"><span>День отдыха</span><b>восстановление</b></div></div>';
    if (R.limiters.length) h += '<div class="card"><h3>Что добавит больше всего</h3>' + R.limiters.slice(0, 3).map((l) => '<div class="row lim"><span>' + esc(l.text) + '</span><b class="plus">+' + r1(l.gain) + ' г</b></div>').join('') + '</div>';
    else h += '<div class="card"><h3>Всё в оптимуме</h3><p class="mut">Ограничителей нет — так держать.</p></div>';
    if (R.risks.length) h += '<div class="card warn"><h3>Внимание</h3>' + R.risks.map((x) => '<p>' + esc(x) + '</p>').join('') + (R.pen > 0 ? '<p class="mut">Штраф к токенам: −' + r1(R.pen) + ' г</p>' : '') + '</div>';
    h += '<div class="card"><div class="row"><span>Токены за 7 дней</span><b>' + r1(wk) + ' г</b></div><p class="mut">Это потенциал, а не измеренный прирост. Сверяйте с замерами на вкладке «Прогресс».</p></div>';
    return h;
  }

  // ---------- Экран: Тренировка ----------
  function viewTrain() {
    const wo = workoutOf(date);
    let h = '<div class="datenav"><button data-a="day" data-d="-1">‹</button><div><b>' + (date === TODAY ? 'Сегодня' : fmtDate(date)) + '</b><span>' + fmtDate(date) + '</span></div><button data-a="day" data-d="1" ' + (date >= TODAY ? 'disabled' : '') + '>›</button></div>';
    h += '<div class="chips">' + ['A', 'B', 'C', ''].map((k) => '<button class="chip ' + (wo === k ? 'on' : '') + '" data-a="wo" data-id="' + k + '">' + (k ? 'Верх ' + k : 'Отдых') + '</button>').join('') + '</div>';
    if (!wo || !C.PLAN[wo]) return h + '<div class="card"><p class="mut">Сегодня отдых. Восстановление — часть роста: сон и белок продолжают работать.</p></div>';
    h += '<h2>' + esc(C.PLAN[wo].name) + '</h2>';
    const L = log().ex || {};
    for (const id of C.PLAN[wo].ex) {
      const ex = C.EXERCISES[id];
      const e = L[id] || { rir: 2, sets: [] };
      const last = C.lastSets(S, id, date);
      const doneN = (e.sets || []).filter((x) => x > 0).length;
      h += '<div class="card ex ' + (doneN === ex.sets ? 'full' : '') + '"><div class="exh"><b>' + esc(ex.name) + '</b><button class="allb ' + (doneN === ex.sets ? 'on' : '') + '" data-a="all" data-id="' + id + '">' + (doneN === ex.sets ? '✓ Готово' : 'Отметить все') + '</button></div><p class="mut"><span class="tgt">' + ex.sets + '×' + ex.reps[0] + '–' + ex.reps[1] + '</span> · ' + esc(ex.tip) + (last ? ' · прошлый раз: ' + last.sets.join(', ') : '') + '</p>';
      for (let i = 0; i < ex.sets; i++) {
        const v = (e.sets && e.sets[i]) || 0;
        const sug = v || (last && last.sets[i]) || ex.reps[0];
        h += '<div class="set"><button class="chk ' + (v > 0 ? 'on' : '') + '" data-a="set" data-id="' + id + '" data-i="' + i + '" aria-label="Подход ' + (i + 1) + '">' + (v > 0 ? '✓' : i + 1) + '</button><span class="sl">Подход ' + (i + 1) + '</span>' +
          '<div class="step ' + (v > 0 ? '' : 'dim') + '"><button data-a="rep" data-id="' + id + '" data-i="' + i + '" data-d="-1">−</button><b>' + sug + '</b><button data-a="rep" data-id="' + id + '" data-i="' + i + '" data-d="1">+</button></div></div>';
      }
      const rir = e.rir == null ? 2 : e.rir;
      const rs = e.rest || 0, rf = C.restFactor(id, rs);
      const restRow = '<div class="rir n"><span>Отдых, мин</span>' + [[45, '≤1'], [75, '1–1,5'], [105, '1,5–2'], [150, '2–3'], [210, '3+']].map(([v, t]) => '<button class="chip s ' + (rs === v ? 'on' : '') + '" data-a="rest" data-id="' + id + '" data-v="' + v + '">' + t + '</button>').join('') + (rs && rf < 0.995 ? '<span class="small minus">зачёт −' + r0((1 - rf) * 100) + '%</span>' : '') + '</div>';
      h += '<div class="rir"><span>Запас повторов</span>' + [[1, '0–1'], [2, '2'], [3, '3'], [4, '4–5'], [6, '6+']].map(([v, t]) => '<button class="chip s ' + (rir === v ? 'on' : '') + '" data-a="rir" data-id="' + id + '" data-v="' + v + '">' + t + '</button>').join('') + '</div>' + restRow + '</div>';
    }
    h += '<p class="mut small">Запас повторов — сколько ещё повторов вы могли бы сделать. Подходы с запасом 0–3 считаются полностью, 4–5 — вполовину, 6+ — не считаются: они слишком далеки от отказа для роста. Отдых: для подтягиваний и брусьев лучше 2–3 минуты, для упражнений с резинкой хватает минуты; при меньшем отдыхе подходы засчитываются с небольшой скидкой.</p>';
    return h;
  }

  // ---------- Экран: План недели ----------
  function viewPlan() {
    const P = C.projectWeek(S, TODAY, 7);
    const B = C.projectWeek(Object.assign({}, S, { plan: {} }), TODAY, 7);
    const sum = (X) => X.days.reduce((s, x) => s + x.r.tokens, 0);
    const tot = sum(P), diff = tot - sum(B);
    const sess = P.days.filter((x) => x.wo && C.PLAN[x.wo]).length;
    const A = P.assumed;
    let h = '<h2>План недели</h2><div class="card"><h3>Прогноз на 7 дней</h3><div class="row"><span>Токены</span><b>' + r1(tot) + ' г</b></div><div class="row"><span>К базовому плану (пн · ср · пт)</span><b class="' + (diff >= -0.05 ? 'plus' : 'minus') + '">' + (diff >= 0 ? '+' : '−') + r1(Math.abs(diff)) + ' г</b></div><div class="row"><span>Тренировок в неделю</span><b>' + sess + '</b></div></div>';
    h += '<div class="card"><h3>Выберите тип дня</h3>' + P.days.map((x) => {
      const dt = C.parse(x.date), tk = x.r.tokens;
      return '<div class="prow"><div class="pd"><b>' + (x.date === TODAY ? 'Сегодня' : DAYS[dt.getDay()]) + '</b><span>' + dt.getDate() + ' ' + MONTHS[dt.getMonth()] + '</span></div><div class="seg">' + ['A', 'B', 'C', ''].map((k) => '<button class="chip s ' + (x.wo === k ? 'on' : '') + '" data-a="plan" data-id="' + x.date + '" data-v="' + k + '">' + (k || 'Отдых') + '</button>').join('') + '</div><div class="pt ' + (tk >= 0 ? 'plus' : 'minus') + '">' + (tk >= 0 ? '+' : '−') + r1(Math.abs(tk)) + '</div>' + (x.wo && C.PLAN[x.wo] && x.r.R < 0.95 ? '<div class="pw">Мало отдыха между тренировками: −' + r0((1 - x.r.R) * 100) + '% к зачёту</div>' : '') + '</div>';
    }).join('') + '<p class="mut small">Число справа — токены этого дня (г). Тренировка влияет на токены следующих 7 дней, поэтому день отдыха после неё тоже «зарабатывает».</p></div>';
    const tips = [];
    if (sess < 3) tips.push('Меньше трёх тренировок в неделю — объём ниже плана, прирост падает.');
    if (sess > 4) tips.push('Больше четырёх тренировок на тот же набор мышц не добавят роста, зато снижают восстановление.');
    if (P.days.some((x) => x.r.R < 0.95)) tips.push('Тренировки подряд на одни и те же мышцы засчитываются хуже: разнесите их на 48 часов.');
    if (tips.length) h += '<div class="card warn"><h3>Совет</h3>' + tips.map((x) => '<p>' + x + '</p>').join('') + '</div>';
    h += '<p class="mut small">Допущения прогноза: подходы выполнены полностью с запасом 2 повтора; питание ≈ ' + r0(A.kcal) + ' ккал и ' + r0(A.p) + ' г белка, сон ≈ ' + r1(A.sleep) + ' ч (' + (A.hasFood && A.hasSleep ? 'ваше среднее за неделю' : 'ориентир, пока мало данных') + '). Уже внесённые подходы учитываются как есть.</p>';
    return h;
  }

  // ---------- Экран: Питание и сон ----------
  function viewFood() {
    const pr = S.profile, ft = C.foodTotals(S, date), L = log();
    const kT = Math.round(pr.tdee * 1.08), pT = Math.round(pr.proteinPerKg * pr.weight);
    let h = '<div class="datenav"><button data-a="day" data-d="-1">‹</button><div><b>' + (date === TODAY ? 'Сегодня' : fmtDate(date)) + '</b><span>' + fmtDate(date) + '</span></div><button data-a="day" data-d="1" ' + (date >= TODAY ? 'disabled' : '') + '>›</button></div>';
    h += '<div class="card"><div class="row"><span>Сон прошлой ночью</span>' + stepper('sleep', 'x', L.sleep > 0 ? r1(L.sleep) + ' ч' : '—') + '</div><p class="mut">Цель — от 7,5 ч. ' + (L.sleep > 0 ? '' : 'Нажмите + чтобы внести.') + '</p>' +
      '<div class="row"><span>Вес утром</span>' + stepper('weight', 'x', L.weight > 0 ? r1(L.weight) + ' кг' : '—') + '</div></div>';
    h += '<div class="card"><div class="row"><span>Калории</span><b>' + r0(ft.kcal) + ' / ' + kT + '</b></div>' + bar(ft.kcal / kT) +
      '<div class="row"><span>Белок</span><b>' + r0(ft.p) + ' / ' + pT + ' г</b></div>' + bar(ft.p / pT) +
      '<div class="row"><span>Углеводы</span><b>' + r0(ft.c) + ' г</b></div><div class="row"><span>Жиры</span><b>' + r0(ft.f) + ' г</b></div></div>';
    const items = L.food || [];
    if (items.length) h += '<div class="card"><h3>Съедено</h3>' + items.map((it, i) => '<div class="row item"><span>' + esc(it.name) + '<small>' + r0(it.kcal) + ' ккал · Б ' + r0(it.p) + ' · У ' + r0(it.c) + ' · Ж ' + r0(it.f) + '</small></span><button class="x" data-a="delfood" data-i="' + i + '" aria-label="Удалить">×</button></div>').join('') + '</div>';
    h += '<h3 class="sec">Добавить</h3><div class="chips wrap">' + S.foods.map((f, i) => '<button class="chip" data-a="pick" data-i="' + i + '">' + esc(f.name) + '</button>').join('') + '<button class="chip plusb" data-a="custom">+ своё</button></div>';
    return h;
  }

  // ---------- Экран: Прогресс ----------
  function bf(m, height) { const d = m.waist - m.neck; if (!(d > 0)) return null; return 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(height)) - 450; }
  function viewProgress() {
    const days = []; for (let i = 13; i >= 0; i--) days.push(C.addDays(TODAY, -i));
    const vals = days.map((d) => C.computeDay(S, d).tokens);
    const max = Math.max(12, ...vals);
    const bw = 300 / 14;
    let svg = '<svg viewBox="0 0 300 110" class="chart">';
    vals.forEach((v, i) => { const hgt = Math.max(1, (Math.max(0, v) / max) * 90); svg += '<rect x="' + (i * bw + 2) + '" y="' + (95 - hgt) + '" width="' + (bw - 4) + '" height="' + hgt + '" rx="3" class="' + (days[i] === TODAY ? 'cur' : '') + '"/>'; });
    svg += '<line x1="0" x2="300" y1="95.5" y2="95.5" class="axis"/></svg>';
    const sum14 = vals.reduce((a, b) => a + b, 0);
    let h = '<h2>Прогресс</h2><div class="card"><h3>Токены за 14 дней</h3>' + svg + '<div class="row"><span>Сумма</span><b>' + r1(sum14) + ' г</b></div><div class="row"><span>В среднем в день</span><b>' + r1(sum14 / 14) + ' г</b></div></div>';
    const ws = []; for (const d of Object.keys(S.logs).sort()) if (S.logs[d].weight > 0) ws.push([d, S.logs[d].weight]);
    if (ws.length) { const l = ws.slice(-8); h += '<div class="card"><h3>Вес</h3>' + l.map(([d, w]) => '<div class="row"><span>' + fmtDate(d) + '</span><b>' + r1(w) + ' кг</b></div>').join('') + '</div>'; }

    h += '<div class="card"><h3>Замеры</h3>';
    const m = S.meas;
    if (m.length) {
      const f0 = m[0], l0 = m[m.length - 1];
      const b = bf(l0, S.profile.height);
      h += '<p class="mut">Последний: ' + fmtDate(l0.date) + '</p>' + [['biceps', 'Бицепс (напряжён)'], ['chest', 'Грудь'], ['waist', 'Талия'], ['neck', 'Шея']].map(([k, n]) => '<div class="row"><span>' + n + '</span><b>' + r1(l0[k]) + ' см' + (m.length > 1 ? ' <small class="' + ((l0[k] - f0[k]) >= 0 ? 'plus' : 'minus') + '">' + ((l0[k] - f0[k]) >= 0 ? '+' : '−') + r1(Math.abs(l0[k] - f0[k])) + '</small>' : '') + '</b></div>').join('');
      if (b != null) { const lbm = S.profile.weight * (1 - b / 100); h += '<div class="row"><span>Жир (Navy, ±3–4 п.п.)</span><b>' + r1(b) + '%</b></div><div class="row"><span>Сухая масса ≈</span><b>' + r1(lbm) + ' кг</b></div>'; }
    } else h += '<p class="mut">Пока нет замеров. Вносите раз в 2–4 недели, утром натощак, в одинаковых условиях.</p>';
    h += '<div class="mform">' + [['biceps', 'бицепс'], ['chest', 'грудь'], ['waist', 'талия'], ['neck', 'шея']].map(([k, n]) => '<label>' + n + ', см<input id="m_' + k + '" inputmode="decimal" placeholder="' + (m.length ? m[m.length - 1][k] : '') + '"></label>').join('') + '</div><button class="btn" data-a="addmeas">Сохранить замеры</button></div>';

    const pr = S.profile;
    h += '<div class="card"><h3>Профиль</h3>' + [['weight', 'Вес, кг', pr.weight], ['tdee', 'Расход калорий, ккал', pr.tdee], ['level', 'Потенциал, % массы в месяц', pr.level], ['proteinPerKg', 'Белок, г на кг', pr.proteinPerKg]].map(([k, n, v]) => '<label class="pf">' + n + '<input data-prof="' + k + '" inputmode="decimal" value="' + v + '"></label>').join('') + '<p class="mut small">Расход калорий (TDEE) подберите по динамике веса: если вес за 2–3 недели не меняется при вашем питании, это и есть ваш расход.</p></div>';
    h += '<div class="card"><h3>Как читать токены</h3><p class="mut">Токен = условный грамм мышечной массы в день при вашем уровне. 100% — план выполнен полностью, белок и калории в норме, сон от 7,5 ч. Модель учитывает объём тренинга (с поправками на запас повторов, отдых между подходами, убывающую отдачу и восстановление между тренировками), белок, энергетический баланс и сон, но это оценка, а не измерение. Через 8–12 недель сравните сумму токенов с реальной динамикой замеров и подправьте «Потенциал» в профиле.</p></div>';
    h += '<div class="card"><h3>Данные</h3><div class="btns"><button class="btn" data-a="export">Экспорт</button><button class="btn" data-a="import">Импорт</button></div><p class="mut small">Данные хранятся только в браузере этого телефона. Делайте экспорт раз в пару недель.</p><textarea id="io" class="io" placeholder="Сюда попадёт копия данных или вставьте её для импорта"></textarea></div>';
    return h;
  }

  // ---------- Шторка добавления еды ----------
  function sheetHtml() {
    if (!sheet) return '';
    if (sheet.type === 'food') {
      const f = S.foods[sheet.i], q = sheet.qty;
      return '<div class="shade" data-a="close"></div><div class="sheet"><h3>' + esc(f.name) + '</h3><p class="mut">на ' + esc(f.unit) + ': ' + f.kcal + ' ккал · Б ' + f.p + ' · У ' + f.c + ' · Ж ' + f.f + '</p><div class="row"><span>Количество порций</span>' + stepper('qty', 'x', q) + '</div><p class="mut">Итого: ' + r0(f.kcal * q) + ' ккал · Б ' + r0(f.p * q) + ' г</p><button class="btn pri" data-a="addfood">Добавить</button><button class="btn ghost" data-a="delpreset">Удалить из списка</button></div>';
    }
    return '<div class="shade" data-a="close"></div><div class="sheet"><h3>Своё блюдо</h3><div class="mform one"><label>Название<input id="c_name" placeholder="Например, обед"></label>' + [['kcal', 'Калории'], ['p', 'Белки, г'], ['c', 'Углеводы, г'], ['f', 'Жиры, г']].map(([k, n]) => '<label>' + n + '<input id="c_' + k + '" inputmode="decimal"></label>').join('') + '</div><label class="chkl"><input type="checkbox" id="c_save" checked> Сохранить в список</label><button class="btn pri" data-a="addcustom">Добавить</button></div>';
  }

  // ---------- Отрисовка ----------
  function render() {
    const body = view === 'today' ? viewToday() : view === 'train' ? viewTrain() : view === 'plan' ? viewPlan() : view === 'food' ? viewFood() : viewProgress();
    $('#main').innerHTML = body;
    $('#sheetroot').innerHTML = sheetHtml();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === view));
    animate();
  }

  // Плавные переходы: полосы, кольцо и число идут от прежнего значения к новому
  function animate() {
    const main = $('#main');
    main.classList.remove('enter');
    if (enter) { void main.offsetWidth; main.classList.add('enter'); }
    enter = false;
    const sr = $('#sheetroot'); sr.classList.toggle('anim', sheetNew); sheetNew = false;
    main.querySelectorAll('.bar i').forEach((el, i) => {
      const k = view + ':b' + i, to = el.style.width, from = prev[k] !== undefined ? prev[k] : '0%';
      el.style.transition = 'none'; el.style.width = from; void el.offsetWidth; el.style.transition = ''; el.style.width = to; prev[k] = to;
    });
    const ring = main.querySelector('.rfg');
    if (ring) {
      const to = parseFloat(ring.getAttribute('stroke-dashoffset')), k = 'ring', from = prev[k] !== undefined ? prev[k] : parseFloat(ring.getAttribute('stroke-dasharray'));
      ring.style.transition = 'none'; ring.style.strokeDashoffset = from; void ring.getBoundingClientRect(); ring.style.transition = ''; ring.style.strokeDashoffset = to; prev[k] = to;
    }
    const big = main.querySelector('.big');
    if (big && big.firstChild) {
      const to = parseInt(big.firstChild.nodeValue, 10), from = prev.big !== undefined ? prev.big : 0, t0 = performance.now();
      prev.big = to;
      if (from !== to) { const step = (t) => { const p = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - p, 3); if (big.firstChild) big.firstChild.nodeValue = Math.round(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    }
    if (popKey) { const q = popKey.split(':'); if (q[0] === 'all') main.querySelectorAll('.chk.on[data-id="' + q[1] + '"]').forEach((b) => b.classList.add('pop')); else { const b = main.querySelector('.chk[data-id="' + q[0] + '"][data-i="' + q[1] + '"]'); if (b) b.classList.add('pop'); } popKey = null; }
  }

  const num = (id) => { const el = $(id); if (!el) return NaN; const v = parseFloat(String(el.value).replace(',', '.')); return v; };

  function ensureEx(id) { const L = log(); L.ex = L.ex || {}; const ex = C.EXERCISES[id]; if (!L.ex[id]) L.ex[id] = { rir: 2, sets: Array(ex.sets).fill(0) }; while (L.ex[id].sets.length < ex.sets) L.ex[id].sets.push(0); return L.ex[id]; }
  function lock() { if (S.plan[date] === undefined) S.plan[date] = C.workoutOf(S, date); }
  function defReps(id, i) { const last = C.lastSets(S, id, date); return (last && last.sets[i]) || C.EXERCISES[id].reps[0]; }

  const actions = {
    tab(el) { scrollY[view] = window.scrollY; view = el.dataset.id; },
    day(el) { const n = C.addDays(date, +el.dataset.d); if (n <= TODAY) date = n; },
    wo(el) { S.plan[date] = el.dataset.id; },
    plan(el) { S.plan[el.dataset.id] = el.dataset.v; },
    set(el) { const id = el.dataset.id, i = +el.dataset.i; const e = ensureEx(id); lock(); e.sets[i] = e.sets[i] > 0 ? 0 : defReps(id, i); if (e.sets[i] > 0) popKey = id + ':' + i; },
    rep(el) { const id = el.dataset.id, i = +el.dataset.i, d = +el.dataset.d; const e = ensureEx(id); const cur = e.sets[i] > 0 ? e.sets[i] : defReps(id, i); e.sets[i] = Math.max(1, cur + d); lock(); },
    rir(el) { ensureEx(el.dataset.id).rir = +el.dataset.v; },
    rest(el) { const e = ensureEx(el.dataset.id), v = +el.dataset.v; e.rest = e.rest === v ? 0 : v; },
    all(el) { const id = el.dataset.id, ex = C.EXERCISES[id], e = ensureEx(id); const full = e.sets.slice(0, ex.sets).every((x) => x > 0); for (let i = 0; i < ex.sets; i++) e.sets[i] = full ? 0 : (e.sets[i] > 0 ? e.sets[i] : defReps(id, i)); lock(); if (!full) popKey = 'all:' + id; },
    sleep(el) { const L = log(); const cur = L.sleep > 0 ? L.sleep : 7; const n = Math.round((cur + 0.25 * +el.dataset.d) * 4) / 4; L.sleep = Math.max(0, Math.min(14, L.sleep > 0 ? n : 7.5)); },
    weight(el) { const L = log(); const base = L.weight > 0 ? L.weight : (C.weightOn(S, date) || S.profile.weight); L.weight = Math.round((L.weight > 0 ? base + 0.1 * +el.dataset.d : base) * 10) / 10; },
    pick(el) { sheetNew = true; sheet = { type: 'food', i: +el.dataset.i, qty: 1 }; },
    qty(el) { sheet.qty = Math.max(0.25, Math.round((sheet.qty + 0.25 * +el.dataset.d) * 100) / 100); },
    close() { sheet = null; },
    addfood() { const f = S.foods[sheet.i], q = sheet.qty; const L = log(); L.food = L.food || []; L.food.push({ name: f.name + (q !== 1 ? ' ×' + q : ''), kcal: f.kcal * q, p: f.p * q, c: f.c * q, f: f.f * q }); sheet = null; },
    delpreset() { S.foods.splice(sheet.i, 1); sheet = null; },
    delfood(el) { log().food.splice(+el.dataset.i, 1); },
    custom() { sheetNew = true; sheet = { type: 'custom' }; },
    addcustom() {
      const name = ($('#c_name').value || '').trim() || 'Блюдо';
      const it = { name, kcal: num('#c_kcal') || 0, p: num('#c_p') || 0, c: num('#c_c') || 0, f: num('#c_f') || 0 };
      if (!(it.kcal > 0 || it.p > 0)) return;
      const L = log(); L.food = L.food || []; L.food.push(it);
      if ($('#c_save').checked) S.foods.push({ name, unit: '1 порция', kcal: it.kcal, p: it.p, c: it.c, f: it.f });
      sheet = null;
    },
    addmeas() {
      const m = { date }; let any = false;
      for (const k of ['biceps', 'chest', 'waist', 'neck']) { let v = num('#m_' + k); if (!(v > 0)) { const prev = S.meas.length ? S.meas[S.meas.length - 1][k] : null; v = prev; } else any = true; m[k] = v; }
      if (!any || ['biceps', 'chest', 'waist', 'neck'].some((k) => !(m[k] > 0))) return;
      S.meas.push(m);
    },
    export() { $('#io').value = JSON.stringify(S); $('#io').select(); },
    import() {
      try { const v = JSON.parse($('#io').value); if (!v || !v.logs || !v.profile) throw 0; S = Object.assign(C.defaultState(), v); S.meas = S.meas || []; }
      catch (e) { $('#io').value = 'Не удалось прочитать данные'; return false; }
    },
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const keep = $('#io') && ev.target.closest('[data-a="export"]');
    if (['tab', 'day', 'wo'].includes(el.dataset.a)) enter = true;
    const r = actions[el.dataset.a] && actions[el.dataset.a](el);
    save();
    if (keep) { render(); $('#io').value = JSON.stringify(S); return; }
    if (r !== false) render();
    if (el.dataset.a === 'tab') window.scrollTo(0, scrollY[view] || 0);
  });
  document.addEventListener('change', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.prof;
    if (!k) return;
    const v = parseFloat(String(ev.target.value).replace(',', '.'));
    if (v > 0) { S.profile[k] = v; save(); }
    render();
  });
  document.addEventListener('DOMContentLoaded', () => { render(); });
  if (document.readyState !== 'loading') render();

  function checkDay() { const n = C.dstr(new Date()); if (n !== TODAY) { if (date === TODAY) date = n; TODAY = n; return true; } return false; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkDay(); render(); } });
  window.addEventListener('pageshow', () => { checkDay(); render(); });
  setInterval(() => { if (checkDay()) render(); }, 60000);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
