# Third-party notices

## spark-md5

- Package: `spark-md5` 3.0.2.
- License: MIT or WTFPL.
- Used for browser-compatible MD5 verification of downloaded Yandex Disk content.

No third-party source code was copied or adapted in Syncer v0.1.0. Research used architecture and
public API behavior only.

## obsidian-yadisk-sync

- Project: <https://github.com/Nikolay-Eltsov/obsidian-yadisk-sync>
- License: MIT.
- Used: architectural review of `requestUrl`, OAuth screen-code approach, pagination, snapshot/MD5,
  exclusions, Obsidian Vault/trash APIs and mobile behavior.
- Borrowed code: none.

## Remotely Save

- Project: <https://github.com/remotely-save/remotely-save>
- `src`, `tests`, `docs`, `assets`: Apache License 2.0.
- `pro`: PolyForm Strict License 1.0.0; not inspected or used.
- Used: provider separation, precomputed plan, bounded queue/retry concepts, completeness failure,
  WebDAV portability, ribbon state, secret warning and mobile limits.
- Borrowed code: none. Native Yandex implementation is in `pro` and was not accessed.

## Obsidian sample plugin and API

- Project: <https://github.com/obsidianmd/obsidian-sample-plugin>
- License: 0BSD.
- Used: public build, manifest, lint, CI/release conventions and official API signatures.
- Borrowed code: none; configuration was independently authored from documented patterns.

Runtime/build dependencies retain licenses distributed in npm packages and lockfile metadata.
