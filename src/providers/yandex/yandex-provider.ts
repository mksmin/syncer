import { IntegrityError, RemoteNotFoundError } from "../../infrastructure/errors";
import type { ConnectionCheckResult, RemoteFile } from "../../types/remote";
import { throwIfAborted } from "../../utils/abort";
import type { RemoteStorageProvider } from "../remote-storage-provider";
import type { YandexApiClient } from "./yandex-api-client";
import { mapYandexFile, normalizeRemoteRoot } from "./yandex-mappers";
import type { YandexResource } from "./yandex-types";

const PAGE_SIZE = 100;

export interface RemoteFolder {
  name: string;
  path: string;
}

export interface YandexListingBatch {
  files: readonly RemoteFile[];
  discoveredFileCount: number;
  processedFolderCount: number;
  pendingFolderCount: number;
}

export class YandexDiskProvider implements RemoteStorageProvider {
  readonly type = "yandex-disk" as const;

  constructor(
    private readonly client: YandexApiClient,
    private readonly configuredRoot: string,
  ) {}

  async validateConnection(signal?: AbortSignal): Promise<ConnectionCheckResult> {
    await this.client.getDiskInfo(signal);
    const root = await this.client.getResource(
      normalizeRemoteRoot(this.configuredRoot),
      1,
      0,
      signal,
    );
    if (root.type !== "dir")
      throw new RemoteNotFoundError("Удалённый путь указывает на файл, а не папку.");
    return { ok: true, message: "Подключение к Яндекс Диску работает.", checkedAt: Date.now() };
  }

  async listFiles(
    rootPath: string,
    signal?: AbortSignal,
    onBatch?: (batch: YandexListingBatch) => void,
  ): Promise<RemoteFile[]> {
    const root = normalizeRemoteRoot(rootPath);
    const files: RemoteFile[] = [];
    const folders = [root];
    let processedFolderCount = 0;
    while (folders.length > 0) {
      throwIfAborted(signal);
      const folder = folders.shift();
      if (folder === undefined) break;
      await this.listDirectory(folder, signal, (children) => {
        for (const child of children) {
          if (child.type === "dir") folders.push(resourcePath(child));
          else files.push(mapYandexFile(child, root));
        }
        onBatch?.({
          files,
          discoveredFileCount: files.length,
          processedFolderCount,
          pendingFolderCount: folders.length,
        });
      });
      processedFolderCount += 1;
    }
    return files;
  }

  async listFolders(path: string, signal?: AbortSignal): Promise<RemoteFolder[]> {
    const children = await this.listDirectory(normalizeRemoteRoot(path), signal);
    return children
      .filter((child) => child.type === "dir")
      .map((child) => ({ name: child.name, path: normalizeRemoteRoot(resourcePath(child)) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async downloadFile(remotePath: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const link = await this.client.getDownloadLink(remotePath, signal);
    return await this.client.download(link.href, signal);
  }

  private async listDirectory(
    path: string,
    signal?: AbortSignal,
    onPage?: (items: readonly YandexResource[]) => void,
  ): Promise<YandexResource[]> {
    const result: YandexResource[] = [];
    let offset = 0;
    let total: number | undefined;
    do {
      throwIfAborted(signal);
      const resource = await this.client.getResource(path, PAGE_SIZE, offset, signal);
      if (resource.type !== "dir")
        throw new RemoteNotFoundError(`Удалённый путь ${path} не является папкой.`);
      const embedded = resource._embedded;
      if (embedded === undefined)
        throw new IntegrityError(`Яндекс Диск не вернул содержимое папки ${path}.`);
      total ??= embedded.total;
      if (embedded.total !== total || embedded.offset !== offset) {
        throw new IntegrityError(`Пагинация папки ${path} изменилась во время чтения.`);
      }
      if (embedded.items.length === 0 && offset < total) {
        throw new IntegrityError(`Яндекс Диск вернул неполную страницу папки ${path}.`);
      }
      result.push(...embedded.items);
      onPage?.(embedded.items);
      offset += embedded.items.length;
    } while (total !== undefined && offset < total);
    return result;
  }
}

function resourcePath(resource: YandexResource): string {
  return resource.path.startsWith("disk:") ? resource.path.slice(5) : resource.path;
}
