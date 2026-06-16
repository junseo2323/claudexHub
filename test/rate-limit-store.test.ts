import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { SqliteRateLimiter } from "../src/rate-limit-store.js";
import { freshDb } from "./helpers.js";

describe("SqliteRateLimiter", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("allows up to the limit then blocks within a window", () => {
    db = freshDb();
    const rl = new SqliteRateLimiter(db, 3, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 100).allowed).toBe(true);
    const third = rl.check("a", 200);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(rl.check("a", 300).allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    db = freshDb();
    const rl = new SqliteRateLimiter(db, 1, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 500).allowed).toBe(false);
    expect(rl.check("a", 1000).allowed).toBe(true);
  });

  it("shares state across instances on the same DB (multi-node)", () => {
    db = freshDb();
    const node1 = new SqliteRateLimiter(db, 2, 1000);
    const node2 = new SqliteRateLimiter(db, 2, 1000);
    expect(node1.check("ip", 0).allowed).toBe(true);
    expect(node2.check("ip", 10).allowed).toBe(true);
    // Third request on either node is blocked — the window is shared.
    expect(node1.check("ip", 20).allowed).toBe(false);
    expect(node2.check("ip", 30).allowed).toBe(false);
  });

  it("prune drops elapsed windows", () => {
    db = freshDb();
    const rl = new SqliteRateLimiter(db, 1, 1000);
    rl.check("a", 0);
    rl.prune(2000);
    expect(rl.check("a", 2000).allowed).toBe(true);
  });
});
