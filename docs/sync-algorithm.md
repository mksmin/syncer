# Sync algorithm

## Stage 1: analysis

1. Validate connection and exact remote root.
2. Build complete recursive remote index. Любая page/decode/network/cancel error => index
   incomplete.
3. Scan local `Vault.getFiles()` без чтения содержимого.
4. Normalize/filter both indexes; reject duplicates and traversal.
5. Compare against last successful per-file snapshot.
6. Build immutable `SyncPlan`; vault ещё не менялся.

## Decisions

- Remote only -> `DOWNLOAD_NEW`.
- Both, size differs -> `UPDATE_LOCAL`.
- Both, comparable checksums differ/match -> `UPDATE_LOCAL`/`SKIP`.
- Both, no local hash: stable local size+mtime plus same remote checksum/revision as snapshot ->
  `SKIP`.
- Ambiguous identity -> `UPDATE_LOCAL`.
- Local only -> `TRASH_LOCAL`, unless filter/deletion/completeness/root guard blocks it.
- Remote file above max size -> `SKIP(FILE_TOO_LARGE)`; local copy survives.

## Stage 2: future executor

1. Run download-new queue with bounded concurrency.
2. Run update queue.
3. Each response: verify byte length and checksum before Vault write.
4. Save snapshot entry after each successful write.
5. Recheck abort and deletion confirmation.
6. Trash local-only files last.
7. Save result; `lastSuccessfulSyncAt` only when run has no partial error.

Repeat with unchanged remote and untouched local produces only `SKIP`.
