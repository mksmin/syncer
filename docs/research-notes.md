# Research notes

Исследование выполнено 10 июля 2026 года до реализации Syncer v0.1.0. Код из изученных проектов не
копировался; использованы архитектурные идеи и проверены API-контракты.

## `Nikolay-Eltsov/obsidian-yadisk-sync`

Проект под MIT, ориентирован на desktop/mobile и использует `requestUrl()`. Структура мала:
`yandex-client`, `sync-engine`, `sync-state`, `settings`, собственный MD5 и модели.

Полезные решения:

- `URLSearchParams` для `path`, `limit`, `offset`;
- рекурсивный обход каталога с постраничным чтением `_embedded.items`;
- reuse локального MD5 из snapshot при неизменных size/mtime;
- `Vault` API, `FileManager.trashFile()` и `vault.configDir`;
- блокировка повторного запуска, команды, ribbon и отмена на уровне цикла;
- исключения и лимит размера.

Риски, из-за которых реализация Syncer самостоятельна:

- 404 корня превращается в пустой список. Для mirror-delete это может удалить весь vault;
- `_embedded` без элементов завершает обход без отдельного доказательства полноты;
- нет `AbortSignal` в `requestUrl()`-цепочке, только флаг между операциями;
- retry не учитывает 408, `Retry-After`, jitter и отменяемую задержку;
- OAuth-клиент содержит client secret. Публичный мобильный клиент не должен хранить secret;
- download сразу вызывает `modifyBinary()` без проверки size/checksum;
- snapshot пересканируется целиком после выполнения; частичные успехи явно не фиксируются;
- простой glob-конвертер и path normalizer не запрещают `..`;
- сложность bidirectional/merge не нужна pull-only v1.

Идеи для будущего Yandex provider: `requestUrl()`, OAuth code flow, `_embedded` pagination, MD5,
ссылка `/resources/download`, рекурсивное чтение. Все типы, retry, completeness proof, path
validation и auth будут написаны заново.

## `remotely-save/remotely-save`

Лицензия смешанная: `src`, `tests`, `docs`, `assets` — Apache-2.0; `pro` — PolyForm Strict. Папка
`pro` не исследовалась. Native Yandex находится там и не используется.

Полезные идеи из открытой части:

- общий remote filesystem contract и фабрика по provider type;
- нормализованная плоская модель `Entity` с local/remote metadata;
- построение полного sync plan перед операциями и экспорт плана для диагностики;
- ограниченные очереди, явное ожидание idle, продолжение после локальных ошибок;
- WebDAV через browser build, `requestUrl()` bridge и ручной breadth-first `PROPFIND Depth: 1`;
- обнаружение неполного server listing как fatal error;
- `Retry-After` и jitter в retry-коде провайдеров;
- ribbon меняет иконку/`aria-label`; конкурентный sync показывает текущий статус;
- предупреждение о `data.json`, лимите 50 MB и невозможности работы при закрытом Obsidian;
- `.obsidian` выключена по умолчанию из-за нестабильных mtime и device-specific файлов.

Что не переносится:

- общий CRUD remote interface шире нужного и разрешает запись/удаление на сервере;
- двусторонние решения на timestamps, tombstones, encryption и conflict merge;
- Node/browser polyfills (`Buffer`) и зависимости WebDAV до v1.2;
- любые импорты или идеи, требующие просмотра `pro`.

Идеи для будущего WebDAV: provider adapter, `PROPFIND Depth: 1` BFS как совместимый fallback,
ETag/Content-Length/Last-Modified, строгая проверка root prefix и серверных лимитов.

## Official Obsidian sample and docs

Официальный sample (0BSD) задаёт актуальные esbuild/TypeScript/ESLint/manifest/release patterns.
Syncer использует собственные файлы, но следует тем же публичным рекомендациям.

Проверено:

- `isDesktopOnly: false`;
- на mobile нет Node/Electron API; `CapacitorAdapter` нельзя считать `FileSystemAdapter`;
- HTTP через `requestUrl()`, данные плагина через `loadData()`/`saveData()`;
- пользовательские пути через единый normalizer; операции vault через `Vault`/`FileManager`;
- удаление через `FileManager.trashFile()`;
- `getFiles()` включает Markdown и бинарные файлы, видимые Vault API;
- release assets: `main.js`, `manifest.json`, `styles.css`; bundle не хранится в Git;
- startup UI после `workspace.onLayoutReady()`.

Источники: [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin),
[plugin checklist](https://docs.obsidian.md/oo/plugin),
[Vault guide](https://docs.obsidian.md/Plugins/Vault).

## Official Yandex Disk and OAuth docs

REST API подходит для mobile/desktop. Resource listing использует `path`, `limit`, `offset` и
`_embedded`; файл может содержать MD5, size, modified и revision. Download — сначала короткоживущая
ссылка, затем GET. Будущий клиент обязан различать 401/403/404/429/5xx и URL-кодировать query через
`URLSearchParams`.

Актуальный OAuth допускает confirmation-code screen через
`https://oauth.yandex.com/verification_code`; code живёт 10 минут. Документация поддерживает PKCE.
Syncer v0.2 использует confirmation-code flow с PKCE S256 и не встраивает client secret. Token
refresh отправляет `client_id` без secret; если конфигурация приложения Яндекса это отклоняет,
пользователь проходит авторизацию заново. Secret в distributable plugin не добавляется.

Источники: [Disk REST API](https://yandex.com/dev/disk/rest/),
[confirmation code](https://yandex.com/dev/id/doc/en/codes/screen-code),
[code exchange](https://yandex.com/dev/id/doc/en/codes/code-and-token).

## Mobile constraints accepted

- весь общий runtime browser-compatible; нет `fs`, `path`, `electron`, `child_process`, Axios;
- обычный файл скачивается целиком в память, поэтому 50 MB — защитный default;
- concurrency ограничивается 1–5;
- нет обещаний background sync после закрытия/заморозки Obsidian;
- `.obsidian` отложена: Vault API не перечисляет скрытые файлы, Adapter API повышает риск;
- отмена и partial snapshot обязательны до появления executor;
- incomplete/failed listing никогда не создаёт executable trash operations.
