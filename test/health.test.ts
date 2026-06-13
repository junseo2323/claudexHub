import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { healthCheck } from "../src/domain/health.js";
import { checkRuntimeConfig } from "../src/runtime-checks.js";
import { freshDb } from "./helpers.js";

describe("healthCheck", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("reports ok with a reachable DB", () => {
    db = freshDb();
    const h = healthCheck(db);
    expect(h.ok).toBe(true);
    expect(h.db).toBe("ok");
    expect(h.cards).toBe(0);
    expect(h.embeddingProvider).toBe("noop");
    expect(h.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("reports error when the table is missing", () => {
    db = freshDb();
    db.exec("DROP TABLE context_cards");
    const h = healthCheck(db);
    expect(h.ok).toBe(false);
    expect(h.db).toBe("error");
  });
});

describe("checkRuntimeConfig", () => {
  it("returns no warnings outside production", () => {
    expect(checkRuntimeConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("errors on a missing/default AUTH_SECRET in production", () => {
    const w = checkRuntimeConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(w.some((x) => x.level === "error" && /AUTH_SECRET/.test(x.message))).toBe(true);

    const w2 = checkRuntimeConfig({
      NODE_ENV: "production",
      AUTH_SECRET: "dev-insecure-secret-change-me",
    } as NodeJS.ProcessEnv);
    expect(w2.some((x) => x.level === "error")).toBe(true);
  });

  it("is clean with a strong secret + GitHub OAuth + a real provider", () => {
    const w = checkRuntimeConfig({
      NODE_ENV: "production",
      AUTH_SECRET: "a-very-long-random-secret-value",
      GITHUB_CLIENT_ID: "id",
      GITHUB_CLIENT_SECRET: "secret",
      EMBEDDING_PROVIDER: "local",
    } as NodeJS.ProcessEnv);
    expect(w).toEqual([]);
  });
});
