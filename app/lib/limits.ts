import { FixedWindowRateLimiter, clientIp, type RateLimitResult } from "../../src/rate-limit.js";

// Up to 20 auth attempts per IP per minute (login/oauth handshakes).
const authLimiter = new FixedWindowRateLimiter(20, 60_000);

export function rateLimitAuth(headers: Headers): RateLimitResult {
  return authLimiter.check(clientIp(headers));
}
