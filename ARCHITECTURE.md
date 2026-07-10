# Syncer architecture

Syncer — pull-only зеркало: remote storage является источником истины, локальный Obsidian vault —
читаемой копией. v0.1.0 строит dry-run plan и ничего не меняет.

## Поток данных

```text
RemoteStorageProvider -> RemoteFile[] --+
                                        +-> PullSyncPlanner -> SyncPlan -> future SyncExecutor
Vault -> LocalVaultIndex -> LocalFile[] -+                         |
SyncStateRepository -> previous snapshot --------------------------+
PathFilter + deletion settings ------------------------------------+
```

Движок зависит от `RemoteStorageProvider`, а не Yandex/WebDAV. `ProviderFactory` — registry; новый
provider регистрируется без изменения planner/executor. HTTP и UI не входят в planner.

## Слои

- `types`: provider-neutral remote/local/state/sync contracts;
- `providers`: contract, factory, mock, отключённый WebDAV stub;
- `filters` и `utils`: glob и vault-bound path normalization;
- `sync`: pure comparator, deletion assessment, planner, progress, state repository;
- `infrastructure`: typed errors, secret-redacting logger;
- `ui`: Obsidian settings; не выполняет HTTP;
- `main`: lifecycle/commands/wiring; остаётся малым по мере появления coordinator.

## Инварианты

1. Runtime не содержит upload/delete remote methods.
2. `remoteIndexComplete=false` или missing root блокирует local trash.
3. `..`, control chars, leading slash и slash variants нормализуются/отклоняются до индексации.
4. Исключённый путь не download/update/trash.
5. Неоднозначное равенство означает update; snapshot fast path допустим только при stable local
   stat.
6. Executor сначала скачивает/проверяет, затем пишет; trash выполняется последним.
7. Snapshot обновляется per successful operation; global success — только без partial failure.
8. Одна session; `AbortController` останавливает новые операции и будущие удаления.

## Состояния

`idle -> connecting -> listing-remote -> scanning-local -> planning -> downloading -> updating -> trashing -> completed|completed-with-errors`.
Любая стадия может перейти в `cancelled` или `failed`. Progress идёт через `ProgressSink`; engine не
знает о Notice/modal/ribbon.

## State

`Plugin.loadData()`/`saveData()` хранят settings, `SyncState` и last result. `schemaVersion`
обязателен. Snapshot привязан к provider type и remote root. Смена любого значения сбрасывает trust,
требует dry run и блокирует удаления на первый run.

## Ошибки

Provider переводит status/network в typed errors. Coordinator формирует пользовательский текст.
Logger получает только metadata и редактирует ключи token/auth/password/secret. Содержимое файлов не
логируется.

## Lifecycle

`onload`: migrate data, register settings/ribbon/commands. Startup sync в будущей версии запускается
только внутри `workspace.onLayoutReady()` с delay и session lock. `onunload`: abort и provider
dispose.

## WebDAV extension

v1.2 реализует существующий contract: complete recursive listing, GET, connection validation. ETag
становится `revision`; Content-Length — `size`; Last-Modified — helper. Planner не меняется.
