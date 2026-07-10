import { SyncCancelledError } from "../../infrastructure/errors";
import type { ConnectionCheckResult, RemoteFile, RemoteProviderType } from "../../types/remote";
import type { RemoteStorageProvider } from "../remote-storage-provider";

export class MockRemoteStorageProvider implements RemoteStorageProvider {
  readonly type: RemoteProviderType;

  constructor(
    private readonly files: readonly RemoteFile[],
    private readonly contents: ReadonlyMap<string, ArrayBuffer> = new Map(),
    type: RemoteProviderType = "yandex-disk",
  ) {
    this.type = type;
  }

  async validateConnection(signal?: AbortSignal): Promise<ConnectionCheckResult> {
    throwIfAborted(signal);
    return { ok: true, message: "Mock provider is ready.", checkedAt: Date.now() };
  }

  async listFiles(_rootPath: string, signal?: AbortSignal): Promise<RemoteFile[]> {
    throwIfAborted(signal);
    return [...this.files];
  }

  async downloadFile(remotePath: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    throwIfAborted(signal);
    const value = this.contents.get(remotePath);
    if (value === undefined) throw new Error(`Mock file has no content: ${remotePath}`);
    return value.slice(0);
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new SyncCancelledError("Operation cancelled.");
}
