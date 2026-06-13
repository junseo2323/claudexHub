import type { DB } from "../db/connection.js";
import { Repository } from "./repository.js";
import { UserRepository, type User } from "./users.js";
import { TeamRepository, type Team, type TeamRole } from "./teams.js";
import type { ContextCard } from "./types.js";

export interface StackCount {
  stack: string;
  count: number;
}

export interface AgentBreakdown {
  agent: string;
  uses: number;
  successes: number;
  failures: number;
  tokensSaved: number;
}

export interface HubStats {
  cardsTotal: number;
  cardsPublished: number;
  cardsDraft: number;
  cardsStale: number;
  verifiedFixCount: number;
  /** Realized tokens saved across all recorded agent reuse (not the heuristic baseline). */
  totalEstimatedTokensSaved: number;
  successfulReuseCount: number;
  failedReuseCount: number;
  reuseSuccessRate: number;
  staleCardRatio: number;
  commitLinkedRatio: number;
  evidenceLinkedRatio: number;
  topStacks: StackCount[];
  agentBreakdown: AgentBreakdown[];
  /** Leaderboard-style reputation (spec 6.1 Rank Score), single-author in local mode. */
  reputationScore: number;
}

/** Normalize a stack label by stripping a trailing version, e.g. "Next.js 15" -> "Next.js". */
function normalizeStack(value: string): string {
  return value.replace(/\s+\d+(\.\d+)*$/, "").trim();
}

function countRow(db: DB, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { c: number };
  return row.c;
}

export function hubStats(db: DB, topN = 8): HubStats {
  const repo = new Repository(db);
  const cards = repo.listCards({ includeDrafts: true });
  const cardsTotal = cards.length;

  const byStatus = (status: string) => cards.filter((c) => c.status === status).length;
  const cardsPublished = byStatus("published");
  const cardsDraft = byStatus("draft");
  const cardsStale = byStatus("stale") + byStatus("deprecated");

  const verifiedFixCount = cards.filter(
    (c) => c.status === "published" && c.verification.length > 0,
  ).length;

  // Reuse + tokens come from the agent_usage ledger (real signal).
  const successfulReuseCount = countRow(
    db,
    "SELECT count(*) c FROM agent_usage WHERE outcome IN ('success','partial')",
  );
  const failedReuseCount = countRow(db, "SELECT count(*) c FROM agent_usage WHERE outcome = 'failed'");
  const totalEstimatedTokensSaved =
    (db.prepare("SELECT COALESCE(SUM(estimated_tokens_saved),0) s FROM agent_usage").get() as { s: number }).s;
  const totalReuse = successfulReuseCount + failedReuseCount;
  const reuseSuccessRate = totalReuse > 0 ? successfulReuseCount / totalReuse : 0;

  // Evidence linkage ratios.
  const cardsWithCommit = countRow(
    db,
    "SELECT count(DISTINCT card_id) c FROM source_evidence WHERE commit_sha IS NOT NULL",
  );
  const cardsWithEvidence = countRow(db, "SELECT count(DISTINCT card_id) c FROM source_evidence");
  const cardsWithSourceLinks = cards.filter((c) => c.sourceLinks.length > 0).length;
  // Both are coverage counts (evidence rows vs. inline links); use the larger as
  // a conservative upper bound on how many cards have any provenance.
  const evidenceLinkedRatio =
    cardsTotal > 0 ? Math.min(Math.max(cardsWithEvidence, cardsWithSourceLinks) / cardsTotal, 1) : 0;
  const commitLinkedRatio = cardsTotal > 0 ? cardsWithCommit / cardsTotal : 0;

  // Top stacks: tally normalized environment values + recorded agent stacks.
  const stackTally = new Map<string, number>();
  const bump = (raw: string) => {
    const s = normalizeStack(raw);
    if (s) stackTally.set(s, (stackTally.get(s) ?? 0) + 1);
  };
  for (const c of cards) {
    for (const v of Object.values(c.environment)) if (typeof v === "string") bump(v);
  }
  const usageStackRows = db.prepare("SELECT stack FROM agent_usage WHERE stack IS NOT NULL").all() as {
    stack: string;
  }[];
  for (const row of usageStackRows) {
    try {
      for (const s of JSON.parse(row.stack) as string[]) bump(s);
    } catch {
      // ignore malformed
    }
  }
  const topStacks: StackCount[] = [...stackTally.entries()]
    .map(([stack, count]) => ({ stack, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  // Per-agent breakdown.
  const agentRows = db
    .prepare(
      `SELECT agent,
              count(*) AS uses,
              SUM(CASE WHEN outcome IN ('success','partial') THEN 1 ELSE 0 END) AS successes,
              SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failures,
              COALESCE(SUM(estimated_tokens_saved),0) AS tokens_saved
       FROM agent_usage GROUP BY agent ORDER BY uses DESC`,
    )
    .all() as { agent: string; uses: number; successes: number; failures: number; tokens_saved: number }[];
  const agentBreakdown: AgentBreakdown[] = agentRows.map((r) => ({
    agent: r.agent,
    uses: r.uses,
    successes: r.successes,
    failures: r.failures,
    tokensSaved: r.tokens_saved,
  }));

  return {
    cardsTotal,
    cardsPublished,
    cardsDraft,
    cardsStale,
    verifiedFixCount,
    totalEstimatedTokensSaved,
    successfulReuseCount,
    failedReuseCount,
    reuseSuccessRate,
    staleCardRatio: cardsTotal > 0 ? cardsStale / cardsTotal : 0,
    commitLinkedRatio,
    evidenceLinkedRatio,
    topStacks,
    agentBreakdown,
    reputationScore: reputationScore({
      verifiedFixCount,
      successfulReuseCount,
      totalEstimatedTokensSaved,
      failedReuseCount,
      cardsStale,
    }),
  };
}

/**
 * Leaderboard reputation, adapted from the product spec (section 6.1):
 *   verified_solves*5 + successful_reuse*3 + tokens_saved/1000
 *   - failed_reuse*4 - stale_unresolved_penalty
 * `stale_updates` (recovering stale cards) isn't tracked yet in Phase 1, so it
 * contributes 0. In local single-user mode this is the author's own score.
 */
export function reputationScore(input: {
  verifiedFixCount: number;
  successfulReuseCount: number;
  totalEstimatedTokensSaved: number;
  failedReuseCount: number;
  cardsStale: number;
}): number {
  const score =
    input.verifiedFixCount * 5 +
    input.successfulReuseCount * 3 +
    input.totalEstimatedTokensSaved / 1000 -
    input.failedReuseCount * 4 -
    input.cardsStale * 2;
  return Math.round(score);
}

export interface UserSummary {
  user: User;
  cardsAuthored: number;
  cardsPublished: number;
  cardsStale: number;
  verifiedFixCount: number;
  successfulReuse: number;
  failedReuse: number;
  tokensSaved: number;
  reputationScore: number;
}

const STALE_STATUSES = new Set(["stale", "deprecated"]);

/** Aggregate per-user contribution metrics over authored cards + reuse ledger. */
function summarize(db: DB): Map<string, UserSummary> {
  const users = new UserRepository(db).listAll();
  const summaries = new Map<string, UserSummary>();
  for (const user of users) {
    summaries.set(user.id, {
      user,
      cardsAuthored: 0,
      cardsPublished: 0,
      cardsStale: 0,
      verifiedFixCount: 0,
      successfulReuse: 0,
      failedReuse: 0,
      tokensSaved: 0,
      reputationScore: 0,
    });
  }

  const cardRows = db
    .prepare(
      `SELECT ca.user_id AS uid, c.status AS status, c.verification AS verification
       FROM card_authors ca JOIN context_cards c ON c.id = ca.card_id`,
    )
    .all() as { uid: string; status: string; verification: string | null }[];
  for (const r of cardRows) {
    const s = summaries.get(r.uid);
    if (!s) continue;
    s.cardsAuthored += 1;
    if (r.status === "published") s.cardsPublished += 1;
    if (STALE_STATUSES.has(r.status)) s.cardsStale += 1;
    const verified = r.verification ? (JSON.parse(r.verification) as unknown[]).length > 0 : false;
    if (r.status === "published" && verified) s.verifiedFixCount += 1;
  }

  const usageRows = db
    .prepare(
      `SELECT ca.user_id AS uid, au.outcome AS outcome, au.estimated_tokens_saved AS saved
       FROM card_authors ca JOIN agent_usage au ON au.card_id = ca.card_id`,
    )
    .all() as { uid: string; outcome: string; saved: number }[];
  for (const r of usageRows) {
    const s = summaries.get(r.uid);
    if (!s) continue;
    if (r.outcome === "failed") s.failedReuse += 1;
    else s.successfulReuse += 1;
    s.tokensSaved += r.saved;
  }

  for (const s of summaries.values()) {
    s.reputationScore = reputationScore({
      verifiedFixCount: s.verifiedFixCount,
      successfulReuseCount: s.successfulReuse,
      totalEstimatedTokensSaved: s.tokensSaved,
      failedReuseCount: s.failedReuse,
      cardsStale: s.cardsStale,
    });
  }
  return summaries;
}

/** Users ranked by reputation score (leaderboard). */
export function leaderboard(db: DB): UserSummary[] {
  return [...summarize(db).values()].sort(
    (a, b) => b.reputationScore - a.reputationScore || b.cardsPublished - a.cardsPublished,
  );
}

/** A single user's contribution summary plus their public-facing cards. */
export function userStats(
  db: DB,
  userId: string,
): { summary: UserSummary; cards: ContextCard[] } | undefined {
  const summary = summarize(db).get(userId);
  if (!summary) return undefined;
  const ids = db
    .prepare("SELECT card_id FROM card_authors WHERE user_id = ?")
    .all(userId) as { card_id: string }[];
  const repo = new Repository(db);
  const cards = ids
    .map((r) => repo.getCard(r.card_id))
    .filter((c): c is ContextCard => !!c && STALE_STATUSES.has(c.status) === false && c.status === "published")
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
  return { summary, cards };
}

export interface TeamMemberSummary extends UserSummary {
  role: TeamRole;
}

export interface TeamStats {
  team: Team;
  members: TeamMemberSummary[];
  totals: {
    cardsPublished: number;
    verifiedFixCount: number;
    successfulReuse: number;
    failedReuse: number;
    tokensSaved: number;
    reputationScore: number;
  };
}

/** Aggregate contribution stats across a team's members. */
export function teamStats(db: DB, teamId: string): TeamStats | undefined {
  const teams = new TeamRepository(db);
  const team = teams.getById(teamId);
  if (!team) return undefined;

  const all = summarize(db);
  const users = new UserRepository(db);
  const members: TeamMemberSummary[] = teams.listMembers(teamId).map((m) => {
    const base =
      all.get(m.id) ??
      ({
        user: users.getById(m.id)!,
        cardsAuthored: 0,
        cardsPublished: 0,
        cardsStale: 0,
        verifiedFixCount: 0,
        successfulReuse: 0,
        failedReuse: 0,
        tokensSaved: 0,
        reputationScore: 0,
      } as UserSummary);
    return { ...base, role: m.role };
  });

  const totals = members.reduce(
    (acc, m) => {
      acc.cardsPublished += m.cardsPublished;
      acc.verifiedFixCount += m.verifiedFixCount;
      acc.successfulReuse += m.successfulReuse;
      acc.failedReuse += m.failedReuse;
      acc.tokensSaved += m.tokensSaved;
      acc.reputationScore += m.reputationScore;
      return acc;
    },
    { cardsPublished: 0, verifiedFixCount: 0, successfulReuse: 0, failedReuse: 0, tokensSaved: 0, reputationScore: 0 },
  );

  members.sort((a, b) => b.reputationScore - a.reputationScore);
  return { team, members, totals };
}
