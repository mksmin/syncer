import { describe, expect, it } from "vitest";
import { selectPullOperations } from "../src/sync/sync-operation-selection";
import type { SyncPlan } from "../src/types/sync";

const plan = {
  operations: [
    { type: "DOWNLOAD_NEW", relativePath: "New.md", remoteFile: {} },
    { type: "UPDATE_LOCAL", relativePath: "Changed.md", remoteFile: {}, localFile: {} },
    { type: "SKIP", relativePath: "Same.md", reason: "UNCHANGED" },
  ],
} as unknown as SyncPlan;

describe("selectPullOperations", () => {
  it("selects new and update operations for all mode", () => {
    const selected = selectPullOperations(plan, "all");
    expect(selected.downloads.map((item) => item.relativePath)).toEqual(["New.md"]);
    expect(selected.updates.map((item) => item.relativePath)).toEqual(["Changed.md"]);
  });

  it("selects only new files", () => {
    const selected = selectPullOperations(plan, "new");
    expect(selected.downloads).toHaveLength(1);
    expect(selected.updates).toHaveLength(0);
  });

  it("selects only updates", () => {
    const selected = selectPullOperations(plan, "updates");
    expect(selected.downloads).toHaveLength(0);
    expect(selected.updates).toHaveLength(1);
  });
});
