import { describe, expect, it } from "vitest";
import { migrateSyncPlan } from "../src/sync/sync-plan-storage";
import type { SyncPlan } from "../src/types/sync";

const validPlan: SyncPlan = {
  createdAt: 1,
  remoteFileCount: 0,
  localFileCount: 0,
  operations: [],
  downloadCount: 0,
  updateCount: 0,
  trashCount: 0,
  skipCount: 0,
  totalDownloadBytes: 0,
  deletionAssessment: {
    allowed: true,
    confirmationRequired: false,
    deleteCount: 0,
    deletePercentage: 0,
    countLimitExceeded: false,
    percentageLimitExceeded: false,
  },
};

describe("sync plan storage", () => {
  it("keeps a valid persisted plan", () => {
    expect(migrateSyncPlan(validPlan)).toEqual(validPlan);
  });

  it("drops malformed persisted operations", () => {
    expect(migrateSyncPlan({ ...validPlan, operations: [{ type: "DELETE_REMOTE" }] })).toBe(
      undefined,
    );
  });

  it("drops invalid summary counters", () => {
    expect(migrateSyncPlan({ ...validPlan, downloadCount: -1 })).toBe(undefined);
  });

  it("drops inconsistent download totals", () => {
    expect(migrateSyncPlan({ ...validPlan, totalDownloadBytes: 1 })).toBe(undefined);
  });
});
