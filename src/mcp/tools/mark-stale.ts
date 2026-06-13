import { z } from "zod";
import type { Repository } from "../../domain/repository.js";

export const markStaleSchema = {
  card_id: z.string().describe("The context card to mark stale"),
  reason: z.string().describe("Why the card is no longer trustworthy"),
  affected_versions: z
    .array(z.string())
    .optional()
    .describe("Versions/conditions the staleness applies to, e.g. ['Next.js 16']"),
};

const inputObject = z.object(markStaleSchema);

export function makeMarkStaleHandler(repo: Repository) {
  return async (args: z.infer<typeof inputObject>) => {
    try {
      const card = await repo.markStale(args.card_id, args.reason, args.affected_versions);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ id: card.id, status: card.status }),
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
