// Плавающая кнопка и панель статистики.
(function (SPP) {
  'use strict';
  const { esc, fmt, fmtSigned } = SPP;

  const CACHE_TTL = 6 * 3600 * 1000;

  // Хранилище: расширение → chrome.storage, userscript (Userscripts/Tampermonkey) → GM.*, иначе localStorage.
  const backend = (() => {
    try { if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return 'chrome'; } catch { /* нет */ }
    if (typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function') return 'gm';
    return 'local';
  })();

  const store = {
    async get(key) {
      try {
        if (backend === 'chrome') return await new Promise((res) => chrome.storage.local.get(key, (o) => res(o ? o[key] : undefined)));
        const raw = backend === 'gm' ? await GM.getValue(key) : localStorage.getItem(key);
        return raw == null ? undefined : JSON.parse(raw);
      } catch { return undefined; }
    },
    async set(key, val) {
      try {
        if (backend === 'chrome') return await new Promise((res) => chrome.storage.local.set({ [key]: val }, () => res()));
        const raw = JSON.stringify(val);
        if (backend === 'gm') await GM.setValue(key, raw); else localStorage.setItem(key, raw);
      } catch { /* переполнено или запрещено — работаем без кэша */ }
    },
    async remove(key) {
      try {
        if (backend === 'chrome') return await new Promise((res) => chrome.storage.local.remove(key, () => res()));
        if (backend === 'gm') await GM.deleteValue(key); else localStorage.removeItem(key);
      } catch { /* нет */ }
    },
  };
  SPP.storageBackend = backend;

  const S = {
    open: false, mock: false,
    pupils: [], pupil: null,
    data: null, stats: null, sample: null,
    loading: false, progress: '', error: null, notice: null,
    tab: 'overview', subject: null, sort: { key: 'name', dir: 1 },
    settings: { threshold: 0.5 },
    today: null,
  };
  let root, overlay, panel;

  const cacheKey = () => `spp:data:${S.pupil.origin}:${S.pupil.id}`;

  // ---------- мелкие элементы разметки ----------

  const mark = (v, title) =>
    v == null ? '<span class="muted">—</span>'
      : `<span class="m lv${SPP.markLevel(v)}"${title ? ` title="${esc(title)}"` : ''}>${v}</span>`;

  const qv = (s) => (!s || !s.n ? '<span class="muted">—</span>'
    : `<span class="qv" title="${s.n} ${SPP.plural(s.n, 'отметка', 'отметки', 'отметок')}, среднее ${fmt(s.avg, 3)}">${mark(s.rounded)}<span class="ex">${fmt(s.avg)}</span></span>`);

  const trend = (t) => {
    if (t == null) return '<span class="flat">—</span>';
    const txt = `${fmtSigned(t, 1)}/мес`;
    if (t > 0.25) return `<span class="up" title="Отметки растут">▲ ${txt}</span>`;
    if (t < -0.25) return `<span class="down" title="Отметки снижаются">▼ ${txt}</span>`;
    return `<span class="flat" title="Без заметных изменений">● ${txt}</span>`;
  };

  const delta = (d) => (d == null ? '<span class="flat">—</span>'
    : `<span class="${d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'}">${fmtSigned(d)}</span>`);

  const qShort = (q) => {
    const m = q.name.match(/\d+/);
    return m ? `${m[0]} четв.` : q.name;
  };

  const kpi = (t, v, s, small) =>
    `<div class="kpi"><div class="t">${t}</div><div class="v">${v}${small ? `<small>${small}</small>` : ''}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

  const bands = (st) => st.quarters.filter((q) => st.ranges[q.id])
    .map((q) => ({ start: st.ranges[q.id].start, end: st.ranges[q.id].end, label: qShort(q) }));

  // ---------- вкладки ----------

  function renderOverview(st) {
    const o = st.overall;
    const curQ = st.quarters.find((q) => q.id === st.current);
    const pct = o.lessons ? (o.absences / o.lessons) * 100 : 0;
    let h = '<div class="kpis">';
    h += kpi(`Средний балл${curQ ? ' · ' + esc(qShort(curQ)) : ''}`, fmt(o.currentExact), 'среднее по предметам', `по округл. ${fmt(o.currentRounded)}`);
    h += kpi('Годовой средний', fmt(o.yearExact), 'по четвертным отметкам', `по округл. ${fmt(o.yearRounded)}`);
    h += kpi('Все отметки', fmt(o.avgAll), `${o.marks} ${SPP.plural(o.marks, 'отметка', 'отметки', 'отметок')}`);
    h += kpi('Последние 30 дней', fmt(o.recent30), o.before30 != null ? `к прошлым 30 дням: ${delta(o.recent30 - o.before30)}` : `${o.recent30n} отметок`);
    h += kpi('Пропуски', String(o.absences), `из ${o.lessons} уроков · ${fmt(pct, 1)}%`);
    h += '</div>';

    h += '<h2>Предметы</h2>';
    const subs = sortSubjects(st);
    const arrow = (k) => (S.sort.key === k ? (S.sort.dir > 0 ? ' ↑' : ' ↓') : '');
    h += S.mobile ? subjectCards(st, subs) : subjectTable(st, subs, arrow);
    h += '<p class="muted small">Крупная цифра — округлённая отметка, мелкая — точное среднее. Годовая считается как среднее округлённых четвертных. ' +
      `Порог округления: ${fmt(st.threshold)} (меняется в «Настройках»).</p>`;
    if (st.noMarks.length) h += `<p class="muted small">Без отметок: ${st.noMarks.map((s) => esc(s.name)).join(', ')}.</p>`;

    // Близко к повышению / на грани понижения — по текущей четверти.
    const near = [], risk = [];
    for (const s of st.subjects) {
      const c = s.current;
      if (!c || !c.n) continue;
      const toUp = c.rounded < 10 ? c.rounded + st.threshold - c.avg : Infinity;
      const toDown = c.avg - (c.rounded - 1 + st.threshold);
      if (toUp <= 0.2) near.push({ s, v: toUp });
      if (c.rounded > 1 && toDown < 0.15) risk.push({ s, v: toDown });
    }
    near.sort((a, b) => a.v - b.v);
    risk.sort((a, b) => a.v - b.v);
    h += '<div class="cols" style="margin-top:16px">';
    h += `<div class="card"><h3>Почти следующая отметка${curQ ? ` (${esc(qShort(curQ))})` : ''}</h3>` +
      (near.length ? near.map(({ s }) => {
        const f = s.forecast.up[0];
        return `<p>${esc(s.name)}: ${fmt(s.current.avg)} → ${mark(s.current.rounded + 1)} нужно ${f.count}×${f.mark}</p>`;
      }).join('') : '<p class="muted">Нет предметов рядом с границей</p>') + '</div>';
    h += '<div class="card"><h3>На грани понижения</h3>' +
      (risk.length ? risk.map(({ s }) => `<p>${esc(s.name)}: ${fmt(s.current.avg)}. Отметка ниже ${s.forecast.down.minSafe} опустит до ${mark(s.forecast.down.dropTo)}</p>`).join('')
        : '<p class="muted">Таких предметов нет</p>') + '</div>';
    h += '</div>';

    h += '<h2>Распределение отметок</h2>' + SPP.charts.distribution(st.distribution);
    return h;
  }

  function subjectTable(st, subs, arrow) {
    let h = '<div class="tscroll">';
    h += '<table><thead><tr>';
    h += `<th class="sort" data-act="sort" data-key="name">Предмет${arrow('name')}</th>`;
    for (const q of st.quarters) {
      h += `<th class="sort${q.id === st.current ? ' cur' : ''}" data-act="sort" data-key="q:${q.id}">${esc(qShort(q))}${st.inProgress[q.id] ? ' <span class="tag">идёт</span>' : ''}${arrow('q:' + q.id)}</th>`;
    }
    h += `<th class="sort" data-act="sort" data-key="year" title="Годовая = среднее четвертных отметок">Год${arrow('year')}</th>`;
    h += `<th class="sort" data-act="sort" data-key="all" title="Среднее всех отметок за год">Все${arrow('all')}</th>`;
    h += `<th class="sort" data-act="sort" data-key="n">Отм.${arrow('n')}</th>`;
    h += `<th class="sort" data-act="sort" data-key="abs">Пропуски${arrow('abs')}</th>`;
    h += `<th class="sort" data-act="sort" data-key="trend">Тренд${arrow('trend')}</th>`;
    h += '<th>Последние</th></tr></thead><tbody>';
    for (const s of subs) {
      h += `<tr class="row" data-act="subject" data-key="${esc(s.key)}"><td class="subj">${esc(s.name)}</td>`;
      for (const q of st.quarters) h += `<td class="${q.id === st.current ? 'cur' : ''}">${qv(s.byQ[q.id])}</td>`;
      h += `<td>${s.year.quarters ? `<span class="qv">${mark(s.year.rounded)}<span class="ex">${fmt(s.year.exact)}</span></span>` : '—'}` +
        `${s.year.quarters && s.year.quarters < Math.max(4, st.quarters.length) ? `<span class="tag" title="Посчитано по ${s.year.quarters} из ${Math.max(4, st.quarters.length)} четвертей">${s.year.quarters}/${Math.max(4, st.quarters.length)}</span>` : ''}</td>`;
      h += `<td><span class="ex">${fmt(s.all.avg)}</span></td>`;
      h += `<td>${s.all.n}</td><td>${s.absences || '<span class="muted">0</span>'}</td><td>${trend(s.trend)}</td>`;
      h += `<td>${SPP.charts.sparkline(s.running.slice(-15).map((r) => r.avg))}</td></tr>`;
    }
    h += '</tbody><tfoot><tr><td>Средний балл</td>';
    for (const q of st.quarters) {
      const t = st.quarterTotals[q.id];
      h += `<td class="${q.id === st.current ? 'cur' : ''}">${t.subjects ? `${fmt(t.exact)}<div class="ex muted small">округл. ${fmt(t.rounded)}</div>` : '—'}</td>`;
    }
    h += `<td>${fmt(st.overall.yearExact)}<div class="ex muted small">округл. ${fmt(st.overall.yearRounded)}</div></td><td>${fmt(st.overall.avgAll)}</td><td>${st.overall.marks}</td><td>${st.overall.absences}</td><td></td><td></td></tr></tfoot></table></div>`;
    return h;
  }

  // Мобильный вид: карточка на предмет.
  const yearCell = (st, s) => (s.year.quarters
    ? `<span class="qv">${mark(s.year.rounded)}<span class="ex">${fmt(s.year.exact)}</span></span>` +
      (s.year.quarters < Math.max(4, st.quarters.length) ? `<span class="tag">${s.year.quarters}/${Math.max(4, st.quarters.length)}</span>` : '')
    : '<span class="muted">—</span>');

  function subjectCards(st, subs) {
    const sorts = [['name', 'по названию'], ['year', 'по годовой'], ...(st.current ? [[`q:${st.current}`, 'по текущей четверти']] : []), ['trend', 'по тренду'], ['abs', 'по пропускам']];
    let h = `<div class="msort"><select data-act="msort">${sorts.map(([k, t]) => `<option value="${k}"${S.sort.key === k ? ' selected' : ''}>Сортировка ${t}</option>`).join('')}</select></div>`;
    h += '<div class="scards">';
    for (const s of subs) {
      h += `<div class="scard" data-act="subject" data-key="${esc(s.key)}">` +
        `<div class="sc-top"><span class="sc-name">${esc(s.name)}</span><span class="sc-year"><span class="muted small">год</span> ${yearCell(st, s)}</span></div>` +
        '<div class="sc-qs">' + st.quarters.map((q) =>
          `<div class="sc-q${q.id === st.current ? ' cur' : ''}"><span class="sc-ql">${esc(qShort(q))}</span>${qv(s.byQ[q.id])}</div>`).join('') + '</div>' +
        `<div class="sc-foot"><span>${s.all.n} отм. · ср. ${fmt(s.all.avg)}${s.absences ? ` · пропуски ${s.absences}` : ''}</span>${trend(s.trend)}${SPP.charts.sparkline(s.running.slice(-15).map((r) => r.avg))}</div>` +
        '</div>';
    }
    h += '<div class="scard total"><div class="sc-top"><span class="sc-name">Средний балл</span>' +
      `<span class="sc-year"><span class="muted small">год</span> ${fmt(st.overall.yearExact)}</span></div><div class="sc-qs">` +
      st.quarters.map((q) => {
        const t = st.quarterTotals[q.id];
        return `<div class="sc-q${q.id === st.current ? ' cur' : ''}"><span class="sc-ql">${esc(qShort(q))}</span>${t.subjects ? `<b>${fmt(t.exact)}</b>` : '—'}</div>`;
      }).join('') + '</div></div>';
    return h + '</div>';
  }

  function sortSubjects(st) {
    const { key, dir } = S.sort;
    const val = (s) => {
      if (key === 'name') return s.name;
      if (key === 'year') return s.year.exact;
      if (key === 'all') return s.all.avg;
      if (key === 'n') return s.all.n;
      if (key === 'abs') return s.absences;
      if (key === 'trend') return s.trend;
      if (key.startsWith('q:')) return s.byQ[key.slice(2)]?.avg;
      return 0;
    };
    return [...st.subjects].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'string') return dir * x.localeCompare(y, 'ru');
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return dir * (x - y);
    });
  }

  function renderSubject(st) {
    if (!st.subjects.length) return '<div class="empty">Нет предметов с отметками</div>';
    const s = st.subjects.find((x) => x.key === S.subject) || st.subjects[0];
    S.subject = s.key;
    const curQ = st.quarters.find((q) => q.id === st.current);
    const c = s.current;

    let h = '<div class="subj-head"><select data-act="pick-subject">' +
      st.subjects.map((x) => `<option value="${esc(x.key)}"${x.key === s.key ? ' selected' : ''}>${esc(x.name)}</option>`).join('') +
      '</select></div>';

    h += '<div class="kpis">';
    if (c && c.n) h += kpi(esc(curQ ? qShort(curQ) : 'Четверть'), mark(c.rounded), `${c.n} отметок`, fmt(c.avg, 3));
    else h += kpi(esc(curQ ? qShort(curQ) : 'Четверть'), '—', 'отметок пока нет');
    h += kpi('Годовая', s.year.quarters ? mark(s.year.rounded) : '—', `по ${s.year.quarters} из ${Math.max(4, st.quarters.length)} четв.`, fmt(s.year.exact, 3));
    h += kpi('За год (все отметки)', fmt(s.all.avg), `${s.all.n} отметок`);
    h += kpi('Медиана · мода', `${fmt(s.all.median, 1)} · ${s.all.mode}`, `мин ${s.all.min}, макс ${s.all.max}`);
    h += kpi('Разброс', fmt(s.all.std), 'стандартное отклонение');
    h += kpi('Тренд', trend(s.trend), s.prev5 != null ? `последние 5: ${fmt(s.last5)} (были ${fmt(s.prev5)})` : '');
    h += kpi('Пропуски', String(s.absences), `из ${s.lessons} уроков`);
    h += '</div>';

    // Прогноз на четверть
    h += '<div class="cols" style="margin-top:16px">';
    const f = s.forecast;
    h += '<div class="card"><h3>Что нужно в этой четверти</h3>';
    if (!f) h += '<p class="muted">Отметок в текущей четверти пока нет</p>';
    else {
      if (f.target && f.up.length) {
        h += `<p>Чтобы получить ${mark(f.target)}: ` + f.up.map((u) => `<b>${u.count}</b>×${u.mark}`).join(' или ') + '</p>';
      } else if (!f.target) h += '<p>Уже максимальная отметка 🎉</p>';
      if (f.down) {
        h += f.down.anySafe
          ? `<p>Одна любая отметка не опустит ниже ${mark(c.rounded)}</p>`
          : `<p>Одна отметка ниже <b>${f.down.minSafe}</b> опустит до ${mark(f.down.dropTo)}</p>`;
      }
    }
    h += '</div>';
    h += '<div class="card"><h3>А что если…</h3><div class="whatif">' +
      '<input data-act="whatif" placeholder="добавить отметки, напр. 9 10 8">' +
      '<span class="whatif-out muted">введите отметки</span></div>' +
      '<p class="muted small">Считается для текущей четверти.</p></div>';
    h += '</div>';

    // График: отметки + накопленное среднее внутри четверти
    h += '<h2>Динамика</h2>';
    let prevQ = null;
    const avgPts = s.running.map((r) => {
      const p = { date: r.date, y: r.avg, break: r.q !== prevQ };
      prevQ = r.q;
      return p;
    });
    const dots = s.marks.map((m) => ({ date: m.date, y: m.v, cls: `lv${SPP.markLevel(m.v)}`, title: `${SPP.fmtDate(m.date)}: ${m.v}` }));
    h += SPP.charts.line({
      bands: bands(st),
      series: [
        { points: dots, line: false, dots: true, r: 4 },
        { points: avgPts, cls: '', step: false },
      ],
    });
    h += '<div class="legend"><span><i class="dot"></i>отметка</span><span><i></i>среднее в четверти на эту дату</span></div>';

    // По четвертям
    h += '<h2>Отметки по четвертям</h2>';
    for (const q of st.quarters) {
      const ms = s.marks.filter((m) => m.q === q.id);
      const sq = s.byQ[q.id];
      h += `<div class="qblock"><div class="qt">${esc(q.name)} ${sq.n ? `${mark(sq.rounded)} <span class="muted">${fmt(sq.avg, 3)} · ${sq.n} отм. · мин ${sq.min}, макс ${sq.max}</span>` : '<span class="muted">нет отметок</span>'}</div>`;
      if (ms.length) h += '<div class="chips">' + ms.map((m) => mark(m.v, SPP.fmtDate(m.date))).join('') + '</div>';
      h += '</div>';
    }
    return h;
  }

  function renderDynamics(st) {
    let h = '<h2>Средний балл по неделям</h2>';
    h += SPP.charts.line({
      bands: bands(st),
      yMin: Math.min(4, Math.floor(Math.min(10, ...st.weekly.map((w) => w.avg)))), yMax: 10,
      series: [
        { points: st.weekly.map((w) => ({ date: w.week, y: w.avg, title: `Неделя с ${SPP.fmtDate(w.week)}: ${fmt(w.avg)} (${w.n} отм.)` })), cls: 'soft', dots: true, r: 3 },
        { points: st.weekly.map((w) => ({ date: w.week, y: w.cumulative })), cls: 'alt' },
      ],
    });
    h += '<div class="legend"><span><i class="dot"></i>среднее за неделю</span><span><i class="alt"></i>накопленное среднее с начала года</span></div>';

    h += '<div class="cols" style="margin-top:16px">';
    h += '<div class="card"><h3>Недели</h3>' +
      (st.bestWeek ? `<p>Лучшая: с ${SPP.fmtDate(st.bestWeek.week)}, ${fmt(st.bestWeek.avg)} (${st.bestWeek.n} отм.)</p>` : '') +
      (st.worstWeek ? `<p>Худшая: с ${SPP.fmtDate(st.worstWeek.week)}, ${fmt(st.worstWeek.avg)} (${st.worstWeek.n} отм.)</p>` : '') +
      (st.weekly.length ? `<p class="muted">Недель с отметками: ${st.weekly.length}, в среднем ${fmt(st.overall.marks / st.weekly.length, 1)} отм. в неделю</p>` : '<p class="muted">Нет данных</p>') +
      '</div>';
    h += '<div class="card"><h3>По дням недели</h3>' +
      SPP.charts.hbars(st.byWeekday.filter((d) => d.n).map((d) => ({ label: d.day, value: d.avg, note: `${d.n} отм.` }))) + '</div>';
    h += '</div>';

    h += '<h2>Изменения по предметам</h2>';
    const rows = st.subjects.map((s) => ({ s, d: s.recent30 != null && s.before30 != null ? s.recent30 - s.before30 : null }))
      .sort((a, b) => (b.d ?? -99) - (a.d ?? -99));
    h += '<div class="tscroll"><table><thead><tr><th>Предмет</th><th class="dk" title="С 60-го по 30-й день назад">30–60 дней назад</th><th>Последние 30 дней</th><th>Изменение</th>' +
      '<th class="dk">Предыдущие 5</th><th class="dk">Последние 5</th><th>Тренд</th></tr></thead><tbody>';
    for (const { s, d } of rows) {
      h += `<tr class="row" data-act="subject" data-key="${esc(s.key)}"><td class="subj">${esc(s.name)}</td><td class="dk">${fmt(s.before30)}</td><td>${fmt(s.recent30)}</td>` +
        `<td>${delta(d)}</td><td class="dk">${fmt(s.prev5)}</td><td class="dk">${fmt(s.last5)}</td><td>${trend(s.trend)}</td></tr>`;
    }
    h += '</tbody></table></div>';

    h += '<h2>По четвертям</h2><div class="tscroll"><table><thead><tr><th>Четверть</th><th>Средний балл (точно)</th><th>По округлённым</th><th class="dk">Предметов</th><th>Отметок</th></tr></thead><tbody>';
    for (const q of st.quarters) {
      const t = st.quarterTotals[q.id];
      h += `<tr><td>${esc(q.name)}${st.inProgress[q.id] ? ' <span class="tag">идёт</span>' : ''}</td><td>${fmt(t.exact, 3)}</td><td>${fmt(t.rounded, 3)}</td><td class="dk">${t.subjects}</td><td>${t.marks}</td></tr>`;
    }
    h += '</tbody></table></div>';
    return h;
  }

  function renderSettings() {
    const d = S.data;
    let h = '<h2>Округление</h2>';
    h += `<div class="form-row"><label>Округлять вверх, если дробная часть ≥</label>` +
      `<input type="number" min="0.05" max="0.95" step="0.05" value="${S.settings.threshold}" data-act="threshold">` +
      '<span class="muted small">0,5: 7,50 → 8, 7,49 → 7</span></div>';
    h += '<h2>Данные</h2>';
    if (d) {
      h += `<p>Загружено: ${new Date(d.fetchedAt).toLocaleString('ru')} · страниц: ${d.pages} · уроков: ${d.lessons.length} · ` +
        `отметок: ${d.lessons.reduce((a, l) => a + l.marks.length, 0)}</p>`;
      h += `<p class="muted small">Четверти: ${d.quarters.map((q) => `${esc(q.name)} (id ${esc(q.id)})`).join(', ')}</p>`;
      if (d.errors?.length) h += `<p class="small" style="color:var(--lv1)">Ошибки при загрузке (${d.errors.length}): ${d.errors.slice(0, 5).map(esc).join('; ')}</p>`;
    }
    h += '<div class="form-row">' +
      `<button class="btn" data-act="full-refresh"${S.loading || S.mock ? ' disabled' : ''}>Загрузить заново всё</button>` +
      `<button class="btn" data-act="clear-cache"${S.mock ? ' disabled' : ''}>Очистить сохранённые данные</button>` +
      `<button class="btn" data-act="debug"${S.sample ? '' : ' disabled'}>Скачать HTML для отладки</button>` +
      '</div>';
    h += '<p class="muted small">Данные хранятся только в вашем браузере. Расширение читает страницы дневника от вашего имени ' +
      'и никуда их не отправляет.</p>';
    return h;
  }

  // ---------- общий каркас ----------

  function statusLine() {
    if (S.loading) return `<div class="progress"></div><div class="status">Загружаю дневник… ${esc(S.progress)}</div>`;
    if (S.error) return `<div class="status err">${esc(S.error)}</div>`;
    if (S.notice) return `<div class="status err">${esc(S.notice)}</div>`;
    if (S.data) {
      const n = S.data.lessons.reduce((a, l) => a + l.marks.length, 0);
      return `<div class="status">Обновлено ${new Date(S.data.fetchedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` +
        `${S.data.lessons.length} уроков · ${n} отметок</div>`;
    }
    return '<div class="status">&nbsp;</div>';
  }

  function render() {
    if (!S.open) return;
    S.mobile = panel.clientWidth < 640;
    SPP.charts.defaultWidth = Math.max(300, Math.min(920, panel.clientWidth - (S.mobile ? 24 : 36)));
    const main = panel.querySelector('main');
    const scroll = main && main.dataset.tab === S.tab ? main.scrollTop : 0;

    const who = S.pupils.length > 1
      ? `<select data-act="pick-pupil">${S.pupils.map((p) => `<option value="${esc(p.id)}"${S.pupil && p.id === S.pupil.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
      : `<span class="who">${esc(S.pupil ? S.pupil.name : '')}</span>`;

    const tabs = [['overview', 'Обзор'], ['subject', 'Предмет'], ['dynamics', 'Динамика'], ['settings', 'Настройки']];
    let body;
    if (S.tab === 'settings') body = renderSettings();
    else if (!S.stats) body = S.loading ? '<div class="empty">Загрузка…</div>' : `<div class="empty">${esc(S.error || 'Нет данных')}</div>`;
    else if (!S.stats.subjects.length) body = '<div class="empty">Отметок не найдено. Если в дневнике они есть, скачайте HTML для отладки во вкладке «Настройки».</div>';
    else if (S.tab === 'overview') body = renderOverview(S.stats);
    else if (S.tab === 'subject') body = renderSubject(S.stats);
    else body = renderDynamics(S.stats);

    panel.innerHTML =
      `<header><h1>Schools<span>++</span></h1>${who}<div class="sp"></div>` +
      `<button class="btn primary" data-act="refresh"${S.loading || !S.pupil || S.mock ? ' disabled' : ''}>Обновить</button>` +
      '<button class="icon" data-act="close" title="Закрыть (Esc)">×</button></header>' +
      statusLine() +
      `<nav>${tabs.map(([k, t]) => `<button data-act="tab" data-key="${k}" class="${S.tab === k ? 'on' : ''}">${t}</button>`).join('')}</nav>` +
      `<main data-tab="${S.tab}">${body}</main>`;
    panel.querySelector('main').scrollTop = scroll;
  }

  function recompute() {
    S.stats = S.data ? SPP.computeStats(S.data, { threshold: S.settings.threshold, today: S.today || undefined }) : null;
  }

  function setData(d) {
    S.data = d;
    recompute();
    S.notice = d && !d.lessons.length ? 'Уроки не найдены. Скачайте HTML для отладки в «Настройках».' : null;
  }

  async function refresh(full) {
    if (!S.pupil || S.loading || S.mock) return;
    S.loading = true; S.error = null; S.progress = '';
    render();
    try {
      const prev = full ? null : S.data;
      const res = await SPP.crawl(S.pupil, {
        previous: prev,
        onlyQuarters: prev ? SPP.quartersToRefresh(prev) : null,
        onProgress: (ctx) => {
          S.progress = `страниц: ${ctx.pages}`;
          const st = panel.querySelector('.status');
          if (st) st.textContent = `Загружаю дневник… ${S.progress}`;
        },
      });
      S.sample = res.sample || S.sample;
      delete res.sample;
      setData(res);
      await store.set(cacheKey(), res);
    } catch (e) {
      if (e.sample) S.sample = e.sample;
      S.error = e instanceof SPP.AuthError
        ? 'Похоже, вы не вошли на schools.by. Войдите и нажмите «Обновить».'
        : `Ошибка загрузки: ${e.message || e}`;
      console.error('[Schools++]', e);
    } finally {
      S.loading = false;
      render();
    }
  }

  async function openPanel() {
    S.open = true;
    overlay.classList.remove('hidden');
    S.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    render();
    if (S.mock || S.data || S.loading) return;
    if (!S.pupil) {
      S.error = 'Откройте дневник ученика или страницу родителя со списком детей.';
      render();
      return;
    }
    const cached = await store.get(cacheKey());
    if (cached) { setData(cached); render(); }
    if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL) refresh(false);
  }

  function closePanel() {
    S.open = false;
    overlay.classList.add('hidden');
    document.documentElement.style.overflow = S.prevOverflow || '';
  }

  // На телефоне нет наведения: подсказку точки графика показываем по нажатию.
  let tipTimer = null;
  function showTip(text) {
    const tip = root.querySelector('.tip');
    tip.textContent = text;
    tip.classList.remove('hidden');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tip.classList.add('hidden'), 2500);
  }

  function onWhatIf(input) {
    const out = root.querySelector('.whatif-out');
    const s = S.stats?.subjects.find((x) => x.key === S.subject);
    const extra = SPP.parseMarkText(input.value).marks;
    if (!s || !extra.length) { out.className = 'whatif-out muted'; out.textContent = 'введите отметки'; return; }
    const c = s.current && s.current.n ? s.current : { n: 0, sum: 0 };
    const n = c.n + extra.length, sum = c.sum + extra.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    out.className = 'whatif-out';
    out.innerHTML = `среднее ${fmt(avg, 3)} → ${mark(SPP.roundMark(avg, S.settings.threshold))}` +
      (c.n ? ` <span class="muted">(сейчас ${fmt(c.avg, 3)})</span>` : '');
  }

  function bind() {
    root.addEventListener('click', async (e) => {
      if (e.target === overlay) return closePanel();
      const titled = e.target.closest('circle, rect');
      if (titled && titled.querySelector('title')) return showTip(titled.querySelector('title').textContent);
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act, key = el.dataset.key;
      if (act === 'open') return openPanel();
      if (act === 'close') return closePanel();
      if (act === 'refresh') return refresh(false);
      if (act === 'full-refresh') return refresh(true);
      if (act === 'tab') { S.tab = key; return render(); }
      if (act === 'subject') { S.subject = key; S.tab = 'subject'; return render(); }
      if (act === 'sort') {
        S.sort = S.sort.key === key ? { key, dir: -S.sort.dir } : { key, dir: key === 'name' ? 1 : -1 };
        return render();
      }
      if (act === 'clear-cache') {
        if (S.pupil) await store.remove(cacheKey());
        S.data = null; S.stats = null;
        return render();
      }
      if (act === 'debug' && S.sample) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([S.sample], { type: 'text/html' }));
        a.download = 'schools-sample.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    });

    root.addEventListener('change', async (e) => {
      const act = e.target.dataset?.act;
      if (act === 'pick-subject') { S.subject = e.target.value; render(); }
      if (act === 'msort') {
        const key = e.target.value;
        S.sort = { key, dir: key === 'name' ? 1 : -1 };
        render();
      }
      if (act === 'pick-pupil') {
        S.pupil = S.pupils.find((p) => p.id === e.target.value);
        S.data = null; S.stats = null; S.error = null;
        if (!S.mock) await store.set(`spp:last:${location.origin}`, S.pupil);
        S.open = false;
        openPanel();
      }
      if (act === 'threshold') {
        const v = parseFloat(String(e.target.value).replace(',', '.'));
        if (v > 0 && v < 1) {
          S.settings.threshold = v;
          if (!S.mock) await store.set('spp:settings', S.settings);
          recompute();
        }
      }
    });

    root.addEventListener('input', (e) => {
      if (e.target.dataset?.act === 'whatif') onWhatIf(e.target);
    });

    let resizeTimer = null, lastW = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (S.open && Math.abs(panel.clientWidth - lastW) > 40) { lastW = panel.clientWidth; render(); }
      }, 200);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.open) closePanel();
    });
  }

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';

  SPP.ui = {
    async init(opts = {}) {
      const host = document.createElement('div');
      host.id = 'spp-host';
      document.documentElement.appendChild(host);
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${SPP.CSS}</style><div class="root">` +
        `<button class="fab" data-act="open" title="Статистика оценок">${ICON}<span class="fab-text">Статистика</span></button>` +
        '<div class="overlay hidden"><div class="panel"></div></div><div class="tip hidden"></div></div>';
      overlay = root.querySelector('.overlay');
      panel = root.querySelector('.panel');
      bind();

      if (opts.data) {
        S.mock = true;
        S.today = opts.today || null;
        S.pupils = [opts.data.pupil];
        S.pupil = opts.data.pupil;
        setData(opts.data);
        if (opts.open) openPanel();
        return;
      }

      const saved = await store.get('spp:settings');
      if (saved) Object.assign(S.settings, saved);
      S.pupils = SPP.findPupils(document, location).filter((p) => p.origin === location.origin);
      const last = await store.get(`spp:last:${location.origin}`);
      if (S.pupils.length) {
        S.pupil = (last && S.pupils.find((p) => p.id === last.id)) || S.pupils[0];
        await store.set(`spp:last:${location.origin}`, S.pupil);
      } else if (last) {
        S.pupil = last;
        S.pupils = [last];
      }
    },
  };
})(globalThis.SPP = globalThis.SPP || {});
