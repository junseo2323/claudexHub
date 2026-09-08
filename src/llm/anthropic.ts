import Anthropic from "@anthropic-ai/sdk";
import type { CardForJudge, JudgeReview, LlmJudge, ReviewRequest, SameProblemJudgement } from "./types.js";
import {
  REVIEW_JSON_SCHEMA,
  REVIEW_SYSTEM_PROMPT,
  SAME_PROBLEM_JSON_SCHEMA,
  SAME_PROBLEM_SYSTEM_PROMPT,
  parseJudgeReview,
  parseSameProblem,
  renderReviewRequest,
  renderSameProblemRequest,
} from "./prompts.js";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/**
 * Claude as the card judge. Uses structured outputs so the response is always
 * schema-valid JSON, and server-side refusal fallbacks so a policy decline on
 * the primary model is retried on a fallback model inside the same call.
 */
export class AnthropicJudge implements LlmJudge {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string = DEFAULT_ANTHROPIC_MODEL,
    apiKey?: string,
  ) {
    // The SDK also resolves ANTHROPIC_API_KEY / an `ant auth login` profile itself.
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async reviewCard(req: ReviewRequest): Promise<JudgeReview> {
    const raw = await this.structured(REVIEW_SYSTEM_PROMPT, renderReviewRequest(req.card, req.evidence), REVIEW_JSON_SCHEMA);
    return parseJudgeReview(raw);
  }

  async sameProblem(a: CardForJudge, b: CardForJudge): Promise<SameProblemJudgement> {
    const raw = await this.structured(SAME_PROBLEM_SYSTEM_PROMPT, renderSameProblemRequest(a, b), SAME_PROBLEM_JSON_SCHEMA);
    return parseSameProblem(raw);
  }

  private async structured(system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    });
    if (res.stop_reason === "refusal") {
      const why = res.stop_details?.type === "refusal" ? res.stop_details.explanation : undefined;
      throw new Error(`Anthropic judge refused the request${why ? `: ${why}` : ""}`);
    }
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) throw new Error(`Anthropic judge returned no text (stop_reason=${res.stop_reason})`);
    return JSON.parse(text);
  }
}
