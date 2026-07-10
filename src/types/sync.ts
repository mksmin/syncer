import type { RemoteFile } from "./remote";
import type { DeletionSafetySettings } from "./settings";
import type { SyncState } from "./state";

export interface LocalFile {
  relativePath: string;
  size: number;
  modifiedAt: number;
  checksum?: string;
  checksumAlgorithm?: "md5" | "sha256";
}

interface SyncOperationBase {
  relativePath: string;
}

export interface DownloadNewOperation extends SyncOperationBase {
  type: "DOWNLOAD_NEW";
  remoteFile: RemoteFile;
}

export interface UpdateLocalOperation extends SyncOperationBase {
  type: "UPDATE_LOCAL";
  remoteFile: RemoteFile;
  localFile: LocalFile;
}

export interface TrashLocalOperation extends SyncOperationBase {
  type: "TRASH_LOCAL";
  localFile: LocalFile;
}

export type SkipReason =
  | "UNCHANGED"
  | "EXCLUDED"
  | "FILE_TOO_LARGE"
  | "DELETION_DISABLED"
  | "REMOTE_INDEX_INCOMPLETE"
  | "REMOTE_ROOT_CHANGED"
  | "UNSAFE_REMOTE_ROOT";

export interface SkipOperation extends SyncOperationBase {
  type: "SKIP";
  reason: SkipReason;
  remoteFile?: RemoteFile;
  localFile?: LocalFile;
}

export type SyncOperation =
  DownloadNewOperation | UpdateLocalOperation | TrashLocalOperation | SkipOperation;

export interface DeletionAssessment {
  allowed: boolean;
  confirmationRequired: boolean;
  blockedReason?: "REMOTE_INDEX_INCOMPLETE" | "REMOTE_ROOT_CHANGED" | "UNSAFE_REMOTE_ROOT";
  deleteCount: number;
  deletePercentage: number;
  countLimitExceeded: boolean;
  percentageLimitExceeded: boolean;
}

export interface SyncPlan {
  createdAt: number;
  remoteFileCount: number;
  localFileCount: number;
  operations: SyncOperation[];
  downloadCount: number;
  updateCount: number;
  trashCount: number;
  skipCount: number;
  totalDownloadBytes: number;
  deletionAssessment: DeletionAssessment;
}

export interface SyncPlannerInput {
  remoteFiles: RemoteFile[];
  localFiles: LocalFile[];
  previousState: SyncState;
  remoteIndexComplete: boolean;
  remoteRootExists: boolean;
  snapshotMatchesRoot: boolean;
  remoteRootChanged: boolean;
  deleteMissingLocalFiles: boolean;
  deletionSafety: DeletionSafetySettings;
  maxFileSizeBytes: number;
}

export type SyncStage =
  | "idle"
  | "connecting"
  | "listing-remote"
  | "scanning-local"
  | "planning"
  | "downloading"
  | "updating"
  | "trashing"
  | "completed"
  | "completed-with-errors"
  | "cancelled"
  | "failed";

export interface SyncProgress {
  stage: SyncStage;
  current: number;
  total: number;
  currentPath?: string;
  processedBytes?: number;
  totalBytes?: number;
  message: string;
}

export interface ProgressSink {
  report(progress: SyncProgress): void;
}
