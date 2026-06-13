import { config } from "../config.js";

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  /** Embed a single text into a fixed-length unit-ish vector. */
  embed(text: string): Promise<Float32Array>;
}

let cached: EmbeddingProvider | undefined;

/** Lazily construct the configured embedding provider (singleton). */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (cached) return cached;
  switch (config.embeddingProvider) {
    case "local": {
      const { LocalEmbeddingProvider } = await import("./local.js");
      cached = new LocalEmbeddingProvider(config.embedDim);
      break;
    }
    case "openai": {
      const { OpenAIEmbeddingProvider } = await import("./openai.js");
      cached = new OpenAIEmbeddingProvider(config.embedDim, config.openaiApiKey);
      break;
    }
    case "noop": {
      const { NoopEmbeddingProvider } = await import("./noop.js");
      cached = new NoopEmbeddingProvider(config.embedDim);
      break;
    }
  }
  return cached;
}

/** For tests: override the provider directly. */
export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  cached = provider;
}
