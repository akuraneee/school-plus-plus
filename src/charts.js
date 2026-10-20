// Простые SVG-графики без внешних библиотек.
(function (SPP) {
  'use strict';
  const esc = SPP.esc;

  const day = (s) => SPP.parseISO(s).getTime() / 86400000;

  /**
   * Линейный график по датам.
   * series: [{ points: [{date, y, title?}], cls, line?: true, dots?: false, step?: false }]
   * bands:  [{ start, end, label }] — подложка четвертей
   */
  function line({ series, bands = [], width = SPP.charts.defaultWidth || 680, height = width < 500 ? 200 : 230, yMin = 1, yMax = 10, yStep = 1 }) {
    const P = { l: 30, r: 12, t: bands.length ? 22 : 10, b: 24 };
    const all = series.flatMap((s) => s.points.map((p) => p.date)).concat(bands.flatMap((b) => [b.start, b.end]));
    if (!all.length) return '<div class="empty">Нет данных</div>';
    let x0 = Math.min(...all.map(day)), x1 = Math.max(...all.map(day));
    if (x1 - x0 < 7) { x0 -= 3; x1 += 4; }
    const W = width - P.l - P.r, H = height - P.t - P.b;
    const X = (d) => P.l + ((day(d) - x0) / (x1 - x0)) * W;
    const Y = (v) => P.t + (1 - (v - yMin) / (yMax - yMin)) * H;

    let out = `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    bands.forEach((b, i) => {
      const a = X(b.start), z = X(b.end);
      out += `<rect class="band ${i % 2 ? 'odd' : ''}" x="${a}" y="${P.t}" width="${Math.max(2, z - a)}" height="${H}"/>`;
      out += `<text class="band-label" x="${(a + z) / 2}" y="${P.t - 7}" text-anchor="middle">${esc(b.label)}</text>`;
    });

    for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
      out += `<line class="grid" x1="${P.l}" x2="${width - P.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      out += `<text class="axis" x="${P.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`;
    }

    // Подписи месяцев
    const start = new Date(x0 * 86400000), end = new Date(x1 * 86400000);
    const m = new Date(start.getFullYear(), start.getMonth() + (start.getDate() > 1 ? 1 : 0), 1);
    for (; m <= end; m.setMonth(m.getMonth() + 1)) {
      const x = X(SPP.iso(m));
      out += `<line class="tick" x1="${x}" x2="${x}" y1="${P.t + H}" y2="${P.t + H + 4}"/>`;
      out += `<text class="axis" x="${x + 3}" y="${height - 6}">${SPP.MONTHS_SHORT[m.getMonth()]}</text>`;
    }

    for (const s of series) {
      const pts = s.points.filter((p) => p.y != null);
      if (s.line !== false && pts.length > 1) {
        let d = '';
        pts.forEach((p, i) => {
          const x = X(p.date), y = Y(p.y);
          if (i === 0 || p.break) d += `M${x},${y}`;
          else if (s.step) d += `H${x}V${y}`;
          else d += `L${x},${y}`;
        });
        out += `<path class="ln ${s.cls || ''}" d="${d}"/>`;
      }
      if (s.dots) {
        for (const p of pts) {
          out += `<circle class="dot ${p.cls || s.cls || ''}" cx="${X(p.date)}" cy="${Y(p.y)}" r="${s.r || 3.5}">` +
            (p.title ? `<title>${esc(p.title)}</title>` : '') + '</circle>';
        }
      }
    }
    return out + '</svg>';
  }

  // Столбики распределения отметок 1..10.
  function distribution(counts, { width = SPP.charts.defaultWidth || 680, height = width < 500 ? 150 : 170 } = {}) {
    const P = { l: 10, r: 10, t: 18, b: 22 };
    const W = width - P.l - P.r, H = height - P.t - P.b;
    const max = Math.max(1, ...counts.slice(1));
    const total = counts.slice(1).reduce((a, b) => a + b, 0) || 1;
    const bw = W / 10;
    let out = `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;
    for (let v = 1; v <= 10; v++) {
      const h = (counts[v] / max) * H;
      const x = P.l + (v - 1) * bw + bw * 0.15;
      const y = P.t + H - h;
      out += `<rect class="bar lv${SPP.markLevel(v)}" x="${x}" y="${y}" width="${bw * 0.7}" height="${Math.max(h, 1)}" rx="3">` +
        `<title>${v}: ${counts[v]} (${Math.round((counts[v] / total) * 100)}%)</title></rect>`;
      if (counts[v]) out += `<text class="bar-val" x="${x + bw * 0.35}" y="${y - 4}" text-anchor="middle">${counts[v]}</text>`;
      out += `<text class="axis strong" x="${x + bw * 0.35}" y="${height - 6}" text-anchor="middle">${v}</text>`;
    }
    return out + '</svg>';
  }

  // Мини-график последних отметок (скользящее среднее).
  function sparkline(values, { width = 84, height = 24 } = {}) {
    if (values.length < 2) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const lo = Math.min(min, max - 1), hi = Math.max(max, min + 1);
    const X = (i) => 2 + (i / (values.length - 1)) * (width - 4);
    const Y = (v) => 2 + (1 - (v - lo) / (hi - lo)) * (height - 4);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const last = values[values.length - 1];
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
      `<path d="${d}"/><circle cx="${X(values.length - 1)}" cy="${Y(last)}" r="2.5"/></svg>`;
  }

  // Горизонтальные полоски «среднее по дням недели».
  function hbars(rows, { max = 10 } = {}) {
    return '<div class="hbars">' + rows.map((r) =>
      `<div class="hbar"><span class="hbar-label">${esc(r.label)}</span>` +
      `<span class="hbar-track"><span class="hbar-fill lv${SPP.markLevel(SPP.roundMark(r.value))}" style="width:${r.value ? (r.value / max) * 100 : 0}%"></span></span>` +
      `<span class="hbar-val">${SPP.fmt(r.value)}</span><span class="hbar-n">${esc(r.note || '')}</span></div>`
    ).join('') + '</div>';
  }

  SPP.charts = { line, distribution, sparkline, hbars };
})(globalThis.SPP = globalThis.SPP || {});
