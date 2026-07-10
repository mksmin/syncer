# ADR 0002: Safe local deletion

Status: accepted, 2026-07-10.

## Decision

Local deletion — только `FileManager.trashFile()`, только после successful downloads/updates, только
при доказанно complete remote index и неизменном trusted root. Count/percentage thresholds требуют
confirmation. Startup sync выше threshold выполняет только download/update.

## Why

Пустой/частичный API response неотличим от массового server delete без explicit completeness state.
Mirror semantics не оправдывает необратимую потерю локальной копии.

## Consequences

Ошибки решаются в пользу лишнего локального файла. Пустые folders остаются в v1. Excluded paths и
`.obsidian` не входят в denominator и никогда не удаляются.
