import { Notice, Plugin, setIcon } from "obsidian";
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
import { SyncProgressReporter } from "./sync/progress-reporter";
import { migrateSyncPlan } from "./sync/sync-plan-storage";
import { PullSyncPlanner } from "./sync/sync-planner";
import { emptySyncState, isSnapshotBoundTo, migrateSyncState } from "./sync/sync-state-repository";
import type { SyncPlan } from "./types/sync";
import type { SyncerSettings } from "./types/settings";
import type { SyncState } from "./types/state";
import { DryRunModal } from "./ui/dry-run-modal";
import { SyncerSettingTab } from "./ui/settings-tab";
import { YandexFolderPickerModal } from "./ui/yandex-folder-picker-modal";

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
  readonly progress = new SyncProgressReporter();

  override async onload(): Promise<void> {
    await this.loadPluginData();
    this.logger = new ConsoleLogger(this.settings.logLevel);
    this.authService = new YandexAuthService({
      transport: this.httpTransport,
      settings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      timeoutMs: () => this.settings.requestTimeoutMs,
    });
    this.addSettingTab(new SyncerSettingTab(this.app, this));

    this.ribbonEl = this.addRibbonIcon("cloud-download", "Показать dry run", () => {
      void this.showDryRun();
    });
    this.ribbonEl.addClass("syncer-ribbon");

    this.addCommand({
      id: "show-dry-run",
      name: "Показать предварительный план",
      callback: () => void this.showDryRun(),
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
    });
  }

  override onunload(): void {
    this.abortController?.abort();
  }

  async saveSettings(): Promise<void> {
    await this.savePluginData();
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
    }
    this.settings.remoteRootPath = nextRoot;
    await this.savePluginData();
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
    try {
      this.progress.report({
        stage: "listing-remote",
        current: 0,
        total: 0,
        message: "Получение списка файлов Яндекс Диска…",
      });
      const provider = this.createYandexProvider();
      const remoteFiles = await provider.listFiles(this.settings.remoteRootPath, controller.signal);

      this.progress.report({
        stage: "scanning-local",
        current: 0,
        total: 0,
        message: "Анализ локального vault…",
      });
      const localFiles = new LocalVaultIndex(this.app.vault).listFiles();

      this.progress.report({
        stage: "planning",
        current: 0,
        total: remoteFiles.length + localFiles.length,
        message: "Подготовка безопасного плана…",
      });
      const filter = new GlobPathFilter(this.settings.excludePatterns);
      const planner = new PullSyncPlanner(filter);
      const remoteRoot = normalizeRemoteRoot(this.settings.remoteRootPath);
      const snapshotBound = isSnapshotBoundTo(this.syncState, "yandex-disk", remoteRoot);
      this.lastPlan = planner.createPlan({
        remoteFiles,
        localFiles,
        previousState: this.syncState,
        remoteIndexComplete: true,
        remoteRootExists: true,
        remoteRootChanged: !snapshotBound,
        deleteMissingLocalFiles: this.settings.deleteMissingLocalFiles,
        deletionSafety: this.settings.deletionSafety,
        maxFileSizeBytes: this.settings.maxFileSizeBytes,
      });
      await this.savePluginData();
      this.progress.report({
        stage: "completed",
        current: this.lastPlan.operations.length,
        total: this.lastPlan.operations.length,
        message: "Dry run завершён; файловые операции не выполнялись",
      });
      this.showLastPlan();
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      this.logger.error("Dry run failed", { error });
      this.progress.report({
        stage: "failed",
        current: 0,
        total: 0,
        message: "Dry run завершился ошибкой",
      });
      new Notice(error instanceof Error ? error.message : String(error));
    } finally {
      this.planning = false;
      this.abortController = undefined;
      this.setRibbonRunning(false);
    }
  }

  private showLastPlan(): void {
    if (this.lastPlan === undefined) {
      new Notice("Предыдущего плана нет.");
      return;
    }
    new DryRunModal(this.app, this.lastPlan).open();
  }

  private setRibbonRunning(running: boolean): void {
    if (this.ribbonEl === undefined) return;
    this.ribbonEl.toggleClass("is-planning", running);
    this.ribbonEl.setAttribute("aria-label", running ? "Подготовка dry run…" : "Показать dry run");
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
