// Генератор правдоподобных данных для демо и тестов (без обращения к сайту).
// «Сегодня» по умолчанию — середина 3-й четверти, чтобы были и закрытые, и текущая, и будущая четверти.
(function (SPP) {
  'use strict';
  SPP.MOCK_TODAY = '2026-03-10';

  SPP.mockData = function (today = SPP.MOCK_TODAY) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // [предмет, базовый уровень, дрейф за четверть]
    const subjects = [
      ['Алгебра', 7.2, 0.4], ['Геометрия', 6.8, 0.2], ['Белорусский язык', 8.1, -0.3], ['Русский язык', 7.6, 0],
      ['Английский язык', 8.8, 0.1], ['Физика', 6.4, 0.5], ['Химия', 7.9, -0.6], ['Биология', 8.4, 0],
      ['История Беларуси', 7.4, 0.2], ['Информатика', 9.3, 0], ['География', 7.0, 0.1], ['Физическая культура', 9.0, 0],
    ];
    const quarters = [
      { id: '901', name: '1 четверть', start: '2025-09-01', end: '2025-10-25' },
      { id: '902', name: '2 четверть', start: '2025-11-03', end: '2025-12-24' },
      { id: '903', name: '3 четверть', start: '2026-01-12', end: '2026-03-21' },
      { id: '904', name: '4 четверть', start: '2026-03-30', end: '2026-05-30' },
    ];
    const lessons = [];
    quarters.forEach((q, qi) => {
      for (let d = q.start; d <= q.end && d <= today; d = SPP.addDays(d, 1)) {
        const wd = (SPP.parseISO(d).getDay() + 6) % 7;
        if (wd > 4) continue;
        for (let n = 1; n <= 6; n++) {
          const [name, base, drift] = subjects[(wd * 7 + n * 5) % subjects.length];
          const marks = [];
          if (rnd() < 0.45) {
            const v = Math.round(base + drift * qi + (rnd() - 0.5) * 3.4);
            marks.push(Math.max(1, Math.min(10, v)));
          }
          lessons.push({ date: d, num: n, subject: name, marks, absent: rnd() < 0.025, q: q.id });
        }
      }
    });
    return {
      pupil: { id: '0', origin: 'https://demo.schools.by', name: 'Демо Ученик' },
      quarters: quarters.map((q, i) => ({ id: q.id, name: q.name, order: i })),
      lessons,
      fetchedAt: Date.now(),
      pages: 0,
      errors: [],
    };
  };
})(globalThis.SPP = globalThis.SPP || {});
