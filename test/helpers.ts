import { openDb, type DB } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { setEmbeddingProvider } from "../src/embeddings/provider.js";
import { NoopEmbeddingProvider } from "../src/embeddings/noop.js";

export const TEST_DIM = 384;

/** Fresh in-memory DB with schema applied and noop embeddings wired in. */
export function freshDb(): DB {
  setEmbeddingProvider(new NoopEmbeddingProvider(TEST_DIM));
  const db = openDb(":memory:");
  migrate(db, TEST_DIM);
  return db;
}
