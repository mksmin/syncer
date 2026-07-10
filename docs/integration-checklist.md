# Integration checklist

- First run: empty local + `A.md`, `Folder/B.md`, `image.png` => three downloads, no trash.
- Repeat: all skip, no writes.
- Remote update: only `A.md` updates.
- Remote delete: `Folder/B.md` goes through `trashFile` after downloads.
- Listing failure/incomplete page: no trash and snapshot unchanged.
- Download failure/checksum mismatch: old local survives; other jobs continue; result has error.
- Wrong/missing root: critical warning; zero trash.
- 80% removal: startup defers trash; manual modal offers three choices.
- Root/provider change: snapshot trust reset; mandatory dry run; first trash blocked.

v0.2 automates planner, Yandex pagination/recursion, typed HTTP errors, retry, cancellation, binary
download transport and PKCE token flow. v0.3 adds strict persisted-state validation, exact snapshot
binding and detailed mobile dry-run reports. v0.4 adds verified new-file creation, bounded
concurrency, per-file snapshot and live batched progress; update/trash remain disabled.
