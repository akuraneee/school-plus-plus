// Копирует расширение (manifest.json + src/) из корня репозитория в app/extension — оттуда его грузит Electron.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', ...manifest.content_scripts[0].js];

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(root, f), path.join(out, f));
}
console.log(`extension: ${files.length} файлов, версия ${manifest.version}`);
