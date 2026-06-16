import type { DB } from "./db/connection.js";
import type { RateLimitResult } from "./rate-limit.js";

interface Row {
  window_start: number;
  count: number;
}

/**
 * SQLite-backed fixed-window rate limiter. Unlike the in-memory limiter, the
 * window state lives in a shared table, so limits hold across multiple app
 * instances that share the database. Each `check` is atomic (a transaction);
 * SQLite's write locking serializes concurrent instances. Swap for Redis if you
 * outgrow a single shared SQLite file.
 */
export class SqliteRateLimiter {
  constructor(
    private readonly db: DB,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const tx = this.db.transaction((): RateLimitResult => {
      const row = this.db
        .prepare("SELECT window_start, count FROM rate_limits WHERE key = ?")
        .get(key) as Row | undefined;

      let windowStart = row?.window_start ?? now;
      let count = row?.count ?? 0;
      if (!row || now - windowStart >= this.windowMs) {
        windowStart = now;
        count = 0;
      }

      const resetMs = windowStart + this.windowMs - now;
      const allowed = count < this.limit;
      if (allowed) count += 1;

      this.db
        .prepare(
          `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
        )
        .run(key, windowStart, count);

      return { allowed, remaining: Math.max(this.limit - count, 0), resetMs };
    });
    return tx();
  }

  /** Drop fully-elapsed windows (call periodically to cap table growth). */
  prune(now: number = Date.now()): void {
    this.db.prepare("DELETE FROM rate_limits WHERE ? - window_start >= ?").run(now, this.windowMs);
  }
}
