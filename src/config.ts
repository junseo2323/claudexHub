import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const EnvSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(["local", "openai", "noop"]).default("local"),
  CLAUDEXHUB_DB_PATH: z.string().optional(),
  HUB_DB_PATH: z.string().optional(),
  EMBED_DIM: z.coerce.number().int().positive().default(384),
  SEARCH_KEYWORD_WEIGHT: z.coerce.number().min(0).max(1).default(0.5),
  SEARCH_VECTOR_WEIGHT: z.coerce.number().min(0).max(1).default(0.5),
  OPENAI_API_KEY: z.string().optional(),
});

const parsed = EnvSchema.parse(process.env);

export interface Config {
  embeddingProvider: "local" | "openai" | "noop";
  dbPath: string;
  embedDim: number;
  keywordWeight: number;
  vectorWeight: number;
  openaiApiKey?: string;
}

export const config: Config = {
  embeddingProvider: parsed.EMBEDDING_PROVIDER,
  dbPath:
    parsed.CLAUDEXHUB_DB_PATH ??
    parsed.HUB_DB_PATH ??
    "./data/claudexhub.db",
  embedDim: parsed.EMBED_DIM,
  keywordWeight: parsed.SEARCH_KEYWORD_WEIGHT,
  vectorWeight: parsed.SEARCH_VECTOR_WEIGHT,
  openaiApiKey: parsed.OPENAI_API_KEY,
};

/**
 * Logging that is safe for an MCP stdio server: stdout is reserved for the MCP
 * protocol, so all human-facing logs MUST go to stderr.
 */
export function logStderr(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error("[claudexhub]", ...args);
}
