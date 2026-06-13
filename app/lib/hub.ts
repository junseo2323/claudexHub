// Server-only data access for the web app. Reuses the exact same domain layer
// (and SQLite database) as the MCP server and CLI — no duplicated logic.
import { getDb } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrate.js";
import { Repository } from "../../src/domain/repository.js";
import { SearchService } from "../../src/domain/search.js";
import {
  hubStats,
  leaderboard,
  userStats,
  type HubStats,
  type UserSummary,
} from "../../src/domain/stats.js";
import { UserRepository, type User } from "../../src/domain/users.js";
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

export function getLeaderboard(): UserSummary[] {
  return leaderboard(db());
}

export function getUserByLogin(login: string): User | undefined {
  return new UserRepository(db()).getByLogin(login);
}

export function getAuthorId(cardId: string): string | undefined {
  return new UserRepository(db()).getCardAuthorId(cardId);
}

export function getUser(id: string): User | undefined {
  return new UserRepository(db()).getById(id);
}

export function listDemoUsers(): User[] {
  return new UserRepository(db()).listAll();
}

export function upsertGithubUser(input: {
  githubId: string;
  login: string;
  name?: string;
  avatarUrl?: string;
}): User {
  return new UserRepository(db()).upsertByGithub(input);
}

export function getOrCreateDevUser(login: string): User {
  return new UserRepository(db()).getOrCreateLocal(login);
}

export function getUserStats(userId: string) {
  return userStats(db(), userId);
}

export type { HubStats, ContextCard, CardBrief, UserSummary, User };
