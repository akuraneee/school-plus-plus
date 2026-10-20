// Самопроверка в настоящем Electron без доступа к schools.by:
// https://demo.schools.by/* отдаётся из тестовых файлов, остальная сеть закрыта.
// Запуск: npm run selftest   (скриншоты — в SPP_SHOT_DIR или во временную папку)
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURE = fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'week-2026-10-12.html'), 'utf8');
const PROFILE = `<!doctype html><html><head><meta charset="utf-8"><title>Тестов Тест. Обучающийся 10 "А"</title></head>
<body style="font:14px Arial;margin:0">
<div style="background:#2a6ebb;color:#fff;padding:14px 20px;font-size:18px">schools.by (тестовая страница)</div>
<div style="padding:20px"><div class="title_box"><h1>Тестов Тест, <a href="/class/1">10 "А"</a> класс, ID 1234567</h1></div>
<p>Обычный белый сайт: в тёмной теме он должен стать тёмным.</p>
<ul class="tabs1"><li><a href="#dnevnik" src="/pupil/1234567/dnevnik">Дневник</a></li></ul></div></body></html>`;

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

module.exports = async function selftest({ ses, createWindow, getWin }) {
  const shotDir = process.env.SPP_SHOT_DIR || os.tmpdir();
  const result = { checks: {}, requests: [] };
  const check = (name, cond) => { result.checks[name] = !!cond; };

  ses.protocol.handle('https', (req) => {
    const u = new URL(req.url);
    if (u.hostname !== 'demo.schools.by') return html('blocked in selftest', 403);
    result.requests.push({ path: u.pathname, xhr: req.headers.get('x-requested-with') });
    if (u.pathname === '/pupil/1234567') return html(PROFILE);
    if (u.pathname === '/pupil/1234567/dnevnik') return html(FIXTURE);
    if (u.pathname === '/pupil/1234567/dnevnik/quarter/92/week/2026-10-12') return html(FIXTURE);
    if (u.pathname.startsWith('/pupil/1234567/dnevnik/quarter/92/week/')) return html('<div class="db_days"></div>');
    return html('not found', 404);
  });

  const win = await createWindow(ses, 'https://demo.schools.by/pupil/1234567');
  const js = (code) => win.webContents.executeJavaScript(code);
  const waitFor = async (code, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await js(code).catch(() => null);
      if (v) return v;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  };
  const shot = async (name) => {
    try {
      await new Promise((r) => setTimeout(r, 800)); // дать панели перерисоваться
      const img = await win.webContents.capturePage(undefined, { stayHidden: true });
      const file = path.join(shotDir, `electron-${name}.png`);
      fs.writeFileSync(file, img.toPNG());
      result[`shot_${name}`] = file;
    } catch (e) {
      result[`shot_${name}`] = `не удалось: ${e.message}`;
    }
  };

  try {
    check('кнопка появилась', await waitFor(`!!document.getElementById('spp-host')?.shadowRoot?.querySelector('.fab')`));
    check('тёмная тема сайта', await js(`getComputedStyle(document.body).filter.includes('invert')`));
    check('текст сайта не исчез', await js(`(() => {
      const [r, g, b] = getComputedStyle(document.querySelector('h1')).color.match(/\\d+/g).map(Number);
      return r + g + b < 200; // тёмный текст → после инверсии светлый
    })()`));
    await shot('site');

    await js(`document.getElementById('spp-host').shadowRoot.querySelector('.fab').click()`);
    const status = await waitFor(`(() => {
      const t = document.getElementById('spp-host').shadowRoot.querySelector('.status')?.textContent || '';
      return /отмет|Ошибка|не вошли/.test(t) && !/Загружаю/.test(t) ? t : null;
    })()`, 30000);
    result.status = status;
    check('дневник загружен', /5 отметок/.test(status || ''));
    check('запросы с X-Requested-With', result.requests.filter((r) => r.path.includes('dnevnik')).every((r) => r.xhr === 'XMLHttpRequest'));
    check('панель тёмная', await js(`(() => {
      const p = document.getElementById('spp-host').shadowRoot.querySelector('.panel');
      const [r, g, b] = getComputedStyle(p).backgroundColor.match(/\\d+/g).map(Number);
      return r + g + b < 200;
    })()`));
    await shot('panel');
  } catch (e) {
    result.error = String(e && e.stack || e);
  }

  console.log('SELFTEST ' + JSON.stringify(result, null, 2));
  const ok = !result.error && Object.values(result.checks).every(Boolean);
  getWin()?.destroy();
  app.exit(ok ? 0 : 1);
};
