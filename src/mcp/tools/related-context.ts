import { z } from "zod";
import type { SearchService } from "../../domain/search.js";

export const relatedContextSchema = {
  id: z.string().describe("Context card id to find related cards for"),
  limit: z.number().int().min(1).max(10).optional().describe("Max related cards (default 3)"),
};

const inputObject = z.object(relatedContextSchema);

export function makeRelatedContextHandler(search: SearchService) {
  return async (args: z.infer<typeof inputObject>) => {
    const related = await search.related(args.id, { limit: args.limit });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ related }) }],
    };
  };
}
