import type { CardBrief, ContextCard } from "./types.js";
import { cardFullText, estimateTokens } from "./scoring.js";

export interface MatchSignals {
  matchedKeyword: boolean;
  matchedVector: boolean;
  overlapTerms: string[];
  envMatches: string[];
}

function deriveRisk(card: ContextCard, confidence: number): CardBrief["risk"] {
  if (card.status === "stale" || card.status === "deprecated" || confidence < 40) {
    return "high";
  }
  if (card.status === "published" && confidence >= 70) return "low";
  return "medium";
}

function summarizeFix(verifiedFix: string[]): string[] {
  return verifiedFix.slice(0, 3).map((f) => (f.length > 120 ? f.slice(0, 117) + "..." : f));
}

function buildMatchReason(signals?: MatchSignals): string {
  if (!signals) return "direct lookup";
  const channel =
    signals.matchedKeyword && signals.matchedVector
      ? "keyword+vector"
      : signals.matchedVector
        ? "vector"
        : "keyword";
  const parts = [`${channel} match`];
  if (signals.overlapTerms.length) {
    parts.push(`on ${signals.overlapTerms.slice(0, 4).join(", ")}`);
  }
  if (signals.envMatches.length) {
    parts.push(`env: ${signals.envMatches.join("/")}`);
  }
  return parts.join(" ");
}

/** Project a card to a token-cheap brief. `confidence` is search-time score. */
/** A short, reused-track-record note appended to the match reason, if earned. */
function provenNote(card: ContextCard): string {
  const total = card.successfulReuseCount + card.failedReuseCount;
  if (total === 0) return "";
  if (card.successfulReuseCount >= 2 && card.successfulReuseCount > card.failedReuseCount) {
    return ` · proven (${card.successfulReuseCount}× reused)`;
  }
  if (card.failedReuseCount > card.successfulReuseCount) {
    return ` · ${card.failedReuseCount}× failed reuse`;
  }
  return "";
}

export function buildBrief(
  card: ContextCard,
  confidence: number,
  signals?: MatchSignals,
): CardBrief {
  return {
    id: card.id,
    title: card.title,
    confidence,
    tokens_estimate: estimateTokens(cardFullText(card)),
    match_reason: buildMatchReason(signals) + provenNote(card),
    fix_summary: summarizeFix(card.verifiedFix),
    risk: deriveRisk(card, confidence),
  };
}
