import { describe, expect, it } from "vitest";
import { GlobPathFilter } from "../src/filters/path-filter";
import { PullSyncPlanner } from "../src/sync/sync-planner";
import { emptySyncState } from "../src/sync/sync-state-repository";
import type { RemoteFile } from "../src/types/remote";
import type { LocalFile, SyncPlannerInput } from "../src/types/sync";

const deletionSafety = {
  enabled: true,
  maxDeleteCount: 20,
  maxDeletePercentage: 20,
  requireConfirmationAboveLimit: true,
};

function createInput(remoteFiles: RemoteFile[], localFiles: LocalFile[]): SyncPlannerInput {
  return {
    remoteFiles,
    localFiles,
    previousState: emptySyncState(),
    remoteIndexComplete: true,
    remoteRootExists: true,
    snapshotMatchesRoot: false,
    remoteRootChanged: true,
    deleteMissingLocalFiles: true,
    deletionSafety,
    maxFileSizeBytes: 50 * 1_024 * 1_024,
  };
}

function remote(relativePath: string): RemoteFile {
  return {
    path: `disk:/Vault/${relativePath}`,
    relativePath,
    name: relativePath.split("/").at(-1) ?? relativePath,
    size: 10,
    modifiedAt: 100,
    checksum: `md5-${relativePath}`,
    checksumAlgorithm: "md5",
  };
}

function local(file: RemoteFile): LocalFile {
  return {
    relativePath: file.relativePath,
    size: file.size,
    modifiedAt: file.modifiedAt,
    ...(file.checksum === undefined ? {} : { checksum: file.checksum }),
    ...(file.checksumAlgorithm === undefined ? {} : { checksumAlgorithm: file.checksumAlgorithm }),
  };
}

describe("sync stress", () => {
  it("plans 1,500 unchanged files without losing paths", () => {
    const remoteFiles = Array.from({ length: 1_500 }, (_, index) =>
      remote(`Папка ${String(index % 25)}/Заметка #${String(index)}.md`),
    );
    const plan = new PullSyncPlanner(new GlobPathFilter([]), () => 1).createPlan(
      createInput(remoteFiles, remoteFiles.map(local)),
    );
    expect(plan.operations).toHaveLength(1_500);
    expect(plan.skipCount).toBe(1_500);
    expect(new Set(plan.operations.map((operation) => operation.relativePath)).size).toBe(1_500);
  });

  it("preserves Cyrillic, emoji and reserved filename characters", () => {
    const paths = [
      "Основные/Мысли #100%.md",
      "Ресурсы/вопрос?.md",
      "Проекты/[архив]/план (финал).md",
      "Emoji/идея 🚀.md",
      "Quotes/О'Брайен.md",
    ];
    const remoteFiles = paths.map(remote);
    const plan = new PullSyncPlanner(new GlobPathFilter([]), () => 1).createPlan(
      createInput(remoteFiles, remoteFiles.map(local)),
    );
    expect(plan.operations.map((operation) => operation.relativePath)).toEqual(
      [...paths].sort((left, right) => left.localeCompare(right)),
    );
  });
});
