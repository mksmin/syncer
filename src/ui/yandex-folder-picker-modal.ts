import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { RemoteFolder } from "../providers/yandex/yandex-provider";
import { normalizeRemoteRoot } from "../providers/yandex/yandex-mappers";

export interface YandexFolderPickerOptions {
  initialPath: string;
  listFolders: (path: string, signal: AbortSignal) => Promise<RemoteFolder[]>;
  onChoose: (path: string) => Promise<void>;
  onError: (error: unknown) => void;
}

export class YandexFolderPickerModal extends Modal {
  private currentPath: string;
  private abortController: AbortController | undefined;

  constructor(
    app: App,
    private readonly options: YandexFolderPickerOptions,
  ) {
    super(app);
    this.currentPath = normalizeRemoteRoot(options.initialPath);
  }

  override onOpen(): void {
    this.setTitle("Выбор папки Яндекс Диска");
    void this.render();
  }

  override onClose(): void {
    this.abortController?.abort();
    this.contentEl.empty();
  }

  private async render(): Promise<void> {
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    this.contentEl.empty();
    this.contentEl.createDiv({ cls: "syncer-folder-picker-path", text: this.currentPath });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("Назад")
          .setDisabled(this.currentPath === "/")
          .onClick(() => {
            this.currentPath = parentPath(this.currentPath);
            void this.render();
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("Выбрать эту папку")
          .setCta()
          .onClick(async () => {
            await this.options.onChoose(this.currentPath);
            this.close();
          }),
      );

    const listEl = this.contentEl.createDiv({ cls: "syncer-folder-picker-list" });
    listEl.createDiv({ cls: "syncer-folder-picker-loading", text: "Загрузка папок…" });
    try {
      const folders = await this.options.listFolders(this.currentPath, controller.signal);
      if (controller.signal.aborted) return;
      listEl.empty();
      if (folders.length === 0) {
        listEl.createDiv({ cls: "syncer-folder-picker-empty", text: "Вложенных папок нет" });
        return;
      }
      for (const folder of folders) {
        const setting = new Setting(listEl).setName(folder.name);
        setting.addButton((button) =>
          button.setButtonText("Открыть").onClick(() => {
            this.currentPath = folder.path;
            void this.render();
          }),
        );
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      listEl.empty();
      listEl.createDiv({ cls: "syncer-settings-warning", text: "Не удалось загрузить папки." });
      this.options.onError(error);
    }
  }
}

function parentPath(path: string): string {
  const normalized = normalizeRemoteRoot(path);
  if (normalized === "/") return "/";
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}
