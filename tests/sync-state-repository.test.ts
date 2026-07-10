import { describe, expect, it } from "vitest";
import { emptySyncState, migrateSyncState } from "../src/sync/sync-state-repository";

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
});
