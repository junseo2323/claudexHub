import { z } from "zod";
import type { SearchService } from "../../domain/search.js";

export const searchContextSchema = {
  query: z.string().describe("Natural-language problem description to search for"),
  stack: z.array(z.string()).optional().describe("Tech stack hints, e.g. ['Next.js','NestJS']"),
  version: z.array(z.string()).optional().describe("Version tokens, e.g. ['Next.js 15','16']"),
  error: z.string().optional().describe("Error message or log snippet"),
  files: z.array(z.string()).optional().describe("Relevant file paths"),
  repo: z.string().optional().describe("Repository name (boosts cards with evidence from it)"),
  limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)"),
  min_confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("Only return results at or above this confidence (0-100)"),
};

const inputObject = z.object(searchContextSchema);

export function makeSearchContextHandler(search: SearchService) {
  return async (args: z.infer<typeof inputObject>) => {
    const results = await search.search({
      query: args.query,
      stack: args.stack,
      version: args.version,
      error: args.error,
      files: args.files,
      repo: args.repo,
      limit: args.limit,
      minConfidence: args.min_confidence,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ results }) }],
    };
  };
}
