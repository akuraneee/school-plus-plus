#!/usr/bin/env python3
"""Проставляет версию сборки в manifest.json: <major>.<minor> из manifest.json + номер запуска GitHub Actions.
Так у каждого релиза своя растущая версия — userscript и APK видят обновления.
Пишет version=… в $GITHUB_OUTPUT (если есть) и печатает версию."""
import json, os, pathlib

path = pathlib.Path(__file__).resolve().parent.parent / 'manifest.json'
manifest = json.loads(path.read_text(encoding='utf-8'))
major, minor = manifest['version'].split('.')[:2]
build = os.environ.get('GITHUB_RUN_NUMBER')
version = f'{major}.{minor}.{build}' if build else manifest['version']
manifest['version'] = version
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
        f.write(f'version={version}\n')
print(version)
