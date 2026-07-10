import { Notice, Plugin, setIcon, TFile, type Vault } from "obsidian";
import { YANDEX_CLIENT_ID } from "./constants";
import { GlobPathFilter } from "./filters/path-filter";
import { errorMessage } from "./infrastructure/errors";
import { ConsoleLogger, type Logger } from "./infrastructure/logger";
import { ObsidianHttpTransport } from "./infrastructure/obsidian-http-transport";
import { YandexApiClient } from "./providers/yandex/yandex-api-client";
import { YandexAuthService } from "./providers/yandex/yandex-auth-service";
import { normalizeRemoteRoot } from "./providers/yandex/yandex-mappers";
import { YandexDiskProvider, type RemoteFolder } from "./providers/yandex/yandex-provider";
import { migrateSettings } from "./settings/settings-migration";
import { LocalVaultIndex } from "./sync/local-vault-index";
import { NewFileExecutor } from "./sync/new-file-executor";
import {
  UpdateFileExecutor,
  type UpdateFileVault,
  type UpdateVaultFile,
} from "./sync/update-file-executor";
import { SyncProgressReporter } from "./sync/progress-reporter";
import { migrateSyncPlan } from "./sync/sync-plan-storage";
import { PullSyncPlanner } from "./sync/sync-planner";
import { emptySyncState, isSnapshotBoundTo, migrateSyncState } from "./sync/sync-state-repository";
import type { DownloadNewOperation, SyncPlan, UpdateLocalOperation } from "./types/sync";
import type { CreatedFileResult } from "./types/execution";
import type { RemoteFile } from "./types/remote";
import type { SyncerSettings } from "./types/settings";
import type { SyncState } from "./types/state";
import { DryRunModal } from "./ui/dry-run-modal";
import { ConfirmationModal } from "./ui/confirmation-modal";
import { SyncerSettingTab } from "./ui/settings-tab";
import { YandexFolderPickerModal } from "./ui/yandex-folder-picker-modal";

const REMOTE_INDEX_CACHE_TTL_MS = 60_000;
const SYNC_COOLDOWN_MS = 30_000;

type PullSelection = "all" | "new" | "updates";

interface RemoteIndexCache {
  remoteRoot: string;
  files: readonly RemoteFile[];
  storedAt: number;
}

interface PluginData {
  settings: SyncerSettings;
  syncState: SyncState;
  lastPlan?: SyncPlan;
}

export default class SyncerPlugin extends Plugin {
  override settings = migrateSettings(undefined);
  private syncState = emptySyncState();
  private lastPlan: SyncPlan | undefined;
  private planning = false;
  private abortController: AbortController | undefined;
  private ribbonEl: HTMLElement | undefined;
  private logger: Logger = new ConsoleLogger("info");
  private readonly httpTransport = new ObsidianHttpTransport();
  private authService: YandexAuthService | undefined;
  private snapshotSaveChain = Promise.resolve();
  private remoteIndexCache: RemoteIndexCache | undefined;
  private lastSyncFinishedAt = 0;
  readonly progress = new SyncProgressReporter();

  override async onload(): Promise<void> {
    await this.loadPluginData();
    this.logger = new ConsoleLogger(this.settings.logLevel);
    this.authService = new YandexAuthService({
      clientId: YANDEX_CLIENT_ID,
      transport: this.httpTransport,
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      timeoutMs: () => this.settings.requestTimeoutMs,
    });
    this.addSettingTab(new SyncerSettingTab(this.app, this));

    this.ribbonEl = this.addRibbonIcon("cloud-download", "Показать план синхронизации", () => {
      void this.showDryRun();
    });
    this.ribbonEl.addClass("syncer-ribbon");

    this.addCommand({
      id: "show-dry-run",
      name: "Показать план синхронизации",
      callback: () => void this.showDryRun(),
    });
    this.addCommand({
      id: "sync-now",
      name: "Синхронизировать сейчас",
      callback: () => void this.preparePullSync(),
    });
    this.addCommand({
      id: "stop-sync",
      name: "Остановить синхронизацию",
      checkCallback: (checking) => {
        if (!this.planning) return false;
        if (!checking) this.cancel();
        return true;
      },
    });
    this.addCommand({
      id: "show-last-result",
      name: "Показать последний результат",
      callback: () => this.showLastPlan(),
    });
    this.addCommand({
      id: "check-connection",
      name: "Проверить подключение",
      callback: () => void this.checkYandexConnection(),
    });

    this.app.workspace.onLayoutReady(() => {
      this.progress.report({ stage: "idle", current: 0, total: 0, message: "Ожидание" });
      if (!this.settings.syncOnStartup) return;
      const timeoutId = window.setTimeout(() => {
        void this.preparePullSync(false);
      }, this.settings.startupDelaySeconds * 1_000);
      this.register(() => window.clearTimeout(timeoutId));
    });
  }

  override onunload(): void {
    this.abortController?.abort();
  }

  async saveSettings(): Promise<void> {
    this.snapshotSaveChain = this.snapshotSaveChain.then(
      () => this.savePluginData(),
      () => this.savePluginData(),
    );
    await this.snapshotSaveChain;
  }

  isYandexAuthorized(): boolean {
    return this.requireAuthService().isAuthorized();
  }

  async beginYandexAuthorization(): Promise<string> {
    return await this.requireAuthService().beginAuthorization();
  }

  async completeYandexAuthorization(code: string): Promise<void> {
    await this.requireAuthService().exchangeCode(code);
  }

  async forgetYandexAuthorization(): Promise<void> {
    await this.requireAuthService().forgetAuthorization();
    new Notice("Локальная авторизация Яндекс Диска удалена.");
  }

  async checkYandexConnection(): Promise<void> {
    try {
      const result = await this.createYandexProvider().validateConnection();
      new Notice(result.message);
    } catch (error: unknown) {
      new Notice(errorMessage(error));
    }
  }

  async updateRemoteRoot(value: string): Promise<void> {
    const nextRoot = normalizeRemoteRoot(value);
    if (nextRoot !== normalizeRemoteRoot(this.settings.remoteRootPath)) {
      this.syncState = emptySyncState();
      this.lastPlan = undefined;
      this.remoteIndexCache = undefined;
    }
    this.settings.remoteRootPath = nextRoot;
    await this.saveSettings();
  }

  openYandexFolderPicker(): void {
    new YandexFolderPickerModal(this.app, {
      initialPath: "/",
      listFolders: (path, signal) => this.listYandexFolders(path, signal),
      onChoose: (path) => this.updateRemoteRoot(path),
      onError: (error) => new Notice(errorMessage(error)),
    }).open();
  }

  async clearSnapshot(): Promise<void> {
    this.syncState = emptySyncState();
    await this.savePluginData();
    new Notice("Snapshot очищен. Файлы vault не изменены.");
  }

  cancel(): void {
    this.abortController?.abort();
    this.progress.report({
      stage: "cancelled",
      current: 0,
      total: 0,
      message: "Операция остановлена пользователем",
    });
  }

  private async showDryRun(): Promise<void> {
    if (this.planning) {
      new Notice(this.progress.getProgress().message);
      return;
    }

    this.planning = true;
    const controller = new AbortController();
    this.abortController = controller;
    this.setRibbonRunning(true);
    const modal = new DryRunModal(this.app);
    modal.open();
    try {
      this.progress.report({
        stage: "listing-remote",
        current: 0,
        total: 0,
        message: "Получение списка файлов Яндекс Диска…",
      });
      const localFiles = new LocalVaultIndex(this.app.vault).listFiles();
      const filter = new GlobPathFilter(this.settings.excludePatterns);
      const planner = new PullSyncPlanner(filter);
      const remoteRoot = normalizeRemoteRoot(this.settings.remoteRootPath);
      const snapshotBound = isSnapshotBoundTo(this.syncState, "yandex-disk", remoteRoot);
      const createPlan = (remoteFiles: readonly RemoteFile[], complete: boolean): SyncPlan =>
        planner.createPlan({
          remoteFiles: [...remoteFiles],
          localFiles,
          previousState: this.syncState,
          remoteIndexComplete: complete,
          remoteRootExists: true,
          snapshotMatchesRoot: snapshotBound,
          remoteRootChanged: !snapshotBound || this.syncState.lastSuccessfulSyncAt === undefined,
          deleteMissingLocalFiles: this.settings.deleteMissingLocalFiles,
          deletionSafety: this.settings.deletionSafety,
          maxFileSizeBytes: this.settings.maxFileSizeBytes,
        });
      const remoteFiles = await this.listRemoteFiles(
        remoteRoot,
        controller.signal,
        modal,
        createPlan,
      );
      this.lastPlan = createPlan(remoteFiles, true);
      await this.savePluginData();
      this.progress.report({
        stage: "completed",
        current: this.lastPlan.operations.length,
        total: this.lastPlan.operations.length,
        message: "План синхронизации готов; файлы не изменены",
      });
      modal.updatePlan(this.lastPlan, true);
      this.setPlanActions(modal, this.lastPlan, remoteRoot);
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      this.logger.error("Dry run failed", { error });
      this.progress.report({
        stage: "failed",
        current: 0,
        total: 0,
        message: "Не удалось подготовить план синхронизации",
      });
      modal.showError(errorMessage(error));
      new Notice(error instanceof Error ? error.message : String(error));
    } finally {
      this.planning = false;
      this.abortController = undefined;
      this.setRibbonRunning(false);
    }
  }

  private async preparePullSync(requireConfirmation = true): Promise<void> {
    if (this.planning) {
      new Notice(this.progress.getProgress().message);
      return;
    }
    const modal = new DryRunModal(this.app);
    modal.open();
    const plan = await this.preparePlanForExecution(modal);
    if (plan === undefined) return;
    const downloads = downloadOperations(plan);
    const updates = updateOperations(plan);
    if (downloads.length === 0 && updates.length === 0) {
      modal.setProgress("Новых и изменённых файлов нет", 1, 1);
      new Notice("Новых и изменённых файлов нет.");
      return;
    }
    const root = normalizeRemoteRoot(this.settings.remoteRootPath);
    this.setPlanActions(modal, plan, root);
    if (!requireConfirmation) {
      await this.executePullSync(downloads, updates, root, modal);
      return;
    }
    this.confirmPlanExecution(plan, "all", modal, root);
  }

  private async preparePlanForExecution(modal: DryRunModal): Promise<SyncPlan | undefined> {
    this.planning = true;
    const controller = new AbortController();
    this.abortController = controller;
    this.setRibbonRunning(true);
    try {
      const localFiles = new LocalVaultIndex(this.app.vault).listFiles();
      const remoteRoot = normalizeRemoteRoot(this.settings.remoteRootPath);
      const snapshotBound = isSnapshotBoundTo(this.syncState, "yandex-disk", remoteRoot);
      const planner = new PullSyncPlanner(new GlobPathFilter(this.settings.excludePatterns));
      const createPlan = (remoteFiles: readonly RemoteFile[], complete: boolean): SyncPlan =>
        planner.createPlan({
          remoteFiles: [...remoteFiles],
          localFiles,
          previousState: this.syncState,
          remoteIndexComplete: complete,
          remoteRootExists: true,
          snapshotMatchesRoot: snapshotBound,
          remoteRootChanged: !snapshotBound || this.syncState.lastSuccessfulSyncAt === undefined,
          deleteMissingLocalFiles: this.settings.deleteMissingLocalFiles,
          deletionSafety: this.settings.deletionSafety,
          maxFileSizeBytes: this.settings.maxFileSizeBytes,
        });
      const remoteFiles = await this.listRemoteFiles(
        remoteRoot,
        controller.signal,
        modal,
        createPlan,
      );
      const plan = createPlan(remoteFiles, true);
      modal.updatePlan(plan, true);
      this.lastPlan = plan;
      await this.savePluginData();
      return plan;
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        modal.showError(errorMessage(error));
        new Notice(errorMessage(error));
      }
      return undefined;
    } finally {
      this.planning = false;
      this.abortController = undefined;
      this.setRibbonRunning(false);
    }
  }

  private async executePullSync(
    downloads: readonly DownloadNewOperation[],
    updates: readonly UpdateLocalOperation[],
    remoteRoot: string,
    modal: DryRunModal,
  ): Promise<void> {
    if (normalizeRemoteRoot(this.settings.remoteRootPath) !== remoteRoot) {
      new Notice("Удалённый root изменился. Сначала создайте новый dry run.");
      return;
    }
    const cooldownRemaining = SYNC_COOLDOWN_MS - (Date.now() - this.lastSyncFinishedAt);
    if (cooldownRemaining > 0) {
      const seconds = Math.ceil(cooldownRemaining / 1_000);
      const message = `Синхронизация только что завершилась. Повторная проверка доступна через ${String(seconds)} сек.`;
      modal.setProgress(message, 1, 1);
      new Notice(message);
      return;
    }
    this.planning = true;
    const controller = new AbortController();
    this.abortController = controller;
    this.setRibbonRunning(true);
    const total = downloads.length + updates.length;
    modal.setProgress("Начало синхронизации…", 0, total);
    try {
      const provider = this.createYandexProvider();
      const executor = new NewFileExecutor({
        vault: this.app.vault,
        provider,
        concurrency: this.settings.concurrentDownloads,
        onCreated: (result) => this.recordCreatedFile(result, remoteRoot),
        onProgress: (completed, _downloadTotal, currentPath) => {
          modal.setProgress(
            `Новые ${String(completed)}/${String(downloads.length)}: ${currentPath}`,
            completed,
            total,
          );
        },
      });
      const newResult = await executor.execute(downloads, controller.signal);
      const updateResult =
        newResult.status === "cancelled"
          ? { status: "cancelled" as const, plannedCount: updates.length, updated: [], errors: [] }
          : await new UpdateFileExecutor({
              vault: createUpdateFileVault(this.app.vault),
              provider,
              concurrency: this.settings.concurrentDownloads,
              onUpdated: (result) => this.recordCreatedFile(result, remoteRoot),
              onProgress: (completed, _updateTotal, currentPath) => {
                modal.setProgress(
                  `Обновление ${String(completed)}/${String(updates.length)}: ${currentPath}`,
                  downloads.length + completed,
                  total,
                );
              },
            }).execute(updates, controller.signal);
      const errors = [...newResult.errors, ...updateResult.errors];
      const status =
        newResult.status === "cancelled" || updateResult.status === "cancelled"
          ? "cancelled"
          : errors.length > 0
            ? "completed-with-errors"
            : "completed";
      this.progress.report({
        stage: status,
        current: newResult.created.length + updateResult.updated.length,
        total,
        message: `Создано ${String(newResult.created.length)}; обновлено ${String(updateResult.updated.length)}; ошибок ${String(errors.length)}`,
      });
      new Notice(
        `Создано ${String(newResult.created.length)}, обновлено ${String(updateResult.updated.length)}, ошибок ${String(errors.length)}. Удаления не выполнялись.`,
        10_000,
      );
      modal.setProgress(
        status === "cancelled"
          ? "Синхронизация остановлена"
          : `Готово: новых ${String(newResult.created.length)}, обновлено ${String(updateResult.updated.length)}, ошибок ${String(errors.length)}`,
        total,
        total,
      );
      modal.showExecutionErrors(errors);
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        const message = errorMessage(error);
        this.logger.error("Pull sync failed", { error });
        this.progress.report({ stage: "failed", current: 0, total, message });
        modal.showError(message);
        new Notice(message, 10_000);
      }
    } finally {
      this.lastSyncFinishedAt = Date.now();
      this.planning = false;
      this.abortController = undefined;
      this.setRibbonRunning(false);
    }
  }

  private async recordCreatedFile(result: CreatedFileResult, remoteRoot: string): Promise<void> {
    const remote = result.remoteFile;
    this.syncState.providerType = "yandex-disk";
    this.syncState.remoteRootPath = remoteRoot;
    this.syncState.files[remote.relativePath] = {
      relativePath: remote.relativePath,
      remoteSize: remote.size,
      remoteModifiedAt: remote.modifiedAt,
      localSize: result.localSize,
      localModifiedAt: result.localModifiedAt,
      syncedAt: Date.now(),
      ...(remote.revision === undefined ? {} : { remoteRevision: remote.revision }),
      ...(remote.checksum === undefined ? {} : { remoteChecksum: remote.checksum }),
    };
    await this.saveSettings();
  }

  private showLastPlan(): void {
    if (this.lastPlan === undefined) {
      new Notice("Предыдущего плана нет.");
      return;
    }
    new DryRunModal(this.app, this.lastPlan).open();
  }

  private setPlanActions(modal: DryRunModal, plan: SyncPlan, remoteRoot: string): void {
    modal.setActions({
      syncAll: () => this.confirmPlanExecution(plan, "all", modal, remoteRoot),
      downloadNew: () => this.confirmPlanExecution(plan, "new", modal, remoteRoot),
      updateExisting: () => this.confirmPlanExecution(plan, "updates", modal, remoteRoot),
    });
  }

  private confirmPlanExecution(
    plan: SyncPlan,
    selection: PullSelection,
    modal: DryRunModal,
    remoteRoot: string,
  ): void {
    if (this.planning) {
      new Notice(this.progress.getProgress().message);
      return;
    }
    const downloads = selection === "updates" ? [] : downloadOperations(plan);
    const updates = selection === "new" ? [] : updateOperations(plan);
    if (downloads.length === 0 && updates.length === 0) {
      new Notice("Для выбранного действия нет файлов.");
      return;
    }
    const title =
      selection === "new"
        ? "Скачать новые файлы?"
        : selection === "updates"
          ? "Обновить изменённые файлы?"
          : "Синхронизировать все изменения?";
    const confirmLabel =
      selection === "new"
        ? "Скачать новые"
        : selection === "updates"
          ? "Обновить файлы"
          : "Синхронизировать всё";
    new ConfirmationModal(
      this.app,
      title,
      `Новых файлов: ${String(downloads.length)}. Изменённых файлов: ${String(updates.length)}. Удаления не выполняются.`,
      confirmLabel,
      () => this.executePullSync(downloads, updates, remoteRoot, modal),
    ).open();
  }

  private async listRemoteFiles(
    remoteRoot: string,
    signal: AbortSignal,
    modal: DryRunModal,
    createPlan: (files: readonly RemoteFile[], complete: boolean) => SyncPlan,
  ): Promise<RemoteFile[]> {
    const cache = this.remoteIndexCache;
    if (
      cache?.remoteRoot === remoteRoot &&
      Date.now() - cache.storedAt < REMOTE_INDEX_CACHE_TTL_MS
    ) {
      const files = [...cache.files];
      modal.setProgress("Использован свежий список файлов из кэша", 1, 1);
      modal.updatePlan(createPlan(files, true), true);
      return files;
    }
    const files = await this.createYandexProvider().listFiles(remoteRoot, signal, (batch) => {
      modal.setProgress(
        `Получено файлов: ${String(batch.discoveredFileCount)}; папок в очереди: ${String(batch.pendingFolderCount)}`,
      );
      modal.updatePlan(createPlan(batch.files, false), false);
    });
    this.remoteIndexCache = { remoteRoot, files: [...files], storedAt: Date.now() };
    return files;
  }

  private setRibbonRunning(running: boolean): void {
    if (this.ribbonEl === undefined) return;
    this.ribbonEl.toggleClass("is-planning", running);
    this.ribbonEl.setAttribute(
      "aria-label",
      running ? "Подготовка плана синхронизации…" : "Показать план синхронизации",
    );
    setIcon(this.ribbonEl, running ? "loader-circle" : "cloud-download");
  }

  private async loadPluginData(): Promise<void> {
    const data = asPluginData(await this.loadData());
    this.settings = migrateSettings(data?.settings);
    const conventionalConfigPattern = [".obsidian", "**"].join("/");
    const actualConfigPattern = `${this.app.vault.configDir}/**`;
    this.settings.excludePatterns = this.settings.excludePatterns.map((pattern) =>
      pattern === conventionalConfigPattern ? actualConfigPattern : pattern,
    );
    this.syncState = migrateSyncState(data?.syncState);
    this.lastPlan = migrateSyncPlan(data?.lastPlan);
  }

  private async savePluginData(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      syncState: this.syncState,
      ...(this.lastPlan === undefined ? {} : { lastPlan: this.lastPlan }),
    };
    await this.saveData(data);
  }

  private async listYandexFolders(path: string, signal: AbortSignal): Promise<RemoteFolder[]> {
    return await this.createYandexProvider().listFolders(path, signal);
  }

  private createYandexProvider(): YandexDiskProvider {
    const authService = this.requireAuthService();
    const client = new YandexApiClient({
      transport: this.httpTransport,
      accessToken: (signal) => authService.getValidAccessToken(signal),
      logger: this.logger,
      timeoutMs: this.settings.requestTimeoutMs,
      retryCount: this.settings.retryCount,
    });
    return new YandexDiskProvider(client, this.settings.remoteRootPath);
  }

  private requireAuthService(): YandexAuthService {
    if (this.authService === undefined) throw new Error("Yandex auth service is not initialized.");
    return this.authService;
  }
}

function asPluginData(value: unknown): Partial<PluginData> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function downloadOperations(plan: SyncPlan): DownloadNewOperation[] {
  return plan.operations.filter(
    (operation): operation is DownloadNewOperation => operation.type === "DOWNLOAD_NEW",
  );
}

function updateOperations(plan: SyncPlan): UpdateLocalOperation[] {
  return plan.operations.filter(
    (operation): operation is UpdateLocalOperation => operation.type === "UPDATE_LOCAL",
  );
}

function createUpdateFileVault(vault: Vault): UpdateFileVault {
  const findTFile = (file: UpdateVaultFile): TFile => {
    const entry = vault.getAbstractFileByPath(file.path);
    if (!(entry instanceof TFile)) throw new Error(`Локальный файл не найден: ${file.path}`);
    return entry;
  };
  return {
    getAbstractFileByPath: (path) => {
      const entry = vault.getAbstractFileByPath(path);
      return entry instanceof TFile ? entry : null;
    },
    readBinary: (file) => vault.readBinary(findTFile(file)),
    modify: (file, data) => vault.modify(findTFile(file), data),
    modifyBinary: (file, data) => vault.modifyBinary(findTFile(file), data),
  };
}
