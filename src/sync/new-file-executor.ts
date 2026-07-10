import { IntegrityError, SyncCancelledError, errorMessage } from "../infrastructure/errors";
import type { RemoteStorageProvider } from "../providers/remote-storage-provider";
import type { DownloadNewOperation } from "../types/sync";
import type { CreatedFileResult, NewFileExecutionResult } from "../types/execution";
import { throwIfAborted } from "../utils/abort";
import { normalizeRelativePath } from "../utils/paths";
import { runBounded } from "./bounded-queue";
import { verifyDownloadedContent } from "./content-integrity";
import { decodeUtf8, isTextFile } from "./vault-content";

interface VaultEntry {
  path: string;
  children?: unknown;
}

interface CreatedVaultFile extends VaultEntry {
  stat: { size: number; mtime: number };
}

export interface NewFileVault {
  getAbstractFileByPath(path: string): VaultEntry | null;
  createFolder(path: string): Promise<VaultEntry>;
  create(path: string, data: string): Promise<CreatedVaultFile>;
  createBinary(path: string, data: ArrayBuffer): Promise<CreatedVaultFile>;
}

export interface NewFileExecutorOptions {
  vault: NewFileVault;
  provider: RemoteStorageProvider;
  concurrency: number;
  onCreated: (result: CreatedFileResult) => Promise<void>;
  onProgress?: (completed: number, total: number, currentPath: string) => void;
}

export class NewFileExecutor {
  private readonly folderPromises = new Map<string, Promise<void>>();

  constructor(private readonly options: NewFileExecutorOptions) {}

  async execute(
    operations: readonly DownloadNewOperation[],
    signal?: AbortSignal,
  ): Promise<NewFileExecutionResult> {
    const created: CreatedFileResult[] = [];
    const errors: NewFileExecutionResult["errors"] = [];
    let completed = 0;
    try {
      await runBounded(
        operations,
        this.options.concurrency,
        async (operation) => {
          try {
            const result = await this.createOne(operation, signal);
            created.push(result);
            await this.options.onCreated(result);
          } catch (error: unknown) {
            if (error instanceof SyncCancelledError) throw error;
            errors.push({ relativePath: operation.relativePath, message: errorMessage(error) });
          } finally {
            completed += 1;
            this.options.onProgress?.(completed, operations.length, operation.relativePath);
          }
        },
        signal,
      );
    } catch (error: unknown) {
      if (!(error instanceof SyncCancelledError)) throw error;
      return { status: "cancelled", plannedCount: operations.length, created, errors };
    }
    return {
      status: errors.length === 0 ? "completed" : "completed-with-errors",
      plannedCount: operations.length,
      created,
      errors,
    };
  }

  private async createOne(
    operation: DownloadNewOperation,
    signal?: AbortSignal,
  ): Promise<CreatedFileResult> {
    throwIfAborted(signal);
    const path = normalizeRelativePath(operation.relativePath);
    if (this.options.vault.getAbstractFileByPath(path) !== null) {
      throw new IntegrityError(`Локальный путь уже существует, перезапись запрещена: ${path}`);
    }
    await this.ensureFolder(parentPath(path));
    const content = await this.options.provider.downloadFile(operation.remoteFile.path, signal);
    throwIfAborted(signal);
    await verifyDownloadedContent(operation.remoteFile, content);
    if (this.options.vault.getAbstractFileByPath(path) !== null) {
      throw new IntegrityError(`Локальный путь появился во время загрузки: ${path}`);
    }
    const file = isTextFile(operation.remoteFile.mimeType, path)
      ? await this.options.vault.create(path, decodeUtf8(content, path))
      : await this.options.vault.createBinary(path, content);
    return {
      remoteFile: operation.remoteFile,
      localSize: file.stat.size,
      localModifiedAt: file.stat.mtime,
    };
  }

  private async ensureFolder(path: string): Promise<void> {
    if (path === "") return;
    const existingPromise = this.folderPromises.get(path);
    if (existingPromise !== undefined) return await existingPromise;
    const promise = this.createFolder(path);
    this.folderPromises.set(path, promise);
    return await promise;
  }

  private async createFolder(path: string): Promise<void> {
    await this.ensureFolder(parentPath(path));
    const existing = this.options.vault.getAbstractFileByPath(path);
    if (existing !== null) {
      if (existing.children === undefined) {
        throw new IntegrityError(`Файл мешает создать папку: ${path}`);
      }
      return;
    }
    await this.options.vault.createFolder(path);
  }
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}
