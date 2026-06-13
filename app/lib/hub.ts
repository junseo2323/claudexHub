// Server-only data access for the web app. Reuses the exact same domain layer
// (and SQLite database) as the MCP server and CLI — no duplicated logic.
import { getDb } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrate.js";
import { Repository } from "../../src/domain/repository.js";
import { SearchService } from "../../src/domain/search.js";
import { hubStats, type HubStats } from "../../src/domain/stats.js";
import type { ContextCard, CardBrief, SearchInput } from "../../src/domain/types.js";

/** Statuses the public, read-only site is allowed to surface. */
const PUBLIC_STATUSES = new Set(["published", "stale", "deprecated"]);

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    migrate(d);
    ready = true;
  }
  return d;
}

export function getStats(): HubStats {
  return hubStats(db());
}

export function listPublicCards(): ContextCard[] {
  return new Repository(db()).listCards().filter((c) => PUBLIC_STATUSES.has(c.status));
}

export function getPublicCard(id: string): ContextCard | undefined {
  const card = new Repository(db()).getCard(id);
  if (!card || !PUBLIC_STATUSES.has(card.status)) return undefined;
  return card;
}

export async function search(input: SearchInput): Promise<CardBrief[]> {
  return new SearchService(db()).search(input);
}

export type { HubStats, ContextCard, CardBrief };
