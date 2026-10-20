// Общие помощники. Все модули расширения живут в одном пространстве имён SPP.
(function (SPP) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  // Даты храним строками 'YYYY-MM-DD' в локальном времени — их удобно сравнивать как строки.
  SPP.iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  SPP.parseISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  SPP.addDays = (s, n) => {
    const d = SPP.parseISO(s);
    d.setDate(d.getDate() + n);
    return SPP.iso(d);
  };
  SPP.mondayOf = (s) => {
    const d = SPP.parseISO(s);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return SPP.iso(d);
  };
  SPP.daysBetween = (a, b) => Math.round((SPP.parseISO(b) - SPP.parseISO(a)) / 86400000);
  SPP.today = () => SPP.iso(new Date());

  // Округление отметки: дробная часть >= threshold — вверх (по умолчанию 0,5 — математическое).
  SPP.roundMark = (x, threshold = 0.5) => {
    if (x == null || isNaN(x)) return null;
    const f = Math.floor(x);
    return x - f >= threshold - 1e-9 ? f + 1 : f;
  };

  SPP.mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  SPP.fmt = (x, digits = 2) =>
    x == null || isNaN(x) ? '—' : x.toFixed(digits).replace('.', ',');

  SPP.fmtSigned = (x, digits = 2) => {
    if (x == null || isNaN(x)) return '—';
    const r = +x.toFixed(digits);
    return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r).toFixed(digits).replace('.', ',');
  };

  SPP.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  SPP.norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  SPP.subjectKey = (s) => SPP.norm(s).toLowerCase().replace(/ё/g, 'е').replace(/[.:]+$/, '');

  // Сокращения из дневника → полные названия (ключ — SPP.subjectKey).
  const SUBJECT_NAMES = {
    'матем': 'Математика', 'алг': 'Алгебра', 'геом': 'Геометрия',
    'рус. яз': 'Русский язык', 'рус. лит': 'Русская литература',
    'бел. яз': 'Белорусский язык', 'бел. лит': 'Белорусская литература',
    'англ. яз': 'Английский язык', 'нем. яз': 'Немецкий язык', 'фр. яз': 'Французский язык', 'кит. яз': 'Китайский язык',
    'ин. яз': 'Иностранный язык', 'физ. к. и зд': 'Физкультура и здоровье', 'информ': 'Информатика',
    'информ. час': 'Информационный час', 'обществов': 'Обществоведение', 'ист. бел. в кон. всем. ист':
      'История Беларуси в контексте всемирной истории', 'всем. ист': 'Всемирная история', 'ист. бел': 'История Беларуси',
    'дп/мп': 'Допризывная / медицинская подготовка', 'черч': 'Черчение', 'астр': 'Астрономия',
    'тр. обуч': 'Трудовое обучение', 'иск': 'Искусство', 'чел. и мир': 'Человек и мир',
  };
  SPP.subjectTitle = (s) => SUBJECT_NAMES[SPP.subjectKey(s)] || SPP.norm(s).replace(/\.$/, '');

  SPP.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Уровни белорусской 10-балльной шкалы → класс цвета.
  SPP.markLevel = (v) => (v == null ? 0 : v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : v <= 8 ? 4 : 5);

  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  SPP.MONTHS_SHORT = MONTHS_SHORT;
  SPP.fmtDate = (s) => {
    const d = SPP.parseISO(s);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };
  SPP.WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Склонение: plural(5, 'отметка', 'отметки', 'отметок')
  SPP.plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
})(globalThis.SPP = globalThis.SPP || {});
