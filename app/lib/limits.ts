import { FixedWindowRateLimiter, clientIp, type RateLimitResult } from "../../src/rate-limit.js";

// Up to 20 auth attempts per IP per minute (login/oauth handshakes).
const authLimiter = new FixedWindowRateLimiter(20, 60_000);

export function rateLimitAuth(headers: Headers): RateLimitResult {
  return authLimiter.check(clientIp(headers));
}

// Up to 60 programmatic API requests per IP per minute.
const apiLimiter = new FixedWindowRateLimiter(60, 60_000);

export function rateLimitApi(headers: Headers): RateLimitResult {
  return apiLimiter.check(clientIp(headers));
}
