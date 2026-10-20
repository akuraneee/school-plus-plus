#!/usr/bin/env python3
"""Сборка:
  dist/schools-plus-plus-chromium.zip  — расширение для Chrome/Edge/Яндекс/Firefox и Android-браузеров с расширениями;
  dist/schools-plus-plus.user.js       — userscript для iPhone (приложение Userscripts для Safari) и Tampermonkey.

Имена файлов не меняются от версии к версии, чтобы работали постоянные ссылки
https://github.com/<репозиторий>/releases/latest/download/<файл>.
"""
import json, os, pathlib, zipfile

root = pathlib.Path(__file__).parent
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
scripts = manifest['content_scripts'][0]['js']
version = manifest['version']
dist = root / 'dist'
dist.mkdir(exist_ok=True)

# --- zip-расширение
out = dist / 'schools-plus-plus-chromium.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in ['manifest.json'] + scripts:
        z.write(root / f, f)
print(out.relative_to(root), f'({out.stat().st_size // 1024} КБ)')

# --- userscript
# Ссылки для автообновления в Userscripts/Tampermonkey (обновится, когда вырастет версия в manifest.json).
repo = os.environ.get('GITHUB_REPOSITORY', 'akuraneee/school-plus-plus')
latest = f'https://github.com/{repo}/releases/latest/download/schools-plus-plus.user.js'
header = f"""// ==UserScript==
// @name         Schools++ — статистика оценок
// @namespace    schools-plus-plus
// @version      {version}
// @description  {manifest['description']}
// @match        *://*.schools.by/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @run-at       document-idle
// @inject-into  content
// @noframes
// @homepageURL  https://github.com/{repo}
// @updateURL    {latest}
// @downloadURL  {latest}
// ==/UserScript==
"""
parts = [header, '// Собрано из src/ командой python3 build.py — не редактируйте этот файл вручную.\n', '(function () {\n']
for f in scripts:
    parts.append(f'\n// ===== {f} =====\n')
    parts.append((root / f).read_text(encoding='utf-8'))
# Модули держат SPP в замыканиях, глобальная ссылка после загрузки не нужна.
parts.append('\ntry { delete globalThis.SPP; } catch (e) { /* нет */ }\n})();\n')
us = dist / 'schools-plus-plus.user.js'
us.write_text(''.join(parts), encoding='utf-8')
print(us.relative_to(root), f'({us.stat().st_size // 1024} КБ)')
