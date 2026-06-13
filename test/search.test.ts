import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { SearchService } from "../src/domain/search.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { freshDb } from "./helpers.js";

async function seedThree(db: DB) {
  const repo = new Repository(db);
  await repo.createCard(
    cardInputSchema.parse({
      title: "OAuth cookie not stored cross-site",
      problem: "Set-Cookie present but cookie not sent on cross-site fetch",
      symptoms: ["cookie missing"],
      verifiedFix: ["SameSite=None; Secure", "credentials: include"],
      verification: ["cookie present"],
      environment: { frontend: "Next.js", backend: "NestJS" },
      status: "published",
      visibility: "public",
    }),
  );
  await repo.createCard(
    cardInputSchema.parse({
      title: "CloudFront SPA 403 on refresh",
      problem: "S3 returns 403 on deep-link refresh behind CloudFront",
      verifiedFix: ["map 403 to index.html"],
      status: "published",
      visibility: "public",
    }),
  );
  await repo.createCard(
    cardInputSchema.parse({
      title: "Draft only — should not appear",
      problem: "cookie oauth cross-site draft",
      status: "draft",
      visibility: "private",
    }),
  );
}

describe("hybrid search", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("ranks the relevant card first and returns brief shape", async () => {
    db = freshDb();
    await seedThree(db);
    const search = new SearchService(db);
    const results = await search.search({ query: "oauth cookie not stored cross site", stack: ["Next.js"] });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toMatch(/cookie/i);

    const brief = results[0];
    expect(brief).toHaveProperty("id");
    expect(brief).toHaveProperty("confidence");
    expect(brief).toHaveProperty("match_reason");
    expect(brief).toHaveProperty("fix_summary");
    expect(brief).toHaveProperty("tokens_estimate");
    expect(brief).toHaveProperty("risk");
    expect(Array.isArray(brief.fix_summary)).toBe(true);
    // No full body leaks into a brief.
    expect(brief).not.toHaveProperty("problem");
  });

  it("excludes draft cards from results", async () => {
    db = freshDb();
    await seedThree(db);
    const search = new SearchService(db);
    const results = await search.search({ query: "cookie oauth cross-site draft" });
    expect(results.find((r) => r.title.includes("Draft only"))).toBeUndefined();
  });

  it("min_confidence filters out low-confidence results", async () => {
    db = freshDb();
    await seedThree(db);
    const search = new SearchService(db);
    const all = await search.search({ query: "oauth cookie cross site" });
    const filtered = await search.search({ query: "oauth cookie cross site", minConfidence: 100 });
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    expect(filtered.every((r) => r.confidence >= 100)).toBe(true);
  });

  it("related() returns other viewable cards and excludes the card itself", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const a = await repo.createCard(
      cardInputSchema.parse({
        title: "OAuth cookie not stored cross-site",
        problem: "Set-Cookie present but cookie not sent on cross-site fetch",
        verifiedFix: ["SameSite=None; Secure"],
        status: "published",
        visibility: "public",
      }),
    );
    const b = await repo.createCard(
      cardInputSchema.parse({
        title: "CloudFront SPA 403 on refresh",
        problem: "S3 returns 403 on deep-link refresh behind CloudFront",
        verifiedFix: ["map 403 to index.html"],
        status: "published",
        visibility: "public",
      }),
    );
    const search = new SearchService(db);

    const related = await search.related(a.id, { limit: 3 });
    expect(related.find((r) => r.id === a.id)).toBeUndefined();
    expect(related.find((r) => r.id === b.id)).toBeTruthy();

    // canView predicate is honored: reject everything → empty.
    const none = await search.related(a.id, { limit: 3, canView: () => false });
    expect(none).toHaveLength(0);

    // Unknown card id yields no results.
    expect(await search.related("does-not-exist")).toHaveLength(0);
  });

  it("file path hints contribute to matching", async () => {
    db = freshDb();
    const repo = new Repository(db);
    await repo.createCard(
      cardInputSchema.parse({
        title: "Cookie helper bug",
        problem: "credentials include missing in the auth cookie helper",
        verifiedFix: ["add credentials: include"],
        status: "published",
        visibility: "public",
      }),
    );
    const search = new SearchService(db);
    // A vague query plus a telling file path should still surface the card.
    const results = await search.search({ query: "request fails", files: ["src/auth/cookie.ts"] });
    expect(results.find((r) => r.title === "Cookie helper bug")).toBeTruthy();
  });
});
