# Releasing Syncer

Obsidian требует tag строго в формате `x.y.z`, совпадающий с `manifest.json`. Префикс `v` не
используется. Release должен содержать отдельные assets `main.js`, `manifest.json` и `styles.css`.

1. Завершить ручную проверку на iPhone по [testing-on-ios.md](testing-on-ios.md).
2. Обновить одинаковую версию в `manifest.json`, `package.json`, `versions.json` и README.
3. Запустить проверки:

   ```bash
   pnpm run validate:release
   pnpm run typecheck
   pnpm run lint
   pnpm test
   pnpm run build
   pnpm run validate:release -- --assets
   ```

4. Закоммитить и отправить `master`.
5. Создать и отправить tag без `v`:

   ```bash
   git tag 1.0.1
   git push origin 1.0.1
   ```

6. GitHub Actions создаст draft release с обязательными отдельными assets и дополнительным ZIP.
   Проверить release notes и опубликовать draft вручную.

Неверный tag, несовпадающие версии или отсутствующий asset останавливают workflow до публикации.
