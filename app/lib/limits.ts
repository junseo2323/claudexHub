import { getDb } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrate.js";
import { SqliteRateLimiter } from "../../src/rate-limit-store.js";
import { clientIp, type RateLimitResult } from "../../src/rate-limit.js";

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    migrate(d);
    ready = true;
  }
  return d;
}

// Shared (cross-instance) limiters backed by the SQLite store.
//   auth: 20 attempts / IP / minute · api: 60 requests / IP / minute
export function rateLimitAuth(headers: Headers): RateLimitResult {
  return new SqliteRateLimiter(db(), 20, 60_000).check(clientIp(headers));
}

export function rateLimitApi(headers: Headers): RateLimitResult {
  return new SqliteRateLimiter(db(), 60, 60_000).check(clientIp(headers));
}
