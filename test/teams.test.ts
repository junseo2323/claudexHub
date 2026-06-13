import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { UserRepository } from "../src/domain/users.js";
import { TeamRepository, slugify } from "../src/domain/teams.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { teamStats } from "../src/domain/stats.js";
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

describe("teams", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("slugify normalizes names", () => {
    expect(slugify("Platform Team!")).toBe("platform-team");
    expect(slugify("  ")).toBe("team");
  });

  it("creates a team with the owner as a member and unique slugs", () => {
    db = freshDb();
    const users = new UserRepository(db);
    const teams = new TeamRepository(db);
    const alice = users.getOrCreateLocal("alice");

    const t1 = teams.createTeam("Platform", alice.id);
    const t2 = teams.createTeam("Platform", alice.id);
    expect(t1.slug).toBe("platform");
    expect(t2.slug).toBe("platform-2");
    expect(teams.isMember(t1.id, alice.id)).toBe(true);
    expect(teams.roleOf(t1.id, alice.id)).toBe("owner");
    expect(teams.listTeamsForUser(alice.id).map((t) => t.id)).toContain(t1.id);
  });

  it("manages membership", () => {
    db = freshDb();
    const users = new UserRepository(db);
    const teams = new TeamRepository(db);
    const alice = users.getOrCreateLocal("alice");
    const bob = users.getOrCreateLocal("bob");
    const team = teams.createTeam("Platform", alice.id);

    teams.addMember(team.id, bob.id);
    expect(teams.isMember(team.id, bob.id)).toBe(true);
    expect(teams.listMembers(team.id).map((m) => m.login)).toEqual(["alice", "bob"]);

    teams.removeMember(team.id, bob.id);
    expect(teams.isMember(team.id, bob.id)).toBe(false);
  });

  it("aggregates team stats across members", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const users = new UserRepository(db);
    const teams = new TeamRepository(db);
    const alice = users.getOrCreateLocal("alice");
    const bob = users.getOrCreateLocal("bob");
    const team = teams.createTeam("Platform", alice.id);
    teams.addMember(team.id, bob.id);

    const a1 = await publish(repo, "A1");
    const b1 = await publish(repo, "B1");
    users.setCardAuthor(a1.id, alice.id);
    users.setCardAuthor(b1.id, bob.id);
    await repo.recordUsage(a1.id, { agent: "codex", outcome: "success" });

    const stats = teamStats(db, team.id)!;
    expect(stats.team.slug).toBe("platform");
    expect(stats.members).toHaveLength(2);
    expect(stats.totals.cardsPublished).toBe(2);
    expect(stats.totals.verifiedFixCount).toBe(2);
    expect(stats.totals.successfulReuse).toBe(1);
    expect(stats.totals.reputationScore).toBeGreaterThan(0);
  });
});
