import { getDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { Repository } from "../domain/repository.js";
import { UserRepository } from "../domain/users.js";
import { cardInputSchema } from "../domain/card-schema.js";
import type { ContextCard } from "../domain/types.js";
import { SEED_CARDS } from "./cards.js";
import { logStderr } from "../config.js";

/** Demo authors so profiles and the leaderboard have content in the prototype. */
const DEMO_USERS = [
  { login: "alice", name: "Alice Kim" },
  { login: "bob", name: "Bob Lee" },
  { login: "carol", name: "Carol Park" },
];

/**
 * Idempotent seed: cards are keyed by a deterministic title so re-running
 * replaces them rather than duplicating. Returns the number of cards loaded.
 */
export async function seed(): Promise<number> {
  const db = getDb();
  migrate(db);
  const repo = new Repository(db);
  const users = new UserRepository(db);

  // Remove previously-seeded cards (match by exact title) to stay idempotent.
  // card_authors rows cascade-delete with the card.
  const titles = SEED_CARDS.map((c) => c.title);
  const existing = repo.listCards({ includeDrafts: true });
  for (const card of existing) {
    if (titles.includes(card.title)) repo.deleteCard(card.id);
  }

  const authors = DEMO_USERS.map((u) => users.getOrCreateLocal(u.login, u.name));

  const created: ContextCard[] = [];
  for (const seedCard of SEED_CARDS) {
    const { seedId: _seedId, ...input } = seedCard;
    created.push(await repo.createCard(cardInputSchema.parse(input)));
  }

  // Attribute cards round-robin across the demo authors.
  created.forEach((card, i) => users.setCardAuthor(card.id, authors[i % authors.length].id));

  // A few reuse events so the leaderboard differentiates the authors.
  const usages: { idx: number; outcome: "success" | "partial" | "failed"; before?: number; after?: number }[] = [
    { idx: 0, outcome: "success", before: 12000, after: 1500 }, // alice
    { idx: 3, outcome: "success" },
    { idx: 6, outcome: "partial" },
    { idx: 1, outcome: "success" }, // bob
    { idx: 4, outcome: "failed" },
    { idx: 2, outcome: "success" }, // carol
    { idx: 5, outcome: "failed" },
  ];
  for (const u of usages) {
    if (!created[u.idx]) continue;
    await repo.recordUsage(created[u.idx].id, {
      agent: "codex",
      outcome: u.outcome,
      tokensBeforeEstimate: u.before,
      tokensAfterActual: u.after,
    });
  }

  return SEED_CARDS.length;
}

// Run only when executed directly (e.g. `tsx src/seed/seed.ts`). Matching the
// source filename keeps this false when the module is inlined into a bundled bin.
if (/\bseed\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  seed()
    .then((n) => logStderr(`Seeded ${n} context cards + ${DEMO_USERS.length} demo users`))
    .catch((err) => {
      logStderr("Seed failed:", err);
      process.exit(1);
    });
}
