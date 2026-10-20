// Разбор HTML недели дневника schools.by.
//
// Ожидаемая разметка (страница /pupil/<id>/dnevnik/quarter/<qid>/week/<YYYY-MM-DD>):
//   div.db_day                    — один день недели
//     table.db_table
//       thead th / .db_period     — «Понедельник, 2 сентября»
//       tr > td.lesson            — «1. Математика»
//            td.mark              — <div class="mark_box"><strong>9</strong></div>
//
// Если разметка на сайте отличается, правьте селекторы в SPP.SEL.
(function (SPP) {
  'use strict';

  SPP.SEL = {
    daysBlock: '.db_days',
    day: '.db_day',
    dayFallback: 'table.db_table',
    dayHeader: '.db_period, .db_day_title, thead th, th, caption, h3, h4',
    row: 'tr',
    lesson: 'td.lesson, td.db_lesson, td.lesson_name',
    mark: 'td.mark, td.db_mark, td.marks',
  };

  const MONTHS = {
    января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
    // белорусский интерфейс
    студзеня: 0, лютага: 1, сакавіка: 2, красавіка: 3, траўня: 4, чэрвеня: 5,
    ліпеня: 6, жніўня: 7, верасня: 8, кастрычніка: 9, лістапада: 10, снежня: 11,
  };

  const ABSENCE = new Set(['н', 'нб', 'н/б', 'нп', 'ув', 'отс', 'адс', 'н/у']);

  // Учебный год, к которому относится «сегодня»: сентябрь–август.
  function schoolYearStart(todayISO) {
    const d = SPP.parseISO(todayISO || SPP.today());
    return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  }

  // Подбираем год так, чтобы дата оказалась ближе всего к опорной (неделе из URL).
  function withYear(day, month, refISO) {
    if (!refISO) {
      const sy = schoolYearStart();
      return SPP.iso(new Date(month >= 7 ? sy : sy + 1, month, day));
    }
    const ref = SPP.parseISO(refISO);
    let best = null, bestDiff = Infinity;
    for (const y of [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) {
      const d = new Date(y, month, day);
      const diff = Math.abs(d - ref);
      if (diff < bestDiff) { bestDiff = diff; best = d; }
    }
    return SPP.iso(best);
  }

  SPP.parseDayDate = function (text, refISO) {
    const t = SPP.norm(text).toLowerCase();
    let m = t.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
    if (m) {
      const day = +m[1], month = +m[2] - 1;
      if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
        if (m[3]) {
          const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
          return SPP.iso(new Date(y, month, day));
        }
        return withYear(day, month, refISO);
      }
    }
    m = t.match(/(\d{1,2})\s+([а-яёіў]+)/);
    if (m && MONTHS[m[2]] != null) return withYear(+m[1], MONTHS[m[2]], refISO);
    return null;
  };

  SPP.parseMarkText = function (text) {
    const marks = [];
    let absent = false;
    const tokens = SPP.norm(text).toLowerCase().split(/[\s,;]+/).filter(Boolean);
    for (const raw of tokens) {
      const tok = raw.replace(/[^0-9a-zа-яёіў/]/g, '');
      if (!tok) continue;
      if (ABSENCE.has(tok)) { absent = true; continue; }
      for (const part of tok.split('/')) {
        if (ABSENCE.has(part)) { absent = true; continue; }
        if (/^\d{1,2}$/.test(part)) {
          const v = +part;
          if (v >= 1 && v <= 10) marks.push(v);
        }
      }
    }
    return { marks, absent };
  };

  function markCellText(cell) {
    const strong = cell.querySelectorAll('strong, b');
    if (strong.length) return [...strong].map((e) => e.textContent).join(' ');
    const c = cell.cloneNode(true);
    c.querySelectorAll('[class*="comment"], [class*="tooltip"], [class*="hint"], [class*="popup"], script, style')
      .forEach((e) => e.remove());
    return c.textContent;
  }

  function parseLessonCell(cell) {
    const full = SPP.norm(cell.textContent);
    const numMatch = full.match(/^(\d{1,2})\s*[.)]?/);
    const candidates = [...cell.querySelectorAll('a, span, div')].map((e) => SPP.norm(e.textContent));
    candidates.push(full);
    let subject = '';
    for (const c of candidates) {
      const s = c.replace(/^\d{1,2}\s*[.)]?\s*/, '').trim();
      if (/[A-Za-zА-Яа-яЁёІіЎў]/.test(s)) { subject = s; break; }
    }
    return { num: numMatch ? +numMatch[1] : null, subject };
  }

  const isHidden = (el) =>
    el.hidden || el.classList.contains('hidden') || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(el.getAttribute('style') || '');

  // Ответ недели содержит два блока .db_days: скрытый (display:none) и видимый, и отметки в них
  // различаются. Пользователь видит второй, поэтому берём только видимые блоки.
  function dayContainers(doc) {
    const blocks = [...doc.querySelectorAll(SPP.SEL.daysBlock)];
    if (!blocks.length) return [doc];
    const visible = blocks.filter((b) => !isHidden(b) && !b.closest('[style*="display: none"], [style*="display:none"]'));
    return visible.length ? visible : [blocks[blocks.length - 1]];
  }

  // <table id="db_table_12.10.26"> — полная дата прямо в id таблицы дня.
  function dateFromId(el) {
    const t = el && (el.matches?.('table') ? el : el.querySelector('table'));
    const m = t && (t.id || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!m) return null;
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return SPP.iso(new Date(y, +m[2] - 1, +m[1]));
  }

  // «Понедельник, 12» — только число; ищем его внутри недели.
  function dateFromDayNumber(text, weekISO) {
    const m = SPP.norm(text).match(/(\d{1,2})\s*$/);
    if (!m || !weekISO) return null;
    const monday = SPP.mondayOf(weekISO);
    for (let i = 0; i < 7; i++) {
      const d = SPP.addDays(monday, i);
      if (SPP.parseISO(d).getDate() === +m[1]) return d;
    }
    return null;
  }

  // Возвращает { days, lessons: [{date, num, subject, marks, absent}] }.
  SPP.parseWeek = function (doc, weekISO) {
    const SEL = SPP.SEL;
    let days = dayContainers(doc).flatMap((c) => [...c.querySelectorAll(SEL.day)]);
    if (!days.length) days = [...doc.querySelectorAll(SEL.dayFallback)];
    const lessons = [];
    const seen = new Set();

    days.forEach((day, i) => {
      const header = day.querySelector(SEL.dayHeader);
      const htext = header ? header.textContent : '';
      const date =
        dateFromId(day) ||
        SPP.parseDayDate(htext, weekISO) ||
        dateFromDayNumber(htext, weekISO) ||
        (weekISO ? SPP.addDays(SPP.mondayOf(weekISO), i) : null);
      if (!date || seen.has(date)) return;
      seen.add(date);

      let rowIndex = 0;
      for (const tr of day.querySelectorAll(SEL.row)) {
        const lessonCell = tr.querySelector(SEL.lesson);
        if (!lessonCell) continue;
        rowIndex++;
        const { num, subject } = parseLessonCell(lessonCell);
        if (!subject) continue;
        const markCell = tr.querySelector(SEL.mark);
        const { marks, absent } = markCell ? SPP.parseMarkText(markCellText(markCell)) : { marks: [], absent: false };
        lessons.push({ date, num: num ?? rowIndex, subject, marks, absent });
      }
    });

    return { days: days.length, lessons };
  };
})(globalThis.SPP = globalThis.SPP || {});
