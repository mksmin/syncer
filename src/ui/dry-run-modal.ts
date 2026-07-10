import { Modal } from "obsidian";
import type { App } from "obsidian";
import {
  buildPlanSections,
  deletionWarning,
  formatBytes,
  operationDetail,
} from "../sync/sync-plan-report";
import type { SyncOperation, SyncPlan } from "../types/sync";
import type { FileExecutionError } from "../types/execution";

const MAX_VISIBLE_OPERATIONS = 200;

export interface DryRunActions {
  syncAll: () => void;
  downloadNew: () => void;
  updateExisting: () => void;
}

interface ProgressState {
  message: string;
  current?: number;
  total?: number;
  isError: boolean;
}

type OperationState =
  | { mode: "preview" }
  | { mode: "active"; message: string; onCancel: () => void }
  | { mode: "finished"; message: string };

export class DryRunModal extends Modal {
  private plan: SyncPlan | undefined;
  private safetyEl: HTMLElement | undefined;
  private statusEl: HTMLElement | undefined;
  private progressEl: HTMLProgressElement | undefined;
  private operationEl: HTMLElement | undefined;
  private planEl: HTMLElement | undefined;
  private actionsEl: HTMLElement | undefined;
  private resultEl: HTMLElement | undefined;
  private actions: DryRunActions | undefined;
  private executionErrors: readonly FileExecutionError[] = [];
  private progressState: ProgressState;
  private operationState: OperationState = { mode: "preview" };
  private readonly sectionOpen = new Map<string, boolean>();

  constructor(app: App, plan?: SyncPlan) {
    super(app);
    this.plan = plan;
    this.progressState = {
      message: plan === undefined ? "Подготовка…" : "План готов",
      ...(plan === undefined ? {} : { current: 1, total: 1 }),
      isError: false,
    };
  }

  override onOpen(): void {
    this.setTitle("План синхронизации");
    this.contentEl.addClass("syncer-dry-run-modal");
    this.safetyEl = this.contentEl.createDiv({ cls: "syncer-dry-run-safety" });
    const progress = this.contentEl.createDiv({ cls: "syncer-live-progress" });
    this.statusEl = progress.createDiv({ cls: "syncer-live-progress-status" });
    this.progressEl = progress.createEl("progress", { cls: "syncer-live-progress-bar" });
    this.operationEl = this.contentEl.createDiv({ cls: "syncer-operation-controls" });
    this.actionsEl = this.contentEl.createDiv({ cls: "syncer-plan-actions" });
    this.planEl = this.contentEl.createDiv({ cls: "syncer-live-plan" });
    this.resultEl = this.contentEl.createDiv({ cls: "syncer-execution-result" });
    this.renderOperationState();
    this.renderProgress();
    this.renderPlan();
    this.renderActions();
    this.renderExecutionErrors();
  }

  setProgress(message: string, current?: number, total?: number): void {
    this.progressState = {
      message,
      ...(current === undefined ? {} : { current }),
      ...(total === undefined ? {} : { total }),
      isError: false,
    };
    this.renderProgress();
  }

  updatePlan(plan: SyncPlan, complete: boolean): void {
    this.plan = plan;
    this.renderPlan();
    if (complete) this.setProgress("План готов", 1, 1);
  }

  setActions(actions: DryRunActions): void {
    this.actions = actions;
    this.renderActions();
  }

  beginOperation(message: string, onCancel: () => void): void {
    this.operationState = { mode: "active", message, onCancel };
    this.renderOperationState();
    this.renderActions();
  }

  endOperation(message: string): void {
    this.operationState = { mode: "finished", message };
    this.renderOperationState();
    this.renderActions();
  }

  showError(message: string): void {
    this.progressState = { message, isError: true };
    this.renderProgress();
  }

  showExecutionErrors(errors: readonly FileExecutionError[]): void {
    this.executionErrors = [...errors];
    this.renderExecutionErrors();
  }

  override onClose(): void {
    this.contentEl.empty();
    this.safetyEl = undefined;
    this.statusEl = undefined;
    this.progressEl = undefined;
    this.operationEl = undefined;
    this.planEl = undefined;
    this.actionsEl = undefined;
    this.resultEl = undefined;
  }

  private renderProgress(): void {
    if (this.statusEl === undefined || this.progressEl === undefined) return;
    this.statusEl.setText(this.progressState.message);
    this.statusEl.toggleClass("is-error", this.progressState.isError);
    const { current, total } = this.progressState;
    if (current === undefined || total === undefined || total <= 0) {
      this.progressEl.removeAttribute("value");
      return;
    }
    this.progressEl.max = total;
    this.progressEl.value = Math.min(current, total);
  }

  private renderOperationState(): void {
    if (this.safetyEl === undefined || this.operationEl === undefined) return;
    this.operationEl.empty();
    if (this.operationState.mode === "preview") {
      this.safetyEl.setText("Предпросмотр: файлы в хранилище пока не изменяются.");
      return;
    }
    this.safetyEl.setText(this.operationState.message);
    if (this.operationState.mode === "finished") return;
    this.operationEl.createDiv({
      cls: "syncer-operation-note",
      text: "Закрытие окна не остановит операцию. Откройте «План синхронизации», чтобы вернуться.",
    });
    const button = this.operationEl.createEl("button", {
      cls: "syncer-operation-cancel",
      text: "Остановить синхронизацию",
    });
    button.addEventListener("click", () => {
      button.disabled = true;
      button.setText("Останавливаем…");
      if (this.operationState.mode === "active") this.operationState.onCancel();
    });
  }

  private renderExecutionErrors(): void {
    if (this.resultEl === undefined) return;
    this.resultEl.empty();
    if (this.executionErrors.length === 0) return;
    const details = this.resultEl.createEl("details", { cls: "syncer-plan-section is-warning" });
    details.open = true;
    details.createEl("summary", { text: `Ошибки: ${String(this.executionErrors.length)}` });
    const list = details.createDiv({ cls: "syncer-plan-list" });
    for (const error of this.executionErrors.slice(0, MAX_VISIBLE_OPERATIONS)) {
      const row = list.createDiv({ cls: "syncer-plan-row" });
      row.createDiv({ cls: "syncer-plan-path", text: error.relativePath });
      row.createDiv({ cls: "syncer-plan-detail", text: error.message });
    }
  }

  private renderPlan(): void {
    if (this.planEl === undefined) return;
    this.planEl.empty();
    if (this.plan === undefined) {
      this.planEl.createDiv({ cls: "syncer-plan-more", text: "Первые данные появятся батчами." });
      return;
    }
    this.renderSummary(this.planEl, this.plan);
    const warning = deletionWarning(this.plan);
    if (warning !== undefined) {
      this.planEl.createDiv({ cls: "syncer-dry-run-warning", text: warning });
    }
    for (const section of buildPlanSections(this.plan)) {
      const details = this.planEl.createEl("details", {
        cls: `syncer-plan-section is-${section.tone}`,
      });
      details.open =
        this.sectionOpen.get(section.title) ??
        (section.tone !== "muted" || section.operations.some(isBlockedDeletionCandidate));
      details.addEventListener("toggle", () => this.sectionOpen.set(section.title, details.open));
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

  private renderSummary(parent: HTMLElement, plan: SyncPlan): void {
    const summary = parent.createDiv({ cls: "syncer-plan-summary" });
    summaryCard(summary, "На сервере", plan.remoteFileCount);
    summaryCard(summary, "Локально", plan.localFileCount);
    summaryCard(summary, "Новые файлы", plan.downloadCount);
    summaryCard(summary, "Изменённые файлы", plan.updateCount);
    summaryCard(summary, "Удалить локально", plan.trashCount);
    summaryCard(summary, "Без действий", plan.skipCount);
    summaryCard(summary, "Объём загрузки", formatBytes(plan.totalDownloadBytes));
  }

  private renderActions(): void {
    if (this.actionsEl === undefined) return;
    this.actionsEl.empty();
    if (
      this.actions === undefined ||
      this.plan === undefined ||
      this.operationState.mode === "active"
    )
      return;
    actionButton(
      this.actionsEl,
      "Синхронизировать всё",
      this.actions.syncAll,
      this.plan.downloadCount + this.plan.updateCount === 0,
    );
    actionButton(
      this.actionsEl,
      "Только новые файлы",
      this.actions.downloadNew,
      this.plan.downloadCount === 0,
    );
    actionButton(
      this.actionsEl,
      "Только обновления",
      this.actions.updateExisting,
      this.plan.updateCount === 0,
    );
  }
}

function actionButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void,
  disabled: boolean,
): void {
  const button = parent.createEl("button", { text: label, cls: "syncer-plan-action" });
  button.disabled = disabled;
  button.addEventListener("click", onClick);
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
