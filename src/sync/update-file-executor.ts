import { IntegrityError, SyncCancelledError, errorMessage } from "../infrastructure/errors";
import type { RemoteStorageProvider } from "../providers/remote-storage-provider";
import type { CreatedFileResult, UpdateFileExecutionResult } from "../types/execution";
import type { UpdateLocalOperation } from "../types/sync";
import { throwIfAborted } from "../utils/abort";
import { normalizeRelativePath } from "../utils/paths";
import { runBounded } from "./bounded-queue";
import { verifyDownloadedContent } from "./content-integrity";
import { decodeUtf8, isTextFile } from "./vault-content";

export interface UpdateVaultFile {
  path: string;
  stat: { size: number; mtime: number };
  children?: unknown;
}

export interface UpdateFileVault {
  getAbstractFileByPath(path: string): UpdateVaultFile | null;
  readBinary(file: UpdateVaultFile): Promise<ArrayBuffer>;
  modify(file: UpdateVaultFile, data: string): Promise<void>;
  modifyBinary(file: UpdateVaultFile, data: ArrayBuffer): Promise<void>;
}

export interface UpdateFileExecutorOptions {
  vault: UpdateFileVault;
  provider: RemoteStorageProvider;
  concurrency: number;
  onUpdated: (result: CreatedFileResult) => Promise<void>;
  onProgress?: (completed: number, total: number, currentPath: string) => void;
}

export class UpdateFileExecutor {
  constructor(private readonly options: UpdateFileExecutorOptions) {}

  async execute(
    operations: readonly UpdateLocalOperation[],
    signal?: AbortSignal,
  ): Promise<UpdateFileExecutionResult> {
    const updated: CreatedFileResult[] = [];
    const errors: UpdateFileExecutionResult["errors"] = [];
    let completed = 0;
    try {
      await runBounded(
        operations,
        this.options.concurrency,
        async (operation) => {
          try {
            const result = await this.updateOne(operation, signal);
            updated.push(result);
            await this.options.onUpdated(result);
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
      return { status: "cancelled", plannedCount: operations.length, updated, errors };
    }
    return {
      status: errors.length === 0 ? "completed" : "completed-with-errors",
      plannedCount: operations.length,
      updated,
      errors,
    };
  }

  private async updateOne(
    operation: UpdateLocalOperation,
    signal?: AbortSignal,
  ): Promise<CreatedFileResult> {
    throwIfAborted(signal);
    const path = normalizeRelativePath(operation.relativePath);
    this.requireUnchangedLocalFile(path, operation);
    const content = await this.options.provider.downloadFile(operation.remoteFile.path, signal);
    throwIfAborted(signal);
    await verifyDownloadedContent(operation.remoteFile, content);
    const file = this.requireUnchangedLocalFile(path, operation);
    const backup = await this.options.vault.readBinary(file);
    throwIfAborted(signal);
    this.requireUnchangedLocalFile(path, operation);
    try {
      if (isTextFile(operation.remoteFile.mimeType, path)) {
        await this.options.vault.modify(file, decodeUtf8(content, path));
      } else {
        await this.options.vault.modifyBinary(file, content);
      }
      const updatedFile = this.options.vault.getAbstractFileByPath(path);
      if (updatedFile === null || updatedFile.children !== undefined) {
        throw new IntegrityError(`Обновлённый файл не найден: ${path}`);
      }
      return {
        remoteFile: operation.remoteFile,
        localSize: updatedFile.stat.size,
        localModifiedAt: updatedFile.stat.mtime,
      };
    } catch (error: unknown) {
      try {
        await this.options.vault.modifyBinary(file, backup);
      } catch (restoreError: unknown) {
        throw new IntegrityError(
          `Не удалось обновить и восстановить ${path}: ${errorMessage(error)}; restore: ${errorMessage(restoreError)}`,
        );
      }
      throw new IntegrityError(`Обновление ${path} отменено; старая копия восстановлена.`);
    }
  }

  private requireUnchangedLocalFile(
    path: string,
    operation: UpdateLocalOperation,
  ): UpdateVaultFile {
    const file = this.options.vault.getAbstractFileByPath(path);
    if (file === null || file.children !== undefined) {
      throw new IntegrityError(`Локальный файл для обновления не найден: ${path}`);
    }
    if (
      file.stat.size !== operation.localFile.size ||
      file.stat.mtime !== operation.localFile.modifiedAt
    ) {
      throw new IntegrityError(`Локальный файл изменился после dry run: ${path}`);
    }
    return file;
  }
}
