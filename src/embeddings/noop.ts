import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./provider.js";

/**
 * Deterministic, dependency-free embedding for tests/CI. Hashes tokens into a
 * fixed-dim bag-of-words vector and L2-normalizes. Not semantically great, but
 * stable and good enough to exercise the cosine/KNN code path.
 */
export class NoopEmbeddingProvider implements EmbeddingProvider {
  readonly name = "noop";
  constructor(readonly dim: number) {}

  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(this.dim);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const token of tokens) {
      const hash = createHash("sha1").update(token).digest();
      const idx = hash.readUInt32BE(0) % this.dim;
      const sign = (hash[4] & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return vec;
  }
}
