import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import type { ContextCard } from "../../domain/types.js";
import { buildBrief } from "../../domain/brief.js";

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
  };
}

export function makeGetContextCardHandler(repo: Repository) {
  return async (args: z.infer<typeof inputObject>) => {
    const card = repo.getCard(args.id);
    if (!card) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found", id: args.id }) }],
        isError: true,
      };
    }
    let payload: unknown;
    if (args.mode === "brief") {
      payload = { brief: buildBrief(card, card.confidenceScore) };
    } else if (args.mode === "agent_json") {
      payload = toAgentJson(card);
    } else {
      payload = { card };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
  };
}
