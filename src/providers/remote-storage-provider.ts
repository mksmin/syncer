import type { ConnectionCheckResult, RemoteFile, RemoteProviderType } from "../types/remote";

export interface RemoteStorageProvider {
  readonly type: RemoteProviderType;

  validateConnection(signal?: AbortSignal): Promise<ConnectionCheckResult>;

  listFiles(rootPath: string, signal?: AbortSignal): Promise<RemoteFile[]>;

  downloadFile(remotePath: string, signal?: AbortSignal): Promise<ArrayBuffer>;

  dispose?(): Promise<void>;
}
