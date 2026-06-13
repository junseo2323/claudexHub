import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import type { ContextCard } from "../src/domain/types.js";
import { Repository } from "../src/domain/repository.js";
import { SearchService, trackRecordFactor } from "../src/domain/search.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { freshDb } from "./helpers.js";

function card(over: Partial<ContextCard>): ContextCard {
  return {
    id: "c",
    title: "t",
    problem: "p",
    environment: {},
    symptoms: [],
    likelyCauses: [],
    failedAttempts: [],
    verifiedFix: [],
    verification: [],
    agentHint: "",
    sourceLinks: [],
    visibility: "public",
    status: "published",
    confidenceScore: 50,
    estimatedTokensSaved: 0,
    successfulReuseCount: 0,
    failedReuseCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

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

describe("trackRecordFactor", () => {
  it("is neutral with no signal, lifts proven cards, demotes poor ones", () => {
    expect(trackRecordFactor(card({}))).toBeCloseTo(1, 5);

    const proven = trackRecordFactor(
      card({ confidenceScore: 90, successfulReuseCount: 4, failedReuseCount: 0 }),
    );
    const poor = trackRecordFactor(
      card({ confidenceScore: 30, successfulReuseCount: 0, failedReuseCount: 4 }),
    );
    expect(proven).toBeGreaterThan(1);
    expect(poor).toBeLessThan(1);
    expect(proven).toBeGreaterThan(poor);
  });

  it("stays within bounds", () => {
    const hi = trackRecordFactor(card({ confidenceScore: 100, successfulReuseCount: 50 }));
    const lo = trackRecordFactor(card({ confidenceScore: 0, failedReuseCount: 50 }));
    expect(hi).toBeLessThanOrEqual(1.25);
    expect(lo).toBeGreaterThanOrEqual(0.6);
  });

  it("weights more reuse evidence more heavily", () => {
    const little = trackRecordFactor(card({ successfulReuseCount: 1 }));
    const lots = trackRecordFactor(card({ successfulReuseCount: 9 }));
    expect(lots).toBeGreaterThan(little);
  });
});

describe("hybrid search", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("a proven card outranks an equally-matching untested one", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const base = {
      problem: "kafka consumer rebalance storm causes duplicate processing",
      verifiedFix: ["tune session.timeout.ms"],
      status: "published" as const,
      visibility: "public" as const,
    };
    const proven = await repo.createCard(
      cardInputSchema.parse({ ...base, title: "Kafka rebalance storm duplicates A" }),
    );
    await repo.createCard(
      cardInputSchema.parse({ ...base, title: "Kafka rebalance storm duplicates B" }),
    );
    // Give the first card a strong reuse track record.
    for (let i = 0; i < 4; i++) {
      await repo.recordUsage(proven.id, { agent: "codex", outcome: "success" });
    }

    const results = await new SearchService(db).search({ query: "kafka rebalance storm duplicate" });
    expect(results[0].id).toBe(proven.id);
  });

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
