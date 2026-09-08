import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";
import type { ContextCard, ReviewVerdict } from "./types.js";
import { Repository } from "./repository.js";
import { redactCard } from "./redaction.js";
import { getLlmJudge } from "../llm/provider.js";
import { toCardForJudge } from "../llm/types.js";
import type { JudgeReview, LlmJudge, ReviewIssue, ReviewSuggestion } from "../llm/types.js";

export type ReviewProvider = "heuristic" | "anthropic" | "openai";

/** A stored review of a card. The newest one is mirrored onto the card row. */
export interface CardReview {
  id: string;
  cardId: string;
  provider: ReviewProvider;
  model?: string;
  verdict: ReviewVerdict;
  score: number;
  summary: string;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
  createdAt: string;
}

interface ReviewRow {
  id: string;
  card_id: string;
  provider: string;
  model: string | null;
  verdict: string;
  score: number;
  summary: string;
  issues: string | null;
  suggestions: string | null;
  created_at: string;
}

function rowTo(row: ReviewRow): CardReview {
  return {
    id: row.id,
    cardId: row.card_id,
    provider: row.provider as ReviewProvider,
    model: row.model ?? undefined,
    verdict: row.verdict as ReviewVerdict,
    score: row.score,
    summary: row.summary,
    issues: row.issues ? JSON.parse(row.issues) : [],
    suggestions: row.suggestions ? JSON.parse(row.suggestions) : [],
    createdAt: row.created_at,
  };
}

/** Phrases that read as instructions to the consuming agent rather than a fix. */
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (the )?(previous|prior|above|system) (instructions|prompt)/i,
  /you are now (a|an|the) /i,
  /run the following (command|script) (immediately|first|now)/i,
  /curl\s+[^\n|]*\|\s*(ba|z)?sh\b/i,
  /rm\s+-rf\s+\/(?!\S)/,
];

/** Advice that is almost always wrong to hand to an agent as a "verified fix". */
const DANGEROUS_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /chmod\s+(-R\s+)?777/i, why: "chmod 777 grants world-writable permissions" },
  { re: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/i, why: "disables TLS certificate verification" },
  { re: /verify\s*=\s*False/i, why: "disables TLS certificate verification" },
  { re: /Access-Control-Allow-Origin:\s*\*[\s\S]{0,120}Allow-Credentials:\s*true/i, why: "wildcard CORS with credentials" },
  { re: /(disable|turn off)\s+(csrf|ssl|tls)\b/i, why: "disables a security control" },
];

const VAGUE_FIX = /^(fixed( it)?|resolved|works now|solved|done|restart(ed)?|reinstall(ed)?|updated?|changed? (it|config))\.?$/i;

/**
 * Deterministic, dependency-free review. Always runs (also under an LLM judge,
 * whose verdict it can only tighten — a leaked secret or injected instruction
 * fails the card regardless of what the model says).
 */
export function heuristicReview(card: ContextCard, evidence: string[] = []): JudgeReview {
  const issues: ReviewIssue[] = [];
  const suggestions: ReviewSuggestion[] = [];

  if (card.verifiedFix.length === 0) {
    issues.push({ severity: "high", field: "verifiedFix", message: "No verified fix — nothing for an agent to apply." });
  } else if (card.verifiedFix.every((f) => f.trim().length < 12 || VAGUE_FIX.test(f.trim()))) {
    issues.push({
      severity: "medium",
      field: "verifiedFix",
      message: "The fix is too vague to reproduce (name the command, config key, code change, or setting).",
    });
  }
  if (card.problem.trim().length < 20) {
    issues.push({ severity: "medium", field: "problem", message: "Problem statement is too thin to match against a real situation." });
  }
  if (card.symptoms.length === 0) {
    issues.push({ severity: "low", field: "symptoms", message: "No symptoms listed — add the error text or observable behaviour." });
  }
  if (card.verification.length === 0) {
    issues.push({ severity: "medium", field: "verification", message: "No verification steps — say how to confirm the fix worked." });
    suggestions.push({ field: "verification", value: "Describe the check that proved the fix (command output, UI state, passing test)." });
  }
  if (Object.values(card.environment).filter(Boolean).length === 0) {
    issues.push({ severity: "low", field: "environment", message: "No environment/version scoping — the fix may not transfer." });
  }

  const redaction = redactCard(card).report;
  if (redaction.findingsCount > 0) {
    issues.push({
      severity: "high",
      field: redaction.redactedFields[0] ?? null,
      message: `Potential secrets remain in: ${redaction.redactedFields.join(", ")}.`,
    });
  }

  const haystack = [
    card.title,
    card.problem,
    card.agentHint,
    ...card.symptoms,
    ...card.likelyCauses,
    ...card.failedAttempts,
    ...card.verifiedFix,
    ...card.verification,
  ].join("\n");
  if (INJECTION_PATTERNS.some((re) => re.test(haystack))) {
    issues.push({ severity: "high", field: null, message: "Contains instruction-like content aimed at the reading agent (possible prompt injection)." });
  }
  for (const { re, why } of DANGEROUS_PATTERNS) {
    if (re.test(haystack)) {
      issues.push({ severity: "high", field: "verifiedFix", message: `Dangerous advice: ${why}.` });
      break;
    }
  }
  // Evidence is reference material; only scan it for the hard-fail classes.
  const evidenceText = evidence.join("\n");
  if (evidenceText && INJECTION_PATTERNS.some((re) => re.test(evidenceText))) {
    issues.push({ severity: "medium", field: "evidence", message: "Attached evidence contains instruction-like content; review before publishing." });
  }

  let score = 100;
  for (const i of issues) score -= i.severity === "high" ? 40 : i.severity === "medium" ? 15 : 5;
  // A card that can't be reproduced or confirmed is never a "pass", however
  // complete the rest of it is — those two fields are the whole point.
  if (issues.some((i) => i.severity === "medium" && (i.field === "verifiedFix" || i.field === "verification"))) {
    score = Math.min(score, 69);
  }
  score = Math.max(0, Math.min(100, score));
  const anyHigh = issues.some((i) => i.severity === "high");
  const verdict: ReviewVerdict = anyHigh ? "fail" : score >= 70 ? "pass" : "needs_work";
  if (anyHigh) score = Math.min(score, 39);

  const summary =
    issues.length === 0
      ? "Heuristic checks passed: concrete fix, verification steps, and no leaked secrets detected."
      : `Heuristic checks found ${issues.length} issue(s): ${issues
          .slice(0, 2)
          .map((i) => i.message.replace(/\.$/, ""))
          .join("; ")}${issues.length > 2 ? "; …" : ""}.`;

  return { verdict, score, summary, issues, suggestions };
}

/** Fold hard-fail heuristic findings into an LLM verdict (the model can't waive them). */
export function mergeReviews(llm: JudgeReview, heuristic: JudgeReview): JudgeReview {
  const hardFails = heuristic.issues.filter((i) => i.severity === "high");
  const seen = new Set(llm.issues.map((i) => i.message.toLowerCase()));
  const issues = [...llm.issues, ...hardFails.filter((i) => !seen.has(i.message.toLowerCase()))];
  if (hardFails.length === 0) return { ...llm, issues };
  return {
    ...llm,
    verdict: "fail",
    score: Math.min(llm.score, 39),
    issues,
    summary: `${llm.summary} Blocked by automated checks: ${hardFails.map((i) => i.message.replace(/\.$/, "")).join("; ")}.`,
  };
}

export interface ReviewOptions {
  /**
   * Judge to use. `undefined` = the configured LLM judge (if any);
   * `null` = force the heuristic-only review.
   */
  judge?: LlmJudge | null;
}

export class ReviewService {
  private readonly repo: Repository;

  constructor(private readonly db: DB) {
    this.repo = new Repository(db);
  }

  latest(cardId: string): CardReview | undefined {
    const row = this.db
      .prepare("SELECT * FROM card_reviews WHERE card_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(cardId) as ReviewRow | undefined;
    return row ? rowTo(row) : undefined;
  }

  list(cardId: string): CardReview[] {
    const rows = this.db
      .prepare("SELECT * FROM card_reviews WHERE card_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(cardId) as ReviewRow[];
    return rows.map(rowTo);
  }

  /** Evidence excerpts (already redacted at ingest) shown to the judge. */
  private evidenceFor(cardId: string): string[] {
    const rows = this.db
      .prepare("SELECT content FROM source_evidence WHERE card_id = ? ORDER BY created_at ASC LIMIT 3")
      .all(cardId) as { content: string | null }[];
    return rows.map((r) => r.content ?? "").filter(Boolean);
  }

  /**
   * Review a card: heuristic checks always run; the LLM judge (when configured
   * or injected) adds its judgement. The result is stored and mirrored onto the
   * card (re-scoring its confidence).
   */
  async review(cardId: string, opts: ReviewOptions = {}): Promise<{ review: CardReview; card: ContextCard }> {
    const card = this.repo.getCard(cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);
    const evidence = this.evidenceFor(cardId);
    const heuristic = heuristicReview(card, evidence);

    const judge = opts.judge === undefined ? await getLlmJudge() : opts.judge ?? undefined;
    let result: JudgeReview = heuristic;
    let provider: ReviewProvider = "heuristic";
    let model: string | undefined;
    if (judge) {
      const llm = await judge.reviewCard({ card: toCardForJudge(card), evidence });
      result = mergeReviews(llm, heuristic);
      provider = judge.name;
      model = judge.model;
    }

    const review: CardReview = {
      id: `rev_${nanoid(12)}`,
      cardId,
      provider,
      model,
      verdict: result.verdict,
      score: Math.round(result.score),
      summary: result.summary,
      issues: result.issues,
      suggestions: result.suggestions,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO card_reviews (id, card_id, provider, model, verdict, score, summary, issues, suggestions, created_at)
         VALUES (@id, @cardId, @provider, @model, @verdict, @score, @summary, @issues, @suggestions, @createdAt)`,
      )
      .run({
        ...review,
        model: review.model ?? null,
        issues: JSON.stringify(review.issues),
        suggestions: JSON.stringify(review.suggestions),
      });
    const updated = await this.repo.updateCard(cardId, {
      reviewVerdict: review.verdict,
      reviewScore: review.score,
    });
    return { review, card: updated };
  }
}
