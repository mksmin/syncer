# ADR 0001: Pull-only sync

Status: accepted, 2026-07-10.

## Decision

До отдельного v2 RFC Syncer разрешает только `Remote -> Local`. Remote provider contract содержит
validate/list/download, но не upload/delete/mkdir. Сервер никогда не меняется.

## Why

iPhone — прежде всего reader; authoritative edits происходят на desktop и уже попадают на server.
Pull-only убирает conflict resolution, clock skew, tombstones, three-way merge и remote write risk.

## Consequences

Локальные правки могут быть перезаписаны remote версией. UI/README предупреждают об этом. Возможный
v2 требует отдельного RFC и новых provider contracts; скрытых upload paths в v1 нет.
