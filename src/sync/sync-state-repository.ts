import { CURRENT_DATA_SCHEMA_VERSION } from "../constants";
import type { RemoteProviderType } from "../types/remote";
import type { SyncState } from "../types/state";
import type { SyncedFileState } from "../types/state";

export interface SyncStateRepository {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
  clear(): Promise<void>;
}

export interface PluginDataStore {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

interface PersistedData {
  syncState?: unknown;
  [key: string]: unknown;
}

export class PluginSyncStateRepository implements SyncStateRepository {
  constructor(private readonly store: PluginDataStore) {}

  async load(): Promise<SyncState> {
    const data = asPersistedData(await this.store.loadData());
    return migrateSyncState(data.syncState);
  }

  async save(state: SyncState): Promise<void> {
    const data = asPersistedData(await this.store.loadData());
    await this.store.saveData({ ...data, syncState: state });
  }

  async clear(): Promise<void> {
    await this.save(emptySyncState());
  }
}

export function emptySyncState(): SyncState {
  return { schemaVersion: CURRENT_DATA_SCHEMA_VERSION, files: {} };
}

export function migrateSyncState(value: unknown): SyncState {
  if (!isRecord(value)) return emptySyncState();
  if (value.schemaVersion !== CURRENT_DATA_SCHEMA_VERSION || !isRecord(value.files)) {
    return emptySyncState();
  }
  const files: Record<string, SyncedFileState> = {};
  for (const [path, entry] of Object.entries(value.files)) {
    const parsed = parseSyncedFileState(entry);
    if (parsed?.relativePath !== path) return emptySyncState();
    files[path] = parsed;
  }
  const providerType = parseProviderType(value.providerType);
  if (value.providerType !== undefined && providerType === undefined) return emptySyncState();
  const remoteRootPath = optionalString(value.remoteRootPath);
  if (value.remoteRootPath !== undefined && remoteRootPath === undefined) return emptySyncState();
  const lastSuccessfulSyncAt = optionalNonNegativeNumber(value.lastSuccessfulSyncAt);
  if (value.lastSuccessfulSyncAt !== undefined && lastSuccessfulSyncAt === undefined) {
    return emptySyncState();
  }
  return {
    schemaVersion: CURRENT_DATA_SCHEMA_VERSION,
    files,
    ...(providerType === undefined ? {} : { providerType }),
    ...(remoteRootPath === undefined ? {} : { remoteRootPath }),
    ...(lastSuccessfulSyncAt === undefined ? {} : { lastSuccessfulSyncAt }),
  };
}

export function isSnapshotBoundTo(
  state: SyncState,
  providerType: RemoteProviderType,
  remoteRootPath: string,
): boolean {
  return state.providerType === providerType && state.remoteRootPath === remoteRootPath;
}

function parseSyncedFileState(value: unknown): SyncedFileState | undefined {
  if (!isRecord(value)) return undefined;
  const relativePath = optionalString(value.relativePath);
  const remoteSize = optionalNonNegativeNumber(value.remoteSize);
  const remoteModifiedAt = optionalNonNegativeNumber(value.remoteModifiedAt);
  const localSize = optionalNonNegativeNumber(value.localSize);
  const localModifiedAt = optionalNonNegativeNumber(value.localModifiedAt);
  const syncedAt = optionalNonNegativeNumber(value.syncedAt);
  if (
    relativePath === undefined ||
    remoteSize === undefined ||
    remoteModifiedAt === undefined ||
    localSize === undefined ||
    localModifiedAt === undefined ||
    syncedAt === undefined
  ) {
    return undefined;
  }
  const remoteRevision = optionalString(value.remoteRevision);
  const remoteChecksum = optionalString(value.remoteChecksum);
  if (value.remoteRevision !== undefined && remoteRevision === undefined) return undefined;
  if (value.remoteChecksum !== undefined && remoteChecksum === undefined) return undefined;
  return {
    relativePath,
    remoteSize,
    remoteModifiedAt,
    localSize,
    localModifiedAt,
    syncedAt,
    ...(remoteRevision === undefined ? {} : { remoteRevision }),
    ...(remoteChecksum === undefined ? {} : { remoteChecksum }),
  };
}

function parseProviderType(value: unknown): RemoteProviderType | undefined {
  return value === "yandex-disk" || value === "webdav" ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function asPersistedData(value: unknown): PersistedData {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
