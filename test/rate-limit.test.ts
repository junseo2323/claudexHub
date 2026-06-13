import { describe, it, expect } from "vitest";
import { FixedWindowRateLimiter, clientIp } from "../src/rate-limit.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit then blocks within a window", () => {
    const rl = new FixedWindowRateLimiter(3, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 100).allowed).toBe(true);
    const third = rl.check("a", 200);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(rl.check("a", 300).allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 500).allowed).toBe(false);
    expect(rl.check("a", 1000).allowed).toBe(true);
  });

  it("keys independently", () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
  });

  it("prune drops elapsed windows", () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    rl.check("a", 0);
    rl.prune(2000);
    // After pruning, the key starts fresh.
    expect(rl.check("a", 2000).allowed).toBe(true);
  });

  it("clientIp reads forwarded headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
