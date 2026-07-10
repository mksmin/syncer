# Syncer

<img src="assets/syncer-icon.png" alt="Syncer icon" width="160">

Syncer строит безопасное одностороннее зеркало удалённой папки в локальном Obsidian vault:
`Remote -> Local`. Приоритет — Obsidian Mobile на iOS. Первый backend — Яндекс Диск; WebDAV для
UGREEN NAS появится позже.

> Синхронизация не является резервным копированием. Перед первым использованием сделайте независимую
> резервную копию.

## Current release: v0.4.0

Работают OAuth confirmation-code + PKCE без client secret, проверка подключения, выбор существующей
папки, рекурсивный индекс Яндекс Диска со всей пагинацией, retry/Retry-After/timeout/отмена и
реальный dry run относительно текущего vault. v0.3 добавляет полный мобильный отчёт: сводку,
download bytes, списки новых/изменённых/удаляемых/пропущенных файлов, причины пропуска и явные
предупреждения deletion guard. v0.4 умеет безопасно создавать отсутствующие файлы после проверки
размера и checksum. Существующие файлы не перезаписываются, удаления не выполняются.

Название Syncer задано владельцем проекта. “Remote vault mirror” используется только как описание
продуктовой модели.

## Install for development

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Скопируйте `main.js`, `manifest.json`, `styles.css` в `<vault>/<vault.configDir>/plugins/syncer/`,
перезапустите Obsidian и включите Syncer. `main.js` — release artifact и не коммитится.

## Настройка Яндекс OAuth

OAuth-приложение уже зарегистрировано разработчиком `mksmin`; публичный Client ID встроен в Syncer.
Client secret в исходниках и настройках отсутствует.

1. Нажмите `Авторизоваться`.
2. Разрешите read-only доступ, скопируйте код и подтвердите его в Syncer.
3. Нажмите `Проверить`, затем выберите существующую удалённую папку.

Access token, refresh token и временный PKCE verifier хранятся локально в plugin `data.json`. Не
публикуйте этот файл. Если refresh публичного клиента отклонён настройками приложения, Syncer
попросит повторную авторизацию; client secret всё равно не сохраняется.

## Use v0.4

Нажмите cloud-download ribbon или команду `Показать предварительный план`. Syncer прочитает всё
дерево выбранной папки, сравнит его с vault и откроет подробный план. Разверните нужную секцию,
чтобы увидеть пути и причины. Это только dry run: файловых операций нет.

Окно открывается сразу и обновляется батчами во время чтения Яндекс Диска. Команда
`Скачать только новые файлы` использует то же окно для плана и прогресса. Перед записью требуется
подтверждение.

## Planned daily flow

После v1.0: проверить подключение, сначала открыть dry run, затем `Синхронизировать сейчас`. Startup
sync запускается после layout-ready delay и не подтверждает массовые удаления.

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

Syncer не содержит telemetry. Access token хранится в plugin `data.json`; этот файл нельзя
публиковать или коммитить. Логи не содержат token, Authorization, password, note contents.
Подробности в [SECURITY.md](SECURITY.md).

## Troubleshooting

- `Яндекс Диск не авторизован`: нажмите `Авторизоваться` и завершите confirmation-code flow.
- `Удалённая папка или файл не найдены`: выберите существующую папку через `Выбрать…`.
- `Токен ... истёк`: повторите авторизацию; secret в плагин добавлять нельзя.
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
