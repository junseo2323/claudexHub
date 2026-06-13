import { z } from "zod";
import type { Repository } from "../../domain/repository.js";

export const recordFeedbackSchema = {
  card_id: z.string().describe("The context card that was used"),
  outcome: z
    .enum(["success", "partial", "failed"])
    .describe("Did applying the card solve the problem?"),
  agent: z
    .enum(["claude_code", "codex", "cursor", "other"])
    .default("claude_code")
    .describe("Which agent used the card"),
  tokens_before_estimate: z
    .number()
    .int()
    .optional()
    .describe("Estimated tokens the problem would have cost without the card"),
  tokens_after_actual: z
    .number()
    .int()
    .optional()
    .describe("Actual tokens spent using the card"),
  stack: z.array(z.string()).optional().describe("Tech stack the card was applied in"),
  notes: z.string().optional(),
};

const inputObject = z.object(recordFeedbackSchema);

export function makeRecordFeedbackHandler(repo: Repository) {
  return async (args: z.infer<typeof inputObject>) => {
    try {
      const { usage, card } = await repo.recordUsage(args.card_id, {
        agent: args.agent ?? "claude_code",
        outcome: args.outcome,
        tokensBeforeEstimate: args.tokens_before_estimate,
        tokensAfterActual: args.tokens_after_actual,
        stack: args.stack,
        notes: args.notes,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              recorded: true,
              outcome: usage.outcome,
              tokens_saved: usage.estimatedTokensSaved,
              card: {
                id: card.id,
                confidence: card.confidenceScore,
                successful_reuse_count: card.successfulReuseCount,
                failed_reuse_count: card.failedReuseCount,
                estimated_tokens_saved: card.estimatedTokensSaved,
              },
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  };
}
