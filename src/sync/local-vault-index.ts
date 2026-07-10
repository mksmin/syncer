import { IntegrityError } from "../infrastructure/errors";
import type { LocalFile } from "../types/sync";
import { normalizeRelativePath } from "../utils/paths";

export interface VaultFileMetadata {
  path: string;
  stat: {
    size: number;
    mtime: number;
  };
}

export interface LocalVaultFileSource {
  getFiles(): readonly VaultFileMetadata[];
}

export class LocalVaultIndex {
  constructor(private readonly source: LocalVaultFileSource) {}

  listFiles(): LocalFile[] {
    const result: LocalFile[] = [];
    const paths = new Set<string>();
    for (const file of this.source.getFiles()) {
      const relativePath = normalizeRelativePath(file.path);
      if (relativePath === "") throw new IntegrityError("Локальный файл имеет пустой путь.");
      if (paths.has(relativePath)) {
        throw new IntegrityError(`Повторяющийся локальный путь: ${relativePath}`);
      }
      if (!isNonNegativeNumber(file.stat.size) || !isNonNegativeNumber(file.stat.mtime)) {
        throw new IntegrityError(`Некорректные метаданные локального файла: ${relativePath}`);
      }
      paths.add(relativePath);
      result.push({ relativePath, size: file.stat.size, modifiedAt: file.stat.mtime });
    }
    return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
}

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
