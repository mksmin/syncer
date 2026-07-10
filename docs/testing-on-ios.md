# Testing on iOS

1. Build `main.js`; copy `main.js`, `manifest.json`, `styles.css` to
   `<vault>/<vault.configDir>/plugins/syncer/` using supported file transfer.
2. Enable community plugins and Syncer. Confirm manifest shows mobile support.
3. Run `Показать предварительный план`; v0.1 must show dry run and make zero file changes.
4. Test 1,000+ paths, Cyrillic, spaces, `#`, `%`, `?`, nested/empty folders and binary names.
5. Background app, lock screen, switch network, cancel. No future trash may start after
   interruption.
6. Inspect memory with 1/10/50 MB binaries before raising 50 MB default.
7. Confirm no `fs`, `path`, `electron`, `child_process`, `FileSystemAdapter`, Axios or direct
   `fetch` in bundle/source.
8. After v0.2, test revoked token, 429/Retry-After, missing root and partial pagination.

Manual matrix: current iPhone/iOS, iPadOS, macOS/Windows desktop; Wi-Fi/mobile/weak/offline;
Obsidian foreground/background/resume. Real iPhone verification remains release blocker outside
automated CI.
