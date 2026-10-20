// Запуск: NODE_PATH=<папка с jsdom>/node_modules node test/run.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['utils', 'parser', 'crawler', 'stats', 'charts', 'ui-css', 'ui'].map((n) => `src/${n}.js`).concat('test/mock.js');

function makeWindow(html = '<!doctype html><html><body></body></html>', url = 'https://demo.schools.by/pupil/1234567') {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error('fetch disabled in tests'));
  for (const f of SCRIPTS) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return w;
}

let failed = 0, passed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  if (!ok) console.log(`✗ ${name}\n   ожидалось: ${JSON.stringify(want)}\n   получено:  ${JSON.stringify(got)}`);
}
function ok(name, cond) { eq(name, !!cond, true); }

const w = makeWindow();
const SPP = w.SPP;

// --- округление
eq('round 7.5', SPP.roundMark(7.5), 8);
eq('round 7.49', SPP.roundMark(7.49), 7);
eq('round 7.55 thr .6', SPP.roundMark(7.55, 0.6), 7);
eq('round 22.5/3', SPP.roundMark(22.5 / 3), 8);

// --- отметки
eq('marks 9', SPP.parseMarkText('9'), { marks: [9], absent: false });
eq('marks 8/9', SPP.parseMarkText(' 8/9 '), { marks: [8, 9], absent: false });
eq('marks н', SPP.parseMarkText('н'), { marks: [], absent: true });
eq('marks Н/б', SPP.parseMarkText('Н/б'), { marks: [], absent: true });
eq('marks 10 7', SPP.parseMarkText('10 7'), { marks: [10, 7], absent: false });
eq('marks 0 and 11 ignored', SPP.parseMarkText('0 11 зач'), { marks: [], absent: false });

// --- даты
eq('date ru', SPP.parseDayDate('Понедельник, 2 сентября', '2025-09-01'), '2025-09-02');
eq('date year boundary', SPP.parseDayDate('Пятница, 2 января', '2025-12-29'), '2026-01-02');
eq('date numeric', SPP.parseDayDate('Вт 14.10', '2025-10-13'), '2025-10-14');
eq('date by', SPP.parseDayDate('Аўторак, 14 кастрычніка', '2025-10-13'), '2025-10-14');

// --- прогноз: сверяем с перебором
for (const vals of [[7, 8, 6, 7], [9, 10, 9], [5, 6, 4, 7, 6, 5], [8], [10, 10, 9], [2, 3]]) {
  const s = SPP.summary(vals, 0.5);
  const f = SPP.forecast(s, 0.5);
  for (const u of f.up) {
    const after = (k) => SPP.roundMark((s.sum + u.mark * k) / (s.n + k));
    ok(`up ${vals} ${u.count}x${u.mark} достаточно`, after(u.count) >= s.rounded + 1);
    ok(`up ${vals} ${u.count - 1}x${u.mark} мало`, u.count === 1 || after(u.count - 1) === s.rounded);
  }
  if (f.down && !f.down.anySafe) {
    ok(`down ${vals} ${f.down.minSafe} держит`, SPP.roundMark((s.sum + f.down.minSafe) / (s.n + 1)) >= s.rounded);
    ok(`down ${vals} ${f.down.minSafe - 1} роняет`, SPP.roundMark((s.sum + f.down.minSafe - 1) / (s.n + 1)) < s.rounded);
  }
}

// --- статистика на демо-данных
const data = SPP.mockData();
const st = SPP.computeStats(data, { today: SPP.MOCK_TODAY });
eq('current quarter', st.current, '903');
eq('in progress', st.inProgress['903'], true);
ok('subjects', st.subjects.length >= 8);
const alg = st.subjects.find((s) => s.name === 'Алгебра');
const algQ1 = data.lessons.filter((l) => l.subject === 'Алгебра' && l.q === '901').flatMap((l) => l.marks);
eq('Q1 avg', alg.byQ['901'].avg, algQ1.reduce((a, b) => a + b, 0) / algQ1.length);
const qr = ['901', '902', '903'].map((q) => alg.byQ[q].rounded);
eq('year exact = mean rounded quarters', alg.year.exact, qr.reduce((a, b) => a + b, 0) / 3);
eq('year quarters', alg.year.quarters, 3);
eq('distribution sum', st.distribution.reduce((a, b) => a + b, 0), st.overall.marks);
ok('weekly', st.weekly.length > 20);

// --- реальная страница профиля ученика
// Структура как на странице ученика: <div class="title_box"><h1>Фамилия Имя, <a>10 "А"</a> класс, ID …</h1>
{
  const profile = '<!doctype html><title>Тестов Тест. Обучающийся 10 "А"</title><div class="title_box"><h1>Тестов Тест, ' +
    '<a href="/class/1">10 &quot;А&quot;</a> класс, ID 1234567</h1></div>' +
    '<a href="/pupil/1234567/dnevnik">Дневник</a><a class="u_name" href="https://demo.schools.by/pupil/1234567"><span>Тестов Т.</span></a>';
  const pw = makeWindow(profile, 'https://demo.schools.by/pupil/1234567');
  const pupils = pw.SPP.findPupils(pw.document, pw.location);
  eq('pupil from profile', pupils.map((p) => [p.id, p.name]), [['1234567', 'Тестов Тест']]);
}

// --- реальная структура недели (копия ответа /pupil/…/dnevnik/quarter/92/week/2026-10-12)
const weekHtml = fs.readFileSync(path.join(__dirname, 'fixtures/week-2026-10-12.html'), 'utf8');
{
  const doc = new w.DOMParser().parseFromString(weekHtml, 'text/html');
  const { lessons } = SPP.parseWeek(doc, '2026-10-12');
  const marked = lessons.filter((l) => l.marks.length).map((l) => [l.date, SPP.subjectTitle(l.subject), ...l.marks]);
  eq('week: только видимый блок', marked, [
    ['2026-10-12', 'Черчение', 9],
    ['2026-10-13', 'Химия', 4],
    ['2026-10-13', 'Математика', 6],
    ['2026-10-15', 'Английский язык', 9],
    ['2026-10-15', 'Математика', 9],
  ]);
  eq('week: пропуски', lessons.filter((l) => l.absent).map((l) => l.date), ['2026-10-12', '2026-10-14', '2026-10-16']);
  ok('week: пустые уроки пропущены', lessons.every((l) => l.subject));
  eq('week: дни', [...new Set(lessons.map((l) => l.date))], ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
}

// --- краулер на подменённом fetch: дневник → недели по ссылкам send_to
async function crawlTest() {
  const cw = makeWindow();
  const requested = [];
  const page = (url, html) => ({ ok: true, status: 200, url, text: async () => html });
  cw.fetch = async (url, init) => {
    requested.push(url.replace('https://demo.schools.by', ''));
    ok('xhr header', init.headers['X-Requested-With'] === 'XMLHttpRequest');
    const m = url.match(/week\/(\d{4}-\d{2}-\d{2})/);
    if (url.endsWith('/dnevnik')) return page(url, weekHtml);
    if (!m) return { ok: false, status: 404, url, text: async () => '' };
    // Подменяем даты, чтобы каждая неделя была своей; крайние недели без ссылок дальше.
    const d = m[1];
    if (url.includes('/quarter/93/')) {
      // Следующая четверть: одна неделя, данные — копия недели 12.10 со сдвигом дат
      const h = weekHtml.replace(/db_table_(\d\d)\.10\.26/g, (_, dd) => `db_table_${+dd + 14}.10.26`)
        .replace(/quarter\/92\/week\/[\d-]+/g, 'quarter/93/week/2026-10-26');
      return page(url, h);
    }
    if (d < '2026-09-28' || d > '2026-10-19') return page(url, '<div class="db_days"></div>');
    const shift = cw.SPP.daysBetween('2026-10-12', d);
    let html = weekHtml.replace(/db_table_(\d\d)\.10\.26/g, (_, dd) => `db_table_${cw.SPP.addDays(`2026-10-${dd}`, shift).split('-').reverse().map((x, i) => (i === 2 ? x.slice(2) : x)).join('.')}`);
    html = html.replace(/week\/2026-10-05/, `week/${cw.SPP.addDays(d, -7)}`).replace(/week\/2026-10-19/, `week/${cw.SPP.addDays(d, 7)}`);
    if (d === '2026-10-19') html = html.replace(/quarter\/92\/week\/2026-10-26/, 'quarter/93/week/2026-10-26');
    if (d === '2026-09-28') html = html.replace(/quarter\/92\/week\/2026-09-21/, 'quarter/88/week/2025-05-18');
    return page(url, html);
  };
  cw.SPP.sleep = async () => {};
  const res = await cw.SPP.crawl({ id: '1234567', origin: 'https://demo.schools.by', name: 'x' }, { today: '2026-10-20' });
  eq('crawl: четверти', res.quarters.map((q) => [q.id, q.name]), [['92', '1 четверть'], ['93', '2 четверть']]);
  eq('crawl: недели', [...new Set(res.lessons.map((l) => cw.SPP.mondayOf(l.date)))], ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  eq('crawl: отметок', res.lessons.reduce((a, l) => a + l.marks.length, 0), 25);
  ok('crawl: прошлый год не запрашивался', !requested.some((u) => u.includes('/quarter/88/')));
  ok('crawl: без запроса четверти без недели', !requested.includes('/pupil/1234567/dnevnik/quarter/92'));
}

// --- панель: каждая вкладка рисуется без ошибок
(async () => {
  await crawlTest();
  const uw = makeWindow();
  await uw.SPP.ui.init({ data: uw.SPP.mockData(), open: true });
  const shadow = uw.document.getElementById('spp-host').shadowRoot;
  for (const tab of ['overview', 'subject', 'dynamics', 'settings']) {
    shadow.querySelector(`[data-act="tab"][data-key="${tab}"]`).dispatchEvent(new uw.MouseEvent('click', { bubbles: true }));
    const main = shadow.querySelector('main');
    ok(`tab ${tab} rendered`, main && main.dataset.tab === tab && main.innerHTML.length > 200 && !/undefined|NaN/.test(main.textContent));
  }
  console.log(`\n${passed} пройдено, ${failed} провалено`);
  process.exit(failed ? 1 : 0);
})();
