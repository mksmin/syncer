import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";

export class ConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(this.title);
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            await this.onConfirm();
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
