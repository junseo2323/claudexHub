import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import type { ReviewService } from "../../domain/review.js";
import type { ClusterService } from "../../domain/clusters.js";
import { redactCard } from "../../domain/redaction.js";
import { getLlmJudge } from "../../llm/provider.js";
import { reviewPayload } from "./review-context-card.js";

export const publishContextCardSchema = {
  id: z.string().describe("Draft card id to publish"),
  approve: z.boolean().describe("Must be true — explicit human approval is required"),
  visibility: z
    .enum(["public", "private", "team"])
    .optional()
    .describe("Visibility on publish (default: private)"),
  override_review: z
    .boolean()
    .optional()
    .describe("Publish even though the latest review verdict is 'fail' (human decision only)"),
};

const inputObject = z.object(publishContextCardSchema);

export interface PublishDeps {
  reviews?: ReviewService;
  clusters?: ClusterService;
}

export function makePublishContextCardHandler(repo: Repository, deps: PublishDeps = {}) {
  return async (args: z.infer<typeof inputObject>) => {
    if (args.approve !== true) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "approval_required" }) },
        ],
        isError: true,
      };
    }

    const card = repo.getCard(args.id);
    if (!card) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found", id: args.id }) }],
        isError: true,
      };
    }

    // Safety net: re-scan for secrets and block publish if any remain.
    const { report } = redactCard(card);
    if (report.findingsCount > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "secrets_detected", redaction_report: report }),
          },
        ],
        isError: true,
      };
    }

    // Review gate: every card is reviewed at least once before it becomes
    // searchable. A "fail" verdict blocks unless the human explicitly overrides.
    let review = deps.reviews?.latest(card.id);
    if (deps.reviews && !review) {
      try {
        review = (await deps.reviews.review(card.id)).review;
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "review_failed",
                message: err instanceof Error ? err.message : String(err),
                hint: "Retry, or run review_context_card once the judge is reachable.",
              }),
            },
          ],
          isError: true,
        };
      }
    }
    if (review?.verdict === "fail" && args.override_review !== true) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "review_failed_verdict",
              review: reviewPayload(review),
              hint: "Fix the flagged issues and call review_context_card, or pass override_review=true after a human decides.",
            }),
          },
        ],
        isError: true,
      };
    }

    const updated = await repo.updateCard(args.id, {
      status: "published",
      visibility: args.visibility ?? card.visibility,
      lastVerifiedAt: card.verification.length > 0 ? new Date().toISOString() : card.lastVerifiedAt,
    });

    // Group with existing near-duplicates so search shows one card per problem.
    let cluster: { id: string; size: number; canonical_id: string; llm_confirmed: boolean } | undefined;
    if (deps.clusters) {
      try {
        const judge = await getLlmJudge();
        const assigned = await deps.clusters.assign(updated.id, { judge });
        if (assigned) {
          cluster = {
            id: assigned.cluster.id,
            size: deps.clusters.members(assigned.cluster.id).length,
            canonical_id: assigned.cluster.canonicalCardId,
            llm_confirmed: assigned.llmConfirmed,
          };
        }
      } catch {
        // Grouping is best-effort metadata; never fail a publish over it.
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: updated.id,
            status: updated.status,
            visibility: updated.visibility,
            redaction_report: report,
            ...(review ? { review: reviewPayload(review) } : {}),
            ...(cluster ? { cluster } : {}),
          }),
        },
      ],
    };
  };
}
