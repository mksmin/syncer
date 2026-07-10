import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { DeletionAssessment } from "../types/sync";

export interface SyncConfirmationOptions {
  downloadCount: number;
  updateCount: number;
  trashCount: number;
  trashPaths: readonly string[];
  deletionAssessment: DeletionAssessment;
  onWithoutTrash: () => Promise<void>;
  onWithTrash: () => Promise<void>;
}

export class SyncConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly options: SyncConfirmationOptions,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { downloadCount, updateCount, trashCount, deletionAssessment } = this.options;
    this.setTitle("Подтвердите локальные удаления");
    this.contentEl.createEl("p", {
      text: `Новых файлов: ${String(downloadCount)}. Изменённых: ${String(updateCount)}. Отсутствуют на сервере: ${String(trashCount)}.`,
    });
    this.contentEl.createDiv({
      cls: "syncer-dry-run-warning",
      text: deletionAssessment.confirmationRequired
        ? `Превышен лимит безопасного удаления: ${String(trashCount)} файлов (${formatPercentage(deletionAssessment.deletePercentage)}).`
        : "Удаления выполняются только локально через корзину Obsidian и после успешных загрузок.",
    });
    const paths = this.contentEl.createEl("details", { cls: "syncer-plan-section is-warning" });
    paths.open = deletionAssessment.confirmationRequired;
    paths.createEl("summary", { text: "Файлы для корзины" });
    const list = paths.createDiv({ cls: "syncer-plan-list" });
    for (const path of this.options.trashPaths.slice(0, 20)) {
      list.createDiv({ cls: "syncer-plan-row syncer-plan-path", text: path });
    }
    if (trashCount > 20) {
      list.createDiv({ cls: "syncer-plan-more", text: `Ещё ${String(trashCount - 20)} файлов…` });
    }
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((button) =>
        button.setButtonText("Без удалений").onClick(async () => {
          button.setDisabled(true);
          this.close();
          await this.options.onWithoutTrash();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText(`В корзину: ${String(trashCount)}`)
          .setWarning()
          .onClick(async () => {
            button.setDisabled(true);
            this.close();
            await this.options.onWithTrash();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

function formatPercentage(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}
