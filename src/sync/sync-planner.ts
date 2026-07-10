import type { PathFilter } from "../filters/path-filter";
import type { RemoteFile } from "../types/remote";
import type {
  LocalFile,
  SkipReason,
  SyncOperation,
  SyncPlan,
  SyncPlannerInput,
} from "../types/sync";
import { normalizeRelativePath } from "../utils/paths";
import { assessDeletion } from "./deletion-safety";
import { compareFile } from "./file-comparator";

export interface SyncPlanner {
  createPlan(input: SyncPlannerInput): SyncPlan;
}

export class PullSyncPlanner implements SyncPlanner {
  constructor(
    private readonly pathFilter: PathFilter,
    private readonly now: () => number = Date.now,
  ) {}

  createPlan(input: SyncPlannerInput): SyncPlan {
    const remote = indexRemote(input.remoteFiles);
    const local = indexLocal(input.localFiles);
    const allPaths = [...new Set([...remote.keys(), ...local.keys()])].sort((a, b) =>
      a.localeCompare(b),
    );
    const eligibleLocalCount = [...local.keys()].filter((path) =>
      this.pathFilter.isIncluded(path),
    ).length;
    const prospectiveDeleteCount = allPaths.filter(
      (path) =>
        local.has(path) &&
        !remote.has(path) &&
        this.pathFilter.isIncluded(path) &&
        input.deleteMissingLocalFiles,
    ).length;
    const deletionAssessment = assessDeletion({
      deleteCount: prospectiveDeleteCount,
      eligibleLocalFileCount: eligibleLocalCount,
      remoteIndexComplete: input.remoteIndexComplete,
      remoteRootExists: input.remoteRootExists,
      remoteRootChanged: input.remoteRootChanged,
      settings: input.deletionSafety,
    });

    const operations = allPaths.map((path) =>
      this.planPath(path, remote.get(path), local.get(path), input, deletionAssessment.allowed),
    );

    return summarize(
      operations,
      input.remoteFiles.length,
      input.localFiles.length,
      this.now(),
      deletionAssessment,
    );
  }

  private planPath(
    path: string,
    remote: RemoteFile | undefined,
    local: LocalFile | undefined,
    input: SyncPlannerInput,
    deletionAllowed: boolean,
  ): SyncOperation {
    if (!this.pathFilter.isIncluded(path)) {
      return skip(path, "EXCLUDED", remote, local);
    }

    if (remote !== undefined && remote.size > input.maxFileSizeBytes) {
      return skip(path, "FILE_TOO_LARGE", remote, local);
    }

    if (remote !== undefined && local === undefined) {
      return { type: "DOWNLOAD_NEW", relativePath: path, remoteFile: remote };
    }

    if (remote !== undefined && local !== undefined) {
      const previous = input.previousState.files[path];
      return compareFile(remote, local, previous) === "same"
        ? skip(path, "UNCHANGED", remote, local)
        : { type: "UPDATE_LOCAL", relativePath: path, remoteFile: remote, localFile: local };
    }

    if (local === undefined) {
      throw new Error(`Planner invariant failed for path: ${path}`);
    }
    if (!input.deleteMissingLocalFiles) {
      return skip(path, "DELETION_DISABLED", undefined, local);
    }
    if (!deletionAllowed) {
      return skip(path, deletionBlockedReason(input), undefined, local);
    }
    return { type: "TRASH_LOCAL", relativePath: path, localFile: local };
  }
}

function deletionBlockedReason(input: SyncPlannerInput): SkipReason {
  if (!input.remoteRootExists) return "UNSAFE_REMOTE_ROOT";
  if (!input.remoteIndexComplete) return "REMOTE_INDEX_INCOMPLETE";
  return "REMOTE_ROOT_CHANGED";
}

function indexRemote(files: readonly RemoteFile[]): Map<string, RemoteFile> {
  return indexFiles(
    files,
    (file) => file.relativePath,
    (file, path) => ({
      ...file,
      relativePath: path,
    }),
  );
}

function indexLocal(files: readonly LocalFile[]): Map<string, LocalFile> {
  return indexFiles(
    files,
    (file) => file.relativePath,
    (file, path) => ({
      ...file,
      relativePath: path,
    }),
  );
}

function indexFiles<T>(
  files: readonly T[],
  getPath: (file: T) => string,
  normalize: (file: T, path: string) => T,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const file of files) {
    const path = normalizeRelativePath(getPath(file));
    if (path === "") throw new Error("A file path cannot be empty.");
    if (result.has(path)) throw new Error(`Duplicate normalized path: ${path}`);
    result.set(path, normalize(file, path));
  }
  return result;
}

function skip(
  relativePath: string,
  reason: SkipReason,
  remoteFile?: RemoteFile,
  localFile?: LocalFile,
): SyncOperation {
  return {
    type: "SKIP",
    relativePath,
    reason,
    ...(remoteFile === undefined ? {} : { remoteFile }),
    ...(localFile === undefined ? {} : { localFile }),
  };
}

function summarize(
  operations: SyncOperation[],
  remoteFileCount: number,
  localFileCount: number,
  createdAt: number,
  deletionAssessment: SyncPlan["deletionAssessment"],
): SyncPlan {
  return {
    createdAt,
    remoteFileCount,
    localFileCount,
    operations,
    downloadCount: operations.filter((operation) => operation.type === "DOWNLOAD_NEW").length,
    updateCount: operations.filter((operation) => operation.type === "UPDATE_LOCAL").length,
    trashCount: operations.filter((operation) => operation.type === "TRASH_LOCAL").length,
    skipCount: operations.filter((operation) => operation.type === "SKIP").length,
    totalDownloadBytes: operations.reduce(
      (total, operation) =>
        operation.type === "DOWNLOAD_NEW" || operation.type === "UPDATE_LOCAL"
          ? total + operation.remoteFile.size
          : total,
      0,
    ),
    deletionAssessment,
  };
}
