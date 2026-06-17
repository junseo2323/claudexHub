import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import { redactCard } from "../../domain/redaction.js";

export const submitForApprovalSchema = {
  id: z.string().describe("Draft card id to submit for human approval"),
  visibility_suggestion: z
    .enum(["public", "private", "team"])
    .optional()
    .describe("Suggested visibility for the human to confirm at publish time"),
};

const inputObject = z.object(submitForApprovalSchema);

/**
 * Move an AI-created draft into the "approved" (pending-publish) state and
 * return a redaction report for the human to preview. This is the review step
 * between draft_context_card and publish_context_card (spec tool 4).
 */
export function makeSubmitForApprovalHandler(repo: Repository) {
  return async (args: z.infer<typeof inputObject>) => {
    const card = repo.getCard(args.id);
    if (!card) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found", id: args.id }) }],
        isError: true,
      };
    }
    if (card.status !== "draft") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "not_a_draft", id: args.id, status: card.status }),
          },
        ],
        isError: true,
      };
    }

    // Redaction preview for the human reviewer (no publish yet).
    const { report } = redactCard(card);
    const updated = await repo.updateCard(args.id, {
      status: "approved",
      visibility: args.visibility_suggestion ?? card.visibility,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: updated.id,
            status: updated.status,
            visibility_suggestion: updated.visibility,
            redaction_report: report,
            next: "Call publish_context_card with approve=true to make it searchable.",
          }),
        },
      ],
    };
  };
}
