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
    if (!st) { def.meas = []; def.meta = {}; return def; }
    st.profile = Object.assign({}, def.profile, st.profile);
    st.logs = st.logs || {}; st.foods = st.foods || def.foods; st.schedule = st.schedule || def.schedule; st.meas = st.meas || []; st.plan = st.plan || {}; st.meta = st.meta || {}; st.meals = st.meals || def.meals; st.barcodes = st.barcodes || {}; if (st.deload === undefined) st.deload = null;
    return st;
  }
  let S = load();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* не критично */ }
  let toastT = null;
  let tmsg = null;
  function toast(msg, undo) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    tmsg = msg; t.innerHTML = '<span></span>' + (undo ? '<button data-a="undo">Отменить</button>' : ''); t.firstChild.textContent = msg;
    t.classList.toggle('u', !!undo); t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), undo ? 4500 : 2000);
  }
  function save() { mem = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ } }

  let view = 'today';
  let date = C.dstr(new Date());
  let TODAY = date;
  const scrollY = {};
  let sheet = null;
  let enter = true, popKey = null, sheetNew = false;
  const ui = {};
  const prev = {}; // {type:'food'|'custom', food, qty}

  const log = () => (S.logs[date] = S.logs[date] || {});
  const workoutOf = (d) => C.workoutOf(S, d);
  const fmtDate = (d) => { const x = C.parse(d); return DAYS[x.getDay()] + ', ' + x.getDate() + ' ' + MONTHS[x.getMonth()]; };

  // ---------- Мелкие компоненты ----------
  const bar = (v, cls) => '<div class="bar"><i class="' + (cls || '') + '" style="width:' + Math.max(0, Math.min(100, v * 100)) + '%"></i></div>';
  const stepper = (a, id, val, extra) => '<div class="step"><button data-a="' + a + '" data-id="' + id + '" data-d="-1" ' + (extra || '') + '>−</button><b>' + val + '</b><button data-a="' + a + '" data-id="' + id + '" data-d="1" ' + (extra || '') + '>+</button></div>';

  // ---------- Общие карточки ----------
  function painCard() {
    const pa = C.painAdvice(S, date); if (!pa) return '';
    return '<div class="card warn"><h3>Боль: ' + pa.tags.join(', ') + '</h3><p>Сократите объём на 30–50% или замените упражнения, нагружающие это место: ' + pa.ex.slice(0, 5).map(esc).join(', ') + '. Если боль острая или держится больше недели, покажитесь врачу.</p></div>';
  }
  function listCard(title, sub, items, flag, key) {
    const done = !!log()[flag], open = !!ui[key];
    return '<div class="card"><button class="exh fold" data-a="fold" data-id="' + key + '"><b>' + title + '</b><span class="mut">' + (done ? '✓ выполнено' : sub) + (open ? ' ▴' : ' ▾') + '</span></button>' +
      (open ? '<div class="lst">' + items.map(([n, d]) => '<div class="li"><b>' + esc(n) + '</b><span>' + esc(d) + '</span></div>').join('') + '<button class="btn ' + (done ? '' : 'pri') + '" data-a="flag" data-id="' + flag + '">' + (done ? 'Снять отметку' : 'Выполнено') + '</button></div>' : '') + '</div>';
  }
  function wellCard() {
    const L = log(), pain = L.pain || [];
    return '<div class="card"><h3>Самочувствие</h3><div class="chips wrap">' + Object.entries(C.PAIN).map(([k, n]) => '<button class="chip s ' + (pain.includes(k) ? 'on' : '') + '" data-a="pain" data-id="' + k + '">' + n + ' болит</button>').join('') + '</div><textarea id="note" class="io" style="height:72px" placeholder="Заметка к дню: самочувствие, погода, что менялось…">' + esc(L.note || '') + '</textarea></div>';
  }
  function reviewCard() {
    const W = C.weeklyReview(S, TODAY), diff = W.total - W.prev, kT = Math.round(S.profile.tdee * 1.08);
    const adv = { train: 'выполните все три тренировки целиком', protein: 'добавляйте белок в каждый приём пищи: творог, курица, яйца, протеин', energy: 'подвиньте калории ближе к ' + kT + ' ккал', sleep: 'ложитесь на 30–45 минут раньше', recovery: 'разнесите тренировки минимум на 48 часов', macro: 'держите углеводы не ниже нормы и жиры около ' + S.profile.fatPerKg + ' г на кг' };
    let h = '<div class="card"><h3>Разбор недели</h3><div class="row"><span>Токены за 7 дней</span><b>' + r1(W.total) + ' из ' + r0(W.ideal) + ' г</b></div>' + bar(W.ideal ? W.total / W.ideal : 0) + '<div class="row"><span>К прошлой неделе</span><b class="' + (diff >= 0 ? 'plus' : 'minus') + '">' + (diff >= 0 ? '+' : '−') + r1(Math.abs(diff)) + ' г</b></div>';
    if (W.logged < 4) h += '<p class="mut small">Внесено только ' + W.logged + ' дн. из 7, разбор приблизительный.</p>';
    if (W.items.length) h += '<h3 style="margin-top:14px">Где потеряно</h3>' + W.items.slice(0, 3).map((x) => '<div class="row lim"><span>' + esc(x.text) + '</span><b class="minus">−' + r1(x.g) + ' г</b></div>').join('') + '<p><b>На следующую неделю:</b> ' + adv[W.items[0].key] + '.</p><p class="mut small">Потери по каждому пункту оцениваются отдельно, поэтому их сумма не равна общему недобору.</p>';
    else h += '<p class="mut">Явных потерь нет.</p>';
    return h + '</div>';
  }
  function heatCard() {
    const dd = C.parse(TODAY), mon = C.addDays(TODAY, -((dd.getDay() + 6) % 7)), start = C.addDays(mon, -77);
    let cells = '', sums = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0], any = 0;
    for (let w = 0; w < 12; w++) for (let d = 0; d < 7; d++) {
      const ds = C.addDays(start, w * 7 + d); if (ds > TODAY) continue;
      const l = S.logs[ds], has = l && (l.ex || (l.food && l.food.length) || l.sleep > 0);
      let fill = '#1e2127';
      if (has) { const o = C.computeDay(S, ds).opt; fill = o >= 85 ? '#7ee0a1' : o >= 60 ? '#f0b86e' : '#ef7a7a'; sums[d] += o; cnt[d]++; any++; }
      cells += '<rect x="' + (24 + w * 25) + '" y="' + (d * 25) + '" width="22" height="22" rx="5" fill="' + fill + '"/>';
    }
    const names = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
    const labels = names.map((n, i) => '<text x="0" y="' + (i * 25 + 16) + '" class="hl">' + n + '</text>').join('');
    let weak = '';
    const av = names.map((n, i) => ({ n, v: cnt[i] >= 3 ? sums[i] / cnt[i] : null })).filter((x) => x.v != null).sort((x, y) => x.v - y.v);
    if (av.length >= 4) weak = '<div class="row"><span>Слабее всего</span><b>' + av[0].n + ' · ' + r0(av[0].v) + '%</b></div><div class="row"><span>Сильнее всего</span><b>' + av[av.length - 1].n + ' · ' + r0(av[av.length - 1].v) + '%</b></div>';
    return '<div class="card"><h3>Оптимальность по дням, 12 недель</h3>' + (any ? '<svg viewBox="0 0 324 175" class="chart">' + labels + cells + '</svg><p class="mut small">Зелёный от 85%, жёлтый 60–85%, красный ниже. Серый — нет данных. Строки — дни недели, столбцы — недели (справа новые).</p>' + weak : '<p class="mut">Появится, когда накопятся данные.</p>') + '</div>';
  }
  function sleepCard() {
    const r = C.sleepVsPerformance(S);
    let h = '<div class="card"><h3>Сон и силовые показатели</h3>';
    if (!r.enough) return h + '<p class="mut">Нужно больше тренировок со внесённым сном: сейчас ' + r.n + ' из 12 измерений.</p></div>';
    h += '<div class="row"><span>Связь (корреляция)</span><b>' + r1(r.r) + '</b></div>';
    if (r.lowPct != null && r.highPct != null) h += '<div class="row"><span>После сна меньше 7 ч</span><b>' + (r.lowPct >= 0 ? '+' : '−') + r1(Math.abs(r.lowPct)) + '%</b></div><div class="row"><span>После сна от 7 ч</span><b>' + (r.highPct >= 0 ? '+' : '−') + r1(Math.abs(r.highPct)) + '%</b></div>';
    return h + '<p class="mut small">' + (Math.abs(r.r) < 0.2 ? 'На ваших данных связь слабая или не видна. ' : r.r > 0 ? 'Чем дольше сон, тем больше повторов в тот же день. ' : 'Обратная связь: скорее всего, влияют другие факторы. ') + 'Проценты — отклонение суммы повторов от вашей обычной для упражнения. Измерений: ' + r.n + '.</p></div>';
  }

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
      for (const id of C.PLAN[wo].ex) { planned += C.setsFor(S, date, id); done += ((L[id] && L[id].sets) || []).filter((x) => x > 0).length; }
    }
    let h = '<div class="datenav"><button data-a="day" data-d="-1">‹</button><div><b>' + (date === TODAY ? 'Сегодня' : fmtDate(date)) + '</b><span>' + fmtDate(date) + '</span></div><button data-a="day" data-d="1" ' + (date >= TODAY ? 'disabled' : '') + '>›</button></div>';
    h += '<div class="ringwrap"><svg viewBox="0 0 180 180" class="ring"><circle cx="90" cy="90" r="' + R_ + '" class="rbg"/><circle cx="90" cy="90" r="' + R_ + '" class="rfg ' + col + '" stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - pct / 100)) + '" transform="rotate(-90 90 90)"/></svg><div class="ringtxt"><div class="big">' + r0(R.opt) + '<small>%</small></div><div class="tok">' + (R.tokens >= 0 ? '+' : '−') + r1(Math.abs(R.tokens)) + ' г</div></div></div>';
    h += '<p class="cap">оптимальность дня · потенциал роста мышц, граммы (модельная оценка)</p>';
    if (R.missing.length) h += '<div class="note">Не внесено: ' + R.missing.map((m) => (m === 'food' ? 'питание' : 'сон')).join(', ') + '. Пока это считается как наполовину выполненное.</div>';
    if (Object.keys(S.logs).length >= 5 && (!S.meta.lastExport || Date.now() - S.meta.lastExport > 14 * 864e5)) h += '<button class="note link" data-a="tab" data-id="progress">Давно не было резервной копии данных. Откройте «Прогресс» → «Данные» → «Экспорт».</button>';
    h += '<div class="card"><div class="row"><span>Тренировка <small>' + (planned ? esc(C.PLAN[wo].name) + ': ' + done + ' из ' + planned + ' подходов' : 'день отдыха · за неделю ' + r0(R.T * 100) + '% плана') + '</small></span><b>' + (planned ? r0(done / planned * 100) + '%' : '—') + '</b></div>' + bar(planned ? done / planned : 0) +
      '<div class="row"><span>Белок <small>' + r0(R.food.p) + ' / ' + Math.round(S.profile.proteinPerKg * S.profile.weight) + ' г</small></span><b>' + r0(R.P * 100) + '%</b></div>' + bar(R.P) +
      '<div class="row"><span>Калории <small>' + r0(R.food.kcal) + ' / ' + R.tg.kcal + ' · ' + (R.tg.train ? 'день тренировки' : 'день отдыха') + '</small></span><b>' + r0(R.food.kcal / R.tg.kcal * 100) + '%</b></div>' + bar(Math.min(1, R.food.kcal / R.tg.kcal)) +
      '<div class="row"><span>Углеводы <small>норма ' + R.tg.carbMin + '–' + R.tg.carbMax + ' г</small></span><b>' + r0(R.food.c) + ' г</b></div><div class="row"><span>Жиры <small>норма ' + R.tg.fatMin + '–' + R.tg.fatMax + ' г</small></span><b>' + r0(R.food.f) + ' г</b></div>' +
      '<div class="row"><span>Сон <small>' + (R.sleep.last ? r1(R.sleep.last) + ' ч ночью · ' : '') + (R.sleep.mean ? 'среднее ' + r1(R.sleep.mean) + ' ч за неделю' : 'не внесён') + '</small></span><b>' + r0(R.S * 100) + '%</b></div>' + bar(R.S) +
      (R.R < 0.98 ? '<div class="row"><span>Восстановление <small>тренировки идут слишком плотно</small></span><b>' + r0(R.R * 100) + '%</b></div>' + bar(R.R) : '') + '</div>';
    if (wo && C.PLAN[wo]) h += '<button class="card link" data-a="tab" data-id="train"><div class="row"><span>' + esc(C.PLAN[wo].name) + '</span><b>' + done + ' / ' + planned + '</b></div>' + bar(planned ? done / planned : 0) + '</button>';
    else h += '<button class="card link" data-a="tab" data-id="train"><div class="row"><span>День отдыха<small>' + (R.next ? 'Ближайшая тренировка: ' + DAYS[C.parse(R.next.date).getDay()] + ' · Верх ' + R.next.wo + '. ' : '') + 'Мобильность плеч, 8 минут</small></span><b>' + (log().mob ? '✓' : 'восстановление') + '</b></div></button>';
    h += painCard();
    if (date === TODAY) { const cu = C.catchup(S, date); h += '<div class="card"><h3>На сегодня осталось</h3><div class="row"><span>Калории</span><b>' + r0(cu.left.kcal) + ' ккал</b></div><div class="row"><span>Белок</span><b>' + r0(cu.left.p) + (cu.extraP ? ' + ' + cu.extraP : '') + ' г</b></div>' + (cu.extraP ? '<p class="mut small">+' + cu.extraP + ' г — наверстать недобор белка за последние дни.</p>' : '') + (cu.sleepMin ? '<div class="row"><span>Сон</span><b>лечь на ' + cu.sleepMin + ' мин раньше</b></div>' : '') + '</div>'; }
    if (S.deload && S.deload.to >= TODAY) h += '<div class="note">Разгрузочная неделя до ' + fmtDate(S.deload.to) + ': подходов вдвое меньше.</div>';
    if (R.limiters.length) h += '<div class="card"><h3>Что добавит больше всего</h3>' + R.limiters.slice(0, 3).map((l) => '<div class="row lim"><span>' + esc(l.text) + '</span><b class="plus">+' + r1(l.gain) + ' г</b></div>').join('') + '</div>';
    else h += '<div class="card"><h3>Всё в оптимуме</h3><p class="mut">Ограничителей нет — так держать.</p></div>';
    if (R.risks.length) h += '<div class="card warn"><h3>Внимание</h3>' + R.risks.map((x) => '<p>' + esc(x) + '</p>').join('') + (R.pen > 0 ? '<p class="mut">Штраф к токенам: −' + r1(R.pen) + ' г</p>' : '') + '</div>';
    { const WR = C.weeklyReview(S, date); h += '<button class="card link" data-a="tab" data-id="progress"><div class="row"><span>Разбор недели<small>' + (WR.items[0] ? 'главное: ' + esc(WR.items[0].text) : 'явных потерь нет') + '</small></span><b>' + r1(WR.total) + ' г</b></div></button>'; }
    h += '<div class="card"><div class="row"><span>Токены за 7 дней</span><b>' + r1(wk) + ' г</b></div><p class="mut">Это потенциал, а не измеренный прирост. Сверяйте с замерами на вкладке «Прогресс».</p></div>';
    return h;
  }

  // ---------- Экран: Тренировка ----------
  function viewTrain() {
    const wo = workoutOf(date);
    let h = '<div class="datenav"><button data-a="day" data-d="-1">‹</button><div><b>' + (date === TODAY ? 'Сегодня' : fmtDate(date)) + '</b><span>' + fmtDate(date) + '</span></div><button data-a="day" data-d="1" ' + (date >= TODAY ? 'disabled' : '') + '>›</button></div>';
    h += '<div class="chips">' + ['A', 'B', 'C', ''].map((k) => '<button class="chip ' + (wo === k ? 'on' : '') + '" data-a="wo" data-id="' + k + '">' + (k ? 'Верх ' + k : 'Отдых') + '</button>').join('') + '</div>';
    if (!wo || !C.PLAN[wo]) return h + painCard() + '<div class="card"><p class="mut">Сегодня отдых. Восстановление — часть роста: сон и белок продолжают работать.</p></div>' + listCard('Мобильность плеч', '8 минут', C.MOBILITY, 'mob', 'mob') + wellCard();
    h += '<h2>' + esc(C.PLAN[wo].name) + '</h2>' + painCard();
    if (C.deloadOn(S, date)) h += '<div class="note">Разгрузочная неделя: подходов вдвое меньше, усилие то же.</div>';
    h += listCard('Разминка', '5 минут', C.WARMUP, 'warm', 'warm');
    const L = log().ex || {};
    for (const id of C.PLAN[wo].ex) {
      const ex = C.EXERCISES[id], ns = C.setsFor(S, date, id);
      const e = L[id] || { rir: 2, sets: [] };
      const last = C.lastSets(S, id, date);
      const ready = last && last.sets.length >= ns && last.sets.every((x) => x >= ex.reps[1]);
      const doneN = (e.sets || []).filter((x) => x > 0).length;
      h += '<div class="card ex ' + (doneN === ns ? 'full' : '') + '"><div class="exh"><b>' + esc(ex.name) + '</b><button class="allb ' + (doneN === ns ? 'on' : '') + '" data-a="all" data-id="' + id + '">' + (doneN === ns ? '✓ Готово' : 'Отметить все') + '</button></div><p class="mut"><span class="tgt">' + ns + '×' + ex.reps[0] + '–' + ex.reps[1] + '</span> · ' + esc(ex.tip) + (last ? ' · прошлый раз: ' + last.sets.join(', ') : '') + '</p>' + (ready ? '<p class="small plus">Все подходы были на верхней границе — пора усложнить: ' + (ex.prog[C.exerciseSessions(S, id, date).length % 3] + ' или ' + ex.prog[(C.exerciseSessions(S, id, date).length + 1) % 3]).toLowerCase() + '.</p>' : '');
      for (let i = 0; i < ns; i++) {
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
    h += listCard('Заминка', '3 минуты', C.COOLDOWN, 'cool', 'cool');
    { const W = C.workoutSummary(S, date); if (W && W.done > 0) h += '<button class="btn pri" data-a="summaryopen">Итог тренировки · ' + W.done + ' / ' + W.planned + '</button>'; }
    h += wellCard();
    h += '<p class="mut small">Запас повторов — сколько ещё повторов вы могли бы сделать. Подходы с запасом 0–3 считаются полностью, 4–5 — вполовину, 6+ — не считаются: они слишком далеки от отказа для роста. Отдых: для подтягиваний и брусьев лучше 2–3 минуты, для упражнений с резинкой хватает минуты; при меньшем отдыхе подходы засчитываются с небольшой скидкой.</p>';
    return h;
  }

  // ---------- Экран: План недели ----------
  function viewPlan() {
    const P = C.projectWeek(S, TODAY, 7);
    const B = C.projectWeek(Object.assign({}, S, { plan: {}, schedule: { 1: 'A', 3: 'B', 5: 'C' } }), TODAY, 7);
    const sum = (X) => X.days.reduce((s, x) => s + x.r.tokens, 0);
    const tot = sum(P), diff = tot - sum(B);
    const sess = P.days.filter((x) => x.wo && C.PLAN[x.wo]).length;
    const A = P.assumed;
    let h = '<h2>План недели</h2><div class="card"><h3>Прогноз на 7 дней</h3><div class="row"><span>Токены</span><b>' + r1(tot) + ' г</b></div><div class="row"><span>К базовому плану (пн · ср · пт)</span><b class="' + (diff >= -0.05 ? 'plus' : 'minus') + '">' + (diff >= 0 ? '+' : '−') + r1(Math.abs(diff)) + ' г</b></div><div class="row"><span>Тренировок в неделю</span><b>' + sess + '</b></div></div>';
    if (S.deload && S.deload.to >= TODAY) h += '<div class="card"><h3>Разгрузочная неделя</h3><p>Идёт до ' + fmtDate(S.deload.to) + ': те же тренировки, но подходов вдвое меньше. В модели такая неделя засчитывается примерно на 80%, а мышцы и суставы отдыхают.</p><button class="btn" data-a="enddeload">Отменить разгрузку</button></div>';
    else if (C.deloadSuggested(S, TODAY)) h += '<div class="card warn"><h3>Нужна разгрузка?</h3><p>Повторы падают в нескольких упражнениях подряд. Это частый признак накопленной усталости. Рекомендуем неделю с половиной подходов.</p><button class="btn pri" data-a="startdeload">Начать разгрузочную неделю</button></div>';
    h += '<div class="card"><h3>Выберите тип дня</h3>' + P.days.map((x) => {
      const dt = C.parse(x.date), tk = x.r.tokens;
      return '<div class="prow"><div class="pd"><b>' + (x.date === TODAY ? 'Сегодня' : DAYS[dt.getDay()]) + '</b><span>' + dt.getDate() + ' ' + MONTHS[dt.getMonth()] + '</span></div><div class="seg">' + ['A', 'B', 'C', ''].map((k) => '<button class="chip s ' + (x.wo === k ? 'on' : '') + '" data-a="plan" data-id="' + x.date + '" data-v="' + k + '">' + (k || 'Отдых') + '</button>').join('') + '</div><div class="pt ' + (tk >= 0 ? 'plus' : 'minus') + '">' + (tk >= 0 ? '+' : '−') + r1(Math.abs(tk)) + '</div>' + (x.wo && C.PLAN[x.wo] && x.r.R < 0.95 ? '<div class="pw">Мало отдыха между тренировками: −' + r0((1 - x.r.R) * 100) + '% к зачёту</div>' : '') + '</div>';
    }).join('') + '<p class="mut small">Число справа — токены этого дня (г). Тренировка влияет на токены следующих 7 дней, поэтому день отдыха после неё тоже «зарабатывает».</p></div>';
    h += '<button class="btn" data-a="saveschedule">Сделать этот выбор расписанием по умолчанию</button>';
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
    const tg = C.targets(S, date), kT = tg.kcal, pT = tg.p;
    let h = '<div class="datenav"><button data-a="day" data-d="-1">‹</button><div><b>' + (date === TODAY ? 'Сегодня' : fmtDate(date)) + '</b><span>' + fmtDate(date) + '</span></div><button data-a="day" data-d="1" ' + (date >= TODAY ? 'disabled' : '') + '>›</button></div>';
    h += '<div class="card"><div class="row"><span>Сон прошлой ночью</span>' + stepper('sleep', 'x', L.sleep > 0 ? r1(L.sleep) + ' ч' : '—') + '</div><p class="mut">Цель — от 7,5 ч. ' + (L.sleep > 0 ? '' : 'Нажмите + чтобы внести.') + '</p>' +
      '<div class="row"><span>Вес утром</span>' + stepper('weight', 'x', L.weight > 0 ? r1(L.weight) + ' кг' : '—') + '</div></div>';
    const mrow = (name, v, t, min, max) => '<div class="row"><span>' + name + (min != null ? '<small>норма ' + min + '–' + max + ' г</small>' : '') + '</span><b>' + r0(v) + ' / ' + t + ' г</b></div>' + bar(v / t, max != null && v > max ? 'warn' : '');
    h += '<div class="card"><div class="row"><span>Калории<small>' + (tg.train ? 'день тренировки' : 'день отдыха') + ' · расход ≈ ' + tg.tdee + '</small></span><b>' + r0(ft.kcal) + ' / ' + kT + '</b></div>' + bar(ft.kcal / kT) + mrow('Белок', ft.p, pT, null, null) + mrow('Углеводы', ft.c, tg.carb, tg.carbMin, tg.carbMax) + mrow('Жиры', ft.f, tg.fat, tg.fatMin, tg.fatMax) + '<p class="mut small">Цель по калориям зависит от дня: в день тренировки выше, в день отдыха ниже. Углеводы — остаток калорий после белка и жиров.</p></div>';
    const items = L.food || [];
    if (undoStack.length) h += '<button class="btn ghost" data-a="undo">↶ Отменить последнее изменение еды (' + undoStack.length + ')</button>';
    if (items.length) h += '<div class="card"><h3>Съедено</h3>' + items.map((it, i) => '<div class="row item"><span>' + esc(it.name) + '<small>' + r0(it.kcal) + ' ккал · Б ' + r0(it.p) + ' · У ' + r0(it.c) + ' · Ж ' + r0(it.f) + '</small></span><button class="x" data-a="delfood" data-i="' + i + '" aria-label="Удалить">×</button></div>').join('') + '</div>';
    if (items.length) h += '<button class="btn ghost" data-a="savetplopen">Сохранить съеденное как шаблон</button>';
    const yf = (S.logs[C.addDays(date, -1)] || {}).food;
    if (!items.length && yf && yf.length) h += '<button class="btn" data-a="copyfood">Скопировать питание со вчера (' + r0(yf.reduce((s, x) => s + x.kcal, 0)) + ' ккал)</button>';
    h += '<h3 class="sec">Шаблоны</h3><div class="chips wrap">' + S.meals.map((m, i) => '<button class="chip" data-a="pickmeal" data-i="' + i + '">' + esc(m.name) + '</button>').join('') + '<button class="chip plusb" data-a="searchopen">Найти продукт</button><button class="chip plusb" data-a="scanopen">Скан камерой</button><button class="chip plusb" data-a="bcopen">Штрихкод</button><button class="chip plusb" data-a="quickopen">Быстрый ввод</button></div>';
    h += '<h3 class="sec">Добавить</h3><div class="chips wrap">' + S.foods.map((f, i) => '<button class="chip" data-a="pick" data-i="' + i + '">' + esc(f.name) + '</button>').join('') + '<button class="chip plusb" data-a="custom">+ своё</button></div>';
    return h;
  }

  // ---------- Экран: Прогресс ----------
  const bf = (m, height) => C.navyBF(m, height);
  function viewProgress() {
    const days = []; for (let i = 13; i >= 0; i--) days.push(C.addDays(TODAY, -i));
    const vals = days.map((d) => C.computeDay(S, d).tokens);
    const max = Math.max(12, ...vals);
    const bw = 300 / 14;
    let svg = '<svg viewBox="0 0 300 110" class="chart">';
    vals.forEach((v, i) => { const hgt = Math.max(1, (Math.max(0, v) / max) * 90); svg += '<rect x="' + (i * bw + 2) + '" y="' + (95 - hgt) + '" width="' + (bw - 4) + '" height="' + hgt + '" rx="3" class="' + (days[i] === TODAY ? 'cur' : '') + '"/>'; });
    svg += '<line x1="0" x2="300" y1="95.5" y2="95.5" class="axis"/></svg>';
    const sum14 = vals.reduce((a, b) => a + b, 0);
    let h = '<h2>Прогресс</h2>' + reviewCard() + '<div class="card"><h3>Токены за 14 дней</h3>' + svg + '<div class="row"><span>Сумма</span><b>' + r1(sum14) + ' г</b></div><div class="row"><span>В среднем в день</span><b>' + r1(sum14 / 14) + ' г</b></div></div>' + heatCard() + sleepCard();
    const ws = []; for (const d of Object.keys(S.logs).sort()) if (S.logs[d].weight > 0) ws.push([d, S.logs[d].weight]);
    if (ws.length >= 2) {
      const l = ws.slice(-30), mn = Math.min(...l.map((x) => x[1])) - 0.3, mx = Math.max(...l.map((x) => x[1])) + 0.3;
      const pts = l.map((x, i) => (l.length === 1 ? 150 : 10 + (i / (l.length - 1)) * 280).toFixed(1) + ',' + (90 - ((x[1] - mn) / (mx - mn)) * 75).toFixed(1)).join(' ');
      const tr = C.weightTrend(S, TODAY);
      h += '<div class="card"><h3>Вес</h3><svg viewBox="0 0 300 100" class="chart"><polyline points="' + pts + '" class="wl"/></svg><div class="row"><span>Сейчас</span><b>' + r1(l[l.length - 1][1]) + ' кг</b></div>' + (tr != null ? '<div class="row"><span>Тренд за 4 недели</span><b class="' + (tr >= 0 ? 'plus' : 'minus') + '">' + (tr >= 0 ? '+' : '−') + r1(Math.abs(tr)) + ' кг/нед</b></div><p class="mut small">Для набора мышц ориентир — плюс 0,1–0,3 кг в неделю: больше — часть уйдёт в жир.</p>' : '') + '</div>';
    } else if (ws.length) h += '<div class="card"><h3>Вес</h3><div class="row"><span>' + fmtDate(ws[0][0]) + '</span><b>' + r1(ws[0][1]) + ' кг</b></div><p class="mut small">График появится после второго взвешивания.</p></div>';
    const cal = C.calibration(S, TODAY);
    h += '<div class="card"><h3>Сверка модели с замерами</h3>';
    if (!cal) h += '<p class="mut">Внесите замеры минимум дважды с интервалом от двух недель. Тогда здесь появится сравнение прогноза токенов с реальным изменением.</p>';
    else {
      const dl = cal.dLbmKg;
      h += '<div class="row"><span>Период</span><b>' + cal.days + ' дн.</b></div><div class="row"><span>Токены за период</span><b>' + r1(cal.tokensG / 1000) + ' кг</b></div>' +
        (dl != null ? '<div class="row"><span>Сухая масса по замерам</span><b class="' + (dl >= 0 ? 'plus' : 'minus') + '">' + (dl >= 0 ? '+' : '−') + r1(Math.abs(dl)) + ' кг</b></div>' : '') +
        '<div class="row"><span>Бицепс</span><b>' + (cal.dBiceps >= 0 ? '+' : '−') + r1(Math.abs(cal.dBiceps)) + ' см</b></div><div class="row"><span>Грудь</span><b>' + (cal.dChest >= 0 ? '+' : '−') + r1(Math.abs(cal.dChest)) + ' см</b></div><div class="row"><span>Талия</span><b>' + (cal.dWaist >= 0 ? '+' : '−') + r1(Math.abs(cal.dWaist)) + ' см</b></div>';
      if (cal.factor != null) h += '<p class="mut">Факт составил ≈ ' + r0(cal.factor * 100) + '% от прогноза модели. Это ориентир, а не точное измерение: погрешность замера жира ±3–4 п.п.</p>' + (Math.abs(cal.factor - 1) > 0.15 ? '<button class="btn" data-a="applylevel" data-v="' + (Math.round(S.profile.level * cal.factor * 100) / 100) + '">Подстроить потенциал до ' + r1(S.profile.level * cal.factor) + '%</button>' : '');
      else h += '<p class="mut">Пока слишком короткий период: ошибка замера жира по формуле Navy (±3–4 п.п.) сопоставима с ожидаемым приростом. Нужно 8–12 недель.</p>';
    }
    h += '</div>';
    const ep = C.exerciseProgress(S);
    if (ep.length) h += '<div class="card"><h3>Прогресс в упражнениях</h3>' + ep.map((x) => '<div class="row"><span>' + esc(C.EXERCISES[x.id].name) + '<small>' + x.n + ' тренировок · лучшая ' + x.best + ' повт.</small></span><b class="' + (x.last >= x.first ? 'plus' : 'minus') + '">' + x.first + ' → ' + x.last + '</b></div>').join('') + '<p class="mut small">Сумма повторов за тренировку: первая и последняя.</p></div>';

    h += '<div class="card"><h3>Замеры</h3>';
    const m = S.meas;
    if (m.length) {
      const f0 = m[0], l0 = m[m.length - 1];
      const b = bf(l0, S.profile.height);
      h += '<p class="mut">Последний: ' + fmtDate(l0.date) + '</p>' + [['biceps', 'Бицепс (напряжён)'], ['chest', 'Грудь'], ['waist', 'Талия'], ['neck', 'Шея']].map(([k, n]) => '<div class="row"><span>' + n + '</span><b>' + r1(l0[k]) + ' см' + (m.length > 1 ? ' <small class="' + ((l0[k] - f0[k]) >= 0 ? 'plus' : 'minus') + '">' + ((l0[k] - f0[k]) >= 0 ? '+' : '−') + r1(Math.abs(l0[k] - f0[k])) + '</small>' : '') + '</b></div>').join('');
      if (b != null) { const lbm = S.profile.weight * (1 - b / 100); h += '<div class="row"><span>Жир (Navy, ±3–4 п.п.)</span><b>' + r1(b) + '%</b></div><div class="row"><span>Сухая масса ≈</span><b>' + r1(lbm) + ' кг</b></div>'; }
    } else h += '<p class="mut">Пока нет замеров. Вносите раз в 2–4 недели, утром натощак, в одинаковых условиях.</p>';
    h += '<div class="mform">' + [['biceps', 'бицепс'], ['chest', 'грудь'], ['waist', 'талия'], ['neck', 'шея']].map(([k, n]) => '<label>' + n + ', см<input id="m_' + k + '" inputmode="decimal" placeholder="' + (m.length ? m[m.length - 1][k] : '') + '"></label>').join('') + '</div><button class="btn" data-a="addmeas">Сохранить замеры</button>' + (m.length ? '<button class="btn ghost" data-a="delmeas">Удалить последний замер</button>' : '') + '</div>';

    const pr = S.profile;
    const te = C.estimateTDEE(S, TODAY);
    const tdeeHtml = te ? '<div class="note">По вашему весу и питанию за ' + te.days + ' дн. расход ≈ <b>' + te.tdee + ' ккал</b> (вес ' + (te.perWeek >= 0 ? '+' : '−') + r1(Math.abs(te.perWeek)) + ' кг/нед). <button class="lnk" data-a="applytdee" data-v="' + te.tdee + '">Применить</button></div>' : '';
    h += '<div class="card"><h3>Профиль</h3>' + [['weight', 'Вес, кг', pr.weight], ['tdee', 'Расход калорий, ккал', pr.tdee], ['level', 'Потенциал, % массы в месяц', pr.level], ['proteinPerKg', 'Белок, г на кг', pr.proteinPerKg], ['fatPerKg', 'Жиры, г на кг', pr.fatPerKg], ['trainKcal', 'Доп. расход в день тренировки, ккал', pr.trainKcal]].map(([k, n, v]) => '<label class="pf">' + n + '<input data-prof="' + k + '" inputmode="decimal" value="' + v + '"></label>').join('') + tdeeHtml + '<p class="mut small">Расход калорий — средний за неделю с тремя тренировками: в день тренировки цель выше, в день отдыха ниже. Подберите его по динамике веса: если вес за 2–3 недели не меняется при вашем питании, это и есть ваш расход.</p></div>';
    h += '<div class="card"><h3>Как читать токены</h3><p class="mut">Токен = условный грамм мышечной массы в день при вашем уровне. 100% — план выполнен полностью, белок и калории в норме, сон от 7,5 ч. Модель учитывает объём тренинга (с поправками на запас повторов, отдых между подходами, убывающую отдачу и восстановление между тренировками), белок, энергетический баланс и сон, но это оценка, а не измерение. Через 8–12 недель сравните сумму токенов с реальной динамикой замеров и подправьте «Потенциал» в профиле.</p></div>';
    h += '<div class="card"><h3>Интерфейс</h3><div class="btns"><button class="btn" data-a="haptoggle">Вибро-отклик: ' + (S.meta.nohaptic ? 'выкл' : 'вкл') + '</button></div></div>';
    h += '<div class="card"><h3>Данные</h3><div class="btns"><button class="btn" data-a="export">Экспорт</button><button class="btn" data-a="import">Импорт</button></div><p class="mut small">Данные хранятся только в браузере этого телефона. Делайте экспорт раз в пару недель.</p><textarea id="io" class="io" placeholder="Сюда попадёт копия данных или вставьте её для импорта"></textarea></div>';
    return h;
  }

  // ---------- Шторка добавления еды ----------
  function sheetHtml() {
    if (!sheet) return '';
    const shade = '<div class="shade" data-a="close"></div>';
    if (sheet.type === 'barcode') {
      let b = '<div class="sheet"><h3>Штрихкод</h3>';
      if (sheet.status === 'found') {
        const it = sheet.item;
        b += '<p><b>' + esc(it.name) + '</b></p><p class="mut">на 100 г: ' + r0(it.kcal) + ' ккал · Б ' + r1(it.p) + ' · У ' + r1(it.c) + ' · Ж ' + r1(it.f) + '</p><div class="chips">' + [50, 100, 150, 200, 250].map((v) => '<button class="chip s ' + (sheet.grams === v ? 'on' : '') + '" data-a="bcg" data-v="' + v + '">' + v + ' г</button>').join('') + '</div><div class="mform one"><label>Сколько съели, г<input id="b_g" inputmode="decimal" value="' + sheet.grams + '"></label></div><label class="chkl"><input type="checkbox" id="b_save" checked> Сохранить в мой список</label><button class="btn pri" data-a="bcadd">Добавить</button><button class="btn ghost" data-a="bcreset">Другой штрихкод</button>';
      } else {
        b += '<p class="mut">Цифры под полосками на упаковке (обычно 13). Нужен интернет; найденные продукты запоминаются.</p><div class="mform one"><label>Номер<input id="b_code" inputmode="numeric" autocomplete="off" value="' + esc(sheet.code) + '" placeholder="4607025392001"></label></div>' + (sheet.msg ? '<p class="minus">' + esc(sheet.msg) + '</p>' : '') + '<button class="btn pri" data-a="bcfind" ' + (sheet.status === 'loading' ? 'disabled' : '') + '>' + (sheet.status === 'loading' ? 'Ищу…' : 'Найти') + '</button><button class="btn" data-a="scanopen">Сканировать камерой</button>';
      }
      return shade + b + '</div>';
    }
    if (sheet.type === 'search') {
      return shade + '<div class="sheet"><h3>Найти продукт</h3><div class="mform one"><label>Название<input id="s_q" autocomplete="off" autocapitalize="none" enterkeyhint="search" value="' + esc(sheet.q) + '" placeholder="Например, творог 5%"></label></div><div id="s_res">' + searchHtml() + '</div><p class="mut small">Поиск идёт по базе Open Food Facts (нужен интернет) и по вашим сохранённым продуктам. Данные в базе вносят пользователи — сверяйте с упаковкой.</p></div>';
    }
    if (sheet.type === 'scan') {
      return shade + '<div class="sheet"><h3>Сканер штрихкода</h3><div class="cam"><video id="cam" playsinline muted autoplay></video><div class="camframe"><i></i></div></div><p id="scanmsg" class="' + (sheet.msg ? 'minus' : 'mut') + '">' + esc(sheet.msg || 'Наведите камеру на штрихкод так, чтобы полоски занимали рамку. Держите 10–20 см, при плохом свете включите лампу.') + '</p><div class="btns"><button class="btn" data-a="bcopen">Ввести номер</button><button class="btn" data-a="close">Закрыть</button></div></div>';
    }
    if (sheet.type === 'summary') {
      const W = C.workoutSummary(S, date);
      if (!W) return '';
      const avg = W.avgRir == null ? '—' : r1(W.avgRir);
      let b = '<div class="sheet"><h3>Итог тренировки</h3><p class="mut">' + esc(W.name) + ' · ' + fmtDate(date) + '</p>';
      b += '<div class="sgrid"><div><b>' + W.done + '/' + W.planned + '</b><span>подходов</span></div><div><b>' + W.reps + '</b><span>повторов</span></div><div><b>' + avg + '</b><span>ср. запас</span></div><div><b>' + (W.dur >= 5 && W.dur <= 240 ? W.dur + ' мин' : '—') + '</b><span>время</span></div></div>';
      for (const e of W.ex) {
        const dl = e.prevTotal != null && e.sets.length ? e.total - e.prevTotal : null;
        b += '<div class="row"><span>' + esc(e.name) + '<small>' + (e.sets.length ? e.sets.join(' · ') : 'не выполнено') + (e.pr ? ' · <i class="pr">рекорд</i>' : '') + '</small></span><b>' + (dl == null ? e.total : e.total + ' <small class="' + (dl >= 0 ? 'up' : 'dn') + '">' + (dl > 0 ? '+' : dl < 0 ? '−' : '±') + Math.abs(dl) + '</small>') + '</b></div>';
      }
      b += '<div class="row"><span>Потенциал дня<small>оптимальность ' + r0(W.opt) + '%</small></span><b>' + r1(W.M) + ' г</b></div>';
      if (W.prs.length) b += '<p class="mut">Рекордов за тренировку: ' + W.prs.length + '. Так держать.</p>';
      else if (W.done < W.planned) b += '<p class="mut">Выполнено не всё — недостающие подходы можно добавить, итог обновится.</p>';
      return shade + b + '<button class="btn pri" data-a="close">Закрыть</button></div>';
    }
    if (sheet.type === 'meal') {
      const mm = S.meals[sheet.i], tk = mm.items.reduce((s, x) => s + x.kcal, 0), tp = mm.items.reduce((s, x) => s + x.p, 0);
      return shade + '<div class="sheet"><h3>' + esc(mm.name) + '</h3>' + mm.items.map((x) => '<div class="row"><span>' + esc(x.name) + '</span><b>' + r0(x.kcal) + ' ккал</b></div>').join('') + '<p class="mut">Итого: ' + r0(tk) + ' ккал · белок ' + r0(tp) + ' г</p><button class="btn pri" data-a="addmeal">Добавить всё</button><button class="btn ghost" data-a="delmeal">Удалить шаблон</button></div>';
    }
    if (sheet.type === 'savetpl') return shade + '<div class="sheet"><h3>Новый шаблон</h3><div class="mform one"><label>Название<input id="t_name" placeholder="Например, ужин после тренировки"></label></div><button class="btn pri" data-a="savetpl">Сохранить</button></div>';
    if (sheet.type === 'quick') return shade + '<div class="sheet"><h3>Быстрый ввод</h3><p class="mut">Итог за приём или за день. Жиры оцениваются в 27% калорий, остальное считается углеводами. Можно выбрать процент от цели (' + sheet.kT + ' ккал, ' + sheet.pT + ' г белка).</p><div class="chips">' + [70, 85, 100, 110].map((v) => '<button class="chip s" data-a="quickpct" data-v="' + v + '">' + v + '%</button>').join('') + '</div><div class="mform"><label>Калории<input id="q_kcal" inputmode="decimal" value="' + sheet.kcal + '"></label><label>Белок, г<input id="q_p" inputmode="decimal" value="' + sheet.p + '"></label></div><button class="btn pri" data-a="addquick">Добавить</button></div>';
    if (sheet.type === 'food') {
      const f = S.foods[sheet.i], q = sheet.qty;
      return '<div class="shade" data-a="close"></div><div class="sheet"><h3>' + esc(f.name) + '</h3><p class="mut">на ' + esc(f.unit) + ': ' + f.kcal + ' ккал · Б ' + f.p + ' · У ' + f.c + ' · Ж ' + f.f + '</p><div class="row"><span>Количество порций</span>' + stepper('qty', 'x', q) + '</div><p class="mut">Итого: ' + r0(f.kcal * q) + ' ккал · Б ' + r0(f.p * q) + ' г</p><button class="btn pri" data-a="addfood">Добавить</button><button class="btn ghost" data-a="delpreset">Удалить из списка</button></div>';
    }
    return '<div class="shade" data-a="close"></div><div class="sheet"><h3>Своё блюдо</h3><div class="mform one"><label>Название<input id="c_name" placeholder="Например, обед"></label>' + [['kcal', 'Калории'], ['p', 'Белки, г'], ['c', 'Углеводы, г'], ['f', 'Жиры, г']].map(([k, n]) => '<label>' + n + '<input id="c_' + k + '" inputmode="decimal"></label>').join('') + '</div><label class="chkl"><input type="checkbox" id="c_save" checked> Сохранить в список</label><button class="btn pri" data-a="addcustom">Добавить</button></div>';
  }

  // ---------- Отрисовка ----------
  // Ввод в шторках запоминается: переживает сворачивание приложения и перезагрузку страницы
  const DRAFT = 'gymapp.draft', DRAFT_TYPES = ['custom', 'quick', 'savetpl'];
  let fields = {}, fieldsOwner = null;
  function writeDraft() {
    try {
      if (sheet && DRAFT_TYPES.includes(sheet.type)) localStorage.setItem(DRAFT, JSON.stringify({ sheet, fields, date, t: Date.now() }));
      else localStorage.removeItem(DRAFT);
    } catch (e) { /* хранилище недоступно */ }
  }
  function readFields() { document.querySelectorAll('#sheetroot input[id]').forEach((el) => { fields[el.id] = el.type === 'checkbox' ? el.checked : el.value; }); }
  function applyFields() { for (const id in fields) { const el = document.getElementById(id); if (el && el.closest('#sheetroot')) { if (el.type === 'checkbox') el.checked = !!fields[id]; else el.value = fields[id]; } } }
  document.addEventListener('input', (ev) => { if (ev.target.closest && ev.target.closest('#sheetroot')) { readFields(); writeDraft(); } });
  document.addEventListener('change', (ev) => { if (ev.target.closest && ev.target.closest('#sheetroot')) { readFields(); writeDraft(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { readFields(); writeDraft(); } });
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
      if (d && d.sheet && DRAFT_TYPES.includes(d.sheet.type) && Date.now() - d.t < 12 * 3600 * 1000) { sheet = d.sheet; fields = d.fields || {}; fieldsOwner = sheet; if (d.date) date = d.date; return true; }
      localStorage.removeItem(DRAFT);
    } catch (e) { /* повреждённый черновик */ }
    return false;
  }
  function render(restore) {
    const body = view === 'today' ? viewToday() : view === 'train' ? viewTrain() : view === 'plan' ? viewPlan() : view === 'food' ? viewFood() : viewProgress();
    $('#main').innerHTML = body;
    if (!sheet) { fields = {}; fieldsOwner = null; } else if (sheet !== fieldsOwner) { if (restore !== true) fields = {}; fieldsOwner = sheet; }
    $('#sheetroot').innerHTML = sheetHtml();
    if (restore === true && sheet) applyFields();
    if (!restore || !sheet) writeDraft();
    if (!(sheet && sheet.type === 'scan')) { if (cam || camStarting) stopScan(); }
    else if (cam) { const v = $('#cam'); if (v && cam.v !== v) { v.srcObject = cam.stream; v.play().catch(() => {}); cam.v = v; } }
    else setTimeout(startScan, 0);
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === view));
    { const ind = $('#tind'), k = ['today', 'train', 'plan', 'food', 'progress'].indexOf(view); if (ind) ind.style.transform = 'translateX(' + (k * 100) + '%)'; }
    animate();
    restoreRip();
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

  function ensureEx(id) { const L = log(); L.ex = L.ex || {}; const n = C.setsFor(S, date, id); if (!L.ex[id]) L.ex[id] = { rir: 2, sets: Array(n).fill(0) }; while (L.ex[id].sets.length < n) L.ex[id].sets.push(0); L.deload = C.deloadOn(S, date); return L.ex[id]; }
  function lock() { if (S.plan[date] === undefined) S.plan[date] = C.workoutOf(S, date); }
  function stamp() { const L = log(), n = Date.now(); L.t0 = L.t0 || n; L.t1 = n; }
  function autoSummary() {
    const L = log(); if (L.summaryShown) return;
    const W = C.workoutSummary(S, date);
    if (W && W.complete) { L.summaryShown = true; sheetNew = true; sheet = { type: 'summary' }; timer = null; drawTimer(); }
  }
  function defReps(id, i) { const last = C.lastSets(S, id, date); return (last && last.sets[i]) || C.EXERCISES[id].reps[0]; }

  // ---------- Поиск по штрихкоду (Open Food Facts) ----------
  async function lookup(code) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json?fields=product_name,brands,nutriments', { signal: ctl.signal });
      if (!r.ok && r.status !== 404) return { error: 'net' };
      return C.parseOFF(await r.json());
    } catch (e) { return { error: 'net' }; } finally { clearTimeout(to); }
  }

  // ---------- Поиск по названию (Open Food Facts) ----------
  function searchHtml() {
    const q = (sheet && sheet.q || '').trim();
    let h = '';
    const rows = (sheet.res || []).map((x, k) => '<button class="row pick" data-a="srpick" data-k="' + k + '"><span>' + esc(x.name) + '<small>' + (x.src === 'preset' ? 'моя заготовка · ' + esc(x.unit || '') : 'на 100 г') + ': ' + r0(x.kcal) + ' ккал · Б ' + r1(x.p) + ' · У ' + r1(x.c) + ' · Ж ' + r1(x.f) + '</small></span><b>›</b></button>').join('');
    h += rows;
    if (q.length < 2) h += rows ? '' : '<p class="mut">Введите минимум две буквы.</p>';
    else if (sheet.status === 'typing') h += '<p class="mut">…</p>';
    else if (sheet.status === 'loading') h += '<p class="mut">Ищу в базе…</p>';
    else if (sheet.status === 'error') h += '<p class="minus">Нет связи с базой или сервер занят. Повторите чуть позже.</p>';
    else if (sheet.status === 'done' && !rows) h += '<p class="mut">Ничего не найдено. Попробуйте другое слово или внесите блюдо вручную («+ своё»).</p>';
    return h;
  }
  function updSearch() { const el = $('#s_res'); if (el && sheet && sheet.type === 'search') el.innerHTML = searchHtml(); }
  let searchT = null, searchCtl = null;
  async function runSearch(q) {
    const my = sheet; if (searchCtl) searchCtl.abort();
    const local = C.searchLocal(S, q);
    my.res = local; my.status = 'loading'; updSearch();
    const ctl = searchCtl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    try {
      const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=25&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments&search_terms=' + encodeURIComponent(q);
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('http');
      const list = C.parseOFFList(await r.json());
      if (sheet !== my || (my.q || '').trim() !== q) return;
      const have = new Set(local.map((x) => x.name.toLowerCase()));
      my.res = local.concat(list.filter((x) => !have.has(x.name.toLowerCase())).map((x) => Object.assign({ src: 'off', item: x }, x))).slice(0, 30);
      my.status = 'done';
    } catch (e) { if (sheet !== my || (my.q || '').trim() !== q) return; my.status = local.length ? 'done' : 'error'; } finally { clearTimeout(to); }
    updSearch();
  }
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 's_q' || !sheet || sheet.type !== 'search') return;
    sheet.q = ev.target.value; clearTimeout(searchT);
    const q = sheet.q.trim();
    if (q.length < 2) { sheet.status = 'idle'; sheet.res = []; updSearch(); return; }
    sheet.res = C.searchLocal(S, q); sheet.status = 'typing'; updSearch();
    searchT = setTimeout(() => runSearch(q), 650);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 's_q' && sheet && sheet.type === 'search') { ev.preventDefault(); const q = sheet.q.trim(); if (q.length >= 2) { clearTimeout(searchT); runSearch(q); } ev.target.blur(); } });

  // ---------- Камера: штрихкод ----------
  let cam = null, camStarting = false;
  function stopScan() {
    if (cam) { clearInterval(cam.timer); try { cam.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* уже остановлено */ } if (cam.v) cam.v.srcObject = null; cam = null; }
    camStarting = false;
  }
  function scanMsg(t) { if (sheet && sheet.type === 'scan') sheet.msg = t; const el = $('#scanmsg'); if (el) { el.textContent = t; el.className = 'minus'; } }
  async function startScan() {
    const v = $('#cam'); if (!v || camStarting || cam) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { scanMsg('Камера недоступна в этом режиме. Введите номер вручную.'); return; }
    camStarting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!sheet || sheet.type !== 'scan') { stream.getTracks().forEach((t) => t.stop()); camStarting = false; return; }
      const el = $('#cam') || v; el.srcObject = stream; await el.play().catch(() => {});
      let det = null; try { if (window.BarcodeDetector) det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] }); } catch (e) { det = null; }
      cam = { stream, v: el, det, last: '', busy: false, canvas: document.createElement('canvas'), timer: null };
      cam.timer = setInterval(scanTick, 170);
    } catch (e) {
      scanMsg(e && /denied|permission|NotAllowed/i.test(e.name + e.message) ? 'Нет доступа к камере. Разрешите её для сайта в настройках iPhone (Safari → Камера) или введите номер вручную.' : 'Не удалось включить камеру. Введите номер вручную.');
    }
    camStarting = false;
  }
  async function scanTick() {
    if (!cam || cam.busy || !sheet || sheet.type !== 'scan') return;
    const v = cam.v; if (!v || v.readyState < 2 || !v.videoWidth) return;
    cam.busy = true;
    try {
      let code = null;
      if (cam.det) { try { const r = await cam.det.detect(v); if (r && r[0]) code = String(r[0].rawValue || ''); } catch (e) { cam.det = null; } }
      if (!code && window.Scan) {
        const vw = v.videoWidth, vh = v.videoHeight, W = Math.min(vw, 1280), k = W / vw, sy = vh * 0.25, sh = vh * 0.5, H = Math.max(8, Math.round(sh * k));
        const cv = cam.canvas; cv.width = W; cv.height = H;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(v, 0, sy, vw, sh, 0, 0, W, H);
        code = window.Scan.decodeRGBA(cx.getImageData(0, 0, W, H).data, W, H);
      }
      if (code && C.validBarcode(code)) {
        if (cam.last === code) { stopScan(); haptic(); foundCode(code); return; }
        cam.last = code;
      } else if (!code) cam.last = '';
    } finally { if (cam) cam.busy = false; }
  }
  function foundCode(code) { sheet = { type: 'barcode', code, status: 'idle', grams: 100, msg: '' }; sheetNew = true; findCode(code); render(); }
  function findCode(code) {
    sheet.code = code;
    if (!C.validBarcode(code)) { sheet.msg = code.length ? 'Номер не похож на штрихкод: проверьте цифры (контрольная цифра не сходится).' : 'Введите номер штрихкода.'; return; }
    if (S.barcodes[code]) { sheet.item = S.barcodes[code]; sheet.status = 'found'; sheet.msg = ''; return; }
    sheet.status = 'loading'; sheet.msg = '';
    const my = sheet;
    lookup(code).then((res) => {
      if (sheet !== my) return;
      if (res.error) { my.status = 'idle'; my.msg = { notfound: 'Продукта нет в базе Open Food Facts. Найдите его по названию или внесите вручную через «+ своё».', nonutri: 'В базе нет данных о калориях этого продукта. Внесите вручную.', net: 'Нет связи с базой. Проверьте интернет и повторите.' }[res.error]; }
      else { S.barcodes[code] = res; save(); my.item = res; my.status = 'found'; }
      render();
    });
  }

  // ---------- Таймер отдыха ----------
  let timer = null, audio = null, beeped = false;
  function startTimer(sec) {
    timer = { end: Date.now() + sec * 1000 }; beeped = false;
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* звук недоступен */ }
    drawTimer();
  }
  function beep() {
    try { if (audio) [0, 0.28].forEach((t) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.18); }); } catch (e) { /* ничего */ }
    try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) { /* ничего */ }
  }
  function drawTimer() {
    let el = $('#timer');
    if (!timer) { if (el) el.classList.remove('on'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'timer'; el.innerHTML = '<span id="tt"></span><button data-a="timeradd">+30 с</button><button data-a="timerstop" aria-label="Закрыть">×</button>'; document.body.appendChild(el); }
    const left = Math.ceil((timer.end - Date.now()) / 1000);
    if (left <= -45) { timer = null; el.classList.remove('on'); return; }
    el.classList.add('on'); el.classList.toggle('done', left <= 0);
    $('#tt').textContent = left > 0 ? 'Отдых ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'Можно следующий подход';
    if (left <= 0 && !beeped) { beeped = true; beep(); }
  }
  setInterval(drawTimer, 500);

  const actions = {
    tab(el) { scrollY[view] = window.scrollY; view = el.dataset.id; },
    day(el) { const n = C.addDays(date, +el.dataset.d); if (n <= TODAY) date = n; },
    wo(el) { S.plan[date] = el.dataset.id; },
    plan(el) { S.plan[el.dataset.id] = el.dataset.v; },
    saveschedule() { const P = C.projectWeek(S, TODAY, 7); const sch = {}; P.days.forEach((x) => { if (x.wo) sch[C.weekday(x.date)] = x.wo; }); S.schedule = sch; toast('Расписание сохранено'); },
    copyfood() { const y = (S.logs[C.addDays(date, -1)] || {}).food || []; log().food = y.map((x) => Object.assign({}, x)); toast('Питание скопировано'); },
    applytdee(el) { S.profile.tdee = +el.dataset.v; toast('Расход обновлён'); },
    applylevel(el) { S.profile.level = +el.dataset.v; toast('Потенциал обновлён'); },
    delmeas() { S.meas.pop(); },
    bcopen() { sheetNew = true; sheet = { type: 'barcode', code: '', status: 'idle', grams: 100, msg: '' }; },
    bcreset() { sheet.status = 'idle'; sheet.item = null; sheet.code = ''; sheet.msg = ''; },
    bcg(el) { sheet.grams = +el.dataset.v; },
    bcfind() { const code = (($('#b_code').value) || '').replace(/\D/g, ''); findCode(code); },
    searchopen() { sheetNew = true; sheet = { type: 'search', q: '', status: 'idle', res: [] }; setTimeout(() => { const el = $('#s_q'); if (el) el.focus(); }, 320); },
    srpick(el) {
      const x = sheet.res[+el.dataset.k]; if (!x) return false;
      sheetNew = true;
      if (x.src === 'preset') { sheet = { type: 'food', i: x.i, qty: 1 }; return; }
      const it = x.item; if (it.code) { S.barcodes[it.code] = { name: it.name, kcal: it.kcal, p: it.p, c: it.c, f: it.f }; }
      sheet = { type: 'barcode', code: it.code || '', status: 'found', item: it, grams: 100, msg: '' };
    },
    scanopen() { sheetNew = true; sheet = { type: 'scan', msg: '' }; },
    bcadd() {
      const g = num('#b_g'); if (!(g > 0)) return false;
      const it = sheet.item, k = g / 100, L = log(); L.food = L.food || [];
      L.food.push({ name: it.name + ' · ' + r0(g) + ' г', kcal: it.kcal * k, p: it.p * k, c: it.c * k, f: it.f * k });
      if ($('#b_save').checked && !S.foods.some((x) => x.name === it.name)) S.foods.push({ name: it.name, unit: '100 г', kcal: it.kcal, p: it.p, c: it.c, f: it.f });
      sheet = null; toast('Добавлено');
    },
    summaryopen() { sheetNew = true; sheet = { type: 'summary' }; },
    undo() {
      const u = undoStack.pop(); if (!u) { toast('Нечего отменять'); return false; }
      const L = (S.logs[u.d] = S.logs[u.d] || {}); L.food = JSON.parse(u.food); sheet = null;
      toast(undoStack.length ? 'Отменено · ещё ' + undoStack.length : 'Отменено');
    },
    haptoggle() { S.meta.nohaptic = !S.meta.nohaptic; toast(S.meta.nohaptic ? 'Вибро-отклик выключен' : 'Вибро-отклик включен'); },
    timerstop() { timer = null; drawTimer(); },
    timeradd() { if (timer) { timer.end += 30000; beeped = false; } drawTimer(); },
    fold(el) { ui[el.dataset.id] = !ui[el.dataset.id]; },
    flag(el) { const L = log(); L[el.dataset.id] = !L[el.dataset.id]; },
    pain(el) { const L = log(), k = el.dataset.id; L.pain = L.pain || []; L.pain = L.pain.includes(k) ? L.pain.filter((x) => x !== k) : L.pain.concat(k); },
    startdeload() { S.deload = { from: TODAY, to: C.addDays(TODAY, 6) }; toast('Разгрузка началась'); },
    enddeload() { S.deload = null; },
    pickmeal(el) { sheetNew = true; sheet = { type: 'meal', i: +el.dataset.i }; },
    addmeal() { const mm = S.meals[sheet.i], L = log(); L.food = L.food || []; mm.items.forEach((x) => L.food.push(Object.assign({}, x))); sheet = null; toast(mm.name + ' добавлен'); },
    delmeal() { S.meals.splice(sheet.i, 1); sheet = null; },
    savetplopen() { sheetNew = true; sheet = { type: 'savetpl' }; },
    savetpl() { const nm = (($('#t_name').value) || '').trim() || 'Шаблон'; S.meals.push({ name: nm, items: (log().food || []).map((x) => Object.assign({}, x)) }); sheet = null; toast('Шаблон сохранён'); },
    quickopen() { sheetNew = true; const cp = C.catchup(S, date); sheet = { type: 'quick', kcal: '', p: '', kT: cp.kT, pT: cp.pT }; },
    quickpct(el) { const k = +el.dataset.v / 100; sheet.kcal = Math.round(sheet.kT * k); sheet.p = Math.round(sheet.pT * k); },
    addquick() { const kcal = num('#q_kcal') || 0, p = num('#q_p') || 0; if (!(kcal > 0 || p > 0)) return; const L = log(); L.food = L.food || []; const fq = (kcal * 0.27) / 9, cq = Math.max(0, (kcal - 4 * p - 9 * fq) / 4); L.food.push({ name: 'Быстрый ввод', kcal, p, c: cq, f: fq }); sheet = null; toast('Добавлено'); },
    set(el) { const id = el.dataset.id, i = +el.dataset.i; const e = ensureEx(id); lock(); e.sets[i] = e.sets[i] > 0 ? 0 : defReps(id, i); if (e.sets[i] > 0) { popKey = id + ':' + i; stamp(); startTimer(e.rest || C.restIdeal(id)); autoSummary(); } },
    rep(el) { const id = el.dataset.id, i = +el.dataset.i, d = +el.dataset.d; const e = ensureEx(id); const cur = e.sets[i] > 0 ? e.sets[i] : defReps(id, i); e.sets[i] = Math.max(1, cur + d); lock(); if (e.sets[i] > 0) stamp(); },
    rir(el) { ensureEx(el.dataset.id).rir = +el.dataset.v; },
    rest(el) { const e = ensureEx(el.dataset.id), v = +el.dataset.v; e.rest = e.rest === v ? 0 : v; },
    all(el) { const id = el.dataset.id, n = C.setsFor(S, date, id), e = ensureEx(id); const full = e.sets.slice(0, n).every((x) => x > 0); for (let i = 0; i < n; i++) e.sets[i] = full ? 0 : (e.sets[i] > 0 ? e.sets[i] : defReps(id, i)); lock(); if (!full) { popKey = 'all:' + id; stamp(); autoSummary(); } },
    sleep(el) { const L = log(); const cur = L.sleep > 0 ? L.sleep : 7; const n = Math.round((cur + 0.25 * +el.dataset.d) * 4) / 4; L.sleep = Math.max(0, Math.min(14, L.sleep > 0 ? n : 7.5)); },
    weight(el) { const L = log(); const base = L.weight > 0 ? L.weight : (C.weightOn(S, date) || S.profile.weight); L.weight = Math.round((L.weight > 0 ? base + 0.1 * +el.dataset.d : base) * 10) / 10; },
    pick(el) { sheetNew = true; sheet = { type: 'food', i: +el.dataset.i, qty: 1 }; },
    qty(el) { sheet.qty = Math.max(0.25, Math.round((sheet.qty + 0.25 * +el.dataset.d) * 100) / 100); },
    close() { sheet = null; stopScan(); },
    addfood() { const f = S.foods[sheet.i], q = sheet.qty; const L = log(); L.food = L.food || []; L.food.push({ name: f.name + (q !== 1 ? ' ×' + q : ''), kcal: f.kcal * q, p: f.p * q, c: f.c * q, f: f.f * q }); sheet = null; toast('Добавлено'); },
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
    export() { S.meta.lastExport = Date.now(); const txt = JSON.stringify(S); $('#io').value = txt; $('#io').select(); try { navigator.clipboard.writeText(txt).then(() => toast('Скопировано в буфер'), () => toast('Выделите текст и скопируйте')); } catch (e) { toast('Выделите текст и скопируйте'); } },
    import() {
      try { const v = JSON.parse($('#io').value); if (!v || !v.logs || !v.profile) throw 0; S = Object.assign(C.defaultState(), v); S.meas = S.meas || []; S.meta = S.meta || {}; S.plan = S.plan || {}; toast('Данные загружены'); }
      catch (e) { $('#io').value = 'Не удалось прочитать данные'; return false; }
    },
  };

  // Отмена — только для списка «Съедено» (хранится прежнее содержимое списка за день)
  const undoStack = [];
  const FOODLABEL = { delfood: 'Блюдо удалено', addfood: 'Блюдо добавлено', addcustom: 'Блюдо добавлено', addquick: 'Добавлено', addmeal: 'Шаблон добавлен', bcadd: 'Добавлено', copyfood: 'Питание скопировано' };
  function haptic() {
    if (S.meta.nohaptic) return;
    try {
      let l = $('#hp');
      if (!l) { l = document.createElement('label'); l.id = 'hp'; l.setAttribute('aria-hidden', 'true'); l.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none'; l.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(l); }
      l.click();
    } catch (e) { /* вибро-отклик недоступен */ }
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const a = el.dataset.a;
    const keep = $('#io') && ev.target.closest('[data-a="export"]');
    if (['tab', 'day', 'wo'].includes(a)) enter = true;
    if (a !== 'tab') haptic();
    const d0 = date, pre = JSON.stringify((S.logs[d0] || {}).food || []); tmsg = null;
    const r = actions[a] && actions[a](el);
    if (a !== 'undo' && JSON.stringify((S.logs[d0] || {}).food || []) !== pre) {
      undoStack.push({ d: d0, food: pre }); if (undoStack.length > 30) undoStack.shift();
      toast(FOODLABEL[a] || tmsg || 'Список изменён', true);
    }
    save();
    if (keep) { render(); $('#io').value = JSON.stringify(S); return; }
    if (r !== false) render();
    if (a === 'tab') window.scrollTo(0, scrollY[view] || 0);
  });


  // Свайп по экрану: контент следует за пальцем, затем плавно уезжает и въезжает новая вкладка
  const TABS = ['today', 'train', 'plan', 'food', 'progress'];
  let sw = null;
  function goTab(i, dir, instant) {
    if (i < 0 || i >= TABS.length || TABS[i] === view) return false;
    scrollY[view] = window.scrollY; view = TABS[i]; render(); window.scrollTo(0, scrollY[view] || 0);
    if (!instant) {
      const m = $('#main'); m.style.transition = 'none'; m.style.opacity = '0'; m.style.transform = 'translateX(' + (dir * 36) + 'px)';
      void m.offsetWidth; m.style.transition = 'transform .38s cubic-bezier(.22,.9,.3,1),opacity .3s ease'; m.style.opacity = ''; m.style.transform = '';
    }
    return true;
  }
  document.addEventListener('touchstart', (ev) => {
    const t = ev.touches[0];
    sw = ev.touches.length === 1 && !sheet && !ev.target.closest('.chips,.seg,input,textarea,.sheet,#timer,#toast,.heat,#tabs') ? { x: t.clientX, y: t.clientY, t: Date.now(), lock: null } : null;
  }, { passive: true });
  document.addEventListener('touchmove', (ev) => {
    if (!sw) return;
    const t = ev.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (sw.lock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) sw.lock = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'h' : 'v';
    if (sw.lock !== 'h') return;
    const i = TABS.indexOf(view), edge = (dx > 0 && i === 0) || (dx < 0 && i === TABS.length - 1), k = edge ? 0.15 : 0.5, m = $('#main');
    m.style.transition = 'none'; m.style.transform = 'translateX(' + (dx * k) + 'px)'; m.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 500));
  }, { passive: true });
  document.addEventListener('touchend', (ev) => {
    if (!sw) return;
    const w = sw; sw = null;
    if (w.lock !== 'h') return;
    const t = ev.changedTouches[0], dx = t.clientX - w.x, m = $('#main'), vel = Math.abs(dx) / Math.max(1, Date.now() - w.t);
    const go = (Math.abs(dx) > 80 || (Math.abs(dx) > 40 && vel > 0.5)) && goTab(TABS.indexOf(view) + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    if (!go) { m.style.transition = 'transform .35s cubic-bezier(.22,.9,.3,1),opacity .3s'; m.style.transform = ''; m.style.opacity = ''; }
  }, { passive: true });

  // Круговая «рябь» от касания (после перерисовки восстанавливается на новом элементе)
  let lastRip = null;
  function addRip(el, x, y, elapsed) {
    const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.6, sp = document.createElement('span');
    sp.className = 'rip'; sp.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (x - r.left - d / 2) + 'px;top:' + (y - r.top - d / 2) + 'px;animation-delay:-' + elapsed + 'ms';
    el.classList.add('rp'); el.appendChild(sp); setTimeout(() => sp.remove(), 600 - elapsed);
  }
  function restoreRip() {
    if (!lastRip || Date.now() - lastRip.t > 450) return;
    const q = lastRip.sel ? $('#main ' + lastRip.sel) || $(lastRip.sel) : null;
    if (q && !q.querySelector('.rip')) addRip(q, lastRip.x, lastRip.y, Date.now() - lastRip.t);
  }
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest('.btn,.chip,.chk,.allb,.step button,.datenav button,.card.link,#toast button,#timer button');
    if (!el || el.disabled) return;
    addRip(el, ev.clientX, ev.clientY, 0);
    const a = el.dataset.a;
    lastRip = { t: Date.now(), x: ev.clientX, y: ev.clientY, sel: a ? '[data-a="' + a + '"]' + ['id', 'i', 'd', 'v'].filter((k) => el.dataset[k] !== undefined).map((k) => '[data-' + k + '="' + el.dataset[k] + '"]').join('') : '' };
  }, { passive: true });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'b_code') { ev.preventDefault(); const b = document.querySelector('[data-a=bcfind]'); if (b) b.click(); } });
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'note') { log().note = ev.target.value; save(); return; }
    const k = ev.target.dataset && ev.target.dataset.prof;
    if (!k) return;
    const v = parseFloat(String(ev.target.value).replace(',', '.'));
    if (v > 0) { S.profile[k] = v; save(); }
    render();
  });
  document.addEventListener('DOMContentLoaded', () => { restoreDraft(); render(true); });
  if (document.readyState !== 'loading') { restoreDraft(); render(true); }

  function checkDay() { const n = C.dstr(new Date()); if (n !== TODAY) { if (date === TODAY) date = n; TODAY = n; return true; } return false; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkDay(); render(true); } });
  window.addEventListener('pageshow', () => { checkDay(); render(true); });
  setInterval(() => { if (checkDay()) render(); }, 60000);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
