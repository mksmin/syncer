import { PluginSettingTab, Setting } from "obsidian";
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
      .setDesc("Яндекс Диск будет подключён в v0.2.0. WebDAV планируется в v1.2.0.")
      .addDropdown((dropdown) => {
        dropdown.addOption("yandex-disk", "Яндекс Диск (v0.2.0)");
        dropdown.addOption("webdav", "WebDAV (планируется)");
        dropdown.setValue(this.plugin.settings.providerType);
        dropdown.setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName("Удалённая папка")
      .setDesc(
        "После подключения Яндекс Диска папку можно будет выбрать из дерева. Смена пути потребует dry run.",
      )
      .addText((text) =>
        text
          .setPlaceholder("/Obsidian-vault")
          .setValue(this.plugin.settings.remoteRootPath)
          .onChange(async (value) => {
            this.plugin.settings.remoteRootPath = value.trim() || "/ObsidianVault";
            await this.plugin.saveSettings();
          }),
      )
      .addButton((button) => button.setButtonText("Выбрать…").setDisabled(true));

    new Setting(this.containerEl).setName("Синхронизация").setHeading();
    new Setting(this.containerEl)
      .setName("Удалять отсутствующие на сервере файлы")
      .setDesc("В v0.1.0 операции только показываются в плане и не выполняются.")
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
        this.plugin.settings.excludePatterns = [...DEFAULT_EXCLUDE_PATTERNS];
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
