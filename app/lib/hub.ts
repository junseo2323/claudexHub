// Server-only data access for the web app. Reuses the exact same domain layer
// (and SQLite database) as the MCP server and CLI — no duplicated logic.
import { getDb } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrate.js";
import { Repository } from "../../src/domain/repository.js";
import { SearchService } from "../../src/domain/search.js";
import { extractDraft } from "../../src/domain/extraction.js";
import { redactCard, type RedactionReport } from "../../src/domain/redaction.js";
import { cardInputSchema, type CardInput } from "../../src/domain/card-schema.js";
import {
  hubStats,
  leaderboard,
  userStats,
  teamStats,
  type HubStats,
  type UserSummary,
  type TeamStats,
} from "../../src/domain/stats.js";
import { TeamRepository, type Team } from "../../src/domain/teams.js";
import { UserRepository, type User } from "../../src/domain/users.js";
import type { ContextCard, CardBrief, SearchInput } from "../../src/domain/types.js";

/** Statuses the read-only site is allowed to surface. */
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

/** Whether `viewerId` may see this card given its status + visibility. */
function canViewCard(card: ContextCard, viewerId?: string): boolean {
  if (!PUBLIC_STATUSES.has(card.status)) return false;
  if (card.visibility === "team") {
    const teamId = new TeamRepository(db()).getCardTeamId(card.id);
    return !!teamId && !!viewerId && new TeamRepository(db()).isMember(teamId, viewerId);
  }
  if (card.visibility === "private") {
    return !!viewerId && new UserRepository(db()).getCardAuthorId(card.id) === viewerId;
  }
  return true; // public (or team/community treated as public)
}

export function getStats(): HubStats {
  return hubStats(db());
}

/** Public-visibility cards only (dashboard / anonymous browse). */
export function listPublicCards(): ContextCard[] {
  return new Repository(db())
    .listCards()
    .filter((c) => PUBLIC_STATUSES.has(c.status) && c.visibility !== "team" && c.visibility !== "private");
}

/** Cards a given viewer may see: public + their team-scoped cards. */
export function listViewableCards(viewerId?: string): ContextCard[] {
  return new Repository(db()).listCards().filter((c) => canViewCard(c, viewerId));
}

export function getViewableCard(id: string, viewerId?: string): ContextCard | undefined {
  const card = new Repository(db()).getCard(id);
  if (!card || !canViewCard(card, viewerId)) return undefined;
  return card;
}

/** Search, then drop any results the viewer isn't allowed to see (team cards). */
export async function search(input: SearchInput, viewerId?: string): Promise<CardBrief[]> {
  const briefs = await new SearchService(db()).search(input);
  if (briefs.length === 0) return briefs;
  const repo = new Repository(db());
  return briefs.filter((b) => {
    const c = repo.getCard(b.id);
    return c != null && canViewCard(c, viewerId);
  });
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

const DRAFT_STATUSES = new Set(["draft", "approved"]);

export interface NewDraftInput {
  title: string;
  problem: string;
  content?: string;
  environment?: Record<string, string>;
  verifiedFix?: string[];
}

/** Create a redacted draft owned by `userId`, reusing the domain extraction. */
export async function createDraftForUser(
  userId: string,
  input: NewDraftInput,
): Promise<{ card: ContextCard; redaction: RedactionReport }> {
  const d = db();
  const repo = new Repository(d);
  const extracted = extractDraft({
    problemSummary: input.problem,
    content: input.content,
    environment: input.environment,
  });
  const raw: CardInput = cardInputSchema.parse({
    title: input.title || extracted.title,
    problem: input.problem,
    environment: extracted.environment,
    symptoms: extracted.symptoms,
    likelyCauses: extracted.likelyCauses,
    failedAttempts: extracted.failedAttempts,
    verifiedFix: input.verifiedFix?.length ? input.verifiedFix : extracted.verifiedFix,
    verification: [],
    agentHint: "",
    sourceLinks: extracted.sourceLinks,
    visibility: "private",
    status: "draft",
  });
  const { card: redacted, report } = redactCard(raw);
  const created = await repo.createCard(redacted as CardInput);
  new UserRepository(d).setCardAuthor(created.id, userId);
  if (input.content) {
    const { redact } = await import("../../src/domain/redaction.js");
    const { redacted: safeContent } = redact(input.content);
    repo.addEvidence(created.id, { source: "manual", url: extracted.sourceLinks[0], content: safeContent });
  }
  return { card: created, redaction: report };
}

/** A draft the given user owns (for review). Undefined if not theirs / not a draft. */
export function getDraftForUser(cardId: string, userId: string): ContextCard | undefined {
  const card = new Repository(db()).getCard(cardId);
  if (!card || !DRAFT_STATUSES.has(card.status)) return undefined;
  if (new UserRepository(db()).getCardAuthorId(cardId) !== userId) return undefined;
  return card;
}

export function listDraftsForUser(userId: string): ContextCard[] {
  const d = db();
  const repo = new Repository(d);
  const users = new UserRepository(d);
  return repo
    .listCards({ includeDrafts: true })
    .filter((c) => DRAFT_STATUSES.has(c.status) && users.getCardAuthorId(c.id) === userId);
}

/** Re-scan a draft for secrets; on a clean scan, publish it publicly. */
export async function publishDraftForUser(
  cardId: string,
  userId: string,
): Promise<{ ok: true; card: ContextCard } | { ok: false; redaction: RedactionReport }> {
  const card = getDraftForUser(cardId, userId);
  if (!card) throw new Error("draft_not_found");
  const { report } = redactCard(card);
  if (report.findingsCount > 0) return { ok: false, redaction: report };
  const updated = await new Repository(db()).updateCard(cardId, {
    status: "published",
    visibility: "public",
    lastVerifiedAt: card.verification.length > 0 ? new Date().toISOString() : card.lastVerifiedAt,
  });
  return { ok: true, card: updated };
}

/** Publish a draft with team visibility (only the team's members can see it). */
export async function publishDraftToTeam(
  cardId: string,
  userId: string,
  teamId: string,
): Promise<{ ok: true; card: ContextCard } | { ok: false; redaction: RedactionReport }> {
  const card = getDraftForUser(cardId, userId);
  if (!card) throw new Error("draft_not_found");
  if (!new TeamRepository(db()).isMember(teamId, userId)) throw new Error("not_team_member");
  const { report } = redactCard(card);
  if (report.findingsCount > 0) return { ok: false, redaction: report };
  const updated = await new Repository(db()).updateCard(cardId, {
    status: "published",
    visibility: "team",
    lastVerifiedAt: card.verification.length > 0 ? new Date().toISOString() : card.lastVerifiedAt,
  });
  new TeamRepository(db()).setCardTeam(cardId, teamId);
  return { ok: true, card: updated };
}

export function scanCard(card: ContextCard): RedactionReport {
  return redactCard(card).report;
}

/** Semantically related cards the viewer may see (excludes the card itself). */
export async function relatedCards(cardId: string, viewerId?: string, limit = 3): Promise<CardBrief[]> {
  return new SearchService(db()).related(cardId, {
    limit,
    canView: (c) => canViewCard(c, viewerId),
  });
}

/** A card the given user may edit (they authored it). Undefined otherwise. */
export function getEditableCardForUser(cardId: string, userId: string): ContextCard | undefined {
  const card = new Repository(db()).getCard(cardId);
  if (!card) return undefined;
  if (new UserRepository(db()).getCardAuthorId(cardId) !== userId) return undefined;
  return card;
}

export interface EditCardFields {
  title: string;
  problem: string;
  environment: Record<string, string>;
  symptoms: string[];
  likelyCauses: string[];
  failedAttempts: string[];
  verifiedFix: string[];
  verification: string[];
  agentHint: string;
}

/** Update an authored card; fields are redacted before saving (re-scores + re-embeds). */
export async function updateCardForUser(
  cardId: string,
  userId: string,
  fields: EditCardFields,
): Promise<{ card: ContextCard; redaction: RedactionReport }> {
  if (!getEditableCardForUser(cardId, userId)) throw new Error("not_editable");
  const { card: patch, report } = redactCard(fields as Partial<ContextCard>);
  const updated = await new Repository(db()).updateCard(cardId, patch);
  return { card: updated, redaction: report };
}

/** Record a reuse outcome on a published card (web feedback). Feeds the
 *  reuse counts, tokens-saved, confidence, and the author's reputation. */
export async function recordFeedbackForCard(
  cardId: string,
  outcome: "success" | "partial" | "failed",
): Promise<ContextCard> {
  const repo = new Repository(db());
  const card = repo.getCard(cardId);
  if (!card || !PUBLIC_STATUSES.has(card.status)) throw new Error("card_not_found");
  const { card: updated } = await repo.recordUsage(cardId, { agent: "other", outcome });
  return updated;
}

/** Delete an authored card (and its evidence/indexes). */
export function deleteCardForUser(cardId: string, userId: string): void {
  if (!getEditableCardForUser(cardId, userId)) throw new Error("not_editable");
  new Repository(db()).deleteCard(cardId);
}

/** Mark an authored card stale (no longer trusted). */
export async function markCardStaleForUser(
  cardId: string,
  userId: string,
  reason: string,
  affectedVersions?: string[],
): Promise<ContextCard> {
  if (!getEditableCardForUser(cardId, userId)) throw new Error("not_editable");
  return new Repository(db()).markStale(cardId, reason, affectedVersions);
}

// --- Teams ---

export function createTeamForUser(userId: string, name: string): Team {
  return new TeamRepository(db()).createTeam(name, userId);
}

export function listTeamsForUser(userId: string): Team[] {
  return new TeamRepository(db()).listTeamsForUser(userId);
}

export function getTeamBySlug(slug: string): Team | undefined {
  return new TeamRepository(db()).getBySlug(slug);
}

export function getTeamStatsById(teamId: string): TeamStats | undefined {
  return teamStats(db(), teamId);
}

export function isTeamOwner(teamId: string, userId: string): boolean {
  return new TeamRepository(db()).roleOf(teamId, userId) === "owner";
}

export function isTeamMember(teamId: string, userId: string): boolean {
  return new TeamRepository(db()).isMember(teamId, userId);
}

/** Owner-only: add a member by login. Returns an error code when not allowed. */
export function addTeamMemberByLogin(
  teamId: string,
  byUserId: string,
  login: string,
): { ok: true } | { ok: false; error: "forbidden" | "no_such_user" } {
  const teams = new TeamRepository(db());
  if (teams.roleOf(teamId, byUserId) !== "owner") return { ok: false, error: "forbidden" };
  const user = new UserRepository(db()).getByLogin(login.trim());
  if (!user) return { ok: false, error: "no_such_user" };
  teams.addMember(teamId, user.id);
  return { ok: true };
}

export type { HubStats, ContextCard, CardBrief, UserSummary, User, Team, TeamStats };
