# Testing on iOS

1. Build `main.js`; copy `main.js`, `manifest.json`, `styles.css` to
   `<vault>/<vault.configDir>/plugins/syncer/` using supported file transfer.
2. Enable community plugins and Syncer. Confirm manifest shows mobile support.
3. Press `Авторизоваться`, finish confirmation-code authorization, run `Проверить` and choose a
   remote folder through `Выбрать…`. No Client ID field should be visible.
4. Run `Плановая синхронизация`; v0.5 must open the modal immediately, append remote data in
   batches, show progress and make zero file changes.
5. Expand every section. Check long paths wrap, lists scroll, blocked deletion candidates open
   automatically and no row escapes screen width.
6. Test 1,000+ paths, Cyrillic, spaces, `#`, `%`, `?`, nested/empty folders and binary names.
7. Background app, lock screen, switch network, cancel. No following request may start after
   interruption.
8. Confirm folder picker navigation, back, selecting root and an empty folder on iPhone width.
9. Confirm no `fs`, `path`, `electron`, `child_process`, `FileSystemAdapter`, Axios or direct
   `fetch` in bundle/source.
10. Test revoked token, offline/timeout, missing root and cancellation. 429/Retry-After and partial
    pagination are covered by HTTP mocks; reproduce manually when practical.
11. In a disposable vault, run `Плановая синхронизация`, select each of the three actions and verify
    their scope. Rows must show remote/local size and modification dates.
12. Change a local file after dry run but before confirmation. Sync must refuse that overwrite and
    show a per-file error.
13. Test every background rule. Startup and `Синхронизировать сейчас` must run without opening a
    modal or asking confirmation. A remote deletion must never remove or trash its local file.
14. Reopen the plan within 60 seconds. Confirm it reports use of cache, makes no new listing request
    and does not propose already completed updates. Immediate repeated write must show cooldown.
15. During background sync run `Плановая синхронизация` or `Синхронизировать сейчас`. The same
    session must reopen with current stage/progress. Stop it from the modal and confirm no next job
    starts.
16. Download Markdown, PNG, JPEG, GIF, PDF and DOCX files. No content response may produce
    `JSON Parse error`; checksum/size validation must still run before every Vault write.

Manual matrix: current iPhone/iOS, iPadOS, macOS/Windows desktop; Wi-Fi/mobile/weak/offline;
Obsidian foreground/background/resume. Real iPhone verification remains release blocker outside
automated CI.
