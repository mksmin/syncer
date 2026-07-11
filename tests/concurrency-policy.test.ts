import { describe, expect, it } from "vitest";
import { effectiveDownloadConcurrency } from "../src/sync/concurrency-policy";

describe("effectiveDownloadConcurrency", () => {
  it("uses one job on mobile to bound download and backup memory", () => {
    expect(effectiveDownloadConcurrency(5, true)).toBe(1);
  });

  it("keeps configured desktop concurrency", () => {
    expect(effectiveDownloadConcurrency(3, false)).toBe(3);
  });

  it("never returns less than one", () => {
    expect(effectiveDownloadConcurrency(0, false)).toBe(1);
  });
});
