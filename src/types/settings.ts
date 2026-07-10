import { DEFAULT_EXCLUDE_PATTERNS, DEFAULT_MAX_FILE_SIZE_BYTES } from "../constants";
import type { LogLevel } from "../infrastructure/logger";
import type { RemoteProviderType } from "./remote";

export interface DeletionSafetySettings {
  enabled: boolean;
  maxDeleteCount: number;
  maxDeletePercentage: number;
  requireConfirmationAboveLimit: boolean;
}

export interface WebDavSettings {
  baseUrl: string;
  username: string;
  password: string;
  remoteRootPath: string;
}

export interface SyncerSettings {
  schemaVersion: number;
  providerType: RemoteProviderType;
  remoteRootPath: string;
  syncOnStartup: boolean;
  startupDelaySeconds: number;
  deleteMissingLocalFiles: boolean;
  deletionSafety: DeletionSafetySettings;
  maxFileSizeBytes: number;
  concurrentDownloads: number;
  requestTimeoutMs: number;
  retryCount: number;
  excludePatterns: string[];
  syncObsidianConfig: boolean;
  showProgressModal: boolean;
  showNotice: boolean;
  logLevel: LogLevel;
  yandexAccessToken: string;
  yandexRefreshToken: string;
  yandexTokenExpiresAt: number;
  yandexClientId: string;
  yandexPendingPkceVerifier: string;
  yandexDeviceId: string;
  webdav: WebDavSettings;
}

export const DEFAULT_SETTINGS: SyncerSettings = {
  schemaVersion: 2,
  providerType: "yandex-disk",
  remoteRootPath: "/ObsidianVault",
  syncOnStartup: false,
  startupDelaySeconds: 5,
  deleteMissingLocalFiles: true,
  deletionSafety: {
    enabled: true,
    maxDeleteCount: 20,
    maxDeletePercentage: 20,
    requireConfirmationAboveLimit: true,
  },
  maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
  concurrentDownloads: 3,
  requestTimeoutMs: 30_000,
  retryCount: 3,
  excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  syncObsidianConfig: false,
  showProgressModal: true,
  showNotice: true,
  logLevel: "info",
  yandexAccessToken: "",
  yandexRefreshToken: "",
  yandexTokenExpiresAt: 0,
  yandexClientId: "",
  yandexPendingPkceVerifier: "",
  yandexDeviceId: "",
  webdav: {
    baseUrl: "",
    username: "",
    password: "",
    remoteRootPath: "",
  },
};
