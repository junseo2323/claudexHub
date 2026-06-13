import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { hubStats, reputationScore } from "../src/domain/stats.js";
import { freshDb } from "./helpers.js";

async function published(repo: Repository, title: string, env: Record<string, string> = {}) {
  return repo.createCard(
    cardInputSchema.parse({
      title,
      problem: `${title} problem`,
      environment: env,
      verifiedFix: ["fix"],
      verification: ["tested"],
      status: "published",
      visibility: "public",
    }),
  );
}

describe("hubStats", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("aggregates cards, reuse, tokens, stacks, and agents", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const a = await published(repo, "Cookie cross-site", { frontend: "Next.js 15", backend: "NestJS 10" });
    const b = await published(repo, "CloudFront 403", { frontend: "Next.js 15", deploy: "CloudFront" });

    await repo.recordUsage(a.id, { agent: "codex", outcome: "success", tokensBeforeEstimate: 10000, tokensAfterActual: 1000 });
    await repo.recordUsage(a.id, { agent: "claude_code", outcome: "success" });
    await repo.recordUsage(b.id, { agent: "codex", outcome: "failed" });

    const s = hubStats(db);
    expect(s.cardsTotal).toBe(2);
    expect(s.cardsPublished).toBe(2);
    expect(s.verifiedFixCount).toBe(2);
    expect(s.successfulReuseCount).toBe(2);
    expect(s.failedReuseCount).toBe(1);
    expect(s.reuseSuccessRate).toBeCloseTo(2 / 3, 5);
    expect(s.totalEstimatedTokensSaved).toBeGreaterThanOrEqual(9000);

    // Next.js appears in both cards -> normalized and top of the list.
    expect(s.topStacks[0].stack).toBe("Next.js");
    expect(s.topStacks[0].count).toBe(2);

    const codex = s.agentBreakdown.find((x) => x.agent === "codex")!;
    expect(codex.uses).toBe(2);
    expect(codex.failures).toBe(1);
    expect(codex.successRate).toBeCloseTo(0.5, 5);
    expect(codex.avgTokensSaved).toBe(4500);
  });

  it("counts stale cards and reflects them in the ratio", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const a = await published(repo, "Stale me");
    await published(repo, "Healthy");
    await repo.markStale(a.id, "outdated");

    const s = hubStats(db);
    expect(s.cardsStale).toBe(1);
    expect(s.staleCardRatio).toBeCloseTo(0.5, 5);
  });

  it("reputationScore follows the spec formula", () => {
    const score = reputationScore({
      verifiedFixCount: 4,
      successfulReuseCount: 3,
      totalEstimatedTokensSaved: 5000,
      failedReuseCount: 1,
      cardsStale: 2,
    });
    // 4*5 + 3*3 + 5000/1000 - 1*4 - 2*2 = 20 + 9 + 5 - 4 - 4 = 26
    expect(score).toBe(26);
  });
});
