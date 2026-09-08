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
  // LLM judge (card review + same-problem confirmation). When unset, the
  // provider is inferred from which API key is present; "none" disables it.
  LLM_PROVIDER: z.enum(["anthropic", "openai", "none"]).optional(),
  LLM_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Cosine similarity at/above which two cards are grouped automatically.
  CLUSTER_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.82),
  // Lower bound of the "gray zone" where the LLM judge confirms a grouping.
  CLUSTER_LLM_CONFIRM_MIN: z.coerce.number().min(0).max(1).default(0.68),
});

const parsed = EnvSchema.parse(process.env);

export type LlmProviderName = "anthropic" | "openai" | "none";

function resolveLlmProvider(): LlmProviderName {
  if (parsed.LLM_PROVIDER) return parsed.LLM_PROVIDER;
  if (parsed.ANTHROPIC_API_KEY) return "anthropic";
  if (parsed.OPENAI_API_KEY) return "openai";
  return "none";
}

export interface Config {
  embeddingProvider: "local" | "openai" | "noop";
  dbPath: string;
  embedDim: number;
  keywordWeight: number;
  vectorWeight: number;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  llmProvider: LlmProviderName;
  /** Provider-specific model override (defaults live in src/llm/). */
  llmModel?: string;
  clusterSimilarityThreshold: number;
  clusterLlmConfirmMin: number;
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
  anthropicApiKey: parsed.ANTHROPIC_API_KEY,
  llmProvider: resolveLlmProvider(),
  llmModel: parsed.LLM_MODEL,
  clusterSimilarityThreshold: parsed.CLUSTER_SIMILARITY_THRESHOLD,
  clusterLlmConfirmMin: Math.min(parsed.CLUSTER_LLM_CONFIRM_MIN, parsed.CLUSTER_SIMILARITY_THRESHOLD),
};

/**
 * Logging that is safe for an MCP stdio server: stdout is reserved for the MCP
 * protocol, so all human-facing logs MUST go to stderr.
 */
export function logStderr(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error("[claudexhub]", ...args);
}
