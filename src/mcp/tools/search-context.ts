import { z } from "zod";
import type { SearchService } from "../../domain/search.js";

export const searchContextSchema = {
  query: z.string().describe("Natural-language problem description to search for"),
  stack: z.array(z.string()).optional().describe("Tech stack hints, e.g. ['Next.js','NestJS']"),
  error: z.string().optional().describe("Error message or log snippet"),
  files: z.array(z.string()).optional().describe("Relevant file paths"),
  repo: z.string().optional().describe("Repository name"),
  limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)"),
};

const inputObject = z.object(searchContextSchema);

export function makeSearchContextHandler(search: SearchService) {
  return async (args: z.infer<typeof inputObject>) => {
    const results = await search.search(args);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ results }) }],
    };
  };
}
