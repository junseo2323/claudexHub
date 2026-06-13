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
});
