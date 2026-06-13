import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { UserRepository } from "../src/domain/users.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { leaderboard, userStats } from "../src/domain/stats.js";
import { freshDb } from "./helpers.js";

async function publish(repo: Repository, title: string) {
  return repo.createCard(
    cardInputSchema.parse({
      title,
      problem: `${title} problem`,
      verifiedFix: ["fix"],
      verification: ["tested"],
      status: "published",
      visibility: "public",
    }),
  );
}

describe("users + authorship", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("upserts GitHub users idempotently and creates local users", () => {
    db = freshDb();
    const users = new UserRepository(db);
    const a = users.upsertByGithub({ githubId: "42", login: "octocat", name: "Octo" });
    const again = users.upsertByGithub({ githubId: "42", login: "octocat-renamed" });
    expect(again.id).toBe(a.id);
    expect(users.getByGithubId("42")!.login).toBe("octocat-renamed");

    const local = users.getOrCreateLocal("alice", "Alice");
    expect(users.getOrCreateLocal("alice").id).toBe(local.id);
    expect(users.listAll()).toHaveLength(2);
  });

  it("attributes cards and computes per-user stats", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const users = new UserRepository(db);
    const alice = users.getOrCreateLocal("alice");

    const c1 = await publish(repo, "Alice card one");
    const c2 = await publish(repo, "Alice card two");
    users.setCardAuthor(c1.id, alice.id);
    users.setCardAuthor(c2.id, alice.id);
    await repo.recordUsage(c1.id, { agent: "codex", outcome: "success", tokensBeforeEstimate: 10000, tokensAfterActual: 1000 });

    const stats = userStats(db, alice.id)!;
    expect(stats.summary.cardsPublished).toBe(2);
    expect(stats.summary.verifiedFixCount).toBe(2);
    expect(stats.summary.successfulReuse).toBe(1);
    expect(stats.summary.tokensSaved).toBeGreaterThanOrEqual(9000);
    expect(stats.cards.map((c) => c.id)).toContain(c1.id);
  });

  it("ranks users by reputation on the leaderboard", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const users = new UserRepository(db);
    const alice = users.getOrCreateLocal("alice");
    const bob = users.getOrCreateLocal("bob");

    const a1 = await publish(repo, "A1");
    const b1 = await publish(repo, "B1");
    users.setCardAuthor(a1.id, alice.id);
    users.setCardAuthor(b1.id, bob.id);
    // Alice gets successful reuse; Bob gets a failure.
    await repo.recordUsage(a1.id, { agent: "codex", outcome: "success", tokensBeforeEstimate: 8000, tokensAfterActual: 1000 });
    await repo.recordUsage(b1.id, { agent: "codex", outcome: "failed" });

    const board = leaderboard(db);
    expect(board[0].user.login).toBe("alice");
    expect(board[0].reputationScore).toBeGreaterThan(board[1].reputationScore);
  });
});
