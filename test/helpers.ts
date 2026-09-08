import { openDb, type DB } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { setEmbeddingProvider } from "../src/embeddings/provider.js";
import { NoopEmbeddingProvider } from "../src/embeddings/noop.js";
import { setLlmJudge } from "../src/llm/provider.js";
import type { CardForJudge, JudgeReview, LlmJudge, SameProblemJudgement } from "../src/llm/types.js";

export const TEST_DIM = 384;

/** Fresh in-memory DB with schema applied, noop embeddings, and NO LLM judge
 *  (so a developer's ANTHROPIC/OPENAI key in the environment is never used). */
export function freshDb(): DB {
  setEmbeddingProvider(new NoopEmbeddingProvider(TEST_DIM));
  setLlmJudge(undefined);
  const db = openDb(":memory:");
  migrate(db, TEST_DIM);
  return db;
}

/** Scriptable judge for tests. Records what it was asked. */
export class FakeJudge implements LlmJudge {
  readonly name = "anthropic" as const;
  readonly model = "fake-judge";
  reviews: CardForJudge[] = [];
  comparisons: [CardForJudge, CardForJudge][] = [];

  constructor(
    private readonly review: JudgeReview = {
      verdict: "pass",
      score: 90,
      summary: "Looks solid.",
      issues: [],
      suggestions: [],
    },
    private readonly same: SameProblemJudgement = { same: true, confidence: 0.9, reason: "same root cause" },
  ) {}

  async reviewCard(req: { card: CardForJudge; evidence: string[] }): Promise<JudgeReview> {
    this.reviews.push(req.card);
    return this.review;
  }

  async sameProblem(a: CardForJudge, b: CardForJudge): Promise<SameProblemJudgement> {
    this.comparisons.push([a, b]);
    return this.same;
  }
}
