export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Milliseconds until the window resets. */
  resetMs: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * In-memory fixed-window rate limiter, keyed by an arbitrary string (e.g. IP).
 * Suitable for a single-instance deployment; swap for a shared store (Redis)
 * when running multiple instances. Deterministic — pass `now` for tests.
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(key, bucket);
    }
    const resetMs = bucket.windowStart + this.windowMs - now;
    if (bucket.count >= this.limit) {
      return { allowed: false, remaining: 0, resetMs };
    }
    bucket.count += 1;
    return { allowed: true, remaining: this.limit - bucket.count, resetMs };
  }

  /** Drop windows that have fully elapsed (call periodically to cap memory). */
  prune(now: number = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) this.buckets.delete(key);
    }
  }
}

/** Best-effort client IP from proxy headers, for keying the limiter. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
