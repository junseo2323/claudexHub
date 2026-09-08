import { z } from "zod";
import type { ReviewService, CardReview } from "../../domain/review.js";

export const reviewContextCardSchema = {
  id: z.string().describe("Card id to review (draft, approved, or published)"),
};

const inputObject = z.object(reviewContextCardSchema);

/** Shape of a review as returned to agents (stable across tools). */
export function reviewPayload(review: CardReview) {
  return {
    provider: review.provider,
    model: review.model,
    verdict: review.verdict,
    score: review.score,
    summary: review.summary,
    issues: review.issues,
    suggestions: review.suggestions,
    reviewed_at: review.createdAt,
  };
}

/**
 * Run the card review (heuristic checks + the configured LLM judge, if any),
 * store it, and return the verdict. Re-runnable after edits.
 */
export function makeReviewContextCardHandler(reviews: ReviewService) {
  return async (args: z.infer<typeof inputObject>) => {
    try {
      const { review, card } = await reviews.review(args.id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              id: card.id,
              status: card.status,
              confidence: card.confidenceScore,
              review: reviewPayload(review),
              next:
                review.verdict === "fail"
                  ? "Fix the flagged issues (edit the card) and review again, or publish with override_review=true after a human decision."
                  : review.verdict === "needs_work"
                    ? "Apply the suggestions to tighten the card, then publish."
                    : "Card is ready to publish.",
            }),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const notFound = /not found/i.test(message);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(notFound ? { error: "not_found", id: args.id } : { error: "review_failed", message }),
          },
        ],
        isError: true,
      };
    }
  };
}
