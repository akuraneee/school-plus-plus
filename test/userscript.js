// Проверка собранного dist/schools-plus-plus.user.js в окружении без chrome.* (как в Userscripts на iPhone).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.join(__dirname, '../dist/schools-plus-plus.user.js'), 'utf8');
const html = '<!doctype html><html><head><title>t</title></head><body><div class="title_box"><h1>Тестов Тест, <a>10 "А"</a> класс</h1></div></body></html>';
let failed = 0;
const ok = (name, cond) => { if (!cond) { failed++; console.log('✗', name); } else console.log('✓', name); };

async function run(withGM) {
  const dom = new JSDOM(html, { url: 'https://demo.schools.by/pupil/1234567', runScripts: 'outside-only' });
  const w = dom.window;
  const gm = {};
  if (withGM) {
    w.GM = {
      getValue: async (k) => gm[k],
      setValue: async (k, v) => { gm[k] = v; },
      deleteValue: async (k) => { delete gm[k]; },
    };
  }
  w.eval(code);
  await new Promise((r) => setTimeout(r, 50));
  const label = withGM ? 'GM' : 'localStorage';
  ok(`${label}: кнопка появилась`, w.document.getElementById('spp-host')?.shadowRoot?.querySelector('.fab'));
  ok(`${label}: SPP не утёк в страницу`, typeof w.SPP === 'undefined' || withGM === null);
  const saved = withGM ? gm['spp:last:https://demo.schools.by'] : w.localStorage.getItem('spp:last:https://demo.schools.by');
  ok(`${label}: ученик сохранён`, saved && JSON.parse(saved).name === 'Тестов Тест');
}

(async () => {
  await run(true);
  await run(false);
  process.exit(failed ? 1 : 0);
})();
