# Testing on iOS

1. Build `main.js`; copy `main.js`, `manifest.json`, `styles.css` to
   `<vault>/<vault.configDir>/plugins/syncer/` using supported file transfer.
2. Enable community plugins and Syncer. Confirm manifest shows mobile support.
3. Enter Yandex Client ID, finish confirmation-code authorization, run `Проверить` and choose a
   remote folder through `Выбрать…`.
4. Run `Показать предварительный план`; v0.2 must show real Yandex counts and make zero file
   changes.
5. Test 1,000+ paths, Cyrillic, spaces, `#`, `%`, `?`, nested/empty folders and binary names.
6. Background app, lock screen, switch network, cancel. No following request may start after
   interruption.
7. Confirm folder picker navigation, back, selecting root and an empty folder on iPhone width.
8. Confirm no `fs`, `path`, `electron`, `child_process`, `FileSystemAdapter`, Axios or direct
   `fetch` in bundle/source.
9. Test revoked token, offline/timeout, missing root and cancellation. 429/Retry-After and partial
   pagination are covered by HTTP mocks; reproduce manually when practical.

Manual matrix: current iPhone/iOS, iPadOS, macOS/Windows desktop; Wi-Fi/mobile/weak/offline;
Obsidian foreground/background/resume. Real iPhone verification remains release blocker outside
automated CI.
