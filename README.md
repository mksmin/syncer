# Syncer

Syncer строит безопасное одностороннее зеркало удалённой папки в локальном Obsidian vault:
`Remote -> Local`. Приоритет — Obsidian Mobile на iOS. Первый backend будет Яндекс Диск; WebDAV для
UGREEN NAS появится позже.

> Синхронизация не является резервным копированием. Перед первым использованием сделайте независимую
> резервную копию.

## Current release: v0.1.0

Это архитектурный каркас. Работают strict TypeScript, mock provider, path/glob validation, sync
planner, snapshot schema, deletion guard, progress model, settings, dry-run ribbon/command, tests,
CI и release build. Яндекс OAuth/API, download, update и trash ещё не реализованы. v0.1 не меняет ни
локальные, ни удалённые файлы.

Название Syncer задано владельцем проекта. “Remote vault mirror” используется только как описание
продуктовой модели.

## Install for development

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Скопируйте `main.js`, `manifest.json`, `styles.css` в `<vault>/<vault.configDir>/plugins/syncer/`,
перезапустите Obsidian и включите Syncer. `main.js` — release artifact и не коммитится.

## Use v0.1

Нажмите cloud-download ribbon или команду `Показать предварительный план`. Syncer сравнит один mock
remote file с текущим vault и покажет статистику. Это только dry run.

## Planned daily flow

После v1.0: авторизовать Яндекс Диск без client secret, указать remote path, проверить подключение,
сначала открыть dry run, затем `Синхронизировать сейчас`. Startup sync запускается после
layout-ready delay и не подтверждает массовые удаления.

Remote новые файлы скачиваются, изменённые заменяют local только после полной проверки,
отсутствующие remote перемещаются через Obsidian trash. Локальные изменения никогда не загружаются
на сервер.

## Exclusions

Defaults: `.obsidian/**`, `.trash/**`, `.git/**`, `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.part`.
Excluded files не download/update/trash и не входят в delete percentage. `.obsidian` полностью
отложена до отдельной версии; workspace, cache и plugin `data.json` нельзя безопасно зеркалировать
между устройствами по умолчанию.

## iOS limits

Плагин использует Obsidian API и browser runtime, без Node/Electron/Axios. Obsidian не даёт плагину
работать после полного закрытия и может заморозить background app. Обычный download хранится в
памяти до проверки; default max file size — 50 MB, concurrency — 3.

## Privacy and security

Syncer не содержит telemetry. Будущий access token хранится в plugin `data.json`; этот файл нельзя
публиковать или коммитить. Логи не содержат token, Authorization, password, note contents.
Подробности в [SECURITY.md](SECURITY.md).

## Troubleshooting

- `Provider is not available yet`: ожидаемо в v0.1; Яндекс появится в v0.2.
- Invalid glob: исправьте незакрытый character class или удалите `..`.
- План предлагает update при одинаковом size: без checksum/snapshot это безопасное поведение.
- Путь пропущен: проверьте exclusions и 50 MB limit.
- Mobile background остановил работу: верните Obsidian foreground и повторите; completed files
  должны остаться, будущие trash — не начаться.

## Development checks

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:coverage
pnpm run build
```

Архитектура: [ARCHITECTURE.md](ARCHITECTURE.md). Roadmap: [ROADMAP.md](ROADMAP.md). Лицензии:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
