# Security

## Threat model

Syncer читает remote files и в будущих версиях пишет/перемещает local files. Главные риски: stolen
token, traversal outside vault, partial listing interpreted as deletion, corrupted download
replacing good local data, secret leakage in diagnostics.

## Controls

- provider contract v1 не имеет remote write operations;
- normalized relative paths reject `.`/`..` and control characters;
- incomplete/missing/changed remote root blocks trash;
- mass deletion needs manual confirmation; trash occurs last through `FileManager.trashFile()`;
- content verified in memory before future Vault write;
- logger redacts token/auth/password/secret keys and never logs file content;
- plugin data uses Obsidian `loadData()`/`saveData()`; `data.json` ignored by Git;
- no client secret ships in plugin. OAuth design must use public-client-safe flow/PKCE or secure
  exchange.

## Sensitive data

Future `data.json` contains Yandex access token and may later contain WebDAV credentials. Do not
share, sync through public Git, attach to issues or include in diagnostic export. Revoked/401 token
must be forgotten through settings and reauthorized.

## Reporting

Do not open a public issue containing token, password, note contents or full `data.json`. Revoke
leaked credentials first, then send a minimal redacted reproduction to project maintainers.
