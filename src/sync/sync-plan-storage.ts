import type { RemoteFile } from "../types/remote";
import type {
  DeletionAssessment,
  LocalFile,
  SkipReason,
  SyncOperation,
  SyncPlan,
} from "../types/sync";

const OPERATION_TYPES = new Set<SyncOperation["type"]>([
  "DOWNLOAD_NEW",
  "UPDATE_LOCAL",
  "TRASH_LOCAL",
  "SKIP",
]);
const SKIP_REASONS = new Set<SkipReason>([
  "UNCHANGED",
  "EXCLUDED",
  "FILE_TOO_LARGE",
  "DELETION_DISABLED",
  "REMOTE_INDEX_INCOMPLETE",
  "REMOTE_ROOT_CHANGED",
  "UNSAFE_REMOTE_ROOT",
]);

export function migrateSyncPlan(value: unknown): SyncPlan | undefined {
  if (!isRecord(value) || !Array.isArray(value.operations)) return undefined;
  if (!value.operations.every(isOperation) || !isDeletionAssessment(value.deletionAssessment)) {
    return undefined;
  }
  const numericKeys = [
    "createdAt",
    "remoteFileCount",
    "localFileCount",
    "downloadCount",
    "updateCount",
    "trashCount",
    "skipCount",
    "totalDownloadBytes",
  ] as const;
  if (!numericKeys.every((key) => isNonNegativeNumber(value[key]))) return undefined;
  const operations = value.operations;
  const expectedCounts = {
    downloadCount: operations.filter((operation) => operation.type === "DOWNLOAD_NEW").length,
    updateCount: operations.filter((operation) => operation.type === "UPDATE_LOCAL").length,
    trashCount: operations.filter((operation) => operation.type === "TRASH_LOCAL").length,
    skipCount: operations.filter((operation) => operation.type === "SKIP").length,
  };
  if (
    value.downloadCount !== expectedCounts.downloadCount ||
    value.updateCount !== expectedCounts.updateCount ||
    value.trashCount !== expectedCounts.trashCount ||
    value.skipCount !== expectedCounts.skipCount
  ) {
    return undefined;
  }
  const expectedBytes = operations.reduce(
    (total, operation) =>
      operation.type === "DOWNLOAD_NEW" || operation.type === "UPDATE_LOCAL"
        ? total + operation.remoteFile.size
        : total,
    0,
  );
  if (value.totalDownloadBytes !== expectedBytes) return undefined;
  return value as unknown as SyncPlan;
}

function isOperation(value: unknown): value is SyncOperation {
  if (!isRecord(value) || typeof value.relativePath !== "string") return false;
  if (!OPERATION_TYPES.has(value.type as SyncOperation["type"])) return false;
  if (value.type === "DOWNLOAD_NEW") {
    return isRemoteFile(value.remoteFile) && value.remoteFile.relativePath === value.relativePath;
  }
  if (value.type === "UPDATE_LOCAL") {
    return (
      isRemoteFile(value.remoteFile) &&
      value.remoteFile.relativePath === value.relativePath &&
      isLocalFile(value.localFile) &&
      value.localFile.relativePath === value.relativePath
    );
  }
  if (value.type === "TRASH_LOCAL") {
    return isLocalFile(value.localFile) && value.localFile.relativePath === value.relativePath;
  }
  return value.type === "SKIP" && SKIP_REASONS.has(value.reason as SkipReason);
}

function isRemoteFile(value: unknown): value is RemoteFile {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.relativePath === "string" &&
    typeof value.name === "string" &&
    isNonNegativeNumber(value.size) &&
    isNonNegativeNumber(value.modifiedAt)
  );
}

function isLocalFile(value: unknown): value is LocalFile {
  return (
    isRecord(value) &&
    typeof value.relativePath === "string" &&
    isNonNegativeNumber(value.size) &&
    isNonNegativeNumber(value.modifiedAt)
  );
}

function isDeletionAssessment(value: unknown): value is DeletionAssessment {
  return (
    isRecord(value) &&
    typeof value.allowed === "boolean" &&
    typeof value.confirmationRequired === "boolean" &&
    isNonNegativeNumber(value.deleteCount) &&
    isNonNegativeNumber(value.deletePercentage) &&
    typeof value.countLimitExceeded === "boolean" &&
    typeof value.percentageLimitExceeded === "boolean" &&
    (value.blockedReason === undefined ||
      value.blockedReason === "REMOTE_INDEX_INCOMPLETE" ||
      value.blockedReason === "REMOTE_ROOT_CHANGED" ||
      value.blockedReason === "UNSAFE_REMOTE_ROOT")
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
