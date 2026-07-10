import { IntegrityError, SyncCancelledError, errorMessage } from "../infrastructure/errors";
import type { TrashFileExecutionResult } from "../types/execution";
import type { TrashLocalOperation } from "../types/sync";
import { throwIfAborted } from "../utils/abort";
import { normalizeRelativePath } from "../utils/paths";

export interface TrashVaultFile {
  path: string;
  stat: { size: number; mtime: number };
  children?: unknown;
}

export interface TrashFileVault {
  getAbstractFileByPath(path: string): TrashVaultFile | null;
}

export interface LocalTrashManager {
  trashFile(file: TrashVaultFile): Promise<void>;
}

export interface TrashFileExecutorOptions {
  vault: TrashFileVault;
  fileManager: LocalTrashManager;
  onTrashed: (relativePath: string) => Promise<void>;
  onProgress?: (completed: number, total: number, currentPath: string) => void;
}

export class TrashFileExecutor {
  constructor(private readonly options: TrashFileExecutorOptions) {}

  async execute(
    operations: readonly TrashLocalOperation[],
    signal?: AbortSignal,
  ): Promise<TrashFileExecutionResult> {
    const trashed: string[] = [];
    const errors: TrashFileExecutionResult["errors"] = [];
    let completed = 0;
    for (const operation of operations) {
      let attempted = false;
      try {
        throwIfAborted(signal);
        attempted = true;
        const path = await this.trashOne(operation);
        trashed.push(path);
        await this.options.onTrashed(path);
      } catch (error: unknown) {
        if (error instanceof SyncCancelledError) {
          return { status: "cancelled", plannedCount: operations.length, trashed, errors };
        }
        errors.push({ relativePath: operation.relativePath, message: errorMessage(error) });
      } finally {
        if (attempted) {
          completed += 1;
          this.options.onProgress?.(completed, operations.length, operation.relativePath);
        }
      }
    }
    return {
      status: errors.length === 0 ? "completed" : "completed-with-errors",
      plannedCount: operations.length,
      trashed,
      errors,
    };
  }

  private async trashOne(operation: TrashLocalOperation): Promise<string> {
    const path = normalizeRelativePath(operation.relativePath);
    const file = this.options.vault.getAbstractFileByPath(path);
    if (file === null || file.children !== undefined) {
      throw new IntegrityError(`Локальный файл для перемещения в корзину не найден: ${path}`);
    }
    if (
      file.stat.size !== operation.localFile.size ||
      file.stat.mtime !== operation.localFile.modifiedAt
    ) {
      throw new IntegrityError(`Локальный файл изменился после подготовки плана: ${path}`);
    }
    await this.options.fileManager.trashFile(file);
    return path;
  }
}
