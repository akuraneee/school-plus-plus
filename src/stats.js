// Подсчёт статистики по загруженным урокам.
(function (SPP) {
  'use strict';

  function summary(vals, thr) {
    const n = vals.length;
    if (!n) return { n: 0, sum: 0, avg: null, rounded: null };
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const counts = {};
    let mode = null;
    for (const v of vals) {
      counts[v] = (counts[v] || 0) + 1;
      if (mode === null || counts[v] > counts[mode] || (counts[v] === counts[mode] && v > mode)) mode = v;
    }
    const std = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / n);
    return { n, sum, avg, rounded: SPP.roundMark(avg, thr), median, mode, min: sorted[0], max: sorted[n - 1], std };
  }
  SPP.summary = summary;

  // Сколько отметок нужно, чтобы округлённая отметка выросла, и какая отметка её уронит.
  function forecast(s, thr) {
    if (!s || !s.n) return null;
    const r = s.rounded;
    const up = [];
    if (r < 10) {
      const target = r + thr;
      for (const m of [10, 9, 8, 7, 6, 5]) {
        if (m <= target) break;
        const k = Math.max(1, Math.ceil((target * s.n - s.sum) / (m - target) - 1e-9));
        up.push({ mark: m, count: k });
        if (up.length >= 3) break;
      }
    }
    let down = null;
    if (r > 1) {
      const floorAvg = r - 1 + thr;
      const x = Math.ceil(floorAvg * (s.n + 1) - s.sum - 1e-9);
      down = { minSafe: Math.max(1, x), anySafe: x <= 1, dropTo: r - 1 };
    }
    return { target: r < 10 ? r + 1 : null, up, down };
  }
  SPP.forecast = forecast;

  // Наклон линейной регрессии «отметка от дня», в баллах за 30 дней.
  function trendPerMonth(marks) {
    if (marks.length < 4) return null;
    const x0 = marks[0].date;
    const xs = marks.map((m) => SPP.daysBetween(x0, m.date));
    const ys = marks.map((m) => m.v);
    const mx = SPP.mean(xs), my = SPP.mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    return den ? (num / den) * 30 : 0;
  }

  function quarterRanges(data) {
    const r = {};
    for (const l of data.lessons) {
      const q = (r[l.q] = r[l.q] || { start: l.date, end: l.date });
      if (l.date < q.start) q.start = l.date;
      if (l.date > q.end) q.end = l.date;
    }
    return r;
  }

  SPP.computeStats = function (data, opts = {}) {
    const thr = opts.threshold ?? 0.5;
    const today = opts.today || SPP.today();
    const quarters = [...data.quarters].sort((a, b) => a.order - b.order);
    const ranges = quarterRanges(data);

    // Текущая четверть — последняя, в которой уже есть прошедшие уроки.
    let current = null;
    for (const q of quarters) {
      if (data.lessons.some((l) => l.q === q.id && l.date <= today)) current = q.id;
    }
    const inProgress = {};
    for (const q of quarters) {
      const rg = ranges[q.id];
      inProgress[q.id] = !!rg && rg.start <= today && rg.end >= today;
    }

    const subjMap = new Map();
    const allMarks = [];
    let lessonsPast = 0, absences = 0;
    for (const l of data.lessons) {
      const key = SPP.subjectKey(l.subject);
      let s = subjMap.get(key);
      if (!s) subjMap.set(key, (s = { key, name: SPP.subjectTitle(l.subject), marks: [], lessons: 0, absences: 0 }));
      if (l.date <= today) {
        s.lessons++; lessonsPast++;
        if (l.absent) { s.absences++; absences++; }
      }
      for (const v of l.marks) {
        const m = { v, date: l.date, q: l.q, subject: s.name };
        s.marks.push(m);
        allMarks.push(m);
      }
    }

    const subjects = [];
    const noMarks = [];
    for (const s of subjMap.values()) {
      if (!s.marks.length) { noMarks.push(s); continue; }
      const byQ = {};
      for (const q of quarters) byQ[q.id] = summary(s.marks.filter((m) => m.q === q.id).map((m) => m.v), thr);
      const done = quarters.map((q) => byQ[q.id]).filter((x) => x.n);
      const qRounded = done.map((x) => x.rounded);
      const yearExact = SPP.mean(qRounded);
      const all = summary(s.marks.map((m) => m.v), thr);

      // Скользящее среднее внутри каждой четверти — как «копится» четвертная отметка.
      const running = [];
      const acc = {};
      for (const m of s.marks) {
        const a = (acc[m.q] = acc[m.q] || { sum: 0, n: 0 });
        a.sum += m.v; a.n++;
        running.push({ date: m.date, v: m.v, q: m.q, avg: a.sum / a.n });
      }

      const last5 = s.marks.slice(-5).map((m) => m.v);
      const prev5 = s.marks.slice(-10, -5).map((m) => m.v);
      const d30 = SPP.addDays(today, -30), d60 = SPP.addDays(today, -60);
      const recent = s.marks.filter((m) => m.date > d30 && m.date <= today).map((m) => m.v);
      const before = s.marks.filter((m) => m.date > d60 && m.date <= d30).map((m) => m.v);

      subjects.push({
        name: s.name,
        key: s.key,
        marks: s.marks,
        lessons: s.lessons,
        absences: s.absences,
        byQ,
        all,
        year: { quarters: qRounded.length, exact: yearExact, rounded: SPP.roundMark(yearExact, thr) },
        current: current ? byQ[current] : null,
        forecast: current ? forecast(byQ[current], thr) : null,
        trend: trendPerMonth(s.marks),
        last5: SPP.mean(last5),
        prev5: prev5.length ? SPP.mean(prev5) : null,
        recent30: SPP.mean(recent),
        before30: SPP.mean(before),
        running,
      });
    }
    subjects.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    // Итоги по четвертям: средний балл = среднее по предметам.
    const quarterTotals = {};
    for (const q of quarters) {
      const list = subjects.map((s) => s.byQ[q.id]).filter((x) => x.n);
      quarterTotals[q.id] = {
        subjects: list.length,
        exact: SPP.mean(list.map((x) => x.avg)),
        rounded: SPP.mean(list.map((x) => x.rounded)),
        marks: list.reduce((a, x) => a + x.n, 0),
      };
    }

    const distribution = Array(11).fill(0);
    for (const m of allMarks) distribution[m.v]++;

    // Понедельная динамика.
    const weekMap = new Map();
    for (const m of [...allMarks].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const w = SPP.mondayOf(m.date);
      if (!weekMap.has(w)) weekMap.set(w, []);
      weekMap.get(w).push(m.v);
    }
    let cs = 0, cn = 0;
    const weekly = [...weekMap.entries()].sort().map(([week, vals]) => {
      cs += vals.reduce((a, b) => a + b, 0); cn += vals.length;
      return { week, avg: SPP.mean(vals), n: vals.length, cumulative: cs / cn };
    });
    const solidWeeks = weekly.filter((w) => w.n >= 5);
    const bestWeek = solidWeeks.reduce((a, w) => (!a || w.avg > a.avg ? w : a), null);
    const worstWeek = solidWeeks.reduce((a, w) => (!a || w.avg < a.avg ? w : a), null);

    const byWeekday = Array.from({ length: 7 }, () => []);
    for (const m of allMarks) byWeekday[(SPP.parseISO(m.date).getDay() + 6) % 7].push(m.v);

    const d30 = SPP.addDays(today, -30), d60 = SPP.addDays(today, -60);
    const recent30 = allMarks.filter((m) => m.date > d30 && m.date <= today).map((m) => m.v);
    const before30 = allMarks.filter((m) => m.date > d60 && m.date <= d30).map((m) => m.v);

    const withYear = subjects.filter((s) => s.year.quarters);
    const withCurrent = subjects.filter((s) => s.current && s.current.n);

    return {
      threshold: thr,
      today,
      quarters,
      ranges,
      current,
      inProgress,
      subjects,
      noMarks,
      quarterTotals,
      overall: {
        marks: allMarks.length,
        avgAll: SPP.mean(allMarks.map((m) => m.v)),
        currentExact: SPP.mean(withCurrent.map((s) => s.current.avg)),
        currentRounded: SPP.mean(withCurrent.map((s) => s.current.rounded)),
        yearExact: SPP.mean(withYear.map((s) => s.year.exact)),
        yearRounded: SPP.mean(withYear.map((s) => s.year.rounded)),
        lessons: lessonsPast,
        absences,
        recent30: SPP.mean(recent30),
        before30: SPP.mean(before30),
        recent30n: recent30.length,
      },
      distribution,
      weekly,
      bestWeek,
      worstWeek,
      byWeekday: byWeekday.map((v, i) => ({ day: SPP.WEEKDAYS[i], n: v.length, avg: SPP.mean(v) })),
    };
  };
})(globalThis.SPP = globalThis.SPP || {});
