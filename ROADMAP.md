# Roadmap

## v0.1.0 — foundation and research

Sample-compatible mobile skeleton; strict TS; build/lint/test/CI; settings; provider
contract/factory; models; logger/errors; mock provider; progress; pure planner; state migration;
architecture, research, pull-only and safe-delete ADRs. Result: desktop/iOS-loadable dry run, zero
file changes.

## v0.2.0 — read Yandex Disk

Public-client-safe OAuth ADR/flow, token storage/revoke, connection check, exact root validation,
`requestUrl()` client, typed response guards, recursive pagination, MD5/revision mapping, retry with
jitter/Retry-After/timeout/abort, HTTP mocks. Result: complete remote file count; no local changes.

## v0.3.0 — real dry run

Local index, filters, snapshot binding, comparator, real `SyncPlan`, dry-run modal, deletion
thresholds and root/provider migration guard. Result: real plan, zero file changes.

## v0.4.0 — create new local files

Bounded download queue, folders, text/binary Vault API, size/checksum verification, max size, retry,
abort and partial result. Existing local files remain untouched.

## v0.5.0 — update local files

Verified `UPDATE_LOCAL`, old-copy preservation on failure, per-file snapshot, result/progress modal,
startup sync without trash.

## v0.6.0 — safe trash

`TRASH_LOCAL` via `FileManager.trashFile()`, last-stage deletion, completeness/root guards, count
and percentage confirmation, startup defer, mass-delete tests.

## v0.7.0 — settings and UX

Full settings sections, auth UI, ribbon states, throttled progress/Notice, result/error details,
dangerous confirmations, RU/EN-ready strings, mobile layout.

## v0.8.0 — iOS stabilization

1,000+ files, Cyrillic/special chars, binaries, interruption/background/weak network/mobile data,
memory and throttle profiling, iPhone/iPad/desktop matrix, Node API bundle audit.

## v1.0.0 — production Yandex mirror

Pull-only new/update/trash, progress/settings/startup/abort/retry/filter/max size/deletion safety,
documentation, tests and release workflow. Real iPhone verification required.

## v1.1.0 — history and diagnostics

Recent runs, redacted diagnostics, timings, retry failed files, copyable report, improved debug
mode.

## v1.2.0 — WebDAV

HTTPS URL/credentials/root, `PROPFIND`, Depth/BFS, XML validation, ETag/Length/Last-Modified, GET,
401/403/404/423/429/5xx, mock server and UGREEN NAS/VPN guide. Still pull-only.

## v1.3.0 — profiles and migration

Yandex/WebDAV profiles, provider/root switching, mandatory dry run, snapshot reset, first-run
no-trash, remote-equivalence check, non-secret settings import/export.

## v1.4.0 — selected Obsidian config

Explicit opt-in themes/snippets/bookmarks; always exclude workspace, cache and plugin data; warn
about desktop-only plugins.

## v2.0.0 — possible bidirectional sync

Not scheduled. Separate RFC required for upload, rename, tombstones, three-way state, conflicts,
checksums, clock skew, multiple writers, recovery and locks. No hidden upload functionality before
it.
