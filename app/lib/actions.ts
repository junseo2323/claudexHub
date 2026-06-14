"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { NEW_TOKEN_COOKIE } from "./constants";
import {
  createApiToken,
  revokeApiToken,
  createDraftForUser,
  publishDraftForUser,
  updateCardForUser,
  markCardStaleForUser,
  recordFeedbackForCard,
  deleteCardForUser,
  createTeamForUser,
  addTeamMemberByLogin,
  removeTeamMember,
  getTeamBySlug,
  publishDraftToTeam,
  addCardRelationForUser,
  removeCardRelationForUser,
  saveSearchForUser,
  deleteSavedSearch,
} from "./hub";

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createDraftAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const problem = String(formData.get("problem") ?? "").trim();
  if (!title || !problem) redirect("/new?error=missing");

  const environment: Record<string, string> = {};
  for (const key of ["frontend", "backend", "deploy"] as const) {
    const v = String(formData.get(key) ?? "").trim();
    if (v) environment[key] = v;
  }

  const { card } = await createDraftForUser(user.id, {
    title,
    problem,
    content: String(formData.get("content") ?? "").trim() || undefined,
    environment,
    verifiedFix: lines(formData.get("verifiedFix")),
  });

  redirect(`/drafts/${card.id}`);
}

export async function publishDraftAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cardId = String(formData.get("cardId") ?? "");
  const result = await publishDraftForUser(cardId, user.id);
  if (!result.ok) redirect(`/drafts/${cardId}?error=secrets`);
  redirect(`/cards/${cardId}`);
}

export async function editCardAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cardId = str(formData, "cardId");
  const title = str(formData, "title");
  const problem = str(formData, "problem");
  if (!title || !problem) redirect(`/cards/${cardId}/edit?error=missing`);

  const environment: Record<string, string> = {};
  for (const key of ["frontend", "backend", "deploy", "browser"] as const) {
    const v = str(formData, key);
    if (v) environment[key] = v;
  }

  await updateCardForUser(cardId, user.id, {
    title,
    problem,
    environment,
    symptoms: lines(formData.get("symptoms")),
    likelyCauses: lines(formData.get("likelyCauses")),
    failedAttempts: lines(formData.get("failedAttempts")),
    verifiedFix: lines(formData.get("verifiedFix")),
    verification: lines(formData.get("verification")),
    agentHint: str(formData, "agentHint"),
  });

  redirect(`/cards/${cardId}`);
}

export async function publishToTeamAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cardId = str(formData, "cardId");
  const teamId = str(formData, "teamId");
  if (!teamId) redirect(`/drafts/${cardId}`);
  const result = await publishDraftToTeam(cardId, user.id, teamId);
  if (!result.ok) redirect(`/drafts/${cardId}?error=secrets`);
  redirect(`/cards/${cardId}`);
}

export async function recordFeedbackAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cardId = str(formData, "cardId");
  const outcome = str(formData, "outcome");
  if (outcome === "success" || outcome === "partial" || outcome === "failed") {
    await recordFeedbackForCard(cardId, outcome, user.id);
  }
  redirect(`/cards/${cardId}?feedback=1`);
}

export async function createTeamAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = str(formData, "name");
  if (!name) redirect("/teams?error=missing");
  const team = createTeamForUser(user.id, name);
  redirect(`/teams/${team.slug}`);
}

export async function addTeamMemberAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const slug = str(formData, "slug");
  const login = str(formData, "login");
  const team = getTeamBySlug(slug);
  if (!team) redirect("/teams");
  const res = addTeamMemberByLogin(team.id, user.id, login);
  redirect(`/teams/${slug}${res.ok ? "" : `?error=${res.error}`}`);
}

export async function removeTeamMemberAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const slug = str(formData, "slug");
  const memberId = str(formData, "memberId");
  const team = getTeamBySlug(slug);
  if (!team) redirect("/teams");
  const res = removeTeamMember(team.id, user.id, memberId);
  redirect(`/teams/${slug}${res.ok ? "" : `?error=${res.error}`}`);
}

function searchHref(q: string, stack?: string, min?: string): string {
  const params = new URLSearchParams({ q });
  if (stack) params.set("stack", stack);
  if (min) params.set("min", min);
  return `/search?${params.toString()}`;
}

export async function saveSearchAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const query = str(formData, "q");
  const stack = str(formData, "stack");
  const min = str(formData, "min");
  if (!query) redirect("/search");
  saveSearchForUser(user.id, {
    label: str(formData, "label") || undefined,
    query,
    stack: stack || undefined,
    minConfidence: min ? Number(min) : undefined,
  });
  redirect(searchHref(query, stack, min));
}

export async function deleteSavedSearchAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  deleteSavedSearch(user.id, str(formData, "id"));
  redirect("/search");
}

export async function createApiTokenAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = str(formData, "name") || "token";
  const { plaintext } = createApiToken(user.id, name);
  // Flash the plaintext once via a short-lived cookie (never stored server-side).
  const store = await cookies();
  store.set(NEW_TOKEN_COOKIE, plaintext, {
    httpOnly: true,
    sameSite: "lax",
    path: "/settings/tokens",
    maxAge: 120,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/settings/tokens");
}

export async function revokeApiTokenAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  revokeApiToken(user.id, str(formData, "id"));
  redirect("/settings/tokens");
}

export async function addRelationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const fromCardId = str(formData, "cardId");
  const toCardId = str(formData, "toCardId");
  const type = str(formData, "type");
  const res = addCardRelationForUser(fromCardId, user.id, toCardId, type);
  redirect(`/cards/${fromCardId}${res.ok ? "" : `?relerror=${res.error}`}`);
}

export async function removeRelationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const fromCardId = str(formData, "cardId");
  removeCardRelationForUser(fromCardId, user.id, str(formData, "toCardId"), str(formData, "type"));
  redirect(`/cards/${fromCardId}`);
}

export async function deleteCardAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  deleteCardForUser(str(formData, "cardId"), user.id);
  redirect("/profile");
}

export async function markStaleAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cardId = str(formData, "cardId");
  const reason = str(formData, "reason") || "Marked stale by the author";
  const versions = lines(formData.get("versions"));
  await markCardStaleForUser(cardId, user.id, reason, versions.length ? versions : undefined);

  redirect(`/cards/${cardId}`);
}
