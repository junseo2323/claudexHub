import { getDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { Repository } from "../domain/repository.js";
import { cardInputSchema } from "../domain/card-schema.js";
import { SEED_CARDS } from "./cards.js";
import { logStderr } from "../config.js";

/**
 * Idempotent seed: cards are keyed by a deterministic title so re-running
 * replaces them rather than duplicating. Returns the number of cards loaded.
 */
export async function seed(): Promise<number> {
  const db = getDb();
  migrate(db);
  const repo = new Repository(db);

  // Remove previously-seeded cards (match by exact title) to stay idempotent.
  const titles = SEED_CARDS.map((c) => c.title);
  const existing = repo.listCards({ includeDrafts: true });
  for (const card of existing) {
    if (titles.includes(card.title)) repo.deleteCard(card.id);
  }

  for (const seedCard of SEED_CARDS) {
    const { seedId: _seedId, ...input } = seedCard;
    await repo.createCard(cardInputSchema.parse(input));
  }
  return SEED_CARDS.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then((n) => logStderr(`Seeded ${n} context cards`))
    .catch((err) => {
      logStderr("Seed failed:", err);
      process.exit(1);
    });
}
