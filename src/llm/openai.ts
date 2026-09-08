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

export const DEFAULT_OPENAI_MODEL = "gpt-5";

/**
 * GPT as the card judge (Chat Completions + strict JSON schema). Plain fetch,
 * matching the existing OpenAI embeddings provider — no extra SDK dependency.
 */
export class OpenAIJudge implements LlmJudge {
  readonly name = "openai" as const;

  constructor(
    readonly model: string = DEFAULT_OPENAI_MODEL,
    private readonly apiKey?: string,
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }

  async reviewCard(req: ReviewRequest): Promise<JudgeReview> {
    const raw = await this.structured(
      REVIEW_SYSTEM_PROMPT,
      renderReviewRequest(req.card, req.evidence),
      "card_review",
      REVIEW_JSON_SCHEMA,
    );
    return parseJudgeReview(raw);
  }

  async sameProblem(a: CardForJudge, b: CardForJudge): Promise<SameProblemJudgement> {
    const raw = await this.structured(
      SAME_PROBLEM_SYSTEM_PROMPT,
      renderSameProblemRequest(a, b),
      "same_problem",
      SAME_PROBLEM_JSON_SCHEMA,
    );
    return parseSameProblem(raw);
  }

  private async structured(
    system: string,
    user: string,
    name: string,
    schema: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI judge failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      choices: { message: { content?: string | null; refusal?: string | null } }[];
    };
    const msg = json.choices?.[0]?.message;
    if (msg?.refusal) throw new Error(`OpenAI judge refused the request: ${msg.refusal}`);
    if (!msg?.content) throw new Error("OpenAI judge returned no content");
    return JSON.parse(msg.content);
  }
}
