import { Modal } from "obsidian";
import type { App } from "obsidian";
import {
  buildPlanSections,
  deletionWarning,
  formatBytes,
  operationDetail,
} from "../sync/sync-plan-report";
import type { SyncOperation, SyncPlan } from "../types/sync";

const MAX_VISIBLE_OPERATIONS = 200;

export class DryRunModal extends Modal {
  constructor(
    app: App,
    private readonly plan: SyncPlan,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("Предварительный план");
    this.contentEl.addClass("syncer-dry-run-modal");
    this.contentEl.createDiv({
      cls: "syncer-dry-run-safety",
      text: "Dry run: файлы vault не будут изменены.",
    });
    this.renderSummary();
    const warning = deletionWarning(this.plan);
    if (warning !== undefined) {
      this.contentEl.createDiv({ cls: "syncer-dry-run-warning", text: warning });
    }
    for (const section of buildPlanSections(this.plan)) {
      const details = this.contentEl.createEl("details", {
        cls: `syncer-plan-section is-${section.tone}`,
      });
      details.open =
        section.tone !== "muted" || section.operations.some(isBlockedDeletionCandidate);
      details.createEl("summary", {
        text: `${section.title}: ${String(section.operations.length)}`,
      });
      const list = details.createDiv({ cls: "syncer-plan-list" });
      for (const operation of section.operations.slice(0, MAX_VISIBLE_OPERATIONS)) {
        renderOperation(list, operation);
      }
      const hiddenCount = section.operations.length - MAX_VISIBLE_OPERATIONS;
      if (hiddenCount > 0) {
        list.createDiv({
          cls: "syncer-plan-more",
          text: `Ещё ${String(hiddenCount)} операций не показано для экономии памяти.`,
        });
      }
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private renderSummary(): void {
    const summary = this.contentEl.createDiv({ cls: "syncer-plan-summary" });
    summaryCard(summary, "Remote", this.plan.remoteFileCount);
    summaryCard(summary, "Local", this.plan.localFileCount);
    summaryCard(summary, "Новые", this.plan.downloadCount);
    summaryCard(summary, "Обновить", this.plan.updateCount);
    summaryCard(summary, "В корзину", this.plan.trashCount);
    summaryCard(summary, "Пропустить", this.plan.skipCount);
    summaryCard(summary, "Скачать", formatBytes(this.plan.totalDownloadBytes));
  }
}

function summaryCard(parent: HTMLElement, label: string, value: number | string): void {
  const card = parent.createDiv({ cls: "syncer-plan-summary-card" });
  card.createDiv({ cls: "syncer-plan-summary-value", text: String(value) });
  card.createDiv({ cls: "syncer-plan-summary-label", text: label });
}

function renderOperation(parent: HTMLElement, operation: SyncOperation): void {
  const row = parent.createDiv({ cls: "syncer-plan-row" });
  row.createDiv({ cls: "syncer-plan-path", text: operation.relativePath });
  row.createDiv({ cls: "syncer-plan-detail", text: operationDetail(operation) });
}

function isBlockedDeletionCandidate(operation: SyncOperation): boolean {
  return (
    operation.type === "SKIP" &&
    (operation.reason === "REMOTE_INDEX_INCOMPLETE" ||
      operation.reason === "REMOTE_ROOT_CHANGED" ||
      operation.reason === "UNSAFE_REMOTE_ROOT")
  );
}
