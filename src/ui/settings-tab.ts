import { Notice, PluginSettingTab, Setting } from "obsidian";
import type { App, TextAreaComponent } from "obsidian";
import { DEFAULT_EXCLUDE_PATTERNS } from "../constants";
import { validateGlob } from "../filters/path-filter";
import type SyncerPlugin from "../main";
import { ConfirmationModal } from "./confirmation-modal";

export class SyncerSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SyncerPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl).setName("Подключение").setHeading();
    new Setting(this.containerEl)
      .setName("Удалённое хранилище")
      .setDesc("Яндекс Диск работает в read-only режиме. WebDAV планируется в v1.2.0.")
      .addDropdown((dropdown) => {
        dropdown.addOption("yandex-disk", "Яндекс Диск");
        dropdown.addOption("webdav", "WebDAV (планируется)");
        dropdown.setValue(this.plugin.settings.providerType);
        dropdown.setDisabled(true);
      });

    this.containerEl.createDiv({
      cls: "syncer-sensitive-data-warning",
      text: "Access token сохраняется в data.json. Не публикуйте и не прикладывайте этот файл к issue.",
    });

    if (this.plugin.isYandexAuthorized()) {
      new Setting(this.containerEl)
        .setName("Авторизация")
        .setDesc("Яндекс Диск авторизован.")
        .addButton((button) =>
          button
            .setButtonText("Проверить")
            .onClick(async () => this.plugin.checkYandexConnection()),
        )
        .addButton((button) =>
          button.setButtonText("Выйти").onClick(() => {
            new ConfirmationModal(
              this.app,
              "Забыть авторизацию?",
              "Access token и refresh token будут удалены из локального data.json.",
              "Выйти",
              async () => {
                await this.plugin.forgetYandexAuthorization();
                this.display();
              },
            ).open();
          }),
        );
    } else {
      new Setting(this.containerEl)
        .setName("Авторизация")
        .setDesc("Откройте Яндекс OAuth, разрешите доступ и скопируйте код подтверждения.")
        .addButton((button) =>
          button
            .setButtonText("Авторизоваться")
            .setCta()
            .onClick(async () => {
              try {
                const url = await this.plugin.beginYandexAuthorization();
                activeWindow.open(url, "_blank");
              } catch (error: unknown) {
                new Notice(error instanceof Error ? error.message : String(error));
              }
            }),
        );

      let authorizationCode = "";
      new Setting(this.containerEl)
        .setName("Код подтверждения")
        .setDesc("Код действует 10 минут.")
        .addText((text) =>
          text.setPlaceholder("Вставьте код").onChange((value) => {
            authorizationCode = value.trim();
          }),
        )
        .addButton((button) =>
          button.setButtonText("Подтвердить").onClick(async () => {
            if (authorizationCode === "") {
              new Notice("Введите код подтверждения.");
              return;
            }
            button.setDisabled(true);
            try {
              await this.plugin.completeYandexAuthorization(authorizationCode);
              new Notice("Яндекс Диск авторизован.");
              this.display();
            } catch (error: unknown) {
              button.setDisabled(false);
              new Notice(error instanceof Error ? error.message : String(error));
            }
          }),
        );
    }

    new Setting(this.containerEl)
      .setName("Удалённая папка")
      .setDesc(
        "Выберите существующую папку или введите путь. Смена пути сбрасывает snapshot trust.",
      )
      .addText((text) =>
        text
          .setPlaceholder("/Obsidian-vault")
          .setValue(this.plugin.settings.remoteRootPath)
          .onChange(async (value) => {
            await this.plugin.updateRemoteRoot(value.trim() || "/");
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("Выбрать…")
          .setDisabled(!this.plugin.isYandexAuthorized())
          .onClick(() => this.plugin.openYandexFolderPicker()),
      );

    new Setting(this.containerEl).setName("Синхронизация").setHeading();
    new Setting(this.containerEl)
      .setName("Удалять отсутствующие на сервере файлы")
      .setDesc("В v0.4.0 удаления только показываются в плане и не выполняются.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.deleteMissingLocalFiles).onChange(async (value) => {
          this.plugin.settings.deleteMissingLocalFiles = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(this.containerEl)
      .setName("Максимальный размер файла")
      .setDesc("МБ; файл больше лимита будет пропущен.")
      .addText((text) =>
        text
          .setValue(String(Math.round(this.plugin.settings.maxFileSizeBytes / (1024 * 1024))))
          .onChange(async (value) => {
            const megabytes = Number.parseInt(value, 10);
            if (Number.isFinite(megabytes) && megabytes > 0) {
              this.plugin.settings.maxFileSizeBytes = megabytes * 1024 * 1024;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(this.containerEl)
      .setName("Параллельные загрузки")
      .setDesc("Подготовлено для download executor; диапазон 1–5.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("1", "1 файл")
          .addOption("2", "2 файла")
          .addOption("3", "3 файла")
          .addOption("4", "4 файла")
          .addOption("5", "5 файлов")
          .setValue(String(this.plugin.settings.concurrentDownloads))
          .onChange(async (value) => {
            this.plugin.settings.concurrentDownloads = Number.parseInt(value, 10);
            await this.plugin.saveSettings();
          });
      });

    new Setting(this.containerEl).setName("Фильтры").setHeading();
    let validationEl: HTMLElement | undefined;
    let exclusionsTextArea: TextAreaComponent | undefined;
    const exclusionsSetting = new Setting(this.containerEl)
      .setName("Исключения")
      .setDesc("Один glob на строку. Исключённые пути не скачиваются и не удаляются.");
    exclusionsSetting.settingEl.addClass("syncer-exclusions-setting");
    exclusionsSetting.addTextArea((text) => {
      exclusionsTextArea = text;
      text.inputEl.rows = 9;
      text.setValue(this.plugin.settings.excludePatterns.join("\n")).onChange(async (value) => {
        const patterns = value
          .split("\n")
          .map((pattern) => pattern.trim())
          .filter(Boolean);
        const invalid = patterns.find((pattern) => !validateGlob(pattern).valid);
        if (invalid !== undefined) {
          validationEl?.setText(`Ошибка glob: ${invalid}`);
          validationEl?.addClass("is-error");
          return;
        }
        validationEl?.setText("Шаблоны корректны");
        validationEl?.removeClass("is-error");
        this.plugin.settings.excludePatterns = patterns;
        await this.plugin.saveSettings();
      });
    });
    validationEl = exclusionsSetting.controlEl.createDiv({
      cls: "syncer-glob-validation",
      text: "Шаблоны корректны",
    });
    exclusionsSetting.addButton((button) =>
      button.setButtonText("Сбросить исключения").onClick(async () => {
        const conventionalConfigPattern = [".obsidian", "**"].join("/");
        this.plugin.settings.excludePatterns = DEFAULT_EXCLUDE_PATTERNS.map((pattern) =>
          pattern === conventionalConfigPattern ? `${this.app.vault.configDir}/**` : pattern,
        );
        await this.plugin.saveSettings();
        exclusionsTextArea?.setValue(this.plugin.settings.excludePatterns.join("\n"));
        validationEl?.setText("Шаблоны сброшены");
        validationEl?.removeClass("is-error");
      }),
    );

    new Setting(this.containerEl)
      .setName("Конфигурация Obsidian")
      .setDesc(
        `Отложено: ${this.app.vault.configDir} полностью исключена до отдельного безопасного дизайна.`,
      )
      .addToggle((toggle) => toggle.setValue(false).setDisabled(true));

    new Setting(this.containerEl).setName("Опасная зона").setHeading();
    new Setting(this.containerEl)
      .setName("Очистить snapshot")
      .setDesc("Удаляет только сохранённые метаданные синхронизации, не файлы vault.")
      .addButton((button) =>
        button.setButtonText("Очистить").onClick(() => {
          new ConfirmationModal(
            this.app,
            "Очистить snapshot?",
            "Будут удалены только сохранённые метаданные. Файлы vault не изменятся.",
            "Очистить snapshot",
            () => this.plugin.clearSnapshot(),
          ).open();
        }),
      );
  }
}
