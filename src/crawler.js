// Обход дневника: находит ученика, четверти и все недели каждой четверти.
// Запросы идут на тот же сайт с куками текущего входа, поэтому пароль расширению не нужен.
(function (SPP) {
  'use strict';

  const MAX_PAGES_PER_QUARTER = 30;
  const REQUEST_DELAY = 150;

  class AuthError extends Error {
    constructor() { super('Нужно войти на schools.by'); this.name = 'AuthError'; }
  }
  SPP.AuthError = AuthError;

  // В Firefox content.fetch выполняет запрос от имени страницы (с её куками).
  const pageFetch = (url, init) => {
    const c = globalThis.content;
    return c && typeof c === 'object' && typeof c.fetch === 'function' ? c.fetch(url, init) : globalThis.fetch(url, init);
  };

  async function fetchPage(url) {
    // Сайт сам грузит дневник через XHR — повторяем те же заголовки.
    const res = await pageFetch(url, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html, */*; q=0.01' },
    });
    if (/\/login/.test(res.url)) throw new AuthError();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.querySelector('input[type="password"]') && !doc.querySelector(SPP.SEL.day)) throw new AuthError();
    return { url: res.url, html, doc };
  }

  function nameFromTitle(title) {
    const part = SPP.norm(String(title).split(/[|—–-]/)[0]);
    return /[А-Яа-яЁёA-Za-z]/.test(part) && part.length < 60 ? part : '';
  }

  // Ученики, доступные с текущей страницы: сам ученик (/pupil/<id>) или дети на странице родителя.
  SPP.findPupils = function (doc, loc) {
    const found = new Map();
    const here = loc.pathname.match(/\/pupil\/(\d+)/);
    if (here) {
      // На странице ученика: <div class="title_box"><h1>Фамилия Имя, <a>10 "А"</a> класс, ID …</h1>
      const h1 = doc.querySelector('.title_box h1');
      const fromH1 = h1 ? SPP.norm(h1.textContent.split(',')[0]) : '';
      found.set(here[1], { id: here[1], origin: loc.origin, name: (fromH1.length < 60 && fromH1) || nameFromTitle(doc.title) });
    }

    for (const a of doc.querySelectorAll('a[href*="/pupil/"]')) {
      let u;
      try { u = new URL(a.getAttribute('href'), loc.href); } catch { continue; }
      const m = u.pathname.match(/^\/pupil\/(\d+)\/?$/) || u.pathname.match(/^\/pupil\/(\d+)\//);
      if (!m) continue;
      const text = SPP.norm(a.textContent);
      const prev = found.get(m[1]);
      const good = /[А-Яа-яЁё]{2,}/.test(text) && text.length < 60 && !/дневник|отметк|расписан/i.test(text);
      if (!prev) found.set(m[1], { id: m[1], origin: u.origin, name: good ? text : '' });
      else if (!prev.name && good) prev.name = text;
    }
    return [...found.values()].map((p) => ({ ...p, name: p.name || `Ученик #${p.id}` }));
  };

  function quarterLabel(text) {
    const t = SPP.norm(text);
    if (!t || t.length > 30) return '';
    if (/четв|чвэрц|полуг|паўг|триместр|^[IV]+$|\d/i.test(t)) return t;
    return '';
  }

  async function discoverQuarters(origin, pid) {
    const page = await fetchPage(`${origin}/pupil/${pid}/dnevnik`);
    const re = new RegExp(`/pupil/${pid}/dnevnik/quarter/(\\d+)`, 'g');
    const ids = new Set();
    for (const m of (page.url + ' ' + page.html).matchAll(re)) ids.add(m[1]);

    const names = {};
    for (const a of page.doc.querySelectorAll('a[href*="/dnevnik/quarter/"]')) {
      const m = (a.getAttribute('href') || '').match(/\/dnevnik\/quarter\/(\d+)/);
      if (!m) continue;
      const label = quarterLabel(a.textContent);
      if (label && !names[m[1]]) names[m[1]] = label;
    }
    // Недели, на которые уже есть ссылки (send_to="…/quarter/92/week/2026-10-05", weekUrl = '…').
    const seeds = {};
    const weekRe = new RegExp(`/pupil/${pid}/dnevnik/quarter/(\\d+)/week/(\\d{4}-\\d{2}-\\d{2})`, 'g');
    for (const m of (page.url + ' ' + page.html).matchAll(weekRe)) {
      ids.add(m[1]);
      (seeds[m[1]] = seeds[m[1]] || new Set()).add(m[2]);
    }
    return {
      quarters: [...ids].sort((a, b) => a - b).map((id) => ({ id, name: names[id] || '', seeds: [...(seeds[id] || [])] })),
      sample: page.html,
    };
  }

  async function crawlQuarter(origin, pid, q, ctx) {
    const weekRe = new RegExp(`/pupil/${pid}/dnevnik/quarter/(\\d+)/week/(\\d{4}-\\d{2}-\\d{2})`, 'g');
    const weekUrl = (d) => `${origin}/pupil/${pid}/dnevnik/quarter/${q.id}/week/${d}`;
    const weeks = new Map(); // date -> lessons
    const seen = new Set();
    const queue = q.seeds && q.seeds.length
      ? q.seeds.map(weekUrl)
      : [`${origin}/pupil/${pid}/dnevnik/quarter/${q.id}`];
    let pages = 0;

    const load = async (url) => {
      pages++;
      const page = await fetchPage(url);
      ctx.pages++;
      ctx.onProgress?.(ctx);
      if (!ctx.sample && page.doc.querySelector(SPP.SEL.day)) ctx.sample = page.html;
      const m = page.url.match(/\/week\/(\d{4}-\d{2}-\d{2})/) || url.match(/\/week\/(\d{4}-\d{2}-\d{2})/);
      const weekISO = m ? m[1] : null;
      const { lessons } = SPP.parseWeek(page.doc, weekISO);
      const key = weekISO || (lessons[0] && SPP.mondayOf(lessons[0].date));
      if (key && key >= ctx.yearStart && lessons.length && !weeks.has(key)) weeks.set(key, lessons);
      await SPP.sleep(REQUEST_DELAY);
      return { page, key, lessons };
    };

    // 1) Обход по ссылкам «предыдущая/следующая неделя», которые отдаёт сам сайт.
    while (queue.length && pages < MAX_PAGES_PER_QUARTER) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      let res;
      try { res = await load(url); } catch (e) {
        if (e instanceof AuthError) throw e;
        ctx.errors.push(String(e.message || e));
        continue;
      }
      for (const m of (res.page.url + ' ' + res.page.html).matchAll(weekRe)) {
        if (m[2] < ctx.yearStart) continue; // прошлый учебный год не трогаем
        if (m[1] !== q.id) {
          // Ссылка в соседнюю четверть (например, «предыдущая неделя» из первой недели четверти).
          (ctx.foreign[m[1]] = ctx.foreign[m[1]] || new Set()).add(m[2]);
          continue;
        }
        const u = weekUrl(m[2]);
        if (!seen.has(u) && !weeks.has(m[2])) queue.push(u);
      }
      seen.add(weekUrl(res.key));
    }

    // 2) Запасной вариант: если ссылок на соседние недели не нашлось — идём по датам ±7 дней.
    if (weeks.size === 1) {
      const start = [...weeks.keys()][0];
      for (const dir of [7, -7]) {
        let d = start;
        for (let i = 0; i < 15 && pages < MAX_PAGES_PER_QUARTER * 2; i++) {
          d = SPP.addDays(d, dir);
          if (seen.has(weekUrl(d))) break; // уже загружали на шаге 1 — там уроков не было
          try {
            const { lessons } = await load(weekUrl(d));
            if (!lessons.length) break;
          } catch (e) {
            if (e instanceof AuthError) throw e;
            break;
          }
        }
      }
    }

    const lessons = [];
    for (const list of weeks.values()) for (const l of list) lessons.push({ ...l, q: q.id });
    return lessons;
  }

  // Если одна и та же дата попала в две четверти (при обходе по датам), оставляем её
  // в той четверти, чья «середина» ближе.
  function dedupe(lessons) {
    const byQ = new Map();
    for (const l of lessons) {
      if (!byQ.has(l.q)) byQ.set(l.q, []);
      byQ.get(l.q).push(l.date);
    }
    const center = {};
    for (const [q, dates] of byQ) {
      dates.sort();
      center[q] = dates[Math.floor(dates.length / 2)];
    }
    const best = new Map();
    for (const l of lessons) {
      const key = `${l.date}|${l.num}|${SPP.subjectKey(l.subject)}`;
      const prev = best.get(key);
      if (!prev) { best.set(key, l); continue; }
      const dPrev = Math.abs(SPP.daysBetween(center[prev.q], l.date));
      const dCur = Math.abs(SPP.daysBetween(center[l.q], l.date));
      if (dCur < dPrev) best.set(key, l);
    }
    return [...best.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.num - b.num));
  }

  function nameQuarters(quarters, lessons) {
    const first = {};
    for (const l of lessons) if (!first[l.q] || l.date < first[l.q]) first[l.q] = l.date;
    const sorted = [...quarters].sort((a, b) => {
      const fa = first[a.id], fb = first[b.id];
      if (fa && fb) return fa < fb ? -1 : 1;
      if (fa || fb) return fa ? -1 : 1;
      return a.id - b.id;
    });
    return sorted.map(({ seeds, ...q }, i) => ({ ...q, order: i, name: q.name || `${i + 1} четверть` }));
  }

  /**
   * Загружает дневник ученика.
   * opts.onlyQuarters — id четвертей, которые нужно перекачать (остальные берутся из opts.previous).
   */
  SPP.crawl = async function (pupil, opts = {}) {
    const today = opts.today || SPP.today();
    const t = SPP.parseISO(today);
    const yearStart = `${t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1}-08-01`;
    const ctx = { pages: 0, errors: [], sample: null, onProgress: opts.onProgress, foreign: {}, yearStart };
    const { quarters, sample } = await discoverQuarters(pupil.origin, pupil.id);
    for (const q of quarters) q.seeds = q.seeds.filter((d) => d >= yearStart);
    ctx.pages++;
    if (!quarters.length) {
      const err = new Error('Не нашёл четвертей в дневнике. Возможно, разметка сайта отличается.');
      err.sample = sample;
      throw err;
    }

    const only = opts.onlyQuarters ? new Set(opts.onlyQuarters) : null;
    const kept = only && opts.previous ? opts.previous.lessons.filter((l) => !only.has(l.q)) : [];
    const todo = quarters.filter((q) => !only || only.has(q.id) || !opts.previous?.quarters.some((p) => p.id === q.id));

    const results = await Promise.all(todo.map((q) => crawlQuarter(pupil.origin, pupil.id, q, ctx)));

    // Четверти, о которых узнали только по ссылкам из недель — догружаем (при быстром обновлении не нужно).
    for (let round = 0; round < 6 && !only; round++) {
      const known = new Set(quarters.map((q) => q.id));
      const extra = Object.keys(ctx.foreign).filter((id) => !known.has(id))
        .map((id) => ({ id, name: '', seeds: [...ctx.foreign[id]] }));
      if (!extra.length) break;
      quarters.push(...extra);
      results.push(...(await Promise.all(extra.map((q) => crawlQuarter(pupil.origin, pupil.id, q, ctx)))));
    }

    const lessons = dedupe(kept.concat(...results));
    const withLessons = new Set(lessons.map((l) => l.q));
    return {
      pupil,
      quarters: nameQuarters(quarters.filter((q) => withLessons.has(q.id)), lessons),
      lessons,
      fetchedAt: Date.now(),
      pages: ctx.pages,
      errors: ctx.errors,
      sample: ctx.sample || sample,
    };
  };

  // Какие четверти стоит обновлять при быстром обновлении: текущая и будущие.
  SPP.quartersToRefresh = function (data, todayISO = SPP.today()) {
    const last = {};
    for (const l of data.lessons) if (l.marks.length && (!last[l.q] || l.date > last[l.q])) last[l.q] = l.date;
    const recent = SPP.addDays(todayISO, -14);
    return data.quarters.filter((q) => !last[q.id] || last[q.id] >= recent).map((q) => q.id);
  };
})(globalThis.SPP = globalThis.SPP || {});
