import { Notice, Plugin, setIcon } from "obsidian";
import { GlobPathFilter } from "./filters/path-filter";
import { ConsoleLogger, type Logger } from "./infrastructure/logger";
import { MockRemoteStorageProvider } from "./providers/mock/mock-provider";
import { migrateSettings } from "./settings/settings-migration";
import { SyncProgressReporter } from "./sync/progress-reporter";
import { PullSyncPlanner } from "./sync/sync-planner";
import { emptySyncState, migrateSyncState } from "./sync/sync-state-repository";
import type { RemoteFile } from "./types/remote";
import type { LocalFile, SyncPlan } from "./types/sync";
import type { SyncerSettings } from "./types/settings";
import type { SyncState } from "./types/state";
import { SyncerSettingTab } from "./ui/settings-tab";

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
  readonly progress = new SyncProgressReporter();

  override async onload(): Promise<void> {
    await this.loadPluginData();
    this.logger = new ConsoleLogger(this.settings.logLevel);
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
      callback: () => new Notice("Яндекс Диск будет подключён в v0.2.0."),
    });

    this.app.workspace.onLayoutReady(() => {
      this.progress.report({ stage: "idle", current: 0, total: 0, message: "Ожидание" });
    });
  }

  async saveSettings(): Promise<void> {
    await this.savePluginData();
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
    this.abortController = new AbortController();
    this.setRibbonRunning(true);
    try {
      this.progress.report({
        stage: "listing-remote",
        current: 0,
        total: 0,
        message: "Получение тестового remote index…",
      });
      const provider = new MockRemoteStorageProvider(demoRemoteFiles());
      const remoteFiles = await provider.listFiles(
        this.settings.remoteRootPath,
        this.abortController.signal,
      );

      this.progress.report({
        stage: "scanning-local",
        current: 0,
        total: 0,
        message: "Анализ локального vault…",
      });
      const localFiles = this.app.vault.getFiles().map<LocalFile>((file) => ({
        relativePath: file.path,
        size: file.stat.size,
        modifiedAt: file.stat.mtime,
      }));

      this.progress.report({
        stage: "planning",
        current: 0,
        total: remoteFiles.length + localFiles.length,
        message: "Подготовка безопасного плана…",
      });
      const filter = new GlobPathFilter(this.settings.excludePatterns);
      const planner = new PullSyncPlanner(filter);
      this.lastPlan = planner.createPlan({
        remoteFiles,
        localFiles,
        previousState: this.syncState,
        remoteIndexComplete: true,
        remoteRootExists: true,
        remoteRootChanged: false,
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
      if (this.abortController.signal.aborted) return;
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
    const plan = this.lastPlan;
    const confirm = plan.deletionAssessment.confirmationRequired
      ? "; удаления требуют подтверждения"
      : "";
    new Notice(
      `Dry run: новых ${String(plan.downloadCount)}, обновить ${String(plan.updateCount)}, в корзину ${String(plan.trashCount)}, пропустить ${String(plan.skipCount)}${confirm}. Файлы не изменены.`,
      10_000,
    );
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
    this.lastPlan = data?.lastPlan;
  }

  private async savePluginData(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      syncState: this.syncState,
      ...(this.lastPlan === undefined ? {} : { lastPlan: this.lastPlan }),
    };
    await this.saveData(data);
  }
}

function asPluginData(value: unknown): Partial<PluginData> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function demoRemoteFiles(): RemoteFile[] {
  return [
    {
      path: "disk:/ObsidianVault/Syncer - demo.md",
      relativePath: "Syncer - demo.md",
      name: "Syncer - demo.md",
      size: 128,
      modifiedAt: 0,
      revision: "mock-v1",
      mimeType: "text/markdown",
    },
  ];
}
