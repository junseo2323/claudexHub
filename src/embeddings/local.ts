import type { EmbeddingProvider } from "./provider.js";

type FeatureExtractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

/**
 * Local embeddings via transformers.js (ONNX). Default model MiniLM-L6-v2
 * produces 384-dim vectors. No API key; downloads the model (~90MB) on first
 * use and caches it.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  private extractorPromise?: Promise<FeatureExtractor>;

  constructor(
    readonly dim: number,
    private readonly model = "Xenova/all-MiniLM-L6-v2",
  ) {}

  private async getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        const { env, pipeline } = await import("@huggingface/transformers");
        if (process.env.HF_CACHE_DIR) {
          env.cacheDir = process.env.HF_CACHE_DIR;
        }
        return (await pipeline("feature-extraction", this.model)) as unknown as FeatureExtractor;
      })();
    }
    return this.extractorPromise;
  }

  async embed(text: string): Promise<Float32Array> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const data = output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
    if (data.length !== this.dim) {
      throw new Error(
        `Embedding dim mismatch: model produced ${data.length}, expected ${this.dim}. ` +
          `Update EMBED_DIM and reindex.`,
      );
    }
    return data;
  }
}
