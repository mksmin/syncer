import { CURRENT_DATA_SCHEMA_VERSION } from "../constants";
import type { SyncState } from "../types/state";

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
  return value as unknown as SyncState;
}

function asPersistedData(value: unknown): PersistedData {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
