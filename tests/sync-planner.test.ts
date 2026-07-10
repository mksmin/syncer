import { describe, expect, it } from "vitest";
import { GlobPathFilter } from "../src/filters/path-filter";
import { PullSyncPlanner } from "../src/sync/sync-planner";
import { emptySyncState } from "../src/sync/sync-state-repository";
import type { RemoteFile } from "../src/types/remote";
import type { LocalFile, SyncPlannerInput } from "../src/types/sync";
import type { SyncedFileState } from "../src/types/state";

const deletionSafety = {
  enabled: true,
  maxDeleteCount: 20,
  maxDeletePercentage: 20,
  requireConfirmationAboveLimit: true,
};

function remote(relativePath: string, overrides: Partial<RemoteFile> = {}): RemoteFile {
  return {
    path: `disk:/root/${relativePath}`,
    relativePath,
    name: relativePath.split("/").at(-1) ?? relativePath,
    size: 10,
    modifiedAt: 100,
    revision: "r1",
    ...overrides,
  };
}

function local(relativePath: string, overrides: Partial<LocalFile> = {}): LocalFile {
  return { relativePath, size: 10, modifiedAt: 100, ...overrides };
}

function input(overrides: Partial<SyncPlannerInput> = {}): SyncPlannerInput {
  return {
    remoteFiles: [],
    localFiles: [],
    previousState: emptySyncState(),
    remoteIndexComplete: true,
    remoteRootExists: true,
    snapshotMatchesRoot: true,
    remoteRootChanged: false,
    deleteMissingLocalFiles: true,
    deletionSafety,
    maxFileSizeBytes: 1_000,
    ...overrides,
  };
}

function planner(patterns: string[] = []): PullSyncPlanner {
  return new PullSyncPlanner(new GlobPathFilter(patterns), () => 123);
}

describe("PullSyncPlanner", () => {
  it("plans download for a new remote file", () => {
    const plan = planner().createPlan(input({ remoteFiles: [remote("A.md")] }));
    expect(plan.operations[0]?.type).toBe("DOWNLOAD_NEW");
    expect(plan.downloadCount).toBe(1);
  });

  it("plans update when size differs", () => {
    const plan = planner().createPlan(
      input({ remoteFiles: [remote("A.md", { size: 11 })], localFiles: [local("A.md")] }),
    );
    expect(plan.operations[0]?.type).toBe("UPDATE_LOCAL");
  });

  it("plans update when checksum differs", () => {
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("A.md", { checksum: "aaa", checksumAlgorithm: "md5" })],
        localFiles: [local("A.md", { checksum: "bbb", checksumAlgorithm: "md5" })],
      }),
    );
    expect(plan.operations[0]?.type).toBe("UPDATE_LOCAL");
  });

  it("skips when checksum matches", () => {
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("A.md", { checksum: "aaa", checksumAlgorithm: "md5" })],
        localFiles: [local("A.md", { checksum: "aaa", checksumAlgorithm: "md5" })],
      }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "UNCHANGED" });
  });

  it("uses stable snapshot without rehashing local file", () => {
    const state: SyncedFileState = {
      relativePath: "A.md",
      remoteSize: 10,
      remoteModifiedAt: 100,
      remoteRevision: "r1",
      localSize: 10,
      localModifiedAt: 100,
      syncedAt: 50,
    };
    const previousState = { ...emptySyncState(), files: { "A.md": state } };
    const plan = planner().createPlan(
      input({ remoteFiles: [remote("A.md")], localFiles: [local("A.md")], previousState }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "UNCHANGED" });
  });

  it("plans trash for local file absent remotely", () => {
    const plan = planner().createPlan(input({ localFiles: [local("Old.md")] }));
    expect(plan.operations[0]?.type).toBe("TRASH_LOCAL");
  });

  it("never trashes excluded local file", () => {
    const plan = planner(["Private/**"]).createPlan(input({ localFiles: [local("Private/A.md")] }));
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "EXCLUDED" });
  });

  it("never downloads excluded remote file", () => {
    const plan = planner(["Private/**"]).createPlan(
      input({ remoteFiles: [remote("Private/A.md")] }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "EXCLUDED" });
  });

  it("blocks deletion when remote index is incomplete", () => {
    const plan = planner().createPlan(
      input({ localFiles: [local("A.md")], remoteIndexComplete: false }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "REMOTE_INDEX_INCOMPLETE" });
    expect(plan.trashCount).toBe(0);
    expect(plan.deletionAssessment.deleteCount).toBe(1);
    expect(plan.deletionAssessment.allowed).toBe(false);
  });

  it("blocks deletion on first run after remote root change", () => {
    const plan = planner().createPlan(
      input({ localFiles: [local("A.md")], remoteRootChanged: true }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "REMOTE_ROOT_CHANGED" });
  });

  it("does not reuse file snapshot after remote root change", () => {
    const state: SyncedFileState = {
      relativePath: "A.md",
      remoteSize: 10,
      remoteModifiedAt: 100,
      remoteRevision: "r1",
      localSize: 10,
      localModifiedAt: 100,
      syncedAt: 50,
    };
    const previousState = { ...emptySyncState(), files: { "A.md": state } };
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("A.md")],
        localFiles: [local("A.md")],
        previousState,
        snapshotMatchesRoot: false,
        remoteRootChanged: true,
      }),
    );
    expect(plan.operations[0]?.type).toBe("UPDATE_LOCAL");
  });

  it("reuses a bound file snapshot while deletion trust is absent", () => {
    const state: SyncedFileState = {
      relativePath: "A.md",
      remoteSize: 10,
      remoteModifiedAt: 100,
      remoteRevision: "r1",
      localSize: 10,
      localModifiedAt: 100,
      syncedAt: 50,
    };
    const previousState = { ...emptySyncState(), files: { "A.md": state } };
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("A.md")],
        localFiles: [local("A.md"), local("Old.md")],
        previousState,
        snapshotMatchesRoot: true,
        remoteRootChanged: true,
      }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "UNCHANGED" });
    expect(plan.operations[1]).toMatchObject({ type: "SKIP", reason: "REMOTE_ROOT_CHANGED" });
  });

  it("requires confirmation above delete count", () => {
    const plan = planner().createPlan(
      input({
        localFiles: [local("A.md"), local("B.md")],
        deletionSafety: { ...deletionSafety, maxDeleteCount: 1, maxDeletePercentage: 100 },
      }),
    );
    expect(plan.deletionAssessment.countLimitExceeded).toBe(true);
    expect(plan.deletionAssessment.confirmationRequired).toBe(true);
  });

  it("requires confirmation above delete percentage", () => {
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("Keep.md")],
        localFiles: [local("Keep.md"), local("Delete.md")],
        deletionSafety: { ...deletionSafety, maxDeleteCount: 100, maxDeletePercentage: 20 },
      }),
    );
    expect(plan.deletionAssessment.deletePercentage).toBe(50);
    expect(plan.deletionAssessment.percentageLimitExceeded).toBe(true);
  });

  it("skips an oversized remote file", () => {
    const plan = planner().createPlan(
      input({ remoteFiles: [remote("Large.bin", { size: 2_000 })] }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", reason: "FILE_TOO_LARGE" });
  });

  it("compares Cyrillic paths", () => {
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("Заметки/Пример.md", { checksum: "x", checksumAlgorithm: "md5" })],
        localFiles: [local("Заметки/Пример.md", { checksum: "x", checksumAlgorithm: "md5" })],
      }),
    );
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", relativePath: "Заметки/Пример.md" });
  });

  it("normalizes slash forms", () => {
    const plan = planner().createPlan(
      input({
        remoteFiles: [remote("Folder\\A.md", { checksum: "x", checksumAlgorithm: "md5" })],
        localFiles: [local("/Folder//A.md", { checksum: "x", checksumAlgorithm: "md5" })],
      }),
    );
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({ type: "SKIP", relativePath: "Folder/A.md" });
  });

  it("rejects parent traversal", () => {
    expect(() => planner().createPlan(input({ remoteFiles: [remote("../secret.md")] }))).toThrow(
      "escapes the vault",
    );
  });
});
