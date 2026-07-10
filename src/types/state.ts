import type { RemoteProviderType } from "./remote";

export interface SyncedFileState {
  relativePath: string;
  remoteSize: number;
  remoteModifiedAt: number;
  remoteRevision?: string;
  remoteChecksum?: string;
  localSize: number;
  localModifiedAt: number;
  syncedAt: number;
}

export interface SyncState {
  schemaVersion: number;
  lastSuccessfulSyncAt?: number;
  providerType?: RemoteProviderType;
  remoteRootPath?: string;
  files: Record<string, SyncedFileState>;
}
