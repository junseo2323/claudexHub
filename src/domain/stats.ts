import type { DB } from "../db/connection.js";
import { Repository } from "./repository.js";

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
