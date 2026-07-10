import { describe, expect, it } from "vitest";
import {
  buildPlanSections,
  deletionWarning,
  formatBytes,
  operationDetail,
} from "../src/sync/sync-plan-report";
import type { SyncPlan } from "../src/types/sync";

function plan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
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
    ...overrides,
  };
}

describe("sync plan report", () => {
  it("groups operations and labels skip reasons", () => {
    const value = plan({
      operations: [
        {
          type: "DOWNLOAD_NEW",
          relativePath: "A.md",
          remoteFile: {
            path: "disk:/A.md",
            relativePath: "A.md",
            name: "A.md",
            size: 2_048,
            modifiedAt: 1,
          },
        },
        { type: "SKIP", relativePath: "B.md", reason: "EXCLUDED" },
      ],
    });
    expect(buildPlanSections(value).map((section) => section.title)).toEqual([
      "Скачать новые",
      "Пропустить",
    ]);
    const download = value.operations[0];
    const skip = value.operations[1];
    if (download === undefined || skip === undefined) throw new Error("Missing report operations.");
    expect(operationDetail(download)).toBe("2.00 КБ");
    expect(operationDetail(skip)).toBe("Исключено фильтром");
  });

  it("describes blocked deletion candidates", () => {
    const value = plan({
      deletionAssessment: {
        allowed: false,
        confirmationRequired: false,
        blockedReason: "REMOTE_ROOT_CHANGED",
        deleteCount: 7,
        deletePercentage: 70,
        countLimitExceeded: false,
        percentageLimitExceeded: true,
      },
    });
    expect(deletionWarning(value)).toContain("Кандидатов: 7");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(42)).toBe("42 Б");
    expect(formatBytes(5 * 1_024 * 1_024)).toBe("5.00 МБ");
  });
});
