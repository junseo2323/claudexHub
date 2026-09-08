import { config, type LlmProviderName } from "../config.js";
import type { LlmJudge } from "./types.js";

let cached: LlmJudge | null | undefined;

/**
 * Lazily construct the configured LLM judge (singleton). Resolves to undefined
 * when no provider is configured — callers then fall back to the heuristic
 * review and similarity-only clustering.
 */
export async function getLlmJudge(): Promise<LlmJudge | undefined> {
  if (cached !== undefined) return cached ?? undefined;
  switch (config.llmProvider) {
    case "anthropic": {
      const { AnthropicJudge } = await import("./anthropic.js");
      cached = new AnthropicJudge(config.llmModel, config.anthropicApiKey);
      break;
    }
    case "openai": {
      const { OpenAIJudge } = await import("./openai.js");
      cached = new OpenAIJudge(config.llmModel, config.openaiApiKey);
      break;
    }
    default:
      cached = null;
  }
  return cached ?? undefined;
}

/** For tests: inject a fake judge (or `undefined` to simulate "not configured"). */
export function setLlmJudge(judge: LlmJudge | undefined): void {
  cached = judge ?? null;
}

export interface LlmStatus {
  provider: LlmProviderName;
  model?: string;
  configured: boolean;
}

/** What the UI/status page shows about the judge, without instantiating it. */
export function llmStatus(): LlmStatus {
  if (cached) return { provider: cached.name, model: cached.model, configured: true };
  const provider = config.llmProvider;
  if (provider === "none") return { provider, configured: false };
  const model =
    config.llmModel ?? (provider === "anthropic" ? "claude-opus-5" : "gpt-5");
  return { provider, model, configured: true };
}
