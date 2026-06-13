import type { EmbeddingProvider } from "./provider.js";

/**
 * OpenAI embeddings (text-embedding-3-small). The model natively returns 1536
 * dims; we request `dimensions` to match the configured EMBED_DIM so it stays
 * interchangeable with the local provider.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";

  constructor(
    readonly dim: number,
    private readonly apiKey?: string,
    private readonly model = "text-embedding-3-small",
  ) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai");
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: text, model: this.model, dimensions: this.dim }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return Float32Array.from(json.data[0].embedding);
  }
}
