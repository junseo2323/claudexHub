import type { ContextCard } from "./types.js";

/** Rough token estimate for a piece of text (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Serialize a card to the text an agent would actually load (for token math). */
export function cardFullText(card: ContextCard): string {
  return JSON.stringify({
    title: card.title,
    problem: card.problem,
    environment: card.environment,
    symptoms: card.symptoms,
    likelyCauses: card.likelyCauses,
    failedAttempts: card.failedAttempts,
    verifiedFix: card.verifiedFix,
    verification: card.verification,
    agentHint: card.agentHint,
  });
}

function daysSince(iso?: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export interface ConfidenceBreakdown {
  sourceQuality: number;
  verification: number;
  recency: number;
  reuse: number;
  failedPenalty: number;
  stalePenalty: number;
  /** Final clamped score, 0-100. */
  total: number;
}

/**
 * Explainable confidence breakdown. Components are on a 0-1 scale and summed,
 * then clamped to 0-100. Phase 1 heuristic — provisional until richer
 * verification/evidence telemetry exists.
 */
export function confidenceBreakdown(card: ContextCard): ConfidenceBreakdown {
  let sourceQuality = 0;
  if (card.verifiedFix.length > 0) sourceQuality += 0.4;
  if (card.sourceLinks.length > 0) sourceQuality += 0.1;

  const verification = card.verification.length > 0 ? 0.3 : 0;

  const age = daysSince(card.lastVerifiedAt);
  let recency = 0.05;
  if (age < 30) recency = 0.2;
  else if (age < 90) recency = 0.1;

  const totalReuse = card.successfulReuseCount + card.failedReuseCount;
  const reuse = totalReuse > 0 ? (card.successfulReuseCount / totalReuse) * 0.1 : 0;

  // Penalties: each failed reuse erodes trust; stale/deprecated status sharply
  // reduces confidence so such cards fall to the bottom (and read as high risk).
  const failedPenalty = Math.min(card.failedReuseCount * 0.05, 0.3);
  const stalePenalty = card.status === "deprecated" ? 0.6 : card.status === "stale" ? 0.4 : 0;

  const raw = sourceQuality + verification + recency + reuse - failedPenalty - stalePenalty;
  const total = Math.round(Math.min(Math.max(raw, 0), 1) * 100);
  return { sourceQuality, verification, recency, reuse, failedPenalty, stalePenalty, total };
}

/**
 * Intrinsic card confidence (0-100). Distinct from search-time relevance
 * confidence (see search.ts), which additionally blends query match.
 */
export function computeConfidence(card: ContextCard): number {
  return confidenceBreakdown(card).total;
}

/**
 * Estimated tokens saved by reusing this card instead of re-deriving the fix.
 * Phase 1 placeholder: full-card token cost * a fixed rediscovery multiplier.
 * Replace the multiplier with measured before/after telemetry in Phase 4.
 */
export function estimateTokensSaved(card: ContextCard, multiplier = 3): number {
  return estimateTokens(cardFullText(card)) * multiplier;
}
