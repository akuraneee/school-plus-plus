// Schools++ Desktop: окно с schools.by, встроенным расширением и тёмной темой.
const { app, BrowserWindow, Menu, nativeTheme, session, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const START_URL = 'https://schools.by/';
const SELFTEST = !!process.env.SPP_SELFTEST || process.argv.includes('--selftest');
if (SELFTEST) app.disableHardwareAcceleration(); // скриншоты без GPU (CI, песочницы)
const isSchools = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)schools\.by$/i.test(u.hostname);
  } catch {
    return false;
  }
};

// ---------- настройки (тёмная тема сайта, последняя страница, размер окна) ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const settings = { siteDark: true, lastUrl: null, bounds: null };
function loadSettings() {
  try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch { /* первый запуск */ }
}
function saveSettings() {
  if (SELFTEST) return;
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* не критично */ }
}

const extensionDir = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(__dirname, 'extension');
const SITE_DARK_CSS = fs.readFileSync(path.join(__dirname, 'site-dark.css'), 'utf8');

let win = null;
let darkCssKey = null;

async function applySiteDark() {
  if (!win) return;
  const wc = win.webContents;
  if (darkCssKey) {
    await wc.removeInsertedCSS(darkCssKey).catch(() => {});
    darkCssKey = null;
  }
  if (settings.siteDark && isSchools(wc.getURL())) darkCssKey = await wc.insertCSS(SITE_DARK_CSS, { cssOrigin: 'user' });
}

async function openStats() {
  const opened = await win.webContents.executeJavaScript(`(() => {
    const host = document.getElementById('spp-host');
    const fab = host && host.shadowRoot && host.shadowRoot.querySelector('.fab');
    if (fab) fab.click();
    return !!fab;
  })()`).catch(() => false);
  if (!opened) {
    dialog.showMessageBox(win, {
      type: 'info',
      message: 'Статистика пока недоступна',
      detail: 'Войдите на schools.by и откройте страницу ученика (дневник), затем попробуйте ещё раз.',
    });
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Schools++',
      submenu: [
        { label: 'Статистика оценок', accelerator: 'F2', click: openStats },
        { type: 'separator' },
        { label: 'На главную', accelerator: 'Alt+Home', click: () => win.loadURL(START_URL) },
        { label: 'Назад', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: () => win.webContents.navigationHistory.goBack() },
        { label: 'Вперёд', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: () => win.webContents.navigationHistory.goForward() },
        { label: 'Обновить страницу', accelerator: 'F5', click: () => win.webContents.reload() },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Закрыть окно' } : { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Тёмная тема сайта',
          type: 'checkbox',
          checked: settings.siteDark,
          accelerator: 'CmdOrCtrl+Shift+D',
          click: (item) => { settings.siteDark = item.checked; saveSettings(); applySiteDark(); },
        },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Крупнее' },
        { role: 'zoomOut', label: 'Мельче' },
        { role: 'resetZoom', label: 'Обычный размер' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      ],
    },
    { role: 'editMenu', label: 'Правка' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function setupSession() {
  // Самопроверка работает в отдельной сессии (очищается при запуске) и не трогает настоящий вход.
  // Расширения в Electron грузятся только в постоянную (persist:) сессию.
  if (SELFTEST) fs.rmSync(path.join(app.getPath('userData'), 'Partitions', 'selftest'), { recursive: true, force: true });
  const ses = session.fromPartition(SELFTEST ? 'persist:selftest' : 'persist:schools');

  // Убираем «Electron/…» из User-Agent, чтобы сайт видел обычный Chrome.
  ses.setUserAgent(ses.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?schools-plus-plus[^\s]*\/\S+/i, ''));

  // Сайту не нужны камера, микрофон, геолокация и т.п.
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  const loader = ses.extensions && ses.extensions.loadExtension ? ses.extensions : ses;
  await loader.loadExtension(extensionDir, { allowFileAccess: false });
  return ses;
}

async function createWindow(ses, startUrl) {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1280,
    height: b.height || 860,
    x: b.x,
    y: b.y,
    minWidth: 380,
    minHeight: 500,
    title: 'Schools++',
    backgroundColor: '#15181e',
    show: !SELFTEST,
    autoHideMenuBar: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const wc = win.webContents;
  wc.on('dom-ready', applySiteDark);
  wc.on('did-navigate', (_e, url) => {
    if (isSchools(url) && !/\/login/.test(url)) { settings.lastUrl = url; saveSettings(); }
  });

  // Сторонние ссылки открываем в обычном браузере, schools.by — в этом окне.
  wc.setWindowOpenHandler(({ url }) => {
    if (isSchools(url)) wc.loadURL(url);
    else if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!/^https:/i.test(url)) { e.preventDefault(); if (/^http:/i.test(url)) shell.openExternal(url); }
  });

  win.on('close', () => { settings.bounds = win.getBounds(); saveSettings(); });
  win.on('closed', () => { win = null; });

  await wc.loadURL(startUrl);
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(start).catch((e) => {
    console.error(e);
    dialog.showErrorBox('Schools++ не запустился', String((e && e.message) || e));
    app.exit(1);
  });

  async function start() {
    nativeTheme.themeSource = 'dark'; // тёмный заголовок окна и тёмная панель статистики
    if (!SELFTEST) loadSettings();
    buildMenu();
    const ses = await setupSession();
    if (SELFTEST) {
      await require('./selftest')({ ses, createWindow, getWin: () => win, applySiteDark, openStats });
      return;
    }
    await createWindow(ses, (settings.lastUrl && isSchools(settings.lastUrl) && settings.lastUrl) || START_URL);
  }

  app.on('window-all-closed', () => app.quit());
}
