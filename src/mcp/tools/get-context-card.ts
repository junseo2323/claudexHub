import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import type { ContextCard } from "../../domain/types.js";
import type { ClusterService } from "../../domain/clusters.js";
import type { ReviewService } from "../../domain/review.js";
import { buildBrief } from "../../domain/brief.js";
import { reviewPayload } from "./review-context-card.js";

export const getContextCardSchema = {
  id: z.string().describe("Context card id"),
  mode: z
    .enum(["brief", "full", "agent_json"])
    .default("full")
    .describe("brief = summary, full = everything, agent_json = compact agent-optimized subset"),
};

const inputObject = z.object(getContextCardSchema);

/** Compact, agent-optimized subset meant to be injected into agent context. */
function toAgentJson(card: ContextCard) {
  return {
    id: card.id,
    title: card.title,
    problem: card.problem,
    environment: card.environment,
    verified_fix: card.verifiedFix,
    verification: card.verification,
    agent_hint: card.agentHint,
    confidence: card.confidenceScore,
    ...(card.reviewVerdict ? { review: card.reviewVerdict } : {}),
  };
}

export interface GetCardDeps {
  clusters?: ClusterService;
  reviews?: ReviewService;
}

export function makeGetContextCardHandler(repo: Repository, deps: GetCardDeps = {}) {
  return async (args: z.infer<typeof inputObject>) => {
    const card = repo.getCard(args.id);
    if (!card) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found", id: args.id }) }],
        isError: true,
      };
    }

    // Same-problem group (if any): tiny in agent_json, member list in full.
    const cluster = deps.clusters?.clusterOf(card.id);
    const members = cluster ? deps.clusters!.members(cluster.id).filter((m) => m.cardId !== card.id) : [];
    const groupBrief = cluster
      ? { id: cluster.id, canonical_id: cluster.canonicalCardId, size: members.length + 1 }
      : undefined;

    let payload: unknown;
    if (args.mode === "brief") {
      payload = { brief: buildBrief(card, card.confidenceScore) };
    } else if (args.mode === "agent_json") {
      payload = { ...toAgentJson(card), ...(groupBrief ? { same_problem_group: groupBrief } : {}) };
    } else {
      const review = deps.reviews?.latest(card.id);
      payload = {
        card,
        ...(review ? { review: reviewPayload(review) } : {}),
        ...(groupBrief
          ? {
              same_problem_group: {
                ...groupBrief,
                members: members.map((m) => {
                  const other = repo.getCard(m.cardId);
                  return { id: m.cardId, title: other?.title, status: other?.status, similarity: m.similarity };
                }),
              },
            }
          : {}),
      };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
  };
}
