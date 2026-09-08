import type { ContextCard, ReviewVerdict } from "../domain/types.js";

export type IssueSeverity = "high" | "medium" | "low";

export interface ReviewIssue {
  severity: IssueSeverity;
  /** Card field the issue is about (title, problem, verifiedFix, ...), or null. */
  field: string | null;
  message: string;
}

export interface ReviewSuggestion {
  /** Card field to replace (list fields take one item per line in `value`). */
  field: string;
  value: string;
}

/** What a judge (LLM or heuristic) concludes about a card. */
export interface JudgeReview {
  verdict: ReviewVerdict;
  /** 0-100 trust score. */
  score: number;
  summary: string;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
}

export interface SameProblemJudgement {
  same: boolean;
  /** 0-1 confidence in the judgement. */
  confidence: number;
  reason: string;
}

/** The subset of a card a judge is shown (never internal counters). */
export type CardForJudge = Pick<
  ContextCard,
  | "id"
  | "title"
  | "problem"
  | "environment"
  | "symptoms"
  | "likelyCauses"
  | "failedAttempts"
  | "verifiedFix"
  | "verification"
  | "agentHint"
  | "sourceLinks"
>;

export interface ReviewRequest {
  card: CardForJudge;
  /** Redacted evidence excerpts (diffs, logs) attached to the card. */
  evidence: string[];
}

export interface LlmJudge {
  readonly name: "anthropic" | "openai";
  readonly model: string;
  reviewCard(req: ReviewRequest): Promise<JudgeReview>;
  sameProblem(a: CardForJudge, b: CardForJudge): Promise<SameProblemJudgement>;
}

export function toCardForJudge(card: ContextCard): CardForJudge {
  return {
    id: card.id,
    title: card.title,
    problem: card.problem,
    environment: card.environment,
    symptoms: card.symptoms,
    likelyCauses: card.likelyCauses,
    failedAttempts: card.failedAttempts,
    verifiedFix: card.verifiedFix,
    verification: card.verification,
    agentHint: card.agentHint,
    sourceLinks: card.sourceLinks,
  };
}
