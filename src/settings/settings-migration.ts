import { DEFAULT_SETTINGS, type SyncerSettings } from "../types/settings";

export function migrateSettings(value: unknown): SyncerSettings {
  const input = isRecord(value) ? value : {};
  const deletion = isRecord(input.deletionSafety) ? input.deletionSafety : {};
  const webdav = isRecord(input.webdav) ? input.webdav : {};
  return {
    ...DEFAULT_SETTINGS,
    ...pickKnownSettings(input),
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    concurrentDownloads: clampInteger(input.concurrentDownloads, 1, 5, 3),
    deletionSafety: {
      ...DEFAULT_SETTINGS.deletionSafety,
      ...pickDeletionSettings(deletion),
      maxDeleteCount: clampInteger(deletion.maxDeleteCount, 0, 100_000, 20),
      maxDeletePercentage: clampNumber(deletion.maxDeletePercentage, 0, 100, 20),
    },
    excludePatterns: stringArray(input.excludePatterns, DEFAULT_SETTINGS.excludePatterns),
    maxFileSizeBytes: clampInteger(
      input.maxFileSizeBytes,
      1,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_SETTINGS.maxFileSizeBytes,
    ),
    webdav: {
      ...DEFAULT_SETTINGS.webdav,
      ...pickWebDavSettings(webdav),
    },
  };
}

export function createDiagnosticSettings(settings: SyncerSettings): Record<string, unknown> {
  return {
    ...settings,
    yandexAccessToken: "<redacted>",
    webdav: { ...settings.webdav, password: "<redacted>" },
  };
}

function pickKnownSettings(value: Record<string, unknown>): Partial<SyncerSettings> {
  const result: Partial<SyncerSettings> = {};
  if (value.providerType === "yandex-disk" || value.providerType === "webdav") {
    result.providerType = value.providerType;
  }
  assignString(result, "remoteRootPath", value.remoteRootPath);
  assignBoolean(result, "syncOnStartup", value.syncOnStartup);
  assignBoolean(result, "deleteMissingLocalFiles", value.deleteMissingLocalFiles);
  assignBoolean(result, "syncObsidianConfig", value.syncObsidianConfig);
  assignBoolean(result, "showProgressModal", value.showProgressModal);
  assignBoolean(result, "showNotice", value.showNotice);
  assignString(result, "yandexAccessToken", value.yandexAccessToken);
  assignString(result, "yandexClientId", value.yandexClientId);
  if (["error", "warn", "info", "debug"].includes(String(value.logLevel))) {
    result.logLevel = value.logLevel as SyncerSettings["logLevel"];
  }
  result.startupDelaySeconds = clampInteger(value.startupDelaySeconds, 0, 60, 5);
  result.requestTimeoutMs = clampInteger(value.requestTimeoutMs, 1_000, 120_000, 30_000);
  result.retryCount = clampInteger(value.retryCount, 0, 10, 3);
  return result;
}

function pickDeletionSettings(
  value: Record<string, unknown>,
): Partial<SyncerSettings["deletionSafety"]> {
  const result: Partial<SyncerSettings["deletionSafety"]> = {};
  assignBoolean(result, "enabled", value.enabled);
  assignBoolean(result, "requireConfirmationAboveLimit", value.requireConfirmationAboveLimit);
  return result;
}

function pickWebDavSettings(value: Record<string, unknown>): Partial<SyncerSettings["webdav"]> {
  const result: Partial<SyncerSettings["webdav"]> = {};
  assignString(result, "baseUrl", value.baseUrl);
  assignString(result, "username", value.username);
  assignString(result, "password", value.password);
  assignString(result, "remoteRootPath", value.remoteRootPath);
  return result;
}

function assignString<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (typeof value === "string") target[key] = value as T[keyof T];
}

function assignBoolean<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (typeof value === "boolean") target[key] = value as T[keyof T];
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) ? clampNumber(value, min, max, fallback) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function stringArray(value: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [...fallback];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
