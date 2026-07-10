import { describe, expect, it } from "vitest";
import {
  emptySyncState,
  isSnapshotBoundTo,
  migrateSyncState,
} from "../src/sync/sync-state-repository";

describe("sync state migration", () => {
  it("returns empty current state for unknown schema", () => {
    expect(migrateSyncState({ schemaVersion: 999, files: { "A.md": {} } })).toEqual(
      emptySyncState(),
    );
  });

  it("keeps current schema state", () => {
    const state = { schemaVersion: 1, lastSuccessfulSyncAt: 123, files: {} };
    expect(migrateSyncState(state)).toEqual(state);
  });

  it("drops an invalid file entry instead of trusting a partial snapshot", () => {
    expect(
      migrateSyncState({ schemaVersion: 1, files: { "A.md": { relativePath: "A.md" } } }),
    ).toEqual(emptySyncState());
  });

  it("requires provider and exact root for snapshot binding", () => {
    const state = migrateSyncState({
      schemaVersion: 1,
      providerType: "yandex-disk",
      remoteRootPath: "/Vault",
      files: {},
    });
    expect(isSnapshotBoundTo(state, "yandex-disk", "/Vault")).toBe(true);
    expect(isSnapshotBoundTo(state, "yandex-disk", "/Other")).toBe(false);
  });
});
