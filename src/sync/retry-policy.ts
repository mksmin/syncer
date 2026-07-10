const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryPolicyOptions {
  maxRetries: number;
  baseDelayMs?: number;
  random?: () => number;
  now?: () => number;
}

export class RetryPolicy {
  private readonly baseDelayMs: number;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly options: RetryPolicyOptions) {
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  shouldRetry(status: number, attempt: number): boolean {
    return RETRYABLE_STATUSES.has(status) && attempt < this.options.maxRetries;
  }

  delayMs(attempt: number, retryAfter: string | undefined): number {
    const serverDelay = parseRetryAfter(retryAfter, this.now());
    if (serverDelay !== undefined) return serverDelay;
    const exponential = this.baseDelayMs * 2 ** attempt;
    const jitter = Math.floor(exponential * 0.2 * this.random());
    return exponential + jitter;
  }
}

export function parseRetryAfter(value: string | undefined, now: number): number | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
