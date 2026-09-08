import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import type { ReviewService } from "../../domain/review.js";
import { redactCard } from "../../domain/redaction.js";
import { reviewPayload } from "./review-context-card.js";

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
 * return a redaction report + an independent review (heuristic checks, plus
 * the LLM judge when configured) for the human to preview. This is the review
 * step between draft_context_card and publish_context_card (spec tool 4).
 */
export function makeSubmitForApprovalHandler(repo: Repository, reviews?: ReviewService) {
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

    // Independent review of the knowledge itself (not just secrets). A judge
    // failure must not block the approval step — report it and move on.
    let review: ReturnType<typeof reviewPayload> | undefined;
    let reviewError: string | undefined;
    if (reviews) {
      try {
        review = reviewPayload((await reviews.review(updated.id)).review);
      } catch (err) {
        reviewError = err instanceof Error ? err.message : String(err);
      }
    }

    const next =
      review?.verdict === "fail"
        ? "Review FAILED: show the issues to the human. Fix the card (or call review_context_card after edits); publishing needs override_review=true."
        : review?.verdict === "needs_work"
          ? "Review says needs_work: apply the suggestions if the human agrees, then call publish_context_card with approve=true."
          : "Call publish_context_card with approve=true to make it searchable.";

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: updated.id,
            status: updated.status,
            visibility_suggestion: updated.visibility,
            redaction_report: report,
            ...(review ? { review } : {}),
            ...(reviewError ? { review_error: reviewError } : {}),
            next,
          }),
        },
      ],
    };
  };
}
