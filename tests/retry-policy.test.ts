import { describe, expect, it } from "vitest";
import { parseRetryAfter, RetryPolicy } from "../src/sync/retry-policy";

describe("RetryPolicy", () => {
  it("retries only transient statuses within limit", () => {
    const policy = new RetryPolicy({ maxRetries: 3 });
    expect(policy.shouldRetry(503, 2)).toBe(true);
    expect(policy.shouldRetry(503, 3)).toBe(false);
    expect(policy.shouldRetry(401, 0)).toBe(false);
  });

  it("uses exponential backoff with bounded jitter", () => {
    const policy = new RetryPolicy({ maxRetries: 3, baseDelayMs: 500, random: () => 0.5 });
    expect(policy.delayMs(0, undefined)).toBe(550);
    expect(policy.delayMs(2, undefined)).toBe(2_200);
  });

  it("parses seconds and HTTP-date Retry-After", () => {
    expect(parseRetryAfter("15", 0)).toBe(15_000);
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:00:10 GMT", 1_000)).toBe(9_000);
  });
});
